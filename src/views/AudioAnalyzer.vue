<template>
  <div class="analyzer-view">
    <header class="analyzer-header">
      <h1>🔬 音频特征分析工具</h1>
      <p class="subtitle">分析发音音频，提取元音共振峰特征</p>
    </header>

    <!-- 控制面板 -->
    <section class="control-panel">
      <div class="control-row">
        <button class="btn btn-primary" @click="loadDefaultAudio" :disabled="isAnalyzing">
          📂 加载示例音频
        </button>
        <label class="btn btn-secondary file-input-label">
          📁 选择音频文件
          <input type="file" accept="audio/*" @change="handleFileSelect" hidden :disabled="isAnalyzing" />
        </label>
        <button 
          class="btn" 
          :class="isRecording ? 'btn-danger' : 'btn-success'"
          @click="toggleRecording"
          :disabled="isAnalyzing"
        >
          {{ isRecording ? '⏹️ 停止录制' : '🎤 开始录制' }}
        </button>
      </div>
      <div class="control-row">
        <button class="btn btn-secondary" @click="exportAllResults" :disabled="!allAnalysisResults.length">
          📋 导出全部结果
        </button>
        <button class="btn btn-secondary" @click="clearAllAudios" :disabled="!audioTracks.length">
          🗑️ 清除全部音频
        </button>
      </div>
    </section>

    <!-- 录制状态 -->
    <div v-if="isRecording" class="recording-indicator">
      <span class="recording-dot"></span>
      录制中... {{ recordingDuration.toFixed(1) }}s
    </div>

    <!-- 分析参数 -->
    <section class="params-section">
      <h3>分析参数</h3>
      <div class="params-grid">
        <label>
          序列间隔阈值 (ms):
          <input type="number" v-model.number="params.sequenceGapMs" min="100" max="2000" step="50" />
        </label>
        <label>
          音节间隔阈值 (ms):
          <input type="number" v-model.number="params.syllableGapMs" min="10" max="200" step="5" />
        </label>
        <label>
          最小音节时长 (ms):
          <input type="number" v-model.number="params.minSyllableDurationMs" min="20" max="200" step="10" />
        </label>
        <label>
          能量阈值倍数:
          <input type="number" v-model.number="params.energyThresholdMultiplier" min="1" max="5000" step="100" />
        </label>
      </div>
    </section>

    <!-- 分析状态 -->
    <div v-if="status" class="status-banner" :class="statusType">
      {{ status }}
    </div>

    <!-- 音频轨道列表 -->
    <div class="audio-tracks">
      <section 
        v-for="(track, trackIdx) in audioTracks" 
        :key="track.id" 
        class="audio-track"
        :class="{ expanded: track.expanded }"
      >
        <div class="track-header" @click="toggleTrackExpanded(trackIdx)">
          <span class="track-icon">{{ track.expanded ? '▼' : '▶' }}</span>
          <h2>{{ track.name }}</h2>
          <span class="track-info">{{ track.buffer.duration.toFixed(2) }}s | {{ track.sequences.length }} 序列 | {{ track.results.length }} 音节</span>
          <div class="track-actions" @click.stop>
            <button class="btn btn-small" @click="reanalyzeTrack(trackIdx)" :disabled="isAnalyzing">
              🔄 重新分析
            </button>
            <button class="btn btn-small btn-danger" @click="removeTrack(trackIdx)">
              ✕
            </button>
          </div>
        </div>

        <div class="track-content" v-show="track.expanded">
          <!-- 调试信息 -->
          <div class="debug-info" v-if="track.debugInfo">
            🔍 {{ track.debugInfo }}
          </div>
          
          <!-- 波形显示 -->
          <div class="waveform-section">
            <h3>📊 音频波形</h3>
            <div class="waveform-container" 
                 @mousemove="(e) => handleWaveformMouseMove(e, trackIdx)"
                 @mouseleave="handleWaveformMouseLeave"
                 @click="(e) => handleWaveformClick(e, trackIdx)">
              <canvas :ref="el => setCanvasRef(el, trackIdx, 'waveform')" width="1200" height="150"></canvas>
              <!-- 光标线 -->
              <div v-if="cursorInfo.visible && cursorInfo.trackIdx === trackIdx" 
                   class="cursor-line" 
                   :style="{ left: `${cursorInfo.x}px` }">
                <div class="cursor-time">{{ cursorInfo.timeMs.toFixed(1) }}ms</div>
              </div>
              <!-- 分割标记 -->
              <div v-for="(mark, idx) in track.splitMarks" 
                   :key="idx" 
                   class="split-mark"
                   :style="{ left: `${mark.xPercent}%` }">
                <div class="mark-time">{{ mark.timeMs.toFixed(0) }}ms</div>
                <button class="mark-remove" @click.stop="removeSplitMark(trackIdx, idx)">✕</button>
              </div>
            </div>
            <div class="time-markers">
              <span>0s</span>
              <span>{{ (track.buffer.duration / 2).toFixed(2) }}s</span>
              <span>{{ track.buffer.duration.toFixed(2) }}s</span>
            </div>
            <div class="waveform-controls" v-if="track.splitMarks.length">
              <span class="marks-info">{{ track.splitMarks.length }} 个分割点</span>
              <button class="btn btn-small" @click="clearSplitMarks(trackIdx)">清除标记</button>
              <button class="btn btn-small btn-primary" @click="exportSplitAudio(trackIdx)">
                📤 导出分割音频
              </button>
            </div>
          </div>

          <!-- 检测到的序列 -->
          <div class="sequences-section" v-if="track.sequences.length">
            <h3>🎵 检测到的发音序列 ({{ track.sequences.length }} 个)</h3>
            <div class="sequences-container">
              <div v-for="(seq, seqIdx) in track.sequences" :key="seqIdx" class="sequence-card">
                <div class="sequence-header">
                  <span class="sequence-label">序列 {{ seqIdx + 1 }}</span>
                  <span class="sequence-time">{{ (seq.start * 1000).toFixed(0) }}ms - {{ (seq.end * 1000).toFixed(0) }}ms</span>
                  <span class="syllable-count">{{ seq.syllables.length }} 音节</span>
                </div>
                <div class="syllables-timeline">
                  <div 
                    v-for="(syl, sylIdx) in seq.syllables" 
                    :key="sylIdx"
                    class="syllable-marker"
                    :class="[
                      syl.guessedVowel?.toLowerCase() || 'unknown',
                      { selected: selectedSyllable?.trackIdx === trackIdx && selectedSyllable?.seqIdx === seqIdx && selectedSyllable?.sylIdx === sylIdx }
                    ]"
                    :style="{ 
                      left: `${((syl.start - seq.start) / (seq.end - seq.start)) * 100}%`, 
                      width: `${Math.max(2, ((syl.end - syl.start) / (seq.end - seq.start)) * 100)}%` 
                    }"
                    :title="`${syl.guessedVowel || '?'}: F1=${syl.f1.toFixed(0)}Hz, F2=${syl.f2.toFixed(0)}Hz`"
                    @click="selectSyllable(trackIdx, seqIdx, sylIdx, syl)"
                  >
                    {{ syl.guessedVowel || '?' }}
                  </div>
                </div>
                <div class="sequence-result">
                  <span class="label">识别:</span>
                  <span class="vowel-sequence">
                    <span 
                      v-for="(syl, sylIdx) in seq.syllables" 
                      :key="sylIdx" 
                      class="vowel-char"
                      :class="[
                        syl.guessedVowel?.toLowerCase() || 'unknown',
                        { selected: selectedSyllable?.trackIdx === trackIdx && selectedSyllable?.seqIdx === seqIdx && selectedSyllable?.sylIdx === sylIdx }
                      ]"
                      @click="selectSyllable(trackIdx, seqIdx, sylIdx, syl)"
                    >{{ syl.guessedVowel || '?' }}</span>
                  </span>
                </div>
                <!-- 选中音节详情 -->
                <div class="syllable-detail" v-if="selectedSyllable && selectedSyllable.trackIdx === trackIdx && selectedSyllable.seqIdx === seqIdx">
                  <div class="detail-header">
                    <span class="detail-vowel" :class="selectedSyllable.syl.guessedVowel?.toLowerCase() || 'unknown'">
                      {{ selectedSyllable.syl.guessedVowel || '?' }}
                    </span>
                    <span class="detail-title">音节 #{{ selectedSyllable.sylIdx + 1 }} 详情</span>
                    <button class="close-btn" @click.stop="selectedSyllable = null">✕</button>
                  </div>
                  <div class="detail-grid">
                    <div class="detail-item">
                      <span class="detail-label">时间范围</span>
                      <span class="detail-value">{{ (selectedSyllable.syl.start * 1000).toFixed(1) }}ms - {{ (selectedSyllable.syl.end * 1000).toFixed(1) }}ms</span>
                    </div>
                    <div class="detail-item">
                      <span class="detail-label">时长</span>
                      <span class="detail-value">{{ ((selectedSyllable.syl.end - selectedSyllable.syl.start) * 1000).toFixed(1) }}ms</span>
                    </div>
                    <div class="detail-item">
                      <span class="detail-label">F1 (第一共振峰)</span>
                      <span class="detail-value">{{ selectedSyllable.syl.f1.toFixed(0) }} Hz</span>
                    </div>
                    <div class="detail-item">
                      <span class="detail-label">F2 (第二共振峰)</span>
                      <span class="detail-value">{{ selectedSyllable.syl.f2.toFixed(0) }} Hz</span>
                    </div>
                    <div class="detail-item">
                      <span class="detail-label">音量</span>
                      <span class="detail-value">{{ selectedSyllable.syl.volume.toFixed(1) }} dB</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- 共振峰散点图 -->
          <div class="formant-plot-section" v-if="track.results.length">
            <h3>📈 共振峰分布图</h3>
            <div class="plot-container">
              <canvas :ref="el => setCanvasRef(el, trackIdx, 'formant')" width="500" height="400"></canvas>
              <div class="plot-legend">
                <div class="legend-item"><span class="dot u"></span> U (oo)</div>
                <div class="legend-item"><span class="dot i"></span> I (ee)</div>
                <div class="legend-item"><span class="dot a"></span> A (ah)</div>
                <div class="legend-item"><span class="dot o"></span> O (oh)</div>
                <div class="legend-item"><span class="dot unknown"></span> 未分类</div>
              </div>
            </div>
          </div>

          <!-- 元音统计 -->
          <div class="stats-section" v-if="track.stats && Object.keys(track.stats).length">
            <h3>📊 元音统计</h3>
            <div class="stats-grid">
              <div class="stat-card" v-for="(stat, vowel) in track.stats" :key="vowel">
                <h4 class="vowel-label" :class="vowel.toLowerCase()">{{ vowel }}</h4>
                <div class="stat-row">
                  <span>数量:</span>
                  <strong>{{ stat.count }}</strong>
                </div>
                <div class="stat-row">
                  <span>F1:</span>
                  <strong>{{ stat.f1Min.toFixed(0) }}-{{ stat.f1Max.toFixed(0) }} Hz</strong>
                </div>
                <div class="stat-row">
                  <span>F2:</span>
                  <strong>{{ stat.f2Min.toFixed(0) }}-{{ stat.f2Max.toFixed(0) }} Hz</strong>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>

    <!-- 汇总结果表格 -->
    <section class="results-section" v-if="allAnalysisResults.length">
      <h2>📋 详细分析结果汇总 ({{ allAnalysisResults.length }} 个音节)</h2>
      <table class="results-table">
        <thead>
          <tr>
            <th>音频</th>
            <th>序列</th>
            <th>#</th>
            <th>时间 (ms)</th>
            <th>时长 (ms)</th>
            <th>F1 (Hz)</th>
            <th>F2 (Hz)</th>
            <th>音量 (dB)</th>
            <th>推测元音</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(result, i) in allAnalysisResults" :key="i">
            <td>{{ result.trackName }}</td>
            <td>{{ result.seqIdx + 1 }}</td>
            <td>{{ result.sylIdx + 1 }}</td>
            <td>{{ (result.time * 1000).toFixed(0) }}</td>
            <td>{{ result.duration.toFixed(0) }}</td>
            <td>{{ result.f1.toFixed(0) }}</td>
            <td>{{ result.f2.toFixed(0) }}</td>
            <td>{{ result.volume.toFixed(1) }}</td>
            <td class="vowel-cell" :class="result.guessedVowel?.toLowerCase()">
              {{ result.guessedVowel || '?' }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 建议配置 -->
    <section class="suggestion-section" v-if="suggestedConfig">
      <h2>💡 建议的共振峰配置</h2>
      <pre class="config-code">{{ suggestedConfig }}</pre>
      <button class="btn btn-primary" @click="copyConfig">📋 复制配置</button>
    </section>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, reactive, nextTick, onUnmounted, type ComponentPublicInstance } from 'vue';
import { DEFAULT_VOWEL_FORMANTS, SYLLABLE_DETECTION_CONFIG } from '@/config/vowels';

// ==================== 类型定义 ====================
interface Syllable {
  start: number;
  end: number;
  f1: number;
  f2: number;
  volume: number;
  guessedVowel: string | null;
}

interface Sequence {
  start: number;
  end: number;
  syllables: Syllable[];
}

interface AnalysisResult extends Syllable {
  trackId: string;
  trackName: string;
  seqIdx: number;
  sylIdx: number;
  time: number;
  duration: number;
}

interface VowelStat {
  count: number;
  f1Min: number;
  f1Max: number;
  f1Avg: number;
  f2Min: number;
  f2Max: number;
  f2Avg: number;
}

interface SplitMark {
  timeMs: number;
  xPercent: number;
}

interface AudioTrack {
  id: string;
  name: string;
  buffer: AudioBuffer;
  sequences: Sequence[];
  results: AnalysisResult[];
  stats: Record<string, VowelStat> | null;
  splitMarks: SplitMark[];
  expanded: boolean;
  debugInfo?: string;
  thresholdInfo?: {
    noiseFloor: number;
    maxEnergy: number;
    highThreshold: number;
    lowThreshold: number;
  };
}

// ==================== 分析参数 ====================
const params = reactive({ ...SYLLABLE_DETECTION_CONFIG });

// ==================== 状态 ====================
const isAnalyzing = ref(false);
const isRecording = ref(false);
const recordingDuration = ref(0);
const status = ref('');
const statusType = ref<'info' | 'success' | 'error'>('info');

const audioTracks = ref<AudioTrack[]>([]);
const cursorInfo = ref({
  visible: false,
  x: 0,
  timeMs: 0,
  trackIdx: -1
});

// 选中的音节
const selectedSyllable = ref<{
  trackIdx: number;
  seqIdx: number;
  sylIdx: number;
  syl: Syllable;
} | null>(null);

// Canvas refs
const canvasRefs = reactive<Record<string, HTMLCanvasElement | null>>({});

// 录制相关
let mediaRecorder: MediaRecorder | null = null;
let recordedChunks: Blob[] = [];
let recordingInterval: ReturnType<typeof setInterval> | null = null;
let recordingStartTime = 0;

// ==================== 计算属性 ====================
const allAnalysisResults = computed(() => {
  const results: AnalysisResult[] = [];
  for (const track of audioTracks.value) {
    results.push(...track.results);
  }
  return results;
});

const allVowelStats = computed(() => {
  if (!allAnalysisResults.value.length) return null;
  
  const stats: Record<string, VowelStat> = {};
  
  for (const result of allAnalysisResults.value) {
    const vowel = result.guessedVowel;
    if (!vowel) continue;
    
    if (!stats[vowel]) {
      stats[vowel] = {
        count: 0,
        f1Min: Infinity,
        f1Max: -Infinity,
        f1Avg: 0,
        f2Min: Infinity,
        f2Max: -Infinity,
        f2Avg: 0
      };
    }
    
    const s = stats[vowel];
    s.count++;
    s.f1Min = Math.min(s.f1Min, result.f1);
    s.f1Max = Math.max(s.f1Max, result.f1);
    s.f2Min = Math.min(s.f2Min, result.f2);
    s.f2Max = Math.max(s.f2Max, result.f2);
    s.f1Avg += result.f1;
    s.f2Avg += result.f2;
  }
  
  for (const vowel in stats) {
    stats[vowel].f1Avg /= stats[vowel].count;
    stats[vowel].f2Avg /= stats[vowel].count;
  }
  
  return stats;
});

const suggestedConfig = computed(() => {
  if (!allVowelStats.value) return null;
  
  const config: Record<string, { f1: [number, number]; f2: [number, number] }> = {};
  
  for (const vowel in allVowelStats.value) {
    const s = allVowelStats.value[vowel];
    const f1Margin = Math.max(50, (s.f1Max - s.f1Min) * 0.2);
    const f2Margin = Math.max(100, (s.f2Max - s.f2Min) * 0.2);
    
    config[vowel] = {
      f1: [Math.round(s.f1Min - f1Margin), Math.round(s.f1Max + f1Margin)],
      f2: [Math.round(s.f2Min - f2Margin), Math.round(s.f2Max + f2Margin)]
    };
  }
  
  return `export const SUGGESTED_VOWEL_FORMANTS: VowelFormantConfig = ${JSON.stringify(config, null, 2)};`;
});

// ==================== Canvas Refs 管理 ====================
function setCanvasRef(el: Element | ComponentPublicInstance | null, trackIdx: number, type: 'waveform' | 'formant') {
  const key = `${trackIdx}-${type}`;
  if (el && el instanceof HTMLCanvasElement) {
    canvasRefs[key] = el;
  }
}

function getCanvasRef(trackIdx: number, type: 'waveform' | 'formant'): HTMLCanvasElement | null {
  return canvasRefs[`${trackIdx}-${type}`] || null;
}

// ==================== 音频加载 ====================
async function loadDefaultAudio() {
  isAnalyzing.value = true;
  status.value = '正在加载示例音频...';
  statusType.value = 'info';
  
  try {
    const fileName = 'Oiiaioooooiai.mp3';
    const response = await fetch(`/${fileName}`);
    if (!response.ok) throw new Error(`无法加载: ${response.status}`);
    
    const arrayBuffer = await response.arrayBuffer();
    await addAudioTrack(arrayBuffer, fileName);
    
    status.value = '示例音频加载完成！';
    statusType.value = 'success';
  } catch (err) {
    status.value = `错误: ${err}`;
    statusType.value = 'error';
  } finally {
    isAnalyzing.value = false;
  }
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  
  isAnalyzing.value = true;
  status.value = `正在加载 ${file.name}...`;
  statusType.value = 'info';
  
  try {
    const arrayBuffer = await file.arrayBuffer();
    await addAudioTrack(arrayBuffer, file.name);
    
    status.value = `${file.name} 加载完成！`;
    statusType.value = 'success';
  } catch (err) {
    status.value = `错误: ${err}`;
    statusType.value = 'error';
  } finally {
    isAnalyzing.value = false;
    input.value = '';
  }
}

// ==================== 录制功能 ====================
async function toggleRecording() {
  if (isRecording.value) {
    stopRecording();
  } else {
    await startRecording();
  }
}

async function startRecording() {
  // 检查是否支持 mediaDevices API
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.value = '❌ 您的浏览器不支持录音功能，或当前页面不是 HTTPS。请使用 HTTPS 访问或使用现代浏览器。';
    statusType.value = 'error';
    return;
  }
  
  try {
    status.value = '正在请求麦克风权限...';
    statusType.value = 'info';
    
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false
      } 
    });
    mediaRecorder = new MediaRecorder(stream);
    recordedChunks = [];
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };
    
    mediaRecorder.onstop = async () => {
      stream.getTracks().forEach(track => track.stop());
      
      if (recordedChunks.length > 0) {
        const blob = new Blob(recordedChunks, { type: 'audio/webm' });
        const arrayBuffer = await blob.arrayBuffer();
        
        isAnalyzing.value = true;
        status.value = '正在分析录制的音频...';
        
        try {
          const timestamp = new Date().toLocaleTimeString();
          await addAudioTrack(arrayBuffer, `录制 ${timestamp}`);
          status.value = '录制音频分析完成！';
          statusType.value = 'success';
        } catch (err) {
          status.value = `分析错误: ${err}`;
          statusType.value = 'error';
        } finally {
          isAnalyzing.value = false;
        }
      }
    };
    
    mediaRecorder.start();
    isRecording.value = true;
    recordingStartTime = Date.now();
    recordingDuration.value = 0;
    
    status.value = '🎙️ 正在录制...';
    statusType.value = 'info';
    
    recordingInterval = setInterval(() => {
      recordingDuration.value = (Date.now() - recordingStartTime) / 1000;
    }, 100);
    
  } catch (err: any) {
    console.error('[AudioAnalyzer] 录制错误:', err);
    
    if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
      status.value = '❌ 麦克风权限被拒绝。请在浏览器设置中允许此网站访问麦克风。';
    } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
      status.value = '❌ 未找到麦克风设备。请确保您的设备有麦克风。';
    } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
      status.value = '❌ 无法访问麦克风。可能被其他应用占用。';
    } else if (err.name === 'OverconstrainedError') {
      status.value = '❌ 麦克风不满足要求的约束条件。';
    } else if (err.name === 'TypeError') {
      status.value = '❌ 无法录音。请确保使用 HTTPS 访问此页面。';
    } else {
      status.value = `❌ 录制错误: ${err.message || err}`;
    }
    statusType.value = 'error';
  }
}

function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  isRecording.value = false;
  
  if (recordingInterval) {
    clearInterval(recordingInterval);
    recordingInterval = null;
  }
}

// ==================== 音轨管理 ====================
async function addAudioTrack(arrayBuffer: ArrayBuffer, name: string) {
  const audioContext = new AudioContext({ sampleRate: 44100 });
  const buffer = await audioContext.decodeAudioData(arrayBuffer);
  audioContext.close();
  
  const track: AudioTrack = {
    id: `track-${Date.now()}`,
    name,
    buffer,
    sequences: [],
    results: [],
    stats: null,
    splitMarks: [],
    expanded: true
  };
  
  audioTracks.value.push(track);
  const trackIdx = audioTracks.value.length - 1;
  
  await nextTick();
  analyzeTrack(trackIdx);
}

function analyzeTrack(trackIdx: number) {
  const track = audioTracks.value[trackIdx];
  if (!track) return;
  
  // 检测序列和音节
  const { sequences, debugInfo, thresholdInfo } = detectSequencesAndSyllables(track.buffer);
  track.sequences = sequences;
  track.debugInfo = debugInfo;
  track.thresholdInfo = thresholdInfo;
  
  // 生成分析结果
  track.results = [];
  for (let seqIdx = 0; seqIdx < track.sequences.length; seqIdx++) {
    const seq = track.sequences[seqIdx];
    for (let sylIdx = 0; sylIdx < seq.syllables.length; sylIdx++) {
      const syl = seq.syllables[sylIdx];
      track.results.push({
        ...syl,
        trackId: track.id,
        trackName: track.name,
        seqIdx,
        sylIdx,
        time: syl.start,
        duration: (syl.end - syl.start) * 1000
      });
    }
  }
  
  // 计算统计
  track.stats = calculateStats(track.results);
  
  // 绘制图表
  nextTick(() => {
    drawTrackWaveform(trackIdx);
    drawTrackFormantPlot(trackIdx);
  });
}

function reanalyzeTrack(trackIdx: number) {
  analyzeTrack(trackIdx);
  status.value = '重新分析完成！';
  statusType.value = 'success';
}

function removeTrack(trackIdx: number) {
  audioTracks.value.splice(trackIdx, 1);
}

function clearAllAudios() {
  audioTracks.value = [];
  status.value = '';
}

function toggleTrackExpanded(trackIdx: number) {
  const track = audioTracks.value[trackIdx];
  if (track) {
    track.expanded = !track.expanded;
    if (track.expanded) {
      nextTick(() => {
        drawTrackWaveform(trackIdx);
        drawTrackFormantPlot(trackIdx);
      });
    }
  }
}

function calculateStats(results: AnalysisResult[]): Record<string, VowelStat> | null {
  if (!results.length) return null;
  
  const stats: Record<string, VowelStat> = {};
  
  for (const result of results) {
    const vowel = result.guessedVowel;
    if (!vowel) continue;
    
    if (!stats[vowel]) {
      stats[vowel] = {
        count: 0,
        f1Min: Infinity,
        f1Max: -Infinity,
        f1Avg: 0,
        f2Min: Infinity,
        f2Max: -Infinity,
        f2Avg: 0
      };
    }
    
    const s = stats[vowel];
    s.count++;
    s.f1Min = Math.min(s.f1Min, result.f1);
    s.f1Max = Math.max(s.f1Max, result.f1);
    s.f2Min = Math.min(s.f2Min, result.f2);
    s.f2Max = Math.max(s.f2Max, result.f2);
    s.f1Avg += result.f1;
    s.f2Avg += result.f2;
  }
  
  for (const vowel in stats) {
    stats[vowel].f1Avg /= stats[vowel].count;
    stats[vowel].f2Avg /= stats[vowel].count;
  }
  
  return stats;
}

// ==================== 音节选择 ====================
function selectSyllable(trackIdx: number, seqIdx: number, sylIdx: number, syl: any) {
  selectedSyllable.value = { trackIdx, seqIdx, sylIdx, syl };
}

// ==================== 分割标记 ====================
function handleWaveformMouseMove(event: MouseEvent, trackIdx: number) {
  const canvas = getCanvasRef(trackIdx, 'waveform');
  const track = audioTracks.value[trackIdx];
  if (!canvas || !track) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const ratio = x / rect.width;
  const timeMs = ratio * track.buffer.duration * 1000;
  
  cursorInfo.value = {
    visible: true,
    x,
    timeMs,
    trackIdx
  };
}

function handleWaveformMouseLeave() {
  cursorInfo.value.visible = false;
}

function handleWaveformClick(event: MouseEvent, trackIdx: number) {
  const canvas = getCanvasRef(trackIdx, 'waveform');
  const track = audioTracks.value[trackIdx];
  if (!canvas || !track) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const ratio = x / rect.width;
  const timeMs = ratio * track.buffer.duration * 1000;
  const xPercent = ratio * 100;
  
  track.splitMarks.push({ timeMs, xPercent });
  track.splitMarks.sort((a, b) => a.timeMs - b.timeMs);
}

function removeSplitMark(trackIdx: number, markIdx: number) {
  const track = audioTracks.value[trackIdx];
  if (track) {
    track.splitMarks.splice(markIdx, 1);
  }
}

function clearSplitMarks(trackIdx: number) {
  const track = audioTracks.value[trackIdx];
  if (track) {
    track.splitMarks = [];
  }
}

async function exportSplitAudio(trackIdx: number) {
  const track = audioTracks.value[trackIdx];
  if (!track || track.splitMarks.length === 0) return;
  
  const buffer = track.buffer;
  const sampleRate = buffer.sampleRate;
  const channelData = buffer.getChannelData(0);
  
  // 构建分割点列表（包含开头和结尾）
  const splitPoints = [0, ...track.splitMarks.map(m => m.timeMs / 1000), buffer.duration];
  
  for (let i = 0; i < splitPoints.length - 1; i++) {
    const startTime = splitPoints[i];
    const endTime = splitPoints[i + 1];
    const startSample = Math.floor(startTime * sampleRate);
    const endSample = Math.floor(endTime * sampleRate);
    const length = endSample - startSample;
    
    if (length <= 0) continue;
    
    // 创建新的音频缓冲区
    const audioContext = new AudioContext({ sampleRate });
    const newBuffer = audioContext.createBuffer(1, length, sampleRate);
    const newChannelData = newBuffer.getChannelData(0);
    
    for (let j = 0; j < length; j++) {
      newChannelData[j] = channelData[startSample + j] || 0;
    }
    
    // 导出为 WAV
    const wavBlob = audioBufferToWav(newBuffer);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${track.name.replace(/\.[^.]+$/, '')}_part${i + 1}.wav`;
    a.click();
    URL.revokeObjectURL(url);
    
    audioContext.close();
  }
  
  status.value = `已导出 ${splitPoints.length - 1} 个音频片段`;
  statusType.value = 'success';
}

function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const data = buffer.getChannelData(0);
  const dataLength = data.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;
  
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);
  
  // WAV header
  writeString(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);
  
  // Write audio data
  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const sample = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
    offset += 2;
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ==================== 音频分析核心 ====================
function detectSequencesAndSyllables(buffer: AudioBuffer): { 
  sequences: Sequence[]; 
  debugInfo: string; 
  thresholdInfo: { noiseFloor: number; maxEnergy: number; highThreshold: number; lowThreshold: number };
} {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // 使用较小的帧进行更精细的分析
  const frameSize = Math.floor(sampleRate * 0.01); // 10ms 帧
  const hopSize = Math.floor(frameSize / 4); // 2.5ms 跳跃，更精细
  const energies: { time: number; energy: number }[] = [];
  
  for (let i = 0; i < data.length - frameSize; i += hopSize) {
    let energy = 0;
    for (let j = 0; j < frameSize; j++) {
      energy += data[i + j] * data[i + j];
    }
    energies.push({
      time: i / sampleRate,
      energy: Math.sqrt(energy / frameSize)
    });
  }
  
  // 平滑能量曲线（3点移动平均）
  const smoothedEnergies = energies.map((e, i) => {
    if (i === 0 || i === energies.length - 1) return e;
    return {
      time: e.time,
      energy: (energies[i-1].energy + e.energy + energies[i+1].energy) / 3
    };
  });
  
  // 自适应阈值计算
  const sortedEnergies = smoothedEnergies.map(e => e.energy).sort((a, b) => a - b);
  const noiseFloor = sortedEnergies[Math.floor(sortedEnergies.length * 0.2)]; // 使用20%位置作为噪音底
  const maxEnergy = sortedEnergies[sortedEnergies.length - 1];
  
  // 计算高低两个阈值（使用 energyThresholdMultiplier 参数）
  // energyThresholdMultiplier 越大，阈值越高，检测越严格
  const thresholdFactor = params.energyThresholdMultiplier / 1000; // 默认1000 -> 1.0
  const highThreshold = Math.max(maxEnergy * 0.15 * thresholdFactor, noiseFloor * 10 * thresholdFactor);
  const lowThreshold = Math.max(maxEnergy * 0.05 * thresholdFactor, noiseFloor * 3 * thresholdFactor);
  
  console.log(`[AudioAnalyzer] 参数: seqGap=${params.sequenceGapMs}ms, sylGap=${params.syllableGapMs}ms, minDur=${params.minSyllableDurationMs}ms, threshMult=${params.energyThresholdMultiplier}`);
  console.log(`[AudioAnalyzer] 能量统计: noiseFloor=${noiseFloor.toExponential(2)}, max=${maxEnergy.toExponential(2)}, highTh=${highThreshold.toExponential(2)}, lowTh=${lowThreshold.toExponential(2)}`);
  
  // 使用双阈值检测声音片段（类似施密特触发器）
  const voiceSegments: { start: number; end: number }[] = [];
  let inVoice = false;
  let voiceStart = 0;
  
  for (const { time, energy } of smoothedEnergies) {
    if (!inVoice && energy > highThreshold) {
      voiceStart = time;
      inVoice = true;
    } else if (inVoice && energy < lowThreshold) {
      if (time - voiceStart >= params.minSyllableDurationMs / 1000) {
        voiceSegments.push({ start: voiceStart, end: time });
      }
      inVoice = false;
    }
  }
  if (inVoice) {
    const lastTime = smoothedEnergies[smoothedEnergies.length - 1].time;
    if (lastTime - voiceStart >= params.minSyllableDurationMs / 1000) {
      voiceSegments.push({ start: voiceStart, end: lastTime });
    }
  }
  
  // 对每个声音片段进行音节细分（基于能量谷值）
  const syllables: { start: number; end: number }[] = [];
  
  for (const seg of voiceSegments) {
    // 获取该片段内的能量数据
    const segEnergies = smoothedEnergies.filter(e => e.time >= seg.start && e.time <= seg.end);
    if (segEnergies.length < 3) {
      syllables.push({ ...seg });
      continue;
    }
    
    // 找到能量谷值点作为音节分割点
    const valleys: number[] = [];
    const segMaxEnergy = Math.max(...segEnergies.map(e => e.energy));
    const valleyThreshold = segMaxEnergy * 0.3; // 谷值需要低于峰值的30%
    
    for (let i = 2; i < segEnergies.length - 2; i++) {
      const prev2 = segEnergies[i-2].energy;
      const prev = segEnergies[i-1].energy;
      const curr = segEnergies[i].energy;
      const next = segEnergies[i+1].energy;
      const next2 = segEnergies[i+2].energy;
      
      // 检查是否是局部最小值且足够低
      if (curr < prev && curr < next && 
          curr < prev2 && curr < next2 &&
          curr < valleyThreshold) {
        valleys.push(i);
      }
    }
    
    // 过滤掉太近的谷值点（保持至少 minSyllableDurationMs 的间隔）
    const minGapFrames = Math.floor(params.minSyllableDurationMs / 1000 / (hopSize / sampleRate));
    const filteredValleys: number[] = [];
    for (const v of valleys) {
      if (filteredValleys.length === 0 || v - filteredValleys[filteredValleys.length - 1] >= minGapFrames) {
        filteredValleys.push(v);
      }
    }
    
    // 根据谷值点分割音节
    if (filteredValleys.length === 0) {
      syllables.push({ ...seg });
    } else {
      let lastStart = seg.start;
      for (const vi of filteredValleys) {
        const splitTime = segEnergies[vi].time;
        if (splitTime - lastStart >= params.minSyllableDurationMs / 1000) {
          syllables.push({ start: lastStart, end: splitTime });
          lastStart = splitTime;
        }
      }
      // 最后一个音节
      if (seg.end - lastStart >= params.minSyllableDurationMs / 1000) {
        syllables.push({ start: lastStart, end: seg.end });
      }
    }
  }
  
  // 将音节按序列分组
  const sequenceGroups: { start: number; end: number }[][] = [];
  let currentGroup: { start: number; end: number }[] = [];
  
  for (const syl of syllables) {
    if (currentGroup.length === 0) {
      currentGroup.push(syl);
    } else {
      const lastSyl = currentGroup[currentGroup.length - 1];
      const gap = syl.start - lastSyl.end;
      // 使用 sequenceGapMs 判断是否是新序列
      if (gap >= params.sequenceGapMs / 1000) {
        sequenceGroups.push(currentGroup);
        currentGroup = [syl];
      } else if (gap >= params.syllableGapMs / 1000) {
        // 使用 syllableGapMs 判断是否是同一序列内的不同音节
        // 如果 gap 介于 syllableGapMs 和 sequenceGapMs 之间，认为是同一序列的不同音节
        currentGroup.push(syl);
      } else {
        // gap 太小，可能需要合并（但我们保留分离的音节）
        currentGroup.push(syl);
      }
    }
  }
  if (currentGroup.length > 0) {
    sequenceGroups.push(currentGroup);
  }
  
  const result: Sequence[] = [];
  
  for (const group of sequenceGroups) {
    const seqStart = group[0].start;
    const seqEnd = group[group.length - 1].end;
    
    const analyzedSyllables: Syllable[] = group.map(syl => {
      const { f1, f2, volume } = analyzeFormants(buffer, syl.start, syl.end);
      const guessedVowel = guessVowel(f1, f2);
      
      return { start: syl.start, end: syl.end, f1, f2, volume, guessedVowel };
    });
    
    result.push({ start: seqStart, end: seqEnd, syllables: analyzedSyllables });
  }
  
  const debugInfo = `噪音: ${noiseFloor.toExponential(2)} | 最大: ${maxEnergy.toExponential(2)} | 高阈值: ${highThreshold.toExponential(2)} | 低阈值: ${lowThreshold.toExponential(2)} | ${voiceSegments.length} 声段 → ${syllables.length} 音节`;
  
  const thresholdInfo = { noiseFloor, maxEnergy, highThreshold, lowThreshold };
  
  return { sequences: result, debugInfo, thresholdInfo };
}

function analyzeFormants(buffer: AudioBuffer, start: number, end: number): { f1: number; f2: number; volume: number } {
  const sampleRate = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  
  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.floor(end * sampleRate);
  const duration = endSample - startSample;
  
  const margin = Math.floor(duration * 0.1);
  const analysisStart = startSample + margin;
  const frameSize = Math.min(2048, duration - 2 * margin);
  
  if (frameSize < 512) {
    return { f1: 0, f2: 0, volume: -100 };
  }
  
  const frame = new Float32Array(2048);
  for (let i = 0; i < Math.min(2048, frameSize); i++) {
    frame[i] = data[analysisStart + i] || 0;
  }
  
  for (let i = 0; i < 2048; i++) {
    frame[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / 2047));
  }
  
  let rms = 0;
  for (let i = 0; i < frameSize; i++) {
    rms += data[analysisStart + i] * data[analysisStart + i];
  }
  rms = Math.sqrt(rms / frameSize);
  const volume = rms > 0 ? 20 * Math.log10(rms) : -100;
  
  const spectrum = performFFT(frame);
  const formants = extractFormants(spectrum, sampleRate, 2048);
  
  return { f1: formants.f1, f2: formants.f2, volume };
}

function performFFT(frame: Float32Array): Float32Array {
  const n = frame.length;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  
  for (let i = 0; i < n; i++) {
    real[i] = frame[i];
    imag[i] = 0;
  }
  
  const levels = Math.log2(n);
  
  for (let i = 0; i < n; i++) {
    let j = 0;
    let x = i;
    for (let k = 0; k < levels; k++) {
      j = (j << 1) | (x & 1);
      x >>= 1;
    }
    if (j > i) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  
  for (let size = 2; size <= n; size *= 2) {
    const halfSize = size / 2;
    const angleStep = -2 * Math.PI / size;
    
    for (let i = 0; i < n; i += size) {
      for (let j = 0; j < halfSize; j++) {
        const angle = angleStep * j;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        
        const idx1 = i + j;
        const idx2 = i + j + halfSize;
        
        const tReal = real[idx2] * cos - imag[idx2] * sin;
        const tImag = real[idx2] * sin + imag[idx2] * cos;
        
        real[idx2] = real[idx1] - tReal;
        imag[idx2] = imag[idx1] - tImag;
        real[idx1] = real[idx1] + tReal;
        imag[idx1] = imag[idx1] + tImag;
      }
    }
  }
  
  const magnitude = new Float32Array(n / 2);
  for (let i = 0; i < n / 2; i++) {
    const mag = Math.sqrt(real[i] * real[i] + imag[i] * imag[i]) / n;
    magnitude[i] = mag > 0 ? 20 * Math.log10(mag) : -100;
  }
  
  return magnitude;
}

function extractFormants(spectrum: Float32Array, sampleRate: number, fftSize: number): { f1: number; f2: number } {
  const binToFreq = (bin: number) => bin * sampleRate / fftSize;
  const freqToBin = (freq: number) => Math.round(freq * fftSize / sampleRate);
  
  const f1MinBin = freqToBin(200);
  const f1MaxBin = freqToBin(1000);
  const f2MinBin = freqToBin(800);
  const f2MaxBin = freqToBin(3000);
  
  let f1Bin = f1MinBin;
  let f1Max = -Infinity;
  for (let i = f1MinBin; i <= f1MaxBin && i < spectrum.length; i++) {
    if (spectrum[i] > f1Max) {
      f1Max = spectrum[i];
      f1Bin = i;
    }
  }
  
  let f2Bin = f2MinBin;
  let f2Max = -Infinity;
  const f1ProtectedBins = freqToBin(300);
  
  for (let i = f2MinBin; i <= f2MaxBin && i < spectrum.length; i++) {
    if (Math.abs(i - f1Bin) < f1ProtectedBins) continue;
    if (spectrum[i] > f2Max) {
      f2Max = spectrum[i];
      f2Bin = i;
    }
  }
  
  return { f1: binToFreq(f1Bin), f2: binToFreq(f2Bin) };
}

function guessVowel(f1: number, f2: number): string | null {
  for (const [vowel, range] of Object.entries(DEFAULT_VOWEL_FORMANTS)) {
    if (f1 >= range.f1[0] && f1 <= range.f1[1] &&
        f2 >= range.f2[0] && f2 <= range.f2[1]) {
      return vowel;
    }
  }
  
  let bestVowel: string | null = null;
  let bestDistance = Infinity;
  
  for (const [vowel, range] of Object.entries(DEFAULT_VOWEL_FORMANTS)) {
    const centerF1 = (range.f1[0] + range.f1[1]) / 2;
    const centerF2 = (range.f2[0] + range.f2[1]) / 2;
    const rangeF1 = range.f1[1] - range.f1[0];
    const rangeF2 = range.f2[1] - range.f2[0];
    
    const distF1 = (f1 - centerF1) / rangeF1;
    const distF2 = (f2 - centerF2) / rangeF2;
    const distance = Math.sqrt(distF1 * distF1 + distF2 * distF2);
    
    if (distance < bestDistance) {
      bestDistance = distance;
      bestVowel = vowel;
    }
  }
  
  if (bestDistance > 1.5) return null;
  return bestVowel;
}

// ==================== 绘图 ====================
function drawTrackWaveform(trackIdx: number) {
  const canvas = getCanvasRef(trackIdx, 'waveform');
  const track = audioTracks.value[trackIdx];
  if (!canvas || !track) return;
  
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const buffer = track.buffer;
  const data = buffer.getChannelData(0);
  
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  
  // 先找到音频最大振幅，用于动态缩放
  let maxAmplitude = 0;
  for (let i = 0; i < data.length; i++) {
    const absVal = Math.abs(data[i]);
    if (absVal > maxAmplitude) maxAmplitude = absVal;
  }
  // 留一点余量，避免波形顶到边缘
  const displayMax = maxAmplitude * 1.1;
  
  ctx.strokeStyle = '#48dbfb';
  ctx.lineWidth = 1;
  ctx.beginPath();
  
  const step = Math.ceil(data.length / width);
  for (let i = 0; i < width; i++) {
    let min = 1.0;
    let max = -1.0;
    for (let j = 0; j < step; j++) {
      const idx = i * step + j;
      if (idx < data.length) {
        const val = data[idx];
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }
    
    // 用 displayMax 缩放，而不是固定的 -1~1
    const y1 = height / 2 - (min / displayMax) * (height / 2);
    const y2 = height / 2 - (max / displayMax) * (height / 2);
    
    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  ctx.stroke();
  
  // 绘制阈值线（如果有阈值信息）
  if (track.thresholdInfo) {
    const { noiseFloor, highThreshold, lowThreshold } = track.thresholdInfo;
    
    // 阈值是 RMS（能量），波形是振幅
    // RMS 和振幅的关系：对于一般音频信号，RMS ≈ 峰值振幅 * 0.3~0.5
    // 我们用同样的 displayMax 来归一化，这样阈值线和波形在同一个坐标系
    const energyToY = (energy: number) => {
      const normalized = Math.min(energy / displayMax, 1);
      return height / 2 - normalized * (height / 2);
    };
    
    // 绘制噪音底线
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    const noiseY = energyToY(noiseFloor);
    ctx.beginPath();
    ctx.moveTo(0, noiseY);
    ctx.lineTo(width, noiseY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, height - noiseY + height / 2);
    ctx.lineTo(width, height - noiseY + height / 2);
    ctx.stroke();
    
    // 绘制低阈值线（绿色）
    ctx.strokeStyle = '#2ecc71';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 3]);
    const lowY = energyToY(lowThreshold);
    ctx.beginPath();
    ctx.moveTo(0, lowY);
    ctx.lineTo(width, lowY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, height - lowY + height / 2);
    ctx.lineTo(width, height - lowY + height / 2);
    ctx.stroke();
    
    // 绘制高阈值线（红色）
    ctx.strokeStyle = '#ff6b6b';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    const highY = energyToY(highThreshold);
    ctx.beginPath();
    ctx.moveTo(0, highY);
    ctx.lineTo(width, highY);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, height - highY + height / 2);
    ctx.lineTo(width, height - highY + height / 2);
    ctx.stroke();
    
    ctx.setLineDash([]);
    
    // 绘制图例
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#666';
    ctx.fillText(`噪音底 ${noiseFloor.toExponential(1)}`, 5, noiseY - 3);
    ctx.fillStyle = '#2ecc71';
    ctx.fillText(`低阈值 ${lowThreshold.toExponential(1)}`, 5, lowY - 3);
    ctx.fillStyle = '#ff6b6b';
    ctx.fillText(`高阈值 ${highThreshold.toExponential(1)}`, 5, highY - 3);
  }
  
  // 绘制序列和音节标记
  for (const seq of track.sequences) {
    const seqX1 = (seq.start / buffer.duration) * width;
    const seqX2 = (seq.end / buffer.duration) * width;
    ctx.fillStyle = 'rgba(254, 202, 87, 0.15)';
    ctx.fillRect(seqX1, 0, seqX2 - seqX1, height);
    
    for (const syl of seq.syllables) {
      const x1 = (syl.start / buffer.duration) * width;
      const x2 = (syl.end / buffer.duration) * width;
      ctx.fillStyle = 'rgba(72, 219, 251, 0.3)';
      ctx.fillRect(x1, height * 0.1, x2 - x1, height * 0.8);
    }
  }
}

function drawTrackFormantPlot(trackIdx: number) {
  const canvas = getCanvasRef(trackIdx, 'formant');
  const track = audioTracks.value[trackIdx];
  if (!canvas || !track || !track.results.length) return;
  
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const padding = 50;
  
  const f1Min = 100, f1Max = 1100;
  const f2Min = 500, f2Max = 3500;
  
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  
  const toX = (f2: number) => padding + (f2 - f2Min) / (f2Max - f2Min) * (width - 2 * padding);
  const toY = (f1: number) => padding + (f1 - f1Min) / (f1Max - f1Min) * (height - 2 * padding);
  
  // 绘制网格线
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let f1 = 200; f1 <= 1000; f1 += 200) {
    const y = toY(f1);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
  }
  for (let f2 = 1000; f2 <= 3000; f2 += 500) {
    const x = toX(f2);
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
  }
  
  // 绘制坐标轴
  ctx.strokeStyle = '#666';
  ctx.lineWidth = 2;
  // Y轴
  ctx.beginPath();
  ctx.moveTo(padding, padding);
  ctx.lineTo(padding, height - padding);
  ctx.stroke();
  // X轴
  ctx.beginPath();
  ctx.moveTo(padding, height - padding);
  ctx.lineTo(width - padding, height - padding);
  ctx.stroke();
  
  // 绘制Y轴刻度和标签 (F1)
  ctx.fillStyle = '#aaa';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (let f1 = 200; f1 <= 1000; f1 += 200) {
    const y = toY(f1);
    ctx.fillText(`${f1}`, padding - 8, y);
    // 刻度线
    ctx.beginPath();
    ctx.moveTo(padding - 4, y);
    ctx.lineTo(padding, y);
    ctx.stroke();
  }
  
  // 绘制X轴刻度和标签 (F2)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (let f2 = 1000; f2 <= 3000; f2 += 500) {
    const x = toX(f2);
    ctx.fillText(`${f2}`, x, height - padding + 8);
    // 刻度线
    ctx.beginPath();
    ctx.moveTo(x, height - padding);
    ctx.lineTo(x, height - padding + 4);
    ctx.stroke();
  }
  
  // 绘制坐标轴名称
  ctx.fillStyle = '#feca57';
  ctx.font = 'bold 12px sans-serif';
  // Y轴名称 (F1)
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('F1 (Hz)', 0, 0);
  ctx.restore();
  // X轴名称 (F2)
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillText('F2 (Hz)', width / 2, height - 15);
  
  const colors: Record<string, string> = {
    U: '#9b59b6',
    I: '#48dbfb',
    E: '#2ecc71',
    A: '#feca57',
    O: '#ff6b6b'
  };
  
  ctx.lineWidth = 2;
  for (const [vowel, range] of Object.entries(DEFAULT_VOWEL_FORMANTS)) {
    ctx.strokeStyle = colors[vowel] || '#888';
    ctx.setLineDash([5, 5]);
    const x1 = toX(range.f2[0]);
    const x2 = toX(range.f2[1]);
    const y1 = toY(range.f1[0]);
    const y2 = toY(range.f1[1]);
    ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
  }
  ctx.setLineDash([]);
  
  for (const result of track.results) {
    const x = toX(result.f2);
    const y = toY(result.f1);
    
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = colors[result.guessedVowel || ''] || '#888';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
}

// ==================== 导出 ====================
function exportAllResults() {
  const data = {
    exportTime: new Date().toISOString(),
    params: { ...params },
    tracks: audioTracks.value.map(t => ({
      name: t.name,
      duration: t.buffer.duration,
      sequences: t.sequences,
      results: t.results,
      stats: t.stats
    })),
    allResults: allAnalysisResults.value,
    allStats: allVowelStats.value,
    suggestedConfig: suggestedConfig.value
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vowel-analysis-${Date.now()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function copyConfig() {
  if (suggestedConfig.value) {
    navigator.clipboard.writeText(suggestedConfig.value);
    status.value = '配置已复制到剪贴板！';
    statusType.value = 'success';
  }
}

// ==================== 清理 ====================
onUnmounted(() => {
  if (recordingInterval) {
    clearInterval(recordingInterval);
  }
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
});
</script>

<style scoped>
.analyzer-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
  padding: 20px;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.analyzer-header {
  text-align: center;
  margin-bottom: 24px;
}

.analyzer-header h1 {
  font-size: 2rem;
  margin: 0;
  background: linear-gradient(90deg, #ff6b6b, #feca57, #48dbfb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: #888;
  margin-top: 8px;
}

/* 控制面板 */
.control-panel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.control-row {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea, #764ba2);
  color: white;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid #444;
}

.btn-success {
  background: linear-gradient(135deg, #2ecc71, #27ae60);
  color: white;
}

.btn-danger {
  background: linear-gradient(135deg, #e74c3c, #c0392b);
  color: white;
}

.btn-small {
  padding: 6px 12px;
  font-size: 0.85rem;
}

.file-input-label {
  display: inline-block;
}

/* 录制指示器 */
.recording-indicator {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 12px;
  background: rgba(231, 76, 60, 0.2);
  border: 1px solid #e74c3c;
  border-radius: 8px;
  margin-bottom: 24px;
  color: #e74c3c;
  font-weight: bold;
}

.recording-dot {
  width: 12px;
  height: 12px;
  background: #e74c3c;
  border-radius: 50%;
  animation: pulse 1s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* 状态 */
.status-banner {
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 24px;
  text-align: center;
}

.status-banner.info {
  background: rgba(72, 219, 251, 0.2);
  border: 1px solid #48dbfb;
}

.status-banner.success {
  background: rgba(46, 204, 113, 0.2);
  border: 1px solid #2ecc71;
}

.status-banner.error {
  background: rgba(233, 69, 96, 0.2);
  border: 1px solid #e94560;
}

/* 参数 */
.params-section {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
}

.params-section h3 {
  margin: 0 0 12px 0;
  color: #888;
  font-size: 0.9rem;
}

.params-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

.params-grid label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.85rem;
  color: #aaa;
}

.params-grid input {
  width: 120px;
  padding: 8px;
  border: 1px solid #444;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.3);
  color: #fff;
}

/* 音频轨道 */
.audio-tracks {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.audio-track {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  overflow: hidden;
}

.track-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background: rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.track-header:hover {
  background: rgba(0, 0, 0, 0.3);
}

.track-icon {
  color: #feca57;
  font-size: 0.8rem;
}

.track-header h2 {
  margin: 0;
  font-size: 1.1rem;
  color: #feca57;
  flex: 1;
}

.track-info {
  color: #888;
  font-size: 0.85rem;
}

.track-actions {
  display: flex;
  gap: 8px;
}

.track-content {
  padding: 16px;
}

/* 调试信息 */
.debug-info {
  background: rgba(72, 219, 251, 0.1);
  border: 1px solid rgba(72, 219, 251, 0.3);
  border-radius: 6px;
  padding: 8px 12px;
  margin-bottom: 16px;
  font-size: 0.8rem;
  color: #48dbfb;
  font-family: 'Fira Code', monospace;
}

/* 波形 */
.waveform-section {
  margin-bottom: 20px;
}

.waveform-section h3,
.sequences-section h3,
.formant-plot-section h3,
.stats-section h3 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #48dbfb;
}

.waveform-container {
  position: relative;
  cursor: crosshair;
}

.waveform-container canvas {
  width: 100%;
  height: 150px;
  border-radius: 8px;
}

.cursor-line {
  position: absolute;
  top: 0;
  width: 1px;
  height: 150px;
  background: #ff6b6b;
  pointer-events: none;
  z-index: 10;
}

.cursor-time {
  position: absolute;
  top: -24px;
  left: 50%;
  transform: translateX(-50%);
  background: #ff6b6b;
  color: #fff;
  padding: 2px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  font-weight: bold;
  white-space: nowrap;
}

.split-mark {
  position: absolute;
  top: 0;
  width: 2px;
  height: 150px;
  background: #00d2d3;
  pointer-events: none;
  z-index: 9;
}

.split-mark .mark-time {
  position: absolute;
  bottom: -20px;
  left: 50%;
  transform: translateX(-50%);
  background: #00d2d3;
  color: #000;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: bold;
  white-space: nowrap;
}

.split-mark .mark-remove {
  position: absolute;
  top: -20px;
  left: 50%;
  transform: translateX(-50%);
  background: #e74c3c;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 18px;
  height: 18px;
  font-size: 10px;
  cursor: pointer;
  pointer-events: auto;
}

.time-markers {
  display: flex;
  justify-content: space-between;
  color: #888;
  font-size: 0.8rem;
  margin-top: 8px;
}

.waveform-controls {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.marks-info {
  color: #00d2d3;
  font-size: 0.85rem;
}

/* 序列 */
.sequences-container {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.sequence-card {
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 12px;
}

.sequence-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
  font-size: 0.85rem;
}

.sequence-label {
  color: #feca57;
  font-weight: bold;
}

.sequence-time {
  color: #888;
}

.syllable-count {
  background: rgba(72, 219, 251, 0.2);
  color: #48dbfb;
  padding: 2px 8px;
  border-radius: 4px;
}

.syllables-timeline {
  position: relative;
  height: 32px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  margin-bottom: 8px;
}

.syllable-marker {
  position: absolute;
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
  min-width: 20px;
}

.syllable-marker.u { background: rgba(155, 89, 182, 0.7); color: #fff; }
.syllable-marker.i { background: rgba(72, 219, 251, 0.7); color: #000; }
.syllable-marker.e { background: rgba(46, 204, 113, 0.7); color: #000; }
.syllable-marker.a { background: rgba(254, 202, 87, 0.7); color: #000; }
.syllable-marker.o { background: rgba(255, 107, 107, 0.7); color: #fff; }
.syllable-marker.unknown { background: rgba(136, 136, 136, 0.7); color: #fff; }

.syllable-marker.selected {
  box-shadow: 0 0 0 2px #fff, 0 0 8px 2px #feca57;
  z-index: 10;
}

.syllable-marker:hover {
  cursor: pointer;
  filter: brightness(1.2);
}

.sequence-result {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.sequence-result .label {
  color: #888;
}

.vowel-sequence {
  display: flex;
  gap: 2px;
}

.vowel-char {
  padding: 2px 6px;
  border-radius: 4px;
  font-weight: bold;
}

.vowel-char.u { background: rgba(155, 89, 182, 0.3); color: #9b59b6; }
.vowel-char.i { background: rgba(72, 219, 251, 0.3); color: #48dbfb; }
.vowel-char.e { background: rgba(46, 204, 113, 0.3); color: #2ecc71; }
.vowel-char.a { background: rgba(254, 202, 87, 0.3); color: #feca57; }
.vowel-char.o { background: rgba(255, 107, 107, 0.3); color: #ff6b6b; }
.vowel-char.unknown { background: rgba(136, 136, 136, 0.3); color: #888; }

.vowel-char.selected {
  box-shadow: 0 0 0 2px currentColor;
  transform: scale(1.1);
}

.vowel-char:hover {
  cursor: pointer;
  filter: brightness(1.2);
}

/* 音节详情面板 */
.syllable-detail {
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #feca57;
  border-radius: 8px;
  padding: 12px;
  margin-top: 12px;
}

.detail-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  padding-bottom: 8px;
  border-bottom: 1px solid #333;
  gap: 8px;
}

.detail-vowel {
  padding: 4px 10px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 1.1rem;
}

.detail-vowel.u { background: rgba(155, 89, 182, 0.5); color: #fff; }
.detail-vowel.i { background: rgba(72, 219, 251, 0.5); color: #000; }
.detail-vowel.e { background: rgba(46, 204, 113, 0.5); color: #000; }
.detail-vowel.a { background: rgba(254, 202, 87, 0.5); color: #000; }
.detail-vowel.o { background: rgba(255, 107, 107, 0.5); color: #fff; }
.detail-vowel.unknown { background: rgba(136, 136, 136, 0.5); color: #fff; }

.detail-title {
  flex: 1;
  color: #feca57;
  font-size: 0.95rem;
  font-weight: bold;
}

.detail-header h4 {
  margin: 0;
  color: #feca57;
  font-size: 0.95rem;
}

.detail-header .close-btn {
  background: transparent;
  border: none;
  color: #888;
  cursor: pointer;
  font-size: 1.2rem;
  padding: 0 4px;
}

.detail-header .close-btn:hover {
  color: #fff;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.05);
  padding: 8px;
  border-radius: 4px;
}

.detail-label {
  font-size: 0.75rem;
  color: #888;
  margin-bottom: 2px;
}

.detail-value {
  font-size: 0.95rem;
  color: #fff;
  font-weight: bold;
}

/* 共振峰图 */
.plot-container {
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.plot-container canvas {
  border-radius: 8px;
}

.plot-legend {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
}

.dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.dot.u { background: #9b59b6; }
.dot.i { background: #48dbfb; }
.dot.e { background: #2ecc71; }
.dot.a { background: #feca57; }
.dot.o { background: #ff6b6b; }
.dot.unknown { background: #888; }

/* 统计 */
.stats-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.stat-card {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 12px;
  min-width: 150px;
}

.stat-card h4 {
  margin: 0 0 8px 0;
  font-size: 1.2rem;
}

.stat-card h4.u { color: #9b59b6; }
.stat-card h4.i { color: #48dbfb; }
.stat-card h4.e { color: #2ecc71; }
.stat-card h4.a { color: #feca57; }
.stat-card h4.o { color: #ff6b6b; }

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 2px 0;
  font-size: 0.85rem;
  border-bottom: 1px solid #333;
}

/* 结果表格 */
.results-section {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  margin-top: 24px;
}

.results-section h2 {
  margin: 0 0 16px 0;
  color: #feca57;
}

.results-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.results-table th,
.results-table td {
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid #333;
}

.results-table th {
  background: rgba(0, 0, 0, 0.3);
  color: #feca57;
}

.results-table tr:hover {
  background: rgba(255, 255, 255, 0.05);
}

.vowel-cell {
  font-weight: bold;
}

.vowel-cell.u { color: #9b59b6; }
.vowel-cell.i { color: #48dbfb; }
.vowel-cell.e { color: #2ecc71; }
.vowel-cell.a { color: #feca57; }
.vowel-cell.o { color: #ff6b6b; }

/* 建议配置 */
.suggestion-section {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  margin-top: 24px;
}

.suggestion-section h2 {
  margin: 0 0 16px 0;
  color: #feca57;
}

.config-code {
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-family: 'Fira Code', monospace;
  font-size: 0.85rem;
  margin-bottom: 16px;
}
</style>
