<template>
  <div class="debug-view">
    <header class="debug-header">
      <h1>🔧 OIIAIOIIIAI 元音识别调试</h1>
      <p class="subtitle">实时监测元音检测过程与性能指标</p>
    </header>

    <!-- ==================== 检测器切换 ==================== -->
    <section class="detector-switch">
      <div class="switch-buttons">
        <button
          class="switch-btn"
          :class="{ active: activeDetector === 'cnn' }"
          @click="switchDetector('cnn')"
          :disabled="isListening"
        >
          🧠 CNN 模型
        </button>
        <button
          class="switch-btn"
          :class="{ active: activeDetector === 'mfcc' }"
          @click="switchDetector('mfcc')"
          :disabled="isListening"
        >
          📊 共振峰 (MFCC)
        </button>
      </div>
      <span class="switch-hint" v-if="isListening">停止监听后可切换检测器</span>
    </section>

    <!-- ==================== 快速统计 ==================== -->
    <section class="quick-stats">
      <div class="stat-card">
        <div class="stat-label">检测总数</div>
        <div class="stat-value">{{ perfStats.totalDetections }}</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均延迟</div>
        <div class="stat-value">{{ perfStats.latencyStats.avg.toFixed(0) }}ms</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">当前检测器</div>
        <div class="stat-value">{{ activeDetector === 'cnn' ? 'CNN' : 'MFCC' }}</div>
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
          <div class="vowel-box" :class="{ active: confirmedVowel, [`v-${confirmedVowel?.toLowerCase()}`]: confirmedVowel }">
            <span class="vowel-text">{{ confirmedVowel || '--' }}</span>
          </div>
        </div>

        <!-- 置信度 -->
        <div class="detection-item">
          <label>置信度</label>
          <div class="confidence-display">
            <div class="bar-track">
              <div
                class="bar-fill confidence"
                :style="{ width: `${(currentResult?.confidence ?? 0) * 100}%` }"
              ></div>
            </div>
            <span class="bar-label">{{ ((currentResult?.confidence ?? 0) * 100).toFixed(1) }}%</span>
          </div>
        </div>

        <!-- 音量 -->
        <div class="detection-item">
          <label>音量级别</label>
          <div class="confidence-display">
            <span class="bar-label-left">{{ currentResult?.volume.toFixed(1) ?? '--' }} dB</span>
            <div class="bar-track">
              <div
                class="bar-fill volume"
                :style="{ width: `${Math.max(0, (currentResult?.volume ?? -100) + 100)}%` }"
              ></div>
            </div>
          </div>
        </div>

        <!-- 状态 -->
        <div class="detection-item">
          <label>检测状态</label>
          <div class="status-badge" :class="isSilenceState ? 'silence' : currentResult?.status">
            {{ isSilenceState ? 'silence' : (currentResult?.status || 'idle') }}
          </div>
        </div>
      </div>

      <!-- CNN: 各类别概率分布 -->
      <div class="class-probabilities" v-if="latestProbabilities">
        <h3>🎯 各类别概率分布</h3>
        <div class="prob-chart">
          <div
            v-for="(prob, idx) in latestProbabilities"
            :key="idx"
            class="prob-bar-container"
          >
            <span class="prob-label">{{ VOWEL_CLASSES[idx] }}</span>
            <div class="prob-bar">
              <div class="bar-fill prob" :style="{ width: `${prob * 100}%` }"></div>
              <div
                v-if="peakProbabilities[idx] > 0.01"
                class="peak-marker"
                :style="{ left: `${peakProbabilities[idx] * 100}%` }"
                :title="`峰值: ${(peakProbabilities[idx] * 100).toFixed(1)}%`"
              ></div>
            </div>
            <span class="prob-value">{{ (prob * 100).toFixed(1) }}%</span>
          </div>
        </div>
      </div>

      <!-- MFCC: 共振峰数据 -->
      <div class="formant-data" v-if="activeDetector === 'mfcc' && currentResult && currentResult.formants.f1 > 0">
        <h3>📈 共振峰数据</h3>
        <div class="formant-items">
          <div class="formant-item">
            <label>F1 (第一共振峰)</label>
            <span class="formant-val">{{ currentResult.formants.f1.toFixed(0) }} Hz</span>
            <div class="bar-track">
              <div class="bar-fill f1" :style="{ width: `${Math.min(100, currentResult.formants.f1 / 12)}%` }"></div>
            </div>
          </div>
          <div class="formant-item">
            <label>F2 (第二共振峰)</label>
            <span class="formant-val">{{ currentResult.formants.f2.toFixed(0) }} Hz</span>
            <div class="bar-track">
              <div class="bar-fill f2" :style="{ width: `${Math.min(100, currentResult.formants.f2 / 35)}%` }"></div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 序列进度 + 游戏状态 ==================== -->
    <section class="game-section">
      <h2>🎮 游戏状态</h2>
      <div class="game-grid">
        <div class="sequence-display">
          <span class="seq-label">{{ currentPreset.name }}: {{ currentPreset.description }}</span>
          <div class="sequence-chars">
            <span
              v-for="(hint, index) in pronunciationHints"
              :key="index"
              class="seq-char"
              :class="{
                active: index === gameStats.sequenceIndex,
                done: index < gameStats.sequenceIndex || (gameStats.sequenceIndex === 0 && gameStats.perfectCycles > 0)
              }"
            >{{ hint }}</span>
          </div>
          <span class="cycle-count">完美循环: {{ gameStats.perfectCycles }} 次</span>
        </div>
        <div class="game-stats-grid">
          <div class="gs-item">
            <label>状态</label>
            <span class="gs-val" :class="gameState">{{ stateLabels[gameState] }}</span>
          </div>
          <div class="gs-item">
            <label>分数</label>
            <span class="gs-val score">{{ gameStats.score.toLocaleString() }}</span>
          </div>
          <div class="gs-item">
            <label>连击</label>
            <span class="gs-val combo">{{ gameStats.combo }}x</span>
          </div>
          <div class="gs-item">
            <label>阶段</label>
            <span class="gs-val" :class="`stage-${gameStats.stage}`">
              Stage {{ gameStats.stage }}: {{ gameStats.stageName }}
            </span>
          </div>
          <div class="gs-item">
            <label>最高连击</label>
            <span class="gs-val">{{ gameStats.maxCombo }}x</span>
          </div>
          <div class="gs-item">
            <label>连续错误</label>
            <span class="gs-val" :class="{ 'err-warn': gameStats.consecutiveErrors > 0 }">
              {{ gameStats.consecutiveErrors }} / 3
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 离线分析（仅 CNN） ==================== -->
    <section class="offline-analysis" v-if="activeDetector === 'cnn'">
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
          <span>❌</span> {{ analysisState.error }}
        </div>
      </div>

      <div v-if="analysisResult" class="analysis-result">
        <div class="result-header">
          <h3>📊 分析结果</h3>
          <p class="file-info">{{ analysisResult.fileName }} - {{ (analysisResult.duration / 1000).toFixed(2) }}s</p>
        </div>

        <div class="vowel-ratio">
          <h4>元音占比分布</h4>
          <div class="ratio-chart">
            <div v-for="vowel in VOWEL_CLASSES" :key="vowel" class="ratio-item">
              <span class="ratio-label">{{ vowel }}</span>
              <div class="bar-track">
                <div class="bar-fill ratio" :style="{ width: `${(analysisResult.ratios[vowel] ?? 0) * 100}%` }"></div>
              </div>
              <span class="ratio-value">
                {{ ((analysisResult.ratios[vowel] ?? 0) * 100).toFixed(1) }}%
                ({{ analysisResult.counts[vowel] ?? 0 }})
              </span>
            </div>
          </div>
        </div>

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

        <div class="timeline-section">
          <h4>元音时间轴</h4>
          <div class="timeline">
            <div
              v-for="(frame, idx) in analysisResult.timeline.slice(0, 200)"
              :key="idx"
              class="timeline-bar"
              :class="`tl-${frame}`"
              :title="`${frame} (${idx})`"
            ></div>
          </div>
          <div class="timeline-legend">
            <div v-for="v in VOWEL_CLASSES" :key="v" class="legend-item">
              <div class="legend-color" :class="`tl-${v}`"></div>
              <span>{{ v }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 控制面板 ==================== -->
    <section class="control-panel">
      <h2>⚙️ 控制面板</h2>
      <div class="control-buttons">
        <button @click="handleStart" :disabled="isListening" class="btn btn-start">
          ▶️ 启动监听
        </button>
        <button @click="handleStop" :disabled="!isListening" class="btn btn-stop">
          ⏹️ 停止监听
        </button>
        <button @click="handleReset" class="btn btn-reset">
          🔄 重置数据
        </button>
        <button @click="showDebugInfo = !showDebugInfo" class="btn btn-debug">
          {{ showDebugInfo ? '🙈 隐藏' : '🔍 显示' }}调试信息
        </button>
      </div>

      <div v-if="error" class="error-box">
        <strong>❌ 错误:</strong> {{ error }}
        <button @click="dismissError" class="close-btn">✕</button>
      </div>

      <div class="init-status" v-if="activeDetector === 'cnn'">
        <div class="status-row">
          <span>模型加载:</span>
          <span :class="isInitialized ? 'ok' : 'pending'">
            {{ isInitialized ? '✅ 完成' : '⏳ 等待中...' }}
          </span>
        </div>
        <div class="status-row">
          <span>麦克风访问:</span>
          <span :class="micPermission === true ? 'ok' : micPermission === false ? 'fail' : 'pending'">
            {{ micPermission === true ? '✅ 已获得' : micPermission === false ? '❌ 被拒绝' : '⏳ 等待中...' }}
          </span>
        </div>
      </div>
    </section>

    <!-- ==================== 性能分析 ==================== -->
    <section class="performance-panel">
      <h2>⚡ 性能分析</h2>
      <div class="perf-grid">
        <div class="perf-card">
          <h3>推理时间</h3>
          <div class="perf-value">{{ perfStats.latencyStats.avg.toFixed(1) }}ms</div>
          <div class="perf-detail">
            最小: {{ perfStats.latencyStats.min === Infinity ? '--' : perfStats.latencyStats.min.toFixed(1) }}ms ·
            最大: {{ perfStats.latencyStats.max === -Infinity ? '--' : perfStats.latencyStats.max.toFixed(1) }}ms
          </div>
        </div>
        <div class="perf-card">
          <h3>置信度范围</h3>
          <div class="perf-value">{{ (perfStats.confidenceStats.avg * 100).toFixed(1) }}%</div>
          <div class="perf-detail">
            最小: {{ (perfStats.confidenceStats.min * 100).toFixed(1) }}% ·
            最大: {{ (perfStats.confidenceStats.max * 100).toFixed(1) }}%
          </div>
        </div>
        <div class="perf-card">
          <h3>音量范围</h3>
          <div class="perf-value">{{ perfStats.volumeStats.avg.toFixed(1) }}dB</div>
          <div class="perf-detail">
            最小: {{ perfStats.volumeStats.min === Infinity ? '--' : perfStats.volumeStats.min.toFixed(1) }}dB ·
            最大: {{ perfStats.volumeStats.max === -Infinity ? '--' : perfStats.volumeStats.max.toFixed(1) }}dB
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
              <span class="dist-vowel">{{ vowel }}</span>
              <span class="dist-count">{{ count }}</span>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ==================== 检测历史 ==================== -->
    <section class="history-panel">
      <h2>📋 检测历史（最近 50 条）</h2>
      <div class="controls-row">
        <button @click="detectionHistory = []" class="btn btn-small">清空历史</button>
        <span class="history-count">共 {{ detectionHistory.length }} 条记录</span>
      </div>
      <div class="history-list">
        <div
          v-for="(record, idx) in detectionHistory.slice().reverse()"
          :key="idx"
          class="history-item"
        >
          <span class="h-time">{{ formatTime(record.timestamp) }}</span>
          <span class="vowel-badge" :class="record.vowel.toLowerCase()">{{ record.vowel }}</span>
          <span class="h-conf">{{ (record.confidence * 100).toFixed(0) }}%</span>
          <span class="h-dur">{{ record.duration.toFixed(0) }}ms</span>
        </div>
        <div v-if="detectionHistory.length === 0" class="empty-state">
          没有检测记录，请启动监听...
        </div>
      </div>
    </section>

    <!-- ==================== 事件日志 ==================== -->
    <section class="log-section">
      <h2>📝 事件日志 <button class="btn btn-small" @click="logs = []">清空</button></h2>
      <div class="log-container" ref="logContainer">
        <div
          v-for="(log, index) in logs"
          :key="index"
          class="log-item"
          :class="log.type"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="logs.length === 0" class="no-logs">暂无日志</div>
      </div>
    </section>

    <!-- ==================== 频谱可视化（仅 MFCC） ==================== -->
    <section class="spectrum-section" v-if="activeDetector === 'mfcc'">
      <h2>🌈 频谱可视化</h2>
      <canvas ref="spectrumCanvas" width="600" height="150"></canvas>
    </section>

    <!-- ==================== 调试信息 ==================== -->
    <section v-if="showDebugInfo" class="debug-info-panel">
      <h2>🐛 调试信息</h2>
      <div class="debug-tabs">
        <button
          v-for="tab in debugTabOptions"
          :key="tab.key"
          @click="debugTab = tab.key"
          :class="{ active: debugTab === tab.key }"
          class="tab-btn"
        >{{ tab.label }}</button>
      </div>
      <pre class="debug-output">{{ debugTabContent }}</pre>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';
import { useVowelDetector } from '@/composables/useVowelDetector';
import { useGameState } from '@/composables/useGameState';
import { getTargetSequence, getPronunciationHints, getCurrentPreset } from '@/config/vowels';
import type { Vowel, GameState, VowelDetectorHookReturn } from '@/types/game';

// ==================== 常量 ====================
const VOWEL_CLASSES = ['A', 'E', 'I', 'O', 'U', 'silence'] as const;

// ==================== 检测器实例 ====================
const cnnDetector = useVowelDetectorML({ modelPath: '/models/vowel/model.json' });
const mfccDetector = useVowelDetector();

const activeDetector = ref<'cnn' | 'mfcc'>('cnn');

function getDetector(): VowelDetectorHookReturn {
  return activeDetector.value === 'cnn' ? cnnDetector : mfccDetector;
}

// ==================== 计算属性代理 (响应式桥接) ====================
const currentResult = computed(() => getDetector().currentResult.value);
const confirmedVowel = computed(() => getDetector().confirmedVowel.value);
const isListening = computed(() => getDetector().isListening.value);
const isInitialized = computed(() => getDetector().isInitialized.value);
const error = computed(() => getDetector().error.value);
const latestProbabilities = computed(() => getDetector().latestProbabilities.value);
const debugData = computed(() => getDetector().debugData.value);

// ==================== 游戏状态 ====================
const {
  state: gameState,
  stats: gameStats,
  startGame,
  processVowel,
  interrupt,
  reset: resetGame,
  onStageChange,
  onComboBreak,
  onPerfectCycle,
  onScoreUpdate
} = useGameState();

// ==================== 本地状态 ====================
const showDebugInfo = ref(false);
const debugTab = ref<string>('raw');
const micPermission = ref<boolean | null>(null);
const logs = ref<{ time: string; message: string; type: string }[]>([]);
const logContainer = ref<HTMLDivElement | null>(null);
const spectrumCanvas = ref<HTMLCanvasElement | null>(null);
const audioFileInput = ref<HTMLInputElement | null>(null);
let animationId: number | null = null;

// ==================== 检测历史 + 性能统计 ====================
const detectionHistory = ref<Array<{
  vowel: Vowel;
  confidence: number;
  timestamp: number;
  duration: number;
}>>([]);

const perfStats = reactive({
  totalDetections: 0,
  latencyStats: { min: Infinity, max: -Infinity, avg: 0 },
  confidenceStats: { min: 1, max: 0, avg: 0 },
  volumeStats: { min: Infinity, max: -Infinity, avg: 0 },
  _confidences: [] as number[],
  _volumes: [] as number[]
});

// ==================== 峰值追踪（CNN only） ====================
const peakProbabilities = ref<number[]>([0, 0, 0, 0, 0, 0]);

const isSilenceState = computed(() => {
  const r = currentResult.value;
  if (!r) return true;
  if (r.status === 'detected' && r.vowel && r.vowel !== 'silence') return false;
  return true;
});

watch(isSilenceState, (isSilence, wasSilent) => {
  if (!isSilence && wasSilent) {
    peakProbabilities.value = [0, 0, 0, 0, 0, 0];
  }
});

watch(latestProbabilities, (probs) => {
  if (!probs) return;
  for (let i = 0; i < probs.length; i++) {
    if (probs[i] > peakProbabilities.value[i]) {
      peakProbabilities.value[i] = probs[i];
    }
  }
});

// ==================== 离线分析 ====================
const analysisState = ref({ analyzing: false, progress: 0, error: '' });
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

// ==================== 游戏序列 ====================
const pronunciationHints = computed(() => getPronunciationHints());
const currentPreset = computed(() => getCurrentPreset());

const stateLabels: Record<GameState, string> = {
  idle: '待机',
  ready: '准备中',
  playing: '游戏中',
  paused: '已暂停',
  interrupted: '已中断',
  sharing: '分享中'
};

// ==================== 元音分布 ====================
const vowelDistribution = computed(() => {
  const dist: Record<string, number> = {};
  for (const record of detectionHistory.value) {
    dist[record.vowel] = (dist[record.vowel] ?? 0) + 1;
  }
  return dist;
});

// ==================== 调试信息选项卡 ====================
const debugTabOptions = computed(() => {
  const tabs = [
    { key: 'raw', label: '原始数据' },
    { key: 'config', label: '配置' },
    { key: 'memory', label: '内存' },
  ];
  if (activeDetector.value === 'mfcc') {
    tabs.push({ key: 'spectrum', label: '频域数据' });
  }
  return tabs;
});

const debugTabContent = computed(() => {
  switch (debugTab.value) {
    case 'raw':
      return JSON.stringify({
        detector: activeDetector.value,
        isListening: isListening.value,
        isInitialized: isInitialized.value,
        currentResult: currentResult.value,
        confirmedVowel: confirmedVowel.value,
        error: error.value,
        detectionCount: perfStats.totalDetections,
        historyLength: detectionHistory.value.length,
        diagnostics: getDetector().getAudioDiagnostics()
      }, null, 2);
    case 'config':
      return JSON.stringify({
        detector: activeDetector.value,
        modelPath: activeDetector.value === 'cnn' ? '/models/vowel/model.json' : 'N/A (formant)',
        inputSamples: activeDetector.value === 'cnn' ? 3360 : 'N/A',
        sampleRate: activeDetector.value === 'cnn' ? 16000 : 'native',
        voiceClasses: [...VOWEL_CLASSES]
      }, null, 2);
    case 'memory': {
      const perfMemory = (performance as any).memory;
      if (!perfMemory) return '浏览器不支持内存统计';
      return `已使用: ${(perfMemory.usedJSHeapSize / 1048576).toFixed(1)} MB\n总限制: ${(perfMemory.jsHeapSizeLimit / 1048576).toFixed(1)} MB\n使用率: ${((perfMemory.usedJSHeapSize / perfMemory.jsHeapSizeLimit) * 100).toFixed(1)}%`;
    }
    case 'spectrum':
      return JSON.stringify(debugData.value, null, 2);
    default:
      return '';
  }
});

// ==================== 方法 ====================
function switchDetector(type: 'cnn' | 'mfcc') {
  if (isListening.value) return;
  activeDetector.value = type;
  handleReset();
  addLog(`切换检测器: ${type === 'cnn' ? 'CNN 模型' : '共振峰 (MFCC)'}`, 'info');
}

function dismissError() {
  const d = getDetector();
  d.error.value = null;
}

async function handleStart() {
  try {
    micPermission.value = null;
    const d = getDetector();

    // 注册回调
    d.onVowelDetected((vowel, result) => {
      perfStats.totalDetections++;
      detectionHistory.value.push({
        vowel,
        confidence: result.confidence,
        timestamp: result.timestamp,
        duration: activeDetector.value === 'cnn' ? 210 : 50
      });
      if (detectionHistory.value.length > 50) detectionHistory.value.shift();

      // 更新性能统计
      perfStats._confidences.push(result.confidence);
      perfStats._volumes.push(result.volume);
      perfStats.confidenceStats.min = Math.min(perfStats.confidenceStats.min, result.confidence);
      perfStats.confidenceStats.max = Math.max(perfStats.confidenceStats.max, result.confidence);
      perfStats.confidenceStats.avg = perfStats._confidences.reduce((a, b) => a + b, 0) / perfStats._confidences.length;
      perfStats.volumeStats.min = Math.min(perfStats.volumeStats.min, result.volume);
      perfStats.volumeStats.max = Math.max(perfStats.volumeStats.max, result.volume);
      perfStats.volumeStats.avg = perfStats._volumes.reduce((a, b) => a + b, 0) / perfStats._volumes.length;

      addLog(`检测到元音: ${vowel} (置信度: ${(result.confidence * 100).toFixed(0)}%)`, 'vowel');

      // 游戏自动控制
      const firstVowel = getTargetSequence()[0];
      if ((gameState.value === 'idle' || gameState.value === 'interrupted') && vowel === firstVowel) {
        startGame();
        addLog('🎮 游戏自动开始！', 'success');
      }
      if (gameState.value === 'playing') {
        processVowel(vowel);
      }
    });

    d.onSilence((duration) => {
      if (duration > 500 && duration % 500 < 50) {
        addLog(`静音中... ${(duration / 1000).toFixed(1)}s`, 'silence');
      }
      if (gameState.value === 'playing' && duration >= 1500) {
        interrupt('silence_timeout');
      }
    });

    d.onError((err) => {
      addLog(`错误: ${err.message}`, 'error');
    });

    await d.start();
    micPermission.value = true;
    addLog(`开始监听 (${activeDetector.value === 'cnn' ? 'CNN' : 'MFCC'}) - 发出 "O" 开始游戏`, 'success');

    if (activeDetector.value === 'mfcc') {
      drawSpectrum();
    }
  } catch (e) {
    if (e instanceof Error && e.message.includes('Permission denied')) {
      micPermission.value = false;
    }
    addLog(`启动失败: ${e}`, 'error');
  }
}

function handleStop() {
  getDetector().stop();
  resetGame();
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }
  addLog('停止监听', 'info');
}

function handleReset() {
  getDetector().reset();
  resetGame();
  detectionHistory.value = [];
  perfStats.totalDetections = 0;
  perfStats._confidences = [];
  perfStats._volumes = [];
  perfStats.latencyStats = { min: Infinity, max: -Infinity, avg: 0 };
  perfStats.confidenceStats = { min: 1, max: 0, avg: 0 };
  perfStats.volumeStats = { min: Infinity, max: -Infinity, avg: 0 };
  peakProbabilities.value = [0, 0, 0, 0, 0, 0];
  analysisResult.value = null;
  addLog('数据已重置', 'info');
}

function addLog(message: string, type: string = 'info') {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  logs.value.push({ time, message, type });
  if (logs.value.length > 100) logs.value.shift();
  nextTick(() => {
    if (logContainer.value) logContainer.value.scrollTop = logContainer.value.scrollHeight;
  });
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('zh-CN', {
    hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

// ==================== 离线音频分析（CNN only） ====================
async function handleFileSelected(event: Event) {
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

  if (audioFileInput.value) audioFileInput.value.value = '';
}

async function analyzeAudioFile(arrayBuffer: ArrayBuffer, fileName: string) {
  const tf = await import('@tensorflow/tfjs');
  const audioContext = new AudioContext();
  const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  const rawAudio = audioBuffer.getChannelData(0);
  const originalSampleRate = audioBuffer.sampleRate;
  const TARGET_SAMPLE_RATE = 16000;
  const INPUT_SAMPLES = 3360;

  // 重采样到 16kHz
  const resampleRatio = TARGET_SAMPLE_RATE / originalSampleRate;
  const resampledLength = Math.ceil(rawAudio.length * resampleRatio);
  const resampledAudio = new Float32Array(resampledLength);
  for (let i = 0; i < resampledLength; i++) {
    const sourcePos = i / resampleRatio;
    const intPart = Math.floor(sourcePos);
    const fracPart = sourcePos % 1;
    resampledAudio[i] = intPart >= rawAudio.length - 1
      ? rawAudio[rawAudio.length - 1]
      : rawAudio[intPart] * (1 - fracPart) + rawAudio[intPart + 1] * fracPart;
  }

  // 短音频 zero-padding
  let audioToAnalyze = resampledAudio;
  if (resampledLength < INPUT_SAMPLES) {
    const padded = new Float32Array(INPUT_SAMPLES);
    padded.set(resampledAudio, Math.floor((INPUT_SAMPLES - resampledLength) / 2));
    audioToAnalyze = padded;
  }

  const model = await tf.loadGraphModel('/models/vowel/model.json') as any;
  const ratios: Record<string, number> = {};
  const counts: Record<string, number> = {};
  const timeline: Vowel[] = [];
  let totalConfidence = 0;
  let frameCount = 0;

  for (const v of VOWEL_CLASSES) {
    ratios[v] = 0;
    counts[v] = 0;
  }

  const stride = INPUT_SAMPLES / 2;
  for (let i = 0; i + INPUT_SAMPLES <= audioToAnalyze.length; i += stride) {
    const chunk = audioToAnalyze.slice(i, i + INPUT_SAMPLES);
    const input = tf.tensor2d(Array.from(chunk), [1, INPUT_SAMPLES]);
    const predictions = model.predict(input) as any;
    const probs = await predictions.data();

    let maxIdx = 0;
    let maxProb = 0;
    for (let j = 0; j < probs.length; j++) {
      if (probs[j] > maxProb) { maxProb = probs[j]; maxIdx = j; }
    }

    const vowel = VOWEL_CLASSES[maxIdx];
    timeline.push(vowel);
    counts[vowel]++;
    totalConfidence += maxProb;
    frameCount++;
    analysisState.value.progress = i / (audioToAnalyze.length - INPUT_SAMPLES);

    input.dispose();
    predictions.dispose();
    tf.dispose(probs);
    if (frameCount % 50 === 0) await new Promise(r => setTimeout(r, 0));
  }

  for (const v of VOWEL_CLASSES) {
    ratios[v] = frameCount > 0 ? counts[v] / frameCount : 0;
  }

  analysisResult.value = {
    fileName,
    duration: audioBuffer.duration * 1000,
    sampleRate: TARGET_SAMPLE_RATE,
    totalFrames: frameCount,
    ratios, counts,
    avgConfidence: frameCount > 0 ? totalConfidence / frameCount : 0,
    timeline
  };

  model.dispose();
  audioContext.close();
  analysisState.value.progress = 1;
}

// ==================== 频谱绘制（MFCC only） ====================
function drawSpectrum() {
  const canvas = spectrumCanvas.value;
  const data = debugData.value?.frequencyData;

  if (canvas && data) {
    const ctx = canvas.getContext('2d');
    if (ctx) {
      const { width, height } = canvas;
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, width, height);

      const binCount = Math.min(256, data.length);
      const barWidth = width / binCount;

      for (let i = 0; i < binCount; i++) {
        const normalizedValue = Math.max(0, (data[i] + 100) / 100);
        const barHeight = normalizedValue * height;
        const hue = (i / binCount) * 240;
        ctx.fillStyle = `hsl(${hue}, 80%, ${50 + normalizedValue * 30}%)`;
        ctx.fillRect(i * barWidth, height - barHeight, barWidth - 1, barHeight);
      }

      // 共振峰标记
      const r = currentResult.value;
      if (r && r.status === 'detected' && r.formants.f1 > 0) {
        const f1Bin = Math.floor(r.formants.f1 / 4000 * binCount);
        const f2Bin = Math.floor(r.formants.f2 / 4000 * binCount);

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(f1Bin * barWidth, 0);
        ctx.lineTo(f1Bin * barWidth, height);
        ctx.stroke();
        ctx.fillStyle = '#00ff00';
        ctx.font = '10px monospace';
        ctx.fillText(`F1: ${r.formants.f1.toFixed(0)}Hz`, f1Bin * barWidth + 2, 12);

        ctx.strokeStyle = '#ff00ff';
        ctx.beginPath();
        ctx.moveTo(f2Bin * barWidth, 0);
        ctx.lineTo(f2Bin * barWidth, height);
        ctx.stroke();
        ctx.fillStyle = '#ff00ff';
        ctx.fillText(`F2: ${r.formants.f2.toFixed(0)}Hz`, f2Bin * barWidth + 2, 24);
      }
    }
  }

  animationId = requestAnimationFrame(drawSpectrum);
}

// ==================== 游戏事件回调 ====================
onStageChange((from, to) => {
  addLog(`🎉 阶段提升! Stage ${from} → Stage ${to}`, 'stage');
});

onComboBreak((combo, reason) => {
  const text = reason === 'silence_timeout' ? '静音超时' : reason === 'consecutive_errors' ? '连续错误' : '手动中断';
  addLog(`💔 连击中断: ${combo}x (原因: ${text})`, 'break');
});

onPerfectCycle((count) => {
  addLog(`✨ 完美循环 #${count}!`, 'perfect');
});

onScoreUpdate((score, delta) => {
  if (delta > 0) addLog(`+${delta} 分 (总分: ${score})`, 'score');
});

// ==================== 生命周期 ====================
onMounted(() => {
  addLog('调试页面已加载', 'info');
});

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId);
  cnnDetector.stop();
  mfccDetector.stop();
});
</script>

<style scoped>
.debug-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #e0e0e0;
  padding: 20px;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.debug-header {
  text-align: center;
  margin-bottom: 24px;
}

.debug-header h1 {
  font-size: 1.8rem;
  margin: 0;
  background: linear-gradient(90deg, #ff6b6b, #feca57, #48dbfb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: #888;
  margin-top: 6px;
}

/* ==================== 通用 section ==================== */
section {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 16px;
}

section h2 {
  margin: 0 0 14px 0;
  font-size: 1.1rem;
  color: #ccc;
  display: flex;
  align-items: center;
  gap: 8px;
}

/* ==================== 检测器切换 ==================== */
.detector-switch {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
}

.switch-buttons {
  display: flex;
  gap: 0;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid #444;
}

.switch-btn {
  padding: 10px 20px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  color: #888;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s;
}

.switch-btn:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.switch-btn.active {
  background: linear-gradient(135deg, #e94560, #ff6b6b);
  color: white;
  font-weight: 600;
}

.switch-hint {
  color: #666;
  font-size: 0.8rem;
  font-style: italic;
}

/* ==================== 快速统计 ==================== */
.quick-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  padding: 16px;
}

.stat-card {
  background: linear-gradient(135deg, rgba(102, 126, 234, 0.3), rgba(118, 75, 162, 0.3));
  padding: 16px;
  border-radius: 8px;
  text-align: center;
}

.stat-card .stat-label {
  font-size: 0.75rem;
  color: #aaa;
  margin-bottom: 6px;
}

.stat-card .stat-value {
  font-size: 1.4rem;
  font-weight: bold;
  color: #fff;
}

.stat-value.running { color: #52c41a; }
.stat-value.stopped { color: #ff4d4f; }

/* ==================== 实时检测面板 ==================== */
.detection-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.detection-item {
  padding: 14px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.detection-item label {
  display: block;
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 8px;
  font-weight: 600;
  text-transform: uppercase;
}

.vowel-box {
  height: 90px;
  background: rgba(255, 255, 255, 0.05);
  border: 2px solid #333;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 2.8rem;
  font-weight: bold;
  color: #555;
  transition: all 0.2s;
}

.vowel-box.active {
  border-color: #48dbfb;
  color: #48dbfb;
  box-shadow: 0 0 16px rgba(72, 219, 251, 0.3);
}

.vowel-box.v-a { border-color: #ff6b6b; color: #ff6b6b; box-shadow: 0 0 16px rgba(255, 107, 107, 0.3); }
.vowel-box.v-e { border-color: #feca57; color: #feca57; box-shadow: 0 0 16px rgba(254, 202, 87, 0.3); }
.vowel-box.v-i { border-color: #48dbfb; color: #48dbfb; box-shadow: 0 0 16px rgba(72, 219, 251, 0.3); }
.vowel-box.v-o { border-color: #ff9ff3; color: #ff9ff3; box-shadow: 0 0 16px rgba(255, 159, 243, 0.3); }
.vowel-box.v-u { border-color: #54a0ff; color: #54a0ff; box-shadow: 0 0 16px rgba(84, 160, 255, 0.3); }

.vowel-text {
  letter-spacing: 4px;
}

.confidence-display {
  display: flex;
  align-items: center;
  gap: 8px;
}

.bar-track {
  flex: 1;
  height: 20px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: visible;
  position: relative;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
  transition: width 0.1s;
}

.bar-fill.confidence { background: linear-gradient(90deg, #52c41a, #48dbfb); }
.bar-fill.volume { background: linear-gradient(90deg, #ff7a45, #ffa940); }
.bar-fill.f1 { background: linear-gradient(90deg, #ff6b6b, #feca57); }
.bar-fill.f2 { background: linear-gradient(90deg, #48dbfb, #ff9ff3); }
.bar-fill.prob { background: linear-gradient(90deg, #667eea, #764ba2); }
.bar-fill.ratio { background: linear-gradient(90deg, #667eea, #764ba2); }

.bar-label, .bar-label-left {
  font-weight: bold;
  min-width: 50px;
  font-size: 0.9rem;
  color: #ccc;
}

.bar-label { text-align: right; }
.bar-label-left { text-align: left; min-width: 60px; }

.status-badge {
  display: inline-block;
  padding: 6px 14px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.status-badge.detected { background: rgba(72, 219, 251, 0.2); color: #48dbfb; }
.status-badge.silence { background: rgba(255, 255, 255, 0.05); color: #888; }
.status-badge.ambiguous { background: rgba(254, 202, 87, 0.2); color: #feca57; }
.status-badge.noise { background: rgba(255, 107, 107, 0.2); color: #ff6b6b; }

/* 概率分布 */
.class-probabilities {
  padding: 14px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  margin-top: 12px;
}

.class-probabilities h3 {
  margin: 0 0 10px 0;
  font-size: 0.95rem;
  color: #bbb;
}

.prob-chart {
  display: grid;
  gap: 10px;
}

.prob-bar-container {
  display: grid;
  grid-template-columns: 50px 1fr 55px;
  gap: 10px;
  align-items: center;
}

.prob-label {
  font-weight: bold;
  text-align: center;
  color: #ccc;
}

.prob-bar {
  height: 18px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  overflow: visible;
  position: relative;
}

.prob-bar .bar-fill {
  height: 100%;
}

.peak-marker {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 3px;
  background: #ff4d4f;
  border-radius: 2px;
  transform: translateX(-50%);
  box-shadow: 0 0 4px rgba(255, 77, 79, 0.5);
}

.prob-value {
  font-size: 0.75rem;
  color: #888;
  text-align: right;
}

/* 共振峰数据 */
.formant-data {
  padding: 14px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 8px;
  margin-top: 12px;
}

.formant-data h3 {
  margin: 0 0 10px 0;
  font-size: 0.95rem;
  color: #bbb;
}

.formant-items { display: grid; gap: 12px; }

.formant-item label {
  display: block;
  color: #888;
  font-size: 0.75rem;
  margin-bottom: 4px;
}

.formant-val {
  font-weight: bold;
  font-size: 1rem;
  color: #ddd;
  display: block;
  margin-bottom: 4px;
}

/* ==================== 游戏状态 ==================== */
.game-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

@media (max-width: 768px) {
  .game-grid { grid-template-columns: 1fr; }
}

.sequence-display {
  text-align: center;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.seq-label {
  display: block;
  color: #888;
  font-size: 0.85rem;
  margin-bottom: 10px;
}

.sequence-chars {
  display: flex;
  gap: 4px;
  justify-content: center;
  flex-wrap: wrap;
}

.seq-char {
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  font-weight: bold;
  font-size: 0.85rem;
  transition: all 0.2s;
}

.seq-char.active {
  background: #e94560;
  transform: scale(1.2);
  color: #fff;
}

.seq-char.done {
  background: rgba(72, 219, 251, 0.3);
  color: #48dbfb;
}

.cycle-count {
  display: block;
  color: #feca57;
  font-size: 0.85rem;
  margin-top: 10px;
}

.game-stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.gs-item {
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 6px;
}

.gs-item label {
  display: block;
  color: #888;
  font-size: 0.7rem;
  text-transform: uppercase;
}

.gs-val {
  font-weight: bold;
  font-size: 1rem;
  color: #ddd;
}

.gs-val.idle { color: #888; }
.gs-val.playing { color: #00d2d3; }
.gs-val.interrupted { color: #e94560; }
.gs-val.sharing { color: #feca57; }
.gs-val.score { color: #feca57; font-size: 1.2rem; }
.gs-val.combo { color: #ff6b6b; }
.stage-1 { color: #888; }
.stage-2 { color: #ff6b6b; }
.stage-3 { color: #feca57; }
.stage-4 { color: #ff9ff3; }
.stage-5 { color: #48dbfb; }
.err-warn { color: #e94560; }

/* ==================== 离线分析 ==================== */
.section-desc {
  color: #888;
  font-size: 0.85rem;
  margin: 0 0 14px;
}

.upload-box {
  position: relative;
  border: 2px dashed #444;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  transition: border-color 0.2s;
}

.upload-box:hover {
  border-color: #48dbfb;
}

.file-input { display: none; }

.upload-label {
  cursor: pointer;
  display: block;
}

.upload-icon { font-size: 2.5rem; display: block; margin-bottom: 8px; }
.upload-text { display: block; font-size: 0.95rem; color: #ccc; margin-bottom: 4px; }
.upload-hint { display: block; font-size: 0.75rem; color: #666; }

.analysis-progress {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  margin-top: 12px;
}

.progress-spinner {
  width: 36px;
  height: 36px;
  border: 3px solid #333;
  border-top: 3px solid #48dbfb;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 12px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.error-message {
  background: rgba(233, 69, 96, 0.2);
  border: 1px solid #e94560;
  border-radius: 4px;
  padding: 10px 14px;
  color: #ff6b6b;
  margin-top: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.analysis-result {
  margin-top: 16px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.result-header {
  margin-bottom: 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 12px;
}

.result-header h3 { margin: 0 0 4px 0; color: #ccc; }
.file-info { margin: 0; color: #888; font-size: 0.8rem; }

.vowel-ratio { margin-bottom: 20px; }
.vowel-ratio h4 { margin: 0 0 12px; color: #bbb; font-size: 0.9rem; }

.ratio-chart { display: flex; flex-direction: column; gap: 10px; }

.ratio-item {
  display: grid;
  grid-template-columns: 40px 1fr 90px;
  gap: 8px;
  align-items: center;
}

.ratio-label { text-align: center; font-weight: 600; color: #ccc; }
.ratio-value { text-align: right; font-size: 0.8rem; color: #888; }

.analysis-stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 12px;
  margin-bottom: 20px;
}

.stat-box {
  background: rgba(255, 255, 255, 0.05);
  padding: 12px;
  border-radius: 6px;
  text-align: center;
}

.stat-box .stat-label { font-size: 0.7rem; color: #888; margin-bottom: 6px; }
.stat-box .stat-val { font-size: 1.2rem; font-weight: 600; color: #ddd; }

.timeline-section {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding-top: 16px;
}

.timeline-section h4 { margin: 0 0 10px; color: #bbb; font-size: 0.9rem; }

.timeline {
  display: flex;
  gap: 1px;
  height: 28px;
  border-radius: 4px;
  overflow: hidden;
  margin-bottom: 10px;
}

.timeline-bar { flex: 1; min-width: 2px; }

.tl-A { background-color: #ff4d4f; }
.tl-E { background-color: #fa8c16; }
.tl-I { background-color: #faad14; }
.tl-O { background-color: #1890ff; }
.tl-U { background-color: #722ed1; }
.tl-silence { background-color: #444; }

.timeline-legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
  color: #888;
}

.legend-color {
  width: 14px;
  height: 14px;
  border-radius: 2px;
}

/* ==================== 控制面板 ==================== */
.control-buttons {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 8px;
  margin-bottom: 12px;
}

.btn {
  padding: 10px 14px;
  border: none;
  border-radius: 6px;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
}

.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn-start { background: #52c41a; color: white; }
.btn-start:hover:not(:disabled) { background: #389e0d; }
.btn-stop { background: #ff4d4f; color: white; }
.btn-stop:hover:not(:disabled) { background: #cf1322; }
.btn-reset { background: #666; color: white; }
.btn-reset:hover { background: #555; }
.btn-debug { background: #1890ff; color: white; }
.btn-debug:hover { background: #0050b3; }
.btn-small { padding: 5px 10px; font-size: 0.75rem; background: #1890ff; color: white; border: none; border-radius: 4px; cursor: pointer; }
.btn-small:hover { background: #0050b3; }

.error-box {
  background: rgba(233, 69, 96, 0.2);
  border: 1px solid #e94560;
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 12px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #ff6b6b;
  font-size: 0.85rem;
}

.close-btn {
  background: none;
  border: none;
  color: #ff6b6b;
  cursor: pointer;
  font-size: 1rem;
  padding: 0;
}

.init-status {
  background: rgba(0, 0, 0, 0.2);
  padding: 10px 14px;
  border-radius: 6px;
  font-size: 0.85rem;
}

.status-row {
  display: flex;
  justify-content: space-between;
  margin: 6px 0;
  color: #aaa;
}

.status-row .ok { color: #52c41a; font-weight: bold; }
.status-row .fail { color: #ff4d4f; font-weight: bold; }
.status-row .pending { color: #ffa940; font-weight: bold; }

/* ==================== 性能分析 ==================== */
.perf-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 12px;
}

.perf-card {
  background: rgba(0, 0, 0, 0.2);
  padding: 14px;
  border-radius: 8px;
  border-left: 3px solid #667eea;
}

.perf-card h3 {
  margin: 0 0 8px;
  font-size: 0.8rem;
  color: #888;
}

.perf-value {
  font-size: 1.5rem;
  font-weight: bold;
  color: #ddd;
  margin-bottom: 6px;
}

.perf-detail {
  font-size: 0.75rem;
  color: #888;
}

.vowel-distribution {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
}

.dist-item {
  text-align: center;
  padding: 6px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 4px;
}

.dist-vowel { display: block; font-weight: bold; color: #ccc; font-size: 0.85rem; }
.dist-count { display: block; color: #667eea; font-size: 1.1rem; font-weight: bold; }

/* ==================== 检测历史 ==================== */
.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.history-count { color: #888; font-size: 0.85rem; }

.history-list {
  max-height: 280px;
  overflow-y: auto;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
}

.history-item {
  display: grid;
  grid-template-columns: 75px 60px 55px 1fr;
  gap: 10px;
  align-items: center;
  padding: 8px 12px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-size: 0.8rem;
}

.h-time { color: #888; font-family: 'Consolas', monospace; }
.h-conf { color: #667eea; font-weight: bold; }
.h-dur { color: #888; }

.vowel-badge {
  padding: 3px 8px;
  border-radius: 3px;
  font-weight: bold;
  text-align: center;
  color: white;
  font-size: 0.75rem;
}

.vowel-badge.a { background: #ff4d4f; }
.vowel-badge.e { background: #fa8c16; }
.vowel-badge.i { background: #faad14; }
.vowel-badge.o { background: #1890ff; }
.vowel-badge.u { background: #722ed1; }
.vowel-badge.silence { background: #666; }

.empty-state {
  padding: 20px;
  text-align: center;
  color: #666;
}

/* ==================== 事件日志 ==================== */
.log-container {
  height: 150px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  padding: 8px;
  font-family: 'Consolas', monospace;
  font-size: 0.75rem;
}

.log-item {
  padding: 3px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.03);
}

.log-time { color: #555; margin-right: 8px; }
.log-item.info .log-message { color: #888; }
.log-item.success .log-message { color: #00d2d3; }
.log-item.error .log-message { color: #e94560; }
.log-item.vowel .log-message { color: #feca57; }
.log-item.silence .log-message { color: #666; }
.log-item.stage .log-message { color: #ff9ff3; }
.log-item.break .log-message { color: #e94560; }
.log-item.perfect .log-message { color: #48dbfb; }
.log-item.score .log-message { color: #00d2d3; }

.no-logs { color: #555; text-align: center; padding: 20px; }

/* ==================== 频谱可视化 ==================== */
.spectrum-section canvas {
  width: 100%;
  height: 150px;
  border-radius: 8px;
}

/* ==================== 调试信息 ==================== */
.debug-info-panel {
  background: rgba(0, 0, 0, 0.4);
}

.debug-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
  border-bottom: 1px solid #333;
  padding-bottom: 8px;
}

.tab-btn {
  background: none;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 0.8rem;
  padding: 5px 10px;
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.tab-btn.active {
  color: #48dbfb;
  border-bottom-color: #48dbfb;
}

.debug-output {
  background: rgba(0, 0, 0, 0.3);
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 0;
  font-size: 0.75rem;
  line-height: 1.5;
  color: #ce9178;
  font-family: 'Consolas', monospace;
}

/* ==================== 响应式 ==================== */
@media (max-width: 768px) {
  .debug-view { padding: 10px; }
  .debug-header h1 { font-size: 1.3rem; }
  .detection-grid { grid-template-columns: 1fr; }
  .perf-grid { grid-template-columns: 1fr; }
  .game-stats-grid { grid-template-columns: 1fr; }
  .history-item { grid-template-columns: 1fr; gap: 4px; }
  .quick-stats { grid-template-columns: repeat(2, 1fr); }
}
</style>
