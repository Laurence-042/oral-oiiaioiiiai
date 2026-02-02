<template>
  <div class="debug-ml-detector">
    <header>
      <h1>🔧 TensorFlow.js 元音检测器 - 调试测试</h1>
      <p class="subtitle">实时监测模型推理过程与性能指标</p>
    </header>

    <!-- ==================== 快速统计 ==================== -->
    <section class="quick-stats">
      <div class="stat-card">
        <div class="stat-label">检测总数</div>
        <div class="stat-value">{{ stats.totalDetections }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均延迟</div>
        <div class="stat-value">{{ stats.avgLatency.toFixed(0) }}ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">状态</div>
        <div class="stat-value" :class="isListening ? 'running' : 'stopped'">
          {{ isListening ? '运行中' : '已停止' }}
        </div>
      </div>
    </section>

    <!-- ==================== 实时检测面板 ==================== -->
    <section class="detection-panel">
      <h2>📊 实时检测结果</h2>
      
      <div class="detection-grid">
        <!-- 当前元音 -->
        <div class="detection-item">
          <label>当前检测</label>
          <div class="vowel-box" :class="{ active: confirmedVowel }">
            <span class="vowel-text">{{ confirmedVowel || '--' }}</span>
          </div>
        </div>

        <!-- 置信度 -->
        <div class="detection-item">
          <label>置信度</label>
          <div class="confidence-display">
            <div class="confidence-bar-large">
              <div 
                class="fill"
                :style="{ width: `${(currentResult?.confidence ?? 0) * 100}%` }"
              ></div>
            </div>
            <span class="percentage">
              {{ ((currentResult?.confidence ?? 0) * 100).toFixed(1) }}%
            </span>
          </div>
        </div>

        <!-- 音量 -->
        <div class="detection-item">
          <label>音量级别</label>
          <div class="volume-display">
            <span class="db-value">{{ currentResult?.volume.toFixed(1) ?? '--' }} dB</span>
            <div class="volume-bar">
              <div 
                class="fill"
                :style="{ width: `${Math.max(0, (currentResult?.volume ?? -100) + 100)}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 状态 -->
        <div class="detection-item">
          <label>检测状态</label>
          <div class="status-badge" :class="currentResult?.status">
            {{ currentResult?.status || 'idle' }}
          </div>
        </div>
      </div>

      <!-- 详细的类别概率 -->
      <div class="class-probabilities" v-if="latestProbabilities">
        <h3>🎯 各类别概率分布</h3>
        <div class="prob-chart">
          <div 
            v-for="(prob, idx) in latestProbabilities"
            :key="idx"
            class="prob-bar-container"
          >
            <span class="label">{{ VOWEL_CLASSES[idx] }}</span>
            <div class="prob-bar">
              <div 
                class="fill"
                :style="{ width: `${prob * 100}%` }"
              ></div>
            </div>
            <span class="value">{{ (prob * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 离线分析面板 ==================== -->
    <section class="offline-analysis">
      <h2>📁 离线音频分析</h2>
      <p class="section-desc">上传音频文件（WAV/MP3），分析元音占比和分布</p>

      <div class="upload-section">
        <div class="upload-box">
          <input 
            id="audio-file"
            ref="audioFileInput"
            type="file"
            accept="audio/wav,audio/mpeg,.wav,.mp3"
            @change="handleFileSelected"
            class="file-input"
          />
          <label for="audio-file" class="upload-label">
            <span class="upload-icon">📤</span>
            <span class="upload-text">点击选择音频文件或拖拽上传</span>
            <span class="upload-hint">(WAV/MP3 格式)</span>
          </label>
        </div>

        <div v-if="analysisState.analyzing" class="analysis-progress">
          <div class="progress-spinner"></div>
          <p>分析中... {{ Math.round(analysisState.progress * 100) }}%</p>
        </div>

        <div v-if="analysisState.error" class="error-message">
          <span class="error-icon">❌</span>
          {{ analysisState.error }}
        </div>
      </div>

      <!-- 分析结果 -->
      <div v-if="analysisResult" class="analysis-result">
        <div class="result-header">
          <h3>📊 分析结果</h3>
          <p class="file-info">{{ analysisResult.fileName }} - {{ (analysisResult.duration / 1000).toFixed(2) }}s</p>
        </div>

        <!-- 元音占比 -->
        <div class="vowel-ratio">
          <h4>元音占比分布</h4>
          <div class="ratio-chart">
            <div 
              v-for="vowel in VOWEL_CLASSES"
              :key="vowel"
              class="ratio-item"
            >
              <div class="ratio-bar-wrapper">
                <span class="ratio-label">{{ vowel }}</span>
                <div class="ratio-bar">
                  <div 
                    class="ratio-fill"
                    :style="{ width: `${(analysisResult.ratios[vowel] ?? 0) * 100}%` }"
                  ></div>
                </div>
              </div>
              <span class="ratio-value">
                {{ ((analysisResult.ratios[vowel] ?? 0) * 100).toFixed(1) }}%
                ({{ analysisResult.counts[vowel] ?? 0 }})
              </span>
            </div>
          </div>
        </div>

        <!-- 详细统计 -->
        <div class="analysis-stats">
          <div class="stat-box">
            <div class="stat-label">总帧数</div>
            <div class="stat-val">{{ analysisResult.totalFrames }}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">采样率</div>
            <div class="stat-val">{{ analysisResult.sampleRate }} Hz</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">时长</div>
            <div class="stat-val">{{ (analysisResult.duration / 1000).toFixed(2) }}s</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">平均置信度</div>
            <div class="stat-val">{{ (analysisResult.avgConfidence * 100).toFixed(1) }}%</div>
          </div>
        </div>

        <!-- 时间轴可视化 -->
        <div class="timeline-analysis">
          <h4>元音时间轴</h4>
          <div class="timeline">
            <div 
              v-for="(frame, idx) in analysisResult.timeline.slice(0, 200)"
              :key="idx"
              class="timeline-bar"
              :class="`vowel-${frame}`"
              :title="`${frame} (${idx})`"
            ></div>
          </div>
          <div class="timeline-legend">
            <div v-for="vowel in VOWEL_CLASSES" :key="vowel" class="legend-item">
              <div class="legend-color" :class="`vowel-${vowel}`"></div>
              <span>{{ vowel }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 控制面板 ==================== -->
    <section class="control-panel">
      <h2>⚙️ 控制面板</h2>
      
      <div class="control-buttons">
        <button 
          @click="handleStart" 
          :disabled="isListening"
          class="btn btn-primary"
        >
          <span>▶️</span> 启动监听
        </button>
        
        <button 
          @click="handleStop" 
          :disabled="!isListening"
          class="btn btn-warning"
        >
          <span>⏹️</span> 停止监听
        </button>
        
        <button 
          @click="handleReset"
          class="btn btn-secondary"
        >
          <span>🔄</span> 重置数据
        </button>

        <button 
          @click="toggleDebug"
          class="btn btn-info"
        >
          <span>{{ showDebugInfo ? '🙈' : '🔍' }}</span> 
          {{ showDebugInfo ? '隐藏' : '显示' }}调试信息
        </button>
      </div>

      <!-- 错误显示 -->
      <div v-if="error" class="error-box">
        <strong>❌ 错误:</strong> {{ error }}
        <button @click="error = null" class="close-btn">✕</button>
      </div>

      <!-- 初始化状态 -->
      <div class="init-status">
        <div class="status-row">
          <span>模型加载:</span>
          <span :class="isInitialized ? 'success' : 'pending'">
            {{ isInitialized ? '✅ 完成' : '⏳ 等待中...' }}
          </span>
        </div>
        <div class="status-row">
          <span>麦克风访问:</span>
          <span :class="micPermission ? 'success' : micPermission === false ? 'error' : 'pending'">
            {{ micPermission === true ? '✅ 已获得' : micPermission === false ? '❌ 被拒绝' : '⏳ 等待中...' }}
          </span>
        </div>
      </div>
    </section>

    <!-- ==================== 检测历史 ==================== -->
    <section class="history-panel">
      <h2>📋 检测历史（最近 50 条）</h2>
      
      <div class="controls-row">
        <button @click="clearHistory" class="btn btn-small">清空历史</button>
        <span class="history-count">共 {{ detectionHistory.length }} 条记录</span>
      </div>

      <div class="history-list">
        <div 
          v-for="(record, idx) in detectionHistory.slice().reverse()"
          :key="idx"
          class="history-item"
        >
          <span class="timestamp">{{ formatTime(record.timestamp) }}</span>
          <span class="vowel-badge" :class="record.vowel.toLowerCase()">{{ record.vowel }}</span>
          <span class="confidence">{{ (record.confidence * 100).toFixed(0) }}%</span>
          <span class="duration">{{ record.duration.toFixed(0) }}ms</span>
        </div>

        <div v-if="detectionHistory.length === 0" class="empty-state">
          没有检测记录，请启动监听...
        </div>
      </div>
    </section>

    <!-- ==================== 性能分析 ==================== -->
    <section class="performance-panel">
      <h2>⚡ 性能分析</h2>
      
      <div class="perf-grid">
        <div class="perf-card">
          <h3>推理时间</h3>
          <div class="perf-value">{{ stats.latencyStats.avg.toFixed(1) }}ms</div>
          <div class="perf-detail">
            <div>最小: {{ stats.latencyStats.min.toFixed(1) }}ms</div>
            <div>最大: {{ stats.latencyStats.max.toFixed(1) }}ms</div>
          </div>
        </div>

        <div class="perf-card">
          <h3>置信度范围</h3>
          <div class="perf-value">{{ (stats.confidenceStats.avg * 100).toFixed(1) }}%</div>
          <div class="perf-detail">
            <div>最小: {{ (stats.confidenceStats.min * 100).toFixed(1) }}%</div>
            <div>最大: {{ (stats.confidenceStats.max * 100).toFixed(1) }}%</div>
          </div>
        </div>

        <div class="perf-card">
          <h3>音量范围</h3>
          <div class="perf-value">{{ stats.volumeStats.avg.toFixed(1) }}dB</div>
          <div class="perf-detail">
            <div>最小: {{ stats.volumeStats.min.toFixed(1) }}dB</div>
            <div>最大: {{ stats.volumeStats.max.toFixed(1) }}dB</div>
          </div>
        </div>

        <div class="perf-card">
          <h3>元音分布</h3>
          <div class="vowel-distribution">
            <div 
              v-for="(count, vowel) in vowelDistribution"
              :key="vowel"
              class="dist-item"
            >
              <span class="vowel">{{ vowel }}</span>
              <span class="count">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 调试信息 ==================== -->
    <section v-if="showDebugInfo" class="debug-panel">
      <h2>🐛 调试信息</h2>
      
      <div class="debug-tabs">
        <button 
          v-for="tab in ['raw', 'config', 'memory']"
          :key="tab"
          @click="debugTab = (tab as 'raw' | 'config' | 'memory')"
          :class="{ active: debugTab === tab }"
          class="tab-btn"
        >
          {{ { raw: '原始数据', config: '配置', memory: '内存' }[tab] }}
        </button>
      </div>

      <pre v-if="debugTab === 'raw'" class="debug-output">{{ JSON.stringify(debugData, null, 2) }}</pre>
      <pre v-if="debugTab === 'config'" class="debug-output">{{ JSON.stringify(debugConfig, null, 2) }}</pre>
      <pre v-if="debugTab === 'memory'" class="debug-output">{{ debugMemory }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, reactive } from 'vue';
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';
import type { Vowel } from '@/types/game';

// ==================== 常量 ====================
const VOWEL_CLASSES = ['A', 'E', 'I', 'O', 'U', 'silence'] as const;

// ==================== 检测器实例 ====================
const detector = useVowelDetectorML({
  modelPath: '/models/vowel/model.json'
});

const {
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
  onError
} = detector;

// ==================== 本地状态 ====================
const showDebugInfo = ref(false);
const debugTab = ref<'raw' | 'config' | 'memory'>('raw');
const micPermission = ref<boolean | null>(null);
const detectionHistory = ref<Array<{
  vowel: Vowel;
  confidence: number;
  timestamp: number;
  duration: number;
}>>([]);
const audioFileInput = ref<HTMLInputElement | null>(null);

// ==================== 离线分析状态 ====================
const analysisState = ref({
  analyzing: false,
  progress: 0,
  error: ''
});

const analysisResult = ref<{
  fileName: string;
  duration: number;
  sampleRate: number;
  totalFrames: number;
  ratios: Record<string, number>;
  counts: Record<string, number>;
  avgConfidence: number;
  timeline: Vowel[];
} | null>(null);

// ==================== 统计数据 ====================
const stats = reactive({
  totalDetections: 0,
  avgLatency: 0,
  latencyStats: { min: Infinity, max: -Infinity, avg: 0 },
  confidenceStats: { min: 1, max: 0, avg: 0 },
  volumeStats: { min: Infinity, max: -Infinity, avg: 0 },
  latencies: [] as number[],
  confidences: [] as number[],
  volumes: [] as number[]
});

// ==================== 计算属性 ====================
const vowelDistribution = computed(() => {
  const dist: Record<string, number> = {};
  for (const record of detectionHistory.value) {
    dist[record.vowel] = (dist[record.vowel] ?? 0) + 1;
  }
  return dist;
});

const debugData = computed(() => ({
  isListening: isListening.value,
  isInitialized: isInitialized.value,
  currentResult: currentResult.value,
  confirmedVowel: confirmedVowel.value,
  error: error.value,
  detectionCount: stats.totalDetections,
  historyLength: detectionHistory.value.length
}));

const debugConfig = computed(() => ({
  modelPath: '/models/vowel/model.json',
  inputSamples: 3360,
  sampleRate: 16000,
  voiceClasses: VOWEL_CLASSES
}));

const debugMemory = computed(() => {
  const perfMemory = (performance as any).memory;
  if (typeof performance === 'undefined' || !perfMemory) {
    return '浏览器不支持内存统计';
  }
  return `已使用: ${(perfMemory.usedJSHeapSize / 1048576).toFixed(1)} MB
总限制: ${(perfMemory.jsHeapSizeLimit / 1048576).toFixed(1)} MB
使用率: ${((perfMemory.usedJSHeapSize / perfMemory.jsHeapSizeLimit) * 100).toFixed(1)}%`;
});

// ==================== 事件处理 ====================
const handleStart = async () => {
  try {
    micPermission.value = null;
    await start();
    micPermission.value = true;
  } catch (err) {
    if (err instanceof Error && err.message.includes('Permission denied')) {
      micPermission.value = false;
    }
    console.error('启动失败:', err);
  }
};

const handleStop = () => {
  stop();
};

const handleReset = () => {
  reset();
  detectionHistory.value = [];
  stats.totalDetections = 0;
  stats.latencies = [];
  stats.confidences = [];
  stats.volumes = [];
  stats.latencyStats = { min: Infinity, max: -Infinity, avg: 0 };
  stats.confidenceStats = { min: 1, max: 0, avg: 0 };
  stats.volumeStats = { min: Infinity, max: -Infinity, avg: 0 };
};

const toggleDebug = () => {
  showDebugInfo.value = !showDebugInfo.value;
};

const clearHistory = () => {
  detectionHistory.value = [];
};

const formatTime = (timestamp: number): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('zh-CN', { 
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
};

// ==================== 离线音频分析 ====================
const handleFileSelected = async (event: Event) => {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  analysisState.value = { analyzing: true, progress: 0, error: '' };
  analysisResult.value = null;

  try {
    const arrayBuffer = await file.arrayBuffer();
    await analyzeAudioFile(arrayBuffer, file.name);
  } catch (err) {
    analysisState.value.error = `分析失败: ${err instanceof Error ? err.message : String(err)}`;
  } finally {
    analysisState.value.analyzing = false;
  }

  // 重置输入
  if (audioFileInput.value) {
    audioFileInput.value.value = '';
  }
};

const analyzeAudioFile = async (arrayBuffer: ArrayBuffer, fileName: string) => {
  // 导入 TensorFlow.js
  const tf = await import('@tensorflow/tfjs');

  // 解码音频
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const rawAudio = audioBuffer.getChannelData(0);
  const originalSampleRate = audioBuffer.sampleRate;

  console.log(`📊 音频信息: ${fileName}`);
  console.log(`  采样率: ${originalSampleRate} Hz`);
  console.log(`  时长: ${(audioBuffer.duration * 1000).toFixed(0)} ms`);
  console.log(`  样本数: ${rawAudio.length}`);

  // ⚠️ 重采样到 16000Hz（模型训练的采样率）
  const TARGET_SAMPLE_RATE = 16000;
  const INPUT_SAMPLES = 3360; // 210ms @ 16000Hz
  const resampleRatio = TARGET_SAMPLE_RATE / originalSampleRate;
  
  const resampledLength = Math.ceil(rawAudio.length * resampleRatio);
  const resampledAudio = new Float32Array(resampledLength);

  // 线性插值重采样
  for (let i = 0; i < resampledLength; i++) {
    const sourcePos = i / resampleRatio;
    const intPart = Math.floor(sourcePos);
    const fracPart = sourcePos % 1;

    if (intPart >= rawAudio.length - 1) {
      resampledAudio[i] = rawAudio[rawAudio.length - 1];
    } else {
      resampledAudio[i] = 
        rawAudio[intPart] * (1 - fracPart) + 
        rawAudio[intPart + 1] * fracPart;
    }
  }

  console.log(`📊 重采样后: ${resampledLength} 样本 @ ${TARGET_SAMPLE_RATE} Hz`);

  // 获取模型
  const modelPath = '/models/vowel/model.json';
  const model = await tf.loadGraphModel(modelPath) as any;

  // 分析音频（滑动窗口）
  const ratios: Record<string, number> = {};
  const counts: Record<string, number> = {};
  const timeline: Vowel[] = [];
  let totalConfidence = 0;
  let frameCount = 0;

  for (const vowel of VOWEL_CLASSES) {
    ratios[vowel] = 0;
    counts[vowel] = 0;
  }

  // ⚠️ 处理短音频：如果音频长度小于 INPUT_SAMPLES，进行 zero-padding（居中）
  let audioToAnalyze = resampledAudio;
  if (resampledLength < INPUT_SAMPLES) {
    console.log(`⚠️ 音频太短 (${resampledLength} < ${INPUT_SAMPLES})，进行 zero-padding`);
    const padded = new Float32Array(INPUT_SAMPLES);
    const startPad = Math.floor((INPUT_SAMPLES - resampledLength) / 2);
    padded.set(resampledAudio, startPad);
    audioToAnalyze = padded;
    console.log(`📊 Padding 后: ${audioToAnalyze.length} 样本 (填充位置: ${startPad})`);
  }

  const stride = INPUT_SAMPLES / 2; // 50% 重叠
  for (let i = 0; i + INPUT_SAMPLES <= audioToAnalyze.length; i += stride) {
    const chunk = audioToAnalyze.slice(i, i + INPUT_SAMPLES);
    
    // 推理
    const input = tf.tensor2d(Array.from(chunk), [1, INPUT_SAMPLES]);
    const predictions = model.predict(input) as any;
    const probs = await predictions.data();

    // 获取最高概率的类
    let maxIdx = 0;
    let maxProb = 0;
    for (let j = 0; j < probs.length; j++) {
      if (probs[j] > maxProb) {
        maxProb = probs[j];
        maxIdx = j;
      }
    }

    const vowel = VOWEL_CLASSES[maxIdx];
    timeline.push(vowel);
    counts[vowel]++;
    totalConfidence += maxProb;
    frameCount++;

    // 更新进度
    analysisState.value.progress = i / (resampledLength - INPUT_SAMPLES);

    // 清理
    input.dispose();
    predictions.dispose();
    tf.dispose(probs);

    // 避免 UI 卡顿
    if (frameCount % 50 === 0) {
      await new Promise(r => setTimeout(r, 0));
    }
  }

  // 计算占比
  for (const vowel of VOWEL_CLASSES) {
    ratios[vowel] = frameCount > 0 ? counts[vowel] / frameCount : 0;
  }

  // 保存结果
  analysisResult.value = {
    fileName,
    duration: audioBuffer.duration * 1000,
    sampleRate: TARGET_SAMPLE_RATE,
    totalFrames: frameCount,
    ratios,
    counts,
    avgConfidence: frameCount > 0 ? totalConfidence / frameCount : 0,
    timeline
  };

  console.log('✅ 分析完成', analysisResult.value);

  // 清理
  model.dispose();
  audioContext.close();
  analysisState.value.progress = 1;
};

// ==================== 初始化回调 ====================
onMounted(() => {
  // 元音检测回调
  onVowelDetected((vowel, result) => {
    stats.totalDetections++;

    // 记录到历史
    detectionHistory.value.push({
      vowel,
      confidence: result.confidence,
      timestamp: result.timestamp,
      duration: 210 // 固定为 210ms
    });

    // 限制历史记录数量
    if (detectionHistory.value.length > 50) {
      detectionHistory.value.shift();
    }

    // 更新统计
    stats.confidences.push(result.confidence);
    stats.volumes.push(result.volume);

    // 更新统计范围
    stats.confidenceStats.min = Math.min(stats.confidenceStats.min, result.confidence);
    stats.confidenceStats.max = Math.max(stats.confidenceStats.max, result.confidence);
    stats.confidenceStats.avg = stats.confidences.reduce((a, b) => a + b, 0) / stats.confidences.length;

    stats.volumeStats.min = Math.min(stats.volumeStats.min, result.volume);
    stats.volumeStats.max = Math.max(stats.volumeStats.max, result.volume);
    stats.volumeStats.avg = stats.volumes.reduce((a, b) => a + b, 0) / stats.volumes.length;

    console.log(`✅ 检测: ${vowel}, 置信度: ${(result.confidence * 100).toFixed(1)}%`);
  });

  // 错误回调
  onError((err) => {
    console.error('❌ 检测错误:', err);
  });
});
</script>

<style scoped>
* {
  box-sizing: border-box;
}

.debug-ml-detector {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  min-height: 100vh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

header {
  text-align: center;
  margin-bottom: 30px;
  color: #333;
}

header h1 {
  font-size: 32px;
  margin: 0 0 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  background-clip: text;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.subtitle {
  margin: 0;
  color: #666;
  font-size: 14px;
}

section {
  background: white;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 20px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

section h2 {
  margin-top: 0;
  margin-bottom: 16px;
  color: #333;
  font-size: 18px;
  border-bottom: 2px solid #f0f0f0;
  padding-bottom: 10px;
}

/* 快速统计 */
.quick-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
  padding: 15px;
}

.stat-card {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 20px;
  border-radius: 8px;
  text-align: center;
}

.stat-label {
  font-size: 12px;
  opacity: 0.9;
  margin-bottom: 8px;
}

.stat-value {
  font-size: 24px;
  font-weight: bold;
}

.stat-value.running {
  color: #52c41a;
}

.stat-value.stopped {
  color: #ff4d4f;
}

/* 检测面板 */
.detection-panel {
  background: white;
}

.detection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
  margin-bottom: 20px;
}

.detection-item {
  padding: 15px;
  border: 1px solid #e8e8e8;
  border-radius: 6px;
  background: #fafafa;
}

.detection-item label {
  display: block;
  font-size: 12px;
  color: #999;
  margin-bottom: 10px;
  font-weight: 600;
}

.vowel-box {
  height: 100px;
  background: white;
  border: 2px solid #e8e8e8;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 48px;
  font-weight: bold;
  color: #ccc;
  transition: all 0.3s;
}

.vowel-box.active {
  background: #e6f7ff;
  border-color: #1890ff;
  color: #1890ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
}

.vowel-text {
  font-family: 'Arial', sans-serif;
  letter-spacing: 5px;
}

.confidence-display {
  display: flex;
  align-items: center;
  gap: 10px;
}

.confidence-bar-large {
  flex: 1;
  height: 30px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.confidence-bar-large .fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #1890ff);
  transition: width 0.3s;
}

.percentage {
  font-weight: bold;
  min-width: 50px;
  text-align: right;
  color: #1890ff;
}

.volume-display {
  display: flex;
  align-items: center;
  gap: 10px;
}

.db-value {
  font-weight: bold;
  min-width: 60px;
  color: #666;
}

.volume-bar {
  flex: 1;
  height: 20px;
  background: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.volume-bar .fill {
  height: 100%;
  background: linear-gradient(90deg, #ff7a45, #ffa940);
  transition: width 0.3s;
}

.status-badge {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.detected {
  background: #e6f7ff;
  color: #1890ff;
}

.status-badge.silence {
  background: #f5f5f5;
  color: #999;
}

.status-badge.ambiguous {
  background: #fff7e6;
  color: #ffa940;
}

/* 概率分布 */
.class-probabilities {
  margin-top: 20px;
  padding: 15px;
  background: #fafafa;
  border-radius: 6px;
}

.class-probabilities h3 {
  margin-top: 0;
  margin-bottom: 12px;
  color: #333;
}

.prob-chart {
  display: grid;
  gap: 12px;
}

.prob-bar-container {
  display: grid;
  grid-template-columns: 50px 1fr 60px;
  gap: 12px;
  align-items: center;
}

.prob-bar-container .label {
  font-weight: bold;
  text-align: center;
  color: #333;
}

.prob-bar {
  height: 20px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
}

.prob-bar .fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  transition: width 0.3s;
}

.prob-bar-container .value {
  font-size: 12px;
  color: #999;
  text-align: right;
}

/* 控制面板 */
.control-panel {
  background: white;
}

.control-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 10px;
  margin-bottom: 15px;
}

.btn {
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.btn-primary {
  background: #52c41a;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #389e0d;
}

.btn-warning {
  background: #ff4d4f;
  color: white;
}

.btn-warning:hover:not(:disabled) {
  background: #cf1322;
}

.btn-secondary {
  background: #999;
  color: white;
}

.btn-secondary:hover {
  background: #666;
}

.btn-info {
  background: #1890ff;
  color: white;
}

.btn-info:hover {
  background: #0050b3;
}

.btn-small {
  padding: 6px 12px;
  font-size: 12px;
  background: #1890ff;
  color: white;
}

.btn-small:hover {
  background: #0050b3;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.error-box {
  background: #fff1f0;
  border: 1px solid #ffa39e;
  border-radius: 4px;
  padding: 12px 16px;
  margin-bottom: 15px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #cf1322;
  font-size: 14px;
}

.close-btn {
  background: none;
  border: none;
  color: #cf1322;
  cursor: pointer;
  font-size: 16px;
  padding: 0;
}

.init-status {
  background: #fafafa;
  padding: 12px;
  border-radius: 4px;
  font-size: 14px;
}

.status-row {
  display: flex;
  justify-content: space-between;
  margin: 8px 0;
}

.status-row .success {
  color: #52c41a;
  font-weight: bold;
}

.status-row .error {
  color: #ff4d4f;
  font-weight: bold;
}

/* ==================== 离线分析样式 ==================== */
.offline-analysis {
  background: linear-gradient(135deg, #fafafa 0%, #f5f5f5 100%);
}

.section-desc {
  color: #666;
  font-size: 14px;
  margin: 0 0 15px;
}

.upload-section {
  margin-bottom: 20px;
}

.upload-box {
  position: relative;
  border: 2px dashed #d9d9d9;
  border-radius: 8px;
  padding: 40px;
  text-align: center;
  transition: all 0.3s;
}

.upload-box:hover {
  border-color: #40a9ff;
  background: #fafafa;
}

.file-input {
  display: none;
}

.upload-label {
  cursor: pointer;
  display: block;
}

.upload-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 10px;
}

.upload-text {
  display: block;
  font-size: 16px;
  color: #333;
  font-weight: 500;
  margin-bottom: 5px;
}

.upload-hint {
  display: block;
  font-size: 12px;
  color: #999;
}

.analysis-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 30px;
  background: #f9f9f9;
  border-radius: 8px;
}

.progress-spinner {
  width: 40px;
  height: 40px;
  border: 4px solid #f3f3f3;
  border-top: 4px solid #1890ff;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 15px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: #fff1f0;
  border: 1px solid #ffa39e;
  border-radius: 4px;
  padding: 12px 16px;
  color: #cf1322;
  display: flex;
  align-items: center;
  gap: 8px;
}

.error-icon {
  font-size: 16px;
}

/* 分析结果样式 */
.analysis-result {
  background: linear-gradient(135deg, #fafafa 0%, #f0f2f5 100%);
  border-radius: 8px;
  padding: 20px;
}

.result-header {
  margin-bottom: 20px;
  border-bottom: 2px solid #e8e8e8;
  padding-bottom: 15px;
}

.result-header h3 {
  margin: 0 0 5px;
  color: #333;
}

.file-info {
  margin: 0;
  color: #999;
  font-size: 13px;
}

/* 元音占比 */
.vowel-ratio {
  margin-bottom: 25px;
}

.vowel-ratio h4 {
  margin: 0 0 15px;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}

.ratio-chart {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ratio-item {
  display: flex;
  align-items: center;
  gap: 10px;
}

.ratio-bar-wrapper {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.ratio-label {
  min-width: 30px;
  text-align: center;
  font-weight: 600;
  color: #333;
}

.ratio-bar {
  flex: 1;
  height: 24px;
  background: #e8e8e8;
  border-radius: 4px;
  overflow: hidden;
}

.ratio-fill {
  height: 100%;
  background: linear-gradient(90deg, #667eea 0%, #764ba2 100%);
  transition: width 0.3s;
}

.ratio-value {
  min-width: 85px;
  text-align: right;
  font-size: 13px;
  color: #666;
}

/* 分析统计 */
.analysis-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 15px;
  margin-bottom: 25px;
}

.stat-box {
  background: white;
  padding: 15px;
  border-radius: 6px;
  text-align: center;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.05);
}

.stat-box .stat-label {
  font-size: 12px;
  color: #999;
  margin-bottom: 8px;
}

.stat-box .stat-val {
  font-size: 20px;
  font-weight: 600;
  color: #333;
}

/* 时间轴 */
.timeline-analysis {
  border-top: 2px solid #e8e8e8;
  padding-top: 20px;
}

.timeline-analysis h4 {
  margin: 0 0 12px;
  color: #333;
  font-size: 14px;
  font-weight: 600;
}

.timeline {
  display: flex;
  gap: 1px;
  height: 30px;
  margin-bottom: 12px;
  background: white;
  border-radius: 4px;
  overflow: hidden;
}

.timeline-bar {
  flex: 1;
  min-width: 2px;
  transition: all 0.2s;
}

.timeline-bar:hover {
  filter: brightness(0.9);
}

/* 元音颜色 */
.timeline-bar.vowel-A,
.ratio-fill,
.vowel-A {
  background-color: #ff4d4f;
}

.timeline-bar.vowel-E {
  background-color: #fa8c16;
}

.timeline-bar.vowel-I {
  background-color: #faad14;
}

.timeline-bar.vowel-O {
  background-color: #1890ff;
}

.timeline-bar.vowel-U {
  background-color: #722ed1;
}

.timeline-bar.vowel-silence {
  background-color: #d9d9d9;
}

.timeline-legend {
  display: flex;
  gap: 15px;
  flex-wrap: wrap;
  padding: 10px 0;
  border-top: 1px solid #e8e8e8;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.legend-color {
  width: 16px;
  height: 16px;
  border-radius: 2px;
}

.legend-color.vowel-A { background-color: #ff4d4f; }
.legend-color.vowel-E { background-color: #fa8c16; }
.legend-color.vowel-I { background-color: #faad14; }
.legend-color.vowel-O { background-color: #1890ff; }
.legend-color.vowel-U { background-color: #722ed1; }
.legend-color.vowel-silence { background-color: #d9d9d9; }

.status-row .pending {
  color: #ffa940;
  font-weight: bold;
}

/* 历史面板 */
.history-panel {
  background: white;
}

.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 15px;
}

.history-count {
  color: #999;
  font-size: 14px;
}

.history-list {
  max-height: 300px;
  overflow-y: auto;
  border: 1px solid #e8e8e8;
  border-radius: 4px;
}

.history-item {
  display: grid;
  grid-template-columns: 80px 80px 80px 1fr;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-bottom: 1px solid #e8e8e8;
  font-size: 13px;
}

.history-item:last-child {
  border-bottom: none;
}

.timestamp {
  color: #999;
  font-family: 'Courier New', monospace;
}

.vowel-badge {
  padding: 4px 8px;
  border-radius: 3px;
  font-weight: bold;
  text-align: center;
  color: white;
  font-size: 12px;
}

.vowel-badge.a { background: #ff4d4f; }
.vowel-badge.e { background: #ff7a45; }
.vowel-badge.i { background: #ffa940; }
.vowel-badge.o { background: #1890ff; }
.vowel-badge.u { background: #722ed1; }
.vowel-badge.silence { background: #ccc; }

.confidence {
  color: #667eea;
  font-weight: bold;
}

.duration {
  color: #999;
}

.empty-state {
  padding: 20px;
  text-align: center;
  color: #999;
}

/* 性能分析 */
.perf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 15px;
}

.perf-card {
  background: #fafafa;
  padding: 15px;
  border-radius: 6px;
  border-left: 3px solid #667eea;
}

.perf-card h3 {
  margin: 0 0 10px;
  font-size: 14px;
  color: #999;
}

.perf-value {
  font-size: 24px;
  font-weight: bold;
  color: #333;
  margin-bottom: 8px;
}

.perf-detail {
  font-size: 12px;
  color: #999;
  line-height: 1.6;
}

.vowel-distribution {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}

.dist-item {
  text-align: center;
  padding: 8px;
  background: white;
  border-radius: 4px;
}

.dist-item .vowel {
  display: block;
  font-weight: bold;
  color: #333;
  margin-bottom: 4px;
}

.dist-item .count {
  display: block;
  color: #667eea;
  font-size: 18px;
  font-weight: bold;
}

/* 调试面板 */
.debug-panel {
  background: #1e1e1e;
  color: #d4d4d4;
}

.debug-tabs {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  border-bottom: 1px solid #404040;
  padding-bottom: 10px;
}

.tab-btn {
  background: none;
  border: none;
  color: #999;
  cursor: pointer;
  font-size: 13px;
  padding: 6px 12px;
  border-bottom: 2px solid transparent;
  transition: all 0.3s;
}

.tab-btn.active {
  color: #1890ff;
  border-bottom-color: #1890ff;
}

.debug-output {
  background: #2d2d2d;
  padding: 12px;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0;
  font-size: 12px;
  line-height: 1.5;
  color: #ce9178;
}

/* 响应式 */
@media (max-width: 768px) {
  .debug-ml-detector {
    padding: 10px;
  }

  header h1 {
    font-size: 24px;
  }

  .detection-grid {
    grid-template-columns: 1fr;
  }

  .history-item {
    grid-template-columns: 1fr;
    gap: 4px;
  }

  .perf-grid {
    grid-template-columns: 1fr;
  }
}
</style>
