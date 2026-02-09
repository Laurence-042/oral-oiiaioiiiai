import { ref, shallowRef, onUnmounted } from 'vue';
import * as tf from '@tensorflow/tfjs';
import type {
  Vowel,
  VowelDetectorConfig,
  VowelDetectionResult,
  DetectionStatus,
  VowelDetectedCallback,
  SilenceCallback,
  ErrorCallback,
  VowelDetectorHookReturn,
  VowelDetectorDebugData
} from '@/types/game';
import { DEFAULT_VOWEL_DETECTOR_CONFIG, DEFAULT_VOWEL_FORMANTS } from '@/config/vowels';

const VOWEL_CLASSES = ['A', 'E', 'I', 'O', 'U', 'silence'] as const;
const INPUT_SAMPLES = 3360; // 210ms @ 16kHz
const TARGET_SAMPLE_RATE = 16000; // 训练模型使用的采样率
const HYSTERESIS_HIGH = 0.6;
const HYSTERESIS_LOW = 0.45;
const SWITCH_MARGIN = 0.08;
const SUSTAINED_RE_EMIT_INTERVAL = 300; // 持续发同一元音时，每隔300ms重新触发一次

/**
 * TensorFlow.js 元音检测器 Composable
 * 使用 CNN 模型进行元音识别
 * 
 * @example
 * ```ts
 * const { confirmedVowel, start, stop, onVowelDetected } = useVowelDetectorML({
 *   modelPath: '/models/vowel/model.json'
 * });
 * 
 * onVowelDetected((vowel, result) => {
 *   console.log(`检测到: ${vowel}, 置信度: ${result.confidence}`);
 * });
 * 
 * await start();
 * ```
 */
export function useVowelDetectorML(config?: VowelDetectorConfig): VowelDetectorHookReturn {
  // ==================== 配置合并 ====================
  const cfg: Required<Omit<VowelDetectorConfig, 'modelPath'>> & { modelPath?: string } = {
    ...DEFAULT_VOWEL_DETECTOR_CONFIG,
    ...config,
    vowelFormants: {
      ...DEFAULT_VOWEL_FORMANTS,
      ...config?.vowelFormants
    }
  };

  // ==================== 响应式状态 ====================
  const currentResult = ref<VowelDetectionResult | null>(null);
  const confirmedVowel = ref<Vowel | null>(null);
  const isListening = ref(false);
  const isInitialized = ref(false);
  const error = ref<string | null>(null);
  const latestProbabilities = ref<number[] | null>(null);  // 最新的各类别概率
  const debugData = shallowRef<VowelDetectorDebugData>({
    frequencyData: null,
    timeData: null
  });

  // ==================== 内部状态 ====================
  let audioContext: AudioContext | null = null;
  let mediaStream: MediaStream | null = null;
  let model: tf.GraphModel | null = null;
  let audioBuffer: Float32Array | null = null;
  let bufferIndex = 0;
  let animationFrameId: number | null = null;
  let actualSampleRate = 44100; // 实际采样率（会在初始化时检测）
  let resampleRatio = 1; // 重采样比例
  
  // 元音检测状态
  let lastConfirmedVowel: Vowel | null = null;
  let hadGapSinceLastEmit = true;
  let stableVowel: Vowel | null = null;
  let stableProb = 0;
  let lastEmitTime = 0; // 上次触发 onVowelDetected 的时间
  
  // 静音检测状态
  let silenceStartTime: number | null = null;

  // ==================== 事件回调 ====================
  const vowelDetectedCallbacks: VowelDetectedCallback[] = [];
  const silenceCallbacks: SilenceCallback[] = [];
  const errorCallbacks: ErrorCallback[] = [];

  function onVowelDetected(callback: VowelDetectedCallback): void {
    vowelDetectedCallbacks.push(callback);
  }

  function onSilence(callback: SilenceCallback): void {
    silenceCallbacks.push(callback);
  }

  function onError(callback: ErrorCallback): void {
    errorCallbacks.push(callback);
  }

  function emitVowelDetected(vowel: Vowel, result: VowelDetectionResult): void {
    vowelDetectedCallbacks.forEach(cb => cb(vowel, result));
  }

  function emitSilence(duration: number): void {
    silenceCallbacks.forEach(cb => cb(duration));
  }

  function emitError(err: Error): void {
    errorCallbacks.forEach(cb => cb(err));
  }

  // ==================== 模型初始化 ====================
  async function loadModel(): Promise<void> {
    try {
      const modelPath = config?.modelPath ?? '/models/vowel/model.json';
      model = (await tf.loadGraphModel(modelPath)) as tf.GraphModel;
      console.log('✅ 元音识别模型已加载');
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = `模型加载失败: ${e.message}`;
      emitError(e);
      throw e;
    }
  }

  // ==================== 音频初始化 ====================
  async function initAudio(): Promise<void> {
    try {
      // 请求麦克风权限
      mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      // 创建音频上下文（不指定采样率，让系统使用默认值）
      audioContext = new AudioContext();
      
      // ⚠️ 关键：获取实际采样率
      actualSampleRate = audioContext.sampleRate;
      resampleRatio = TARGET_SAMPLE_RATE / actualSampleRate;
      
      console.log(`📊 实际采样率: ${actualSampleRate} Hz`);
      console.log(`📊 目标采样率: ${TARGET_SAMPLE_RATE} Hz`);
      console.log(`📊 重采样比例: ${resampleRatio.toFixed(4)}`);
      
      // 计算重采样后的缓冲区大小
      // 如果实际采样率是 44100Hz，重采样到 16000Hz 后，
      // 每个 4096 样本的音频块会变成 ~1495 样本
      // 创建音频缓冲区（用于存储重采样后的数据）
      audioBuffer = new Float32Array(INPUT_SAMPLES);
      bufferIndex = 0;

      // 创建 ScriptProcessorNode 用于收集音频数据
      // 使用 2048 样本的缓冲大小，降低延迟（~46ms @ 44100Hz）
      const scriptNode = audioContext.createScriptProcessor(2048, 1, 1);
      
      scriptNode.onaudioprocess = (event: AudioProcessingEvent) => {
        const inputData = event.inputBuffer.getChannelData(0);
        
        // ⚠️ 正确的重采样：从高采样率降到低采样率
        // 例如：44100Hz -> 16000Hz，每 2.76 个源样本产生 1 个目标样本
        const resampledLength = Math.ceil(inputData.length * resampleRatio);
        
        for (let i = 0; i < resampledLength; i++) {
          // 计算在源数组中的位置
          const sourcePos = i / resampleRatio;
          const intPart = Math.floor(sourcePos);
          const fracPart = sourcePos - intPart;
          
          // 线性插值
          let sample: number;
          if (intPart >= inputData.length - 1) {
            sample = inputData[inputData.length - 1];
          } else {
            sample = inputData[intPart] * (1 - fracPart) + inputData[intPart + 1] * fracPart;
          }
          
          // 将重采样后的数据放入主缓冲区（循环缓冲）
          audioBuffer![bufferIndex] = sample;
          bufferIndex = (bufferIndex + 1) % INPUT_SAMPLES;
        }
      };

      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(scriptNode);
      scriptNode.connect(audioContext.destination);

      isInitialized.value = true;
      error.value = null;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = `麦克风初始化失败: ${e.message}`;
      emitError(e);
      throw e;
    }
  }

  // ==================== 音频预处理和推理 ====================
  async function analyzeAudio(): Promise<void> {
    if (!model || !audioBuffer || !isListening.value) return;

    const now = performance.now();

    try {
      // 从循环缓冲区正确读取数据
      // audioBuffer 是循环缓冲区，bufferIndex 指向下一个要写入的位置
      // 正确的顺序是：[bufferIndex...end] + [0...bufferIndex-1]
      const audioData = new Float32Array(INPUT_SAMPLES);
      for (let i = 0; i < INPUT_SAMPLES; i++) {
        // 从 bufferIndex 开始读取，回绕到开头
        audioData[i] = audioBuffer[(bufferIndex + i) % INPUT_SAMPLES];
      }

      // 计算音量
      const volume = calculateVolume(audioData);
      debugData.value = { frequencyData: null, timeData: audioData };

      // 判断是否静音
      if (volume < cfg.silenceThreshold) {
        handleSilence(now, volume);
      } else {
        // 重置静音计时
        silenceStartTime = null;

        // 转换为 Tensor 并进行推理
        const input = tf.tensor2d(audioData, [1, INPUT_SAMPLES]);
        const predictions = model!.predict(input) as tf.Tensor;
        const probabilities = await predictions.data();
        
        // 更新最新概率分布（用于 UI 显示）
        latestProbabilities.value = Array.from(probabilities);
        
        // 获取最高置信度的类
        let maxIdx = 0;
        let maxProb = 0;
        for (let i = 0; i < probabilities.length; i++) {
          if (probabilities[i] > maxProb) {
            maxProb = probabilities[i];
            maxIdx = i;
          }
        }

        const candidate = VOWEL_CLASSES[maxIdx] as Vowel;
        const candidateProb = Math.min(1, Math.max(0, maxProb));

        // Schmitt 触发式滞回：减少元音抖动
        if (stableVowel === null) {
          if (candidateProb >= HYSTERESIS_HIGH) {
            stableVowel = candidate;
            stableProb = candidateProb;
          }
        } else if (candidate === stableVowel) {
          stableProb = candidateProb;
          if (candidateProb < HYSTERESIS_LOW) {
            stableVowel = null;
            stableProb = 0;
          }
        } else {
          // 关键修复：用当前帧中旧元音的实际概率更新 stableProb
          // 否则 stableProb 会停留在历史峰值，导致永远无法切换
          const stableVowelIdx = VOWEL_CLASSES.indexOf(stableVowel!);
          if (stableVowelIdx >= 0 && stableVowelIdx < probabilities.length) {
            stableProb = probabilities[stableVowelIdx];
          }
          // 旧元音概率衰减到阈值以下时，直接清除
          if (stableProb < HYSTERESIS_LOW) {
            stableVowel = null;
            stableProb = 0;
            // 如果新候选超过阈值，立即采纳
            if (candidateProb >= HYSTERESIS_HIGH) {
              stableVowel = candidate;
              stableProb = candidateProb;
            }
          } else {
            // 旧元音仍然存在，但新候选超过旧元音+余量时切换
            const canSwitch = candidateProb >= HYSTERESIS_HIGH &&
              candidateProb >= stableProb + SWITCH_MARGIN;
            if (canSwitch) {
              stableVowel = candidate;
              stableProb = candidateProb;
            }
          }
        }

        const vowel = stableVowel;
        const confidence = stableVowel ? stableProb : candidateProb;

        // 确定检测状态
        const status: DetectionStatus =
          vowel !== null && confidence > 0.5 ? 'detected' :
          vowel !== null ? 'ambiguous' : 'noise';

        const result: VowelDetectionResult = {
          vowel: status === 'detected' ? vowel : null,
          status,
          confidence,
          formants: { f1: 0, f2: 0 }, // ML 模型不直接输出共振峰
          volume,
          timestamp: now
        };
        currentResult.value = result;

        // 处理元音检测结果
        if (status === 'detected' && vowel !== null) {
          handleVowelDetected(vowel, result);
        }

        // 清理
        input.dispose();
        predictions.dispose();
      }
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      console.error('推理错误:', e);
      emitError(e);
    }

    animationFrameId = requestAnimationFrame(analyzeAudio);
  }

  // ==================== 音量计算 ====================
  function calculateVolume(audioData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < audioData.length; i++) {
      sum += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sum / audioData.length);
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    return Math.max(-100, Math.min(0, db)); // 限制范围在 -100 到 0
  }

  // ==================== 元音检测处理 ====================
  function handleVowelDetected(vowel: Vowel, result: VowelDetectionResult): void {
    const isNewVowel = vowel !== lastConfirmedVowel;
    const now = performance.now();
    // 持续发同一元音时，每隔一段时间重新触发（支持序列中连续相同元音如 I,I,I）
    const sustainedReEmit = !isNewVowel && !hadGapSinceLastEmit 
      && (now - lastEmitTime >= SUSTAINED_RE_EMIT_INTERVAL);
    
    // 触发条件：元音变化 / 经过了静音间隔 / 持续发音重新触发
    if (isNewVowel || hadGapSinceLastEmit || sustainedReEmit) {
      confirmedVowel.value = vowel;
      lastConfirmedVowel = vowel;
      hadGapSinceLastEmit = false;
      lastEmitTime = now;
      emitVowelDetected(vowel, result);
    }
  }

  // ==================== 静音处理 ====================
  function handleSilence(now: number, volume: number): void {
    if (silenceStartTime === null) {
      silenceStartTime = now;
    } else {
      emitSilence(now - silenceStartTime);
    }
    
    currentResult.value = {
      vowel: null,
      status: 'silence',
      confidence: 0,
      formants: { f1: 0, f2: 0 },
      volume,
      timestamp: now
    };
    
    hadGapSinceLastEmit = true;
    confirmedVowel.value = null;
    lastConfirmedVowel = null;
    lastEmitTime = 0;
    // 重置 Schmitt 触发器状态，防止旧元音干扰下次检测
    stableVowel = null;
    stableProb = 0;
  }

  // ==================== 控制方法 ====================
  async function start(): Promise<void> {
    if (isListening.value) return;

    if (!isInitialized.value) {
      await initAudio();
      await loadModel();
    }

    // 确保 AudioContext 处于运行状态
    if (audioContext?.state === 'suspended') {
      await audioContext.resume();
    }

    isListening.value = true;
    silenceStartTime = null;
    bufferIndex = 0;
    
    // 开始分析循环
    analyzeAudio();
  }

  function stop(): void {
    isListening.value = false;
    
    if (animationFrameId !== null) {
      cancelAnimationFrame(animationFrameId);
      animationFrameId = null;
    }
    
    confirmedVowel.value = null;
    lastConfirmedVowel = null;
    hadGapSinceLastEmit = true;
    lastEmitTime = 0;
    stableVowel = null;
    stableProb = 0;
  }

  function reset(): void {
    stop();
    
    // 释放资源
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    if (model) {
      model.dispose();
      model = null;
    }

    audioBuffer = null;
    bufferIndex = 0;
    
    isInitialized.value = false;
    currentResult.value = null;
    error.value = null;
    latestProbabilities.value = null;
  }

  // ==================== 诊断和调试 ====================
  /**
   * 获取音频格式诊断信息
   * 用于调试采样率不匹配问题
   */
  function getAudioDiagnostics() {
    return {
      detectorType: 'ml',
      targetSampleRate: TARGET_SAMPLE_RATE,
      actualSampleRate: actualSampleRate,
      resampleRatio: resampleRatio,
      inputSamples: INPUT_SAMPLES,
      expectedDurationMs: (INPUT_SAMPLES / TARGET_SAMPLE_RATE) * 1000,
      actualDurationMs: (INPUT_SAMPLES / actualSampleRate) * 1000,
      audioContextState: audioContext?.state,
      silenceThreshold: cfg.silenceThreshold,
      modelPath: config?.modelPath ?? '/models/vowel/model.json',
      isInitialized: isInitialized.value,
      isListening: isListening.value
    };
  }

  // ==================== 生命周期 ====================
  onUnmounted(() => {
    reset();
  });

  // ==================== 返回 ====================
  return {
    currentResult,
    confirmedVowel,
    isListening,
    isInitialized,
    error,
    latestProbabilities,
    start,
    stop,
    reset,
    onVowelDetected,
    onSilence,
    onError,
    debugData,
    getAudioDiagnostics
  };
}
