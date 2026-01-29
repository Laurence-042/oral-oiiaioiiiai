import { ref, shallowRef, onUnmounted, type Ref, type ShallowRef } from 'vue';
import type {
  Vowel,
  VowelDetectorConfig,
  VowelDetectionResult,
  DetectionStatus,
  VowelFormantConfig,
  VowelDetectedCallback,
  SilenceCallback,
  ErrorCallback
} from '@/types/game';
import {
  DEFAULT_VOWEL_DETECTOR_CONFIG,
  DEFAULT_VOWEL_FORMANTS,
  frequencyToBin,
  binToFrequency,
  FREQUENCY_ANALYSIS
} from '@/config/vowels';

/**
 * useVowelDetector Hook 返回类型
 */
export interface UseVowelDetectorReturn {
  /** 当前检测结果（响应式） */
  currentResult: Ref<VowelDetectionResult | null>;
  /** 当前确认的元音（经过稳定性过滤） */
  confirmedVowel: Ref<Vowel | null>;
  /** 检测器状态 */
  isListening: Ref<boolean>;
  isInitialized: Ref<boolean>;
  error: Ref<string | null>;
  /** 控制方法 */
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** 事件回调注册 */
  onVowelDetected: (callback: VowelDetectedCallback) => void;
  onSilence: (callback: SilenceCallback) => void;
  onError: (callback: ErrorCallback) => void;
  /** 调试用：原始音频数据 */
  debugData: ShallowRef<{
    frequencyData: Float32Array | null;
    timeData: Float32Array | null;
  }>;
}

/**
 * 元音检测器 Composable
 * 
 * 将麦克风音频流实时转换为 O/I/A 元音信号
 * 
 * @example
 * ```ts
 * const { confirmedVowel, start, stop, onVowelDetected } = useVowelDetector();
 * 
 * onVowelDetected((vowel, result) => {
 *   console.log(`检测到: ${vowel}, 置信度: ${result.confidence}`);
 * });
 * 
 * await start();
 * ```
 */
export function useVowelDetector(config?: VowelDetectorConfig): UseVowelDetectorReturn {
  // ==================== 配置合并 ====================
  const cfg: Required<VowelDetectorConfig> = {
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
  
  const debugData = shallowRef<{
    frequencyData: Float32Array | null;
    timeData: Float32Array | null;
  }>({
    frequencyData: null,
    timeData: null
  });

  // ==================== 内部状态 ====================
  let audioContext: AudioContext | null = null;
  let analyserNode: AnalyserNode | null = null;
  let mediaStream: MediaStream | null = null;
  let animationFrameId: number | null = null;
  let lastAnalysisTime = 0;
  
  // 元音检测状态
  let lastConfirmedVowel: Vowel | null = null;  // 上一次确认的元音
  let hadGapSinceLastEmit = true;                // 上次触发后是否经过了静音间隔
  
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

      // 创建音频上下文
      audioContext = new AudioContext({ sampleRate: cfg.sampleRate });
      
      // 创建分析节点
      analyserNode = audioContext.createAnalyser();
      analyserNode.fftSize = cfg.fftSize;
      // 降低平滑系数，让频谱响应更灵敏（0 = 无平滑，1 = 最大平滑）
      analyserNode.smoothingTimeConstant = 0.1;

      // 连接音频源到分析节点
      const source = audioContext.createMediaStreamSource(mediaStream);
      source.connect(analyserNode);

      isInitialized.value = true;
      error.value = null;
    } catch (err) {
      const e = err instanceof Error ? err : new Error(String(err));
      error.value = `麦克风初始化失败: ${e.message}`;
      emitError(e);
      throw e;
    }
  }

  // ==================== 共振峰提取 ====================
  /**
   * 从频谱数据中提取共振峰
   * 使用峰值检测算法找到 F1 和 F2
   */
  function extractFormants(frequencyData: Float32Array): { f1: number; f2: number } {
    const sampleRate = cfg.sampleRate;
    const fftSize = cfg.fftSize;
    
    // 定义搜索范围
    const f1MinBin = frequencyToBin(FREQUENCY_ANALYSIS.FORMANT_FREQUENCY_RANGE.min, sampleRate, fftSize);
    const f1MaxBin = frequencyToBin(1200, sampleRate, fftSize);  // F1 通常在 200-1200 Hz
    const f2MinBin = frequencyToBin(800, sampleRate, fftSize);
    const f2MaxBin = frequencyToBin(FREQUENCY_ANALYSIS.FORMANT_FREQUENCY_RANGE.max, sampleRate, fftSize);

    // 找到 F1 范围内的最大峰值
    let f1Bin = f1MinBin;
    let f1MaxValue = -Infinity;
    for (let i = f1MinBin; i <= f1MaxBin && i < frequencyData.length; i++) {
      if (frequencyData[i] > f1MaxValue) {
        f1MaxValue = frequencyData[i];
        f1Bin = i;
      }
    }

    // 找到 F2 范围内的最大峰值（排除 F1 附近）
    let f2Bin = f2MinBin;
    let f2MaxValue = -Infinity;
    const f1ProtectedRange = Math.floor(200 * fftSize / sampleRate); // F1 周围 200Hz 保护区
    
    for (let i = f2MinBin; i <= f2MaxBin && i < frequencyData.length; i++) {
      // 跳过 F1 附近的区域
      if (Math.abs(i - f1Bin) < f1ProtectedRange) continue;
      
      if (frequencyData[i] > f2MaxValue) {
        f2MaxValue = frequencyData[i];
        f2Bin = i;
      }
    }

    return {
      f1: binToFrequency(f1Bin, sampleRate, fftSize),
      f2: binToFrequency(f2Bin, sampleRate, fftSize)
    };
  }

  // ==================== 元音分类 ====================
  /**
   * 根据共振峰值判断元音
   * 使用欧几里得距离计算与各元音特征中心的接近程度
   */
  function classifyVowel(f1: number, f2: number): { vowel: Vowel | null; confidence: number } {
    const formants = cfg.vowelFormants;
    
    type VowelDistance = { vowel: Vowel; distance: number; inRange: boolean };
    const distances: VowelDistance[] = [];

    // 计算到每个元音特征区域的距离
    for (const vowel of ['O', 'I', 'A'] as Vowel[]) {
      const range = formants[vowel];
      
      // 计算特征区域中心
      const centerF1 = (range.f1[0] + range.f1[1]) / 2;
      const centerF2 = (range.f2[0] + range.f2[1]) / 2;
      
      // 归一化距离（考虑各轴范围不同）
      const rangeF1 = range.f1[1] - range.f1[0];
      const rangeF2 = range.f2[1] - range.f2[0];
      
      const normalizedDistF1 = (f1 - centerF1) / rangeF1;
      const normalizedDistF2 = (f2 - centerF2) / rangeF2;
      
      const distance = Math.sqrt(normalizedDistF1 ** 2 + normalizedDistF2 ** 2);
      
      // 检查是否在范围内
      const inRange = f1 >= range.f1[0] && f1 <= range.f1[1] &&
                      f2 >= range.f2[0] && f2 <= range.f2[1];

      distances.push({ vowel, distance, inRange });
    }

    // 排序，优先选择在范围内的，其次选择距离最近的
    distances.sort((a, b) => {
      if (a.inRange && !b.inRange) return -1;
      if (!a.inRange && b.inRange) return 1;
      return a.distance - b.distance;
    });

    const best = distances[0];
    
    // 计算置信度（距离越小，置信度越高）
    // 在范围内时置信度至少 0.7，距离为 0 时置信度为 1
    let confidence: number;
    if (best.inRange) {
      confidence = Math.max(0.7, 1 - best.distance * 0.3);
    } else if (best.distance < 1.5) {
      // 稍微超出范围，仍可能是正确的
      confidence = Math.max(0.3, 0.7 - best.distance * 0.3);
    } else {
      // 距离太远，不确定
      return { vowel: null, confidence: 0 };
    }

    return { vowel: best.vowel, confidence: Math.min(1, confidence) };
  }

  // ==================== 音量计算 ====================
  /**
   * 计算 RMS 音量 (dB)
   * 使用时域数据计算更准确的音量
   */
  function calculateVolumeFromTimeData(timeData: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < timeData.length; i++) {
      sum += timeData[i] * timeData[i];
    }
    const rms = Math.sqrt(sum / timeData.length);
    // 转换为 dB，避免 log(0)
    const db = rms > 0 ? 20 * Math.log10(rms) : -100;
    return db;
  }

  /**
   * 从频域数据计算平均能量 (dB)
   */
  function calculateVolumeFromFrequencyData(frequencyData: Float32Array): number {
    // 只取人声频率范围 (100-4000Hz)
    const startBin = frequencyToBin(100, cfg.sampleRate, cfg.fftSize);
    const endBin = frequencyToBin(4000, cfg.sampleRate, cfg.fftSize);
    
    let maxDb = -Infinity;
    for (let i = startBin; i <= endBin && i < frequencyData.length; i++) {
      if (frequencyData[i] > maxDb) {
        maxDb = frequencyData[i];
      }
    }
    return maxDb;
  }

  // ==================== 分析循环 ====================
  function analyzeFrame(): void {
    if (!analyserNode || !isListening.value) return;

    const now = performance.now();
    
    // 控制分析频率
    if (now - lastAnalysisTime < cfg.frameTime) {
      animationFrameId = requestAnimationFrame(analyzeFrame);
      return;
    }
    lastAnalysisTime = now;

    // 获取频谱数据
    const frequencyData = new Float32Array(analyserNode.frequencyBinCount);
    analyserNode.getFloatFrequencyData(frequencyData);
    
    // 获取时域数据（用于调试）
    const timeData = new Float32Array(analyserNode.fftSize);
    analyserNode.getFloatTimeDomainData(timeData);

    // 更新调试数据
    debugData.value = { frequencyData, timeData };

    // 计算音量 (使用时域 RMS + 频域峰值的组合)
    const rmsVolume = calculateVolumeFromTimeData(timeData);
    const peakVolume = calculateVolumeFromFrequencyData(frequencyData);
    // 取较大值作为有效音量
    const volume = Math.max(rmsVolume, peakVolume);

    // 判断是否静音
    if (volume < cfg.silenceThreshold) {
      handleSilence(now, volume);
    } else {
      // 重置静音计时
      silenceStartTime = null;

      // 提取共振峰并分类元音
      const formants = extractFormants(frequencyData);
      const { vowel, confidence } = classifyVowel(formants.f1, formants.f2);

      // 确定检测状态 - 降低置信度阈值，让识别更宽松
      const status: DetectionStatus = 
        vowel !== null && confidence > 0.4 ? 'detected' :
        vowel !== null ? 'ambiguous' : 'noise';

      const result: VowelDetectionResult = {
        vowel, status, confidence, formants, volume, timestamp: now
      };
      currentResult.value = result;

      // 处理元音检测结果
      if (status === 'detected' && vowel !== null) {
        handleVowelDetected(vowel, result, now);
      }
      // 注意：不在 ambiguous/noise 时设置 hadGapSinceLastEmit
      // 只有真正的静音才算间隔
    }

    animationFrameId = requestAnimationFrame(analyzeFrame);
  }

  /**
   * 处理检测到的元音
   * 触发条件：
   * 1. 元音发生变化（O→I, I→A 等）
   * 2. 经过了静音间隔后的同一元音
   */
  function handleVowelDetected(vowel: Vowel, result: VowelDetectionResult, now: number): void {
    const isNewVowel = vowel !== lastConfirmedVowel;
    
    // 触发条件：元音变化 或 经过了静音间隔
    if (isNewVowel || hadGapSinceLastEmit) {
      confirmedVowel.value = vowel;
      lastConfirmedVowel = vowel;
      hadGapSinceLastEmit = false;
      emitVowelDetected(vowel, result);
    }
  }

  /**
   * 处理静音
   */
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
    
    // 静音标记为间隔，清除当前元音
    hadGapSinceLastEmit = true;
    confirmedVowel.value = null;
    lastConfirmedVowel = null;
  }

  // ==================== 控制方法 ====================
  async function start(): Promise<void> {
    if (isListening.value) return;

    if (!isInitialized.value) {
      await initAudio();
    }

    // 确保 AudioContext 处于运行状态
    if (audioContext?.state === 'suspended') {
      await audioContext.resume();
    }

    isListening.value = true;
    lastAnalysisTime = 0;
    silenceStartTime = null;
    
    // 开始分析循环
    analyzeFrame();
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
      analyserNode = null;
    }
    
    isInitialized.value = false;
    currentResult.value = null;
    error.value = null;
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
    start,
    stop,
    reset,
    onVowelDetected,
    onSilence,
    onError,
    debugData
  };
}
