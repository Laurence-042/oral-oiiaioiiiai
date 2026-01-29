<template>
  <div class="analyzer-view">
    <header class="analyzer-header">
      <h1>🔬 音频特征分析工具</h1>
      <p class="subtitle">分析标准发音音频，提取元音共振峰特征</p>
    </header>

    <!-- 控制面板 -->
    <section class="control-panel">
      <button class="btn btn-primary" @click="loadAndAnalyze" :disabled="isAnalyzing">
        {{ isAnalyzing ? '⏳ 分析中...' : '📂 加载并分析 oiia-oiia-sound.mp3' }}
      </button>
      <button class="btn btn-secondary" @click="exportResults" :disabled="!analysisResults.length">
        📋 导出结果
      </button>
    </section>

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
          <input type="number" v-model.number="params.energyThresholdMultiplier" min="1" max="10" step="0.5" />
        </label>
      </div>
    </section>

    <!-- 分析状态 -->
    <div v-if="status" class="status-banner" :class="statusType">
      {{ status }}
    </div>

    <!-- 波形显示 -->
    <section class="waveform-section" v-if="audioBuffer">
      <h2>📊 音频波形</h2>
      <div class="waveform-container" 
           @mousemove="handleWaveformMouseMove" 
           @mouseleave="handleWaveformMouseLeave"
           @click="handleWaveformClick">
        <canvas ref="waveformCanvas" width="1200" height="150"></canvas>
        <!-- 光标线 -->
        <div v-if="cursorInfo.visible" 
             class="cursor-line" 
             :style="{ left: `${cursorInfo.x}px` }">
          <div class="cursor-time">{{ cursorInfo.timeMs.toFixed(1) }}ms</div>
        </div>
        <!-- 点击标记 -->
        <div v-for="(mark, idx) in clickMarks" 
             :key="idx" 
             class="click-mark"
             :style="{ left: `${mark.x}px` }">
          <div class="mark-time">{{ mark.timeMs.toFixed(1) }}ms</div>
        </div>
      </div>
      <div class="time-markers">
        <span>0s</span>
        <span>{{ (audioBuffer.duration / 2).toFixed(2) }}s</span>
        <span>{{ audioBuffer.duration.toFixed(2) }}s</span>
      </div>
      <div class="cursor-controls" v-if="clickMarks.length">
        <span class="marks-info">已标记 {{ clickMarks.length }} 个点</span>
        <button class="btn btn-small" @click="clearClickMarks">清除标记</button>
      </div>
    </section>

    <!-- 检测到的序列 -->
    <section class="sequences-section" v-if="sequences.length">
      <h2>🎵 检测到的发音序列 ({{ sequences.length }} 个)</h2>
      <div class="sequences-container">
        <div v-for="(seq, seqIdx) in sequences" :key="seqIdx" class="sequence-card">
          <div class="sequence-header">
            <h3>序列 {{ seqIdx + 1 }}</h3>
            <span class="sequence-time">{{ seq.start.toFixed(2) }}s - {{ seq.end.toFixed(2) }}s ({{ ((seq.end - seq.start) * 1000).toFixed(0) }}ms)</span>
            <span class="syllable-count">{{ seq.syllables.length }} 个音节</span>
          </div>
          
          <!-- 音节时间线 -->
          <div class="syllables-timeline">
            <div 
              v-for="(syl, sylIdx) in seq.syllables" 
              :key="sylIdx"
              class="syllable-marker"
              :class="[syl.guessedVowel?.toLowerCase() || 'unknown', { selected: selectedSyllable?.seqIdx === seqIdx && selectedSyllable?.sylIdx === sylIdx }]"
              :style="{ 
                left: `${((syl.start - seq.start) / (seq.end - seq.start)) * 100}%`, 
                width: `${((syl.end - syl.start) / (seq.end - seq.start)) * 100}%` 
              }"
              @click="selectSyllable(seqIdx, sylIdx)"
            >
              {{ syl.guessedVowel || '?' }}
            </div>
          </div>
          
          <!-- 识别结果 -->
          <div class="sequence-result">
            <span class="label">识别序列:</span>
            <span class="vowel-sequence">
              <span 
                v-for="(syl, sylIdx) in seq.syllables" 
                :key="sylIdx" 
                class="vowel-char"
                :class="syl.guessedVowel?.toLowerCase() || 'unknown'"
              >{{ syl.guessedVowel || '?' }}</span>
            </span>
          </div>
        </div>
      </div>
    </section>

    <!-- 选中音节详情 -->
    <section class="syllable-detail" v-if="selectedSyllableData">
      <h2>🔍 音节详情</h2>
      <div class="detail-grid">
        <div class="detail-item">
          <label>时间:</label>
          <span>{{ selectedSyllableData.start.toFixed(3) }}s - {{ selectedSyllableData.end.toFixed(3) }}s</span>
        </div>
        <div class="detail-item">
          <label>时长:</label>
          <span>{{ ((selectedSyllableData.end - selectedSyllableData.start) * 1000).toFixed(1) }}ms</span>
        </div>
        <div class="detail-item">
          <label>F1:</label>
          <span>{{ selectedSyllableData.f1.toFixed(0) }} Hz</span>
        </div>
        <div class="detail-item">
          <label>F2:</label>
          <span>{{ selectedSyllableData.f2.toFixed(0) }} Hz</span>
        </div>
        <div class="detail-item">
          <label>音量:</label>
          <span>{{ selectedSyllableData.volume.toFixed(1) }} dB</span>
        </div>
        <div class="detail-item">
          <label>推测元音:</label>
          <span class="vowel-badge" :class="selectedSyllableData.guessedVowel?.toLowerCase()">
            {{ selectedSyllableData.guessedVowel || '?' }}
          </span>
        </div>
        <div class="detail-item">
          <label>当前配置匹配:</label>
          <span>{{ selectedSyllableData.currentMatch || '无' }}</span>
        </div>
      </div>
    </section>

    <!-- 共振峰散点图 -->
    <section class="formant-plot-section" v-if="analysisResults.length">
      <h2>📈 共振峰分布图 (F1 vs F2)</h2>
      <div class="plot-container">
        <canvas ref="formantPlotCanvas" width="600" height="500"></canvas>
        <div class="plot-legend">
          <div class="legend-item"><span class="dot u"></span> U (oo)</div>
          <div class="legend-item"><span class="dot i"></span> I (ee)</div>
          <div class="legend-item"><span class="dot a"></span> A (ah)</div>
          <div class="legend-item"><span class="dot o"></span> O (oh)</div>
          <div class="legend-item"><span class="dot unknown"></span> 未分类</div>
        </div>
      </div>
    </section>

    <!-- 分析结果表格 -->
    <section class="results-section" v-if="analysisResults.length">
      <h2>📋 详细分析结果 ({{ analysisResults.length }} 个音节)</h2>
      <table class="results-table">
        <thead>
          <tr>
            <th>序列</th>
            <th>#</th>
            <th>时间 (s)</th>
            <th>时长 (ms)</th>
            <th>F1 (Hz)</th>
            <th>F2 (Hz)</th>
            <th>音量 (dB)</th>
            <th>推测元音</th>
            <th>当前配置匹配</th>
          </tr>
        </thead>
        <tbody>
          <tr 
            v-for="(result, i) in analysisResults" 
            :key="i" 
            :class="{ highlight: selectedSyllable?.seqIdx === result.seqIdx && selectedSyllable?.sylIdx === result.sylIdx }"
            @click="selectSyllable(result.seqIdx, result.sylIdx)"
          >
            <td>{{ result.seqIdx + 1 }}</td>
            <td>{{ result.sylIdx + 1 }}</td>
            <td>{{ result.time.toFixed(3) }}</td>
            <td>{{ result.duration.toFixed(0) }}</td>
            <td>{{ result.f1.toFixed(0) }}</td>
            <td>{{ result.f2.toFixed(0) }}</td>
            <td>{{ result.volume.toFixed(1) }}</td>
            <td class="vowel-cell" :class="result.guessedVowel?.toLowerCase()">
              {{ result.guessedVowel || '?' }}
            </td>
            <td class="match-cell" :class="result.currentMatch ? 'match' : 'no-match'">
              {{ result.currentMatch || '无' }}
            </td>
          </tr>
        </tbody>
      </table>
    </section>

    <!-- 统计摘要 -->
    <section class="summary-section" v-if="vowelStats">
      <h2>📊 元音统计摘要</h2>
      <div class="stats-grid">
        <div class="stat-card" v-for="(stat, vowel) in vowelStats" :key="vowel">
          <h3 class="vowel-label" :class="vowel.toLowerCase()">{{ vowel }}</h3>
          <div class="stat-row">
            <span>样本数:</span>
            <strong>{{ stat.count }}</strong>
          </div>
          <div class="stat-row">
            <span>F1 范围:</span>
            <strong>{{ stat.f1Min.toFixed(0) }} - {{ stat.f1Max.toFixed(0) }} Hz</strong>
          </div>
          <div class="stat-row">
            <span>F1 平均:</span>
            <strong>{{ stat.f1Avg.toFixed(0) }} Hz</strong>
          </div>
          <div class="stat-row">
            <span>F2 范围:</span>
            <strong>{{ stat.f2Min.toFixed(0) }} - {{ stat.f2Max.toFixed(0) }} Hz</strong>
          </div>
          <div class="stat-row">
            <span>F2 平均:</span>
            <strong>{{ stat.f2Avg.toFixed(0) }} Hz</strong>
          </div>
        </div>
      </div>
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
import { ref, computed, nextTick, reactive } from 'vue';
import { DEFAULT_VOWEL_FORMANTS } from '@/config/vowels';

// ==================== 类型定义 ====================
interface Syllable {
  start: number;
  end: number;
  f1: number;
  f2: number;
  volume: number;
  guessedVowel: string | null;
  currentMatch: string | null;
}

interface Sequence {
  start: number;
  end: number;
  syllables: Syllable[];
}

interface AnalysisResult extends Syllable {
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
  samples: { f1: number; f2: number }[];
}

// ==================== 分析参数 ====================
const params = reactive({
  sequenceGapMs: 300,          // 序列之间的最小间隔 (ms)
  syllableGapMs: 20,           // 音节之间的最小间隔 (ms)
  minSyllableDurationMs: 30,   // 最小音节时长 (ms)
  energyThresholdMultiplier: 1800 // 能量阈值倍数
});

// ==================== 状态 ====================
const isAnalyzing = ref(false);
const status = ref('');
const statusType = ref<'info' | 'success' | 'error'>('info');
const audioBuffer = ref<AudioBuffer | null>(null);
const sequences = ref<Sequence[]>([]);
const analysisResults = ref<AnalysisResult[]>([]);
const selectedSyllable = ref<{ seqIdx: number; sylIdx: number } | null>(null);

const waveformCanvas = ref<HTMLCanvasElement | null>(null);
const formantPlotCanvas = ref<HTMLCanvasElement | null>(null);

// 光标状态
const cursorInfo = ref({
  visible: false,
  x: 0,
  timeMs: 0
});
const clickMarks = ref<{ x: number; timeMs: number }[]>([]);

// ==================== 计算属性 ====================
const selectedSyllableData = computed(() => {
  if (!selectedSyllable.value) return null;
  const { seqIdx, sylIdx } = selectedSyllable.value;
  const seq = sequences.value[seqIdx];
  if (!seq) return null;
  return seq.syllables[sylIdx] || null;
});

// ==================== 计算属性 ====================
const vowelStats = computed(() => {
  if (!analysisResults.value.length) return null;
  
  const stats: Record<string, VowelStat> = {};
  
  for (const result of analysisResults.value) {
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
        f2Avg: 0,
        samples: []
      };
    }
    
    const s = stats[vowel];
    s.count++;
    s.f1Min = Math.min(s.f1Min, result.f1);
    s.f1Max = Math.max(s.f1Max, result.f1);
    s.f2Min = Math.min(s.f2Min, result.f2);
    s.f2Max = Math.max(s.f2Max, result.f2);
    s.samples.push({ f1: result.f1, f2: result.f2 });
  }
  
  // 计算平均值
  for (const vowel in stats) {
    const s = stats[vowel];
    s.f1Avg = s.samples.reduce((sum, p) => sum + p.f1, 0) / s.count;
    s.f2Avg = s.samples.reduce((sum, p) => sum + p.f2, 0) / s.count;
  }
  
  return stats;
});

const suggestedConfig = computed(() => {
  if (!vowelStats.value) return null;
  
  const config: Record<string, { f1: [number, number]; f2: [number, number] }> = {};
  
  for (const vowel in vowelStats.value) {
    const s = vowelStats.value[vowel];
    // 扩展范围 20% 作为容差
    const f1Range = s.f1Max - s.f1Min;
    const f2Range = s.f2Max - s.f2Min;
    const f1Margin = Math.max(50, f1Range * 0.2);
    const f2Margin = Math.max(100, f2Range * 0.2);
    
    config[vowel] = {
      f1: [Math.round(s.f1Min - f1Margin), Math.round(s.f1Max + f1Margin)],
      f2: [Math.round(s.f2Min - f2Margin), Math.round(s.f2Max + f2Margin)]
    };
  }
  
  return `export const SUGGESTED_VOWEL_FORMANTS: VowelFormantConfig = ${JSON.stringify(config, null, 2)};`;
});

// ==================== 方法 ====================
function selectSyllable(seqIdx: number, sylIdx: number) {
  selectedSyllable.value = { seqIdx, sylIdx };
}

async function loadAndAnalyze() {
  isAnalyzing.value = true;
  status.value = '正在加载音频文件...';
  statusType.value = 'info';
  selectedSyllable.value = null;
  
  try {
    // 加载音频文件
    const response = await fetch('/oiia-oiia-sound.mp3');
    if (!response.ok) {
      throw new Error(`无法加载音频文件: ${response.status}`);
    }
    
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new AudioContext({ sampleRate: 44100 });
    audioBuffer.value = await audioContext.decodeAudioData(arrayBuffer);
    
    status.value = `音频已加载: ${audioBuffer.value.duration.toFixed(2)}s, ${audioBuffer.value.sampleRate}Hz`;
    
    await nextTick();
    drawWaveform();
    
    // 两级检测：先检测序列，再检测音节
    status.value = '正在检测发音序列和音节...';
    sequences.value = detectSequencesAndSyllables(audioBuffer.value);
    
    // 分析每个音节的共振峰
    status.value = '正在分析共振峰...';
    analysisResults.value = analyzeSyllables(audioBuffer.value, sequences.value);
    
    await nextTick();
    drawFormantPlot();
    
    const totalSyllables = sequences.value.reduce((sum, seq) => sum + seq.syllables.length, 0);
    status.value = `分析完成！检测到 ${sequences.value.length} 个序列，共 ${totalSyllables} 个音节`;
    statusType.value = 'success';
    
    audioContext.close();
  } catch (err) {
    status.value = `错误: ${err}`;
    statusType.value = 'error';
  } finally {
    isAnalyzing.value = false;
  }
}

/**
 * 两级检测：先按大间隔分割序列，再按小间隔分割音节
 */
function detectSequencesAndSyllables(buffer: AudioBuffer): Sequence[] {
  const data = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  
  // 计算短时能量
  const frameSize = Math.floor(sampleRate * 0.01); // 10ms 帧（更精细）
  const hopSize = Math.floor(frameSize / 2);
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
  
  // 动态阈值
  const sortedEnergies = energies.map(e => e.energy).sort((a, b) => a - b);
  const noiseFloor = sortedEnergies[Math.floor(sortedEnergies.length * 0.3)];
  const threshold = noiseFloor * params.energyThresholdMultiplier;
  
  // 第一步：检测所有发声段
  const voiceSegments: { start: number; end: number }[] = [];
  let inVoice = false;
  let voiceStart = 0;
  
  for (const { time, energy } of energies) {
    if (!inVoice && energy > threshold) {
      voiceStart = time;
      inVoice = true;
    } else if (inVoice && energy <= threshold) {
      if (time - voiceStart >= params.minSyllableDurationMs / 1000) {
        voiceSegments.push({ start: voiceStart, end: time });
      }
      inVoice = false;
    }
  }
  // 处理末尾
  if (inVoice) {
    const lastTime = energies[energies.length - 1].time;
    if (lastTime - voiceStart >= params.minSyllableDurationMs / 1000) {
      voiceSegments.push({ start: voiceStart, end: lastTime });
    }
  }
  
  // 第二步：合并相近的段（小于音节间隔阈值的合并为同一音节）
  const syllables: { start: number; end: number }[] = [];
  for (const seg of voiceSegments) {
    if (syllables.length === 0) {
      syllables.push({ ...seg });
    } else {
      const last = syllables[syllables.length - 1];
      const gap = seg.start - last.end;
      if (gap < params.syllableGapMs / 1000) {
        // 合并
        last.end = seg.end;
      } else {
        syllables.push({ ...seg });
      }
    }
  }
  
  // 第三步：按序列间隔阈值分组
  const sequenceGroups: { start: number; end: number }[][] = [];
  let currentGroup: { start: number; end: number }[] = [];
  
  for (const syl of syllables) {
    if (currentGroup.length === 0) {
      currentGroup.push(syl);
    } else {
      const lastSyl = currentGroup[currentGroup.length - 1];
      const gap = syl.start - lastSyl.end;
      if (gap >= params.sequenceGapMs / 1000) {
        // 新序列
        sequenceGroups.push(currentGroup);
        currentGroup = [syl];
      } else {
        currentGroup.push(syl);
      }
    }
  }
  if (currentGroup.length > 0) {
    sequenceGroups.push(currentGroup);
  }
  
  // 第四步：为每个序列分析音节特征
  const result: Sequence[] = [];
  
  for (const group of sequenceGroups) {
    const seqStart = group[0].start;
    const seqEnd = group[group.length - 1].end;
    
    const analyzedSyllables: Syllable[] = group.map(syl => {
      // 分析这个音节的共振峰
      const { f1, f2, volume } = analyzeFormants(buffer, syl.start, syl.end);
      const guessedVowel = guessVowel(f1, f2);
      const currentMatch = matchCurrentConfig(f1, f2);
      
      return {
        start: syl.start,
        end: syl.end,
        f1,
        f2,
        volume,
        guessedVowel,
        currentMatch
      };
    });
    
    result.push({
      start: seqStart,
      end: seqEnd,
      syllables: analyzedSyllables
    });
  }
  
  return result;
}

/**
 * 分析指定时间范围内的共振峰
 */
function analyzeFormants(buffer: AudioBuffer, start: number, end: number): { f1: number; f2: number; volume: number } {
  const sampleRate = buffer.sampleRate;
  const data = buffer.getChannelData(0);
  
  const startSample = Math.floor(start * sampleRate);
  const endSample = Math.floor(end * sampleRate);
  const duration = endSample - startSample;
  
  // 取中间部分做分析（避免边缘效应）
  const margin = Math.floor(duration * 0.1);
  const analysisStart = startSample + margin;
  const frameSize = Math.min(2048, duration - 2 * margin);
  
  if (frameSize < 512) {
    return { f1: 0, f2: 0, volume: -100 };
  }
  
  // 提取帧数据
  const frame = new Float32Array(2048);
  for (let i = 0; i < Math.min(2048, frameSize); i++) {
    frame[i] = data[analysisStart + i] || 0;
  }
  
  // 应用汉宁窗
  for (let i = 0; i < 2048; i++) {
    frame[i] *= 0.5 * (1 - Math.cos(2 * Math.PI * i / 2047));
  }
  
  // 计算音量
  let rms = 0;
  for (let i = 0; i < frameSize; i++) {
    rms += data[analysisStart + i] * data[analysisStart + i];
  }
  rms = Math.sqrt(rms / frameSize);
  const volume = rms > 0 ? 20 * Math.log10(rms) : -100;
  
  // FFT
  const spectrum = performFFT(frame);
  
  // 提取共振峰
  const formants = extractFormants(spectrum, sampleRate, 2048);
  
  return { f1: formants.f1, f2: formants.f2, volume };
}

/**
 * 将序列数据转换为分析结果列表
 */
function analyzeSyllables(_buffer: AudioBuffer, seqs: Sequence[]): AnalysisResult[] {
  const results: AnalysisResult[] = [];
  
  for (let seqIdx = 0; seqIdx < seqs.length; seqIdx++) {
    const seq = seqs[seqIdx];
    for (let sylIdx = 0; sylIdx < seq.syllables.length; sylIdx++) {
      const syl = seq.syllables[sylIdx];
      results.push({
        ...syl,
        seqIdx,
        sylIdx,
        time: syl.start,
        duration: (syl.end - syl.start) * 1000
      });
    }
  }
  
  return results;
}

function performFFT(frame: Float32Array): Float32Array {
  const n = frame.length;
  const real = new Float32Array(n);
  const imag = new Float32Array(n);
  
  // 复制输入
  for (let i = 0; i < n; i++) {
    real[i] = frame[i];
    imag[i] = 0;
  }
  
  // Cooley-Tukey FFT
  const levels = Math.log2(n);
  
  // 位反转排序
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
  
  // FFT 蝶形运算
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
  
  // 计算幅度谱 (dB)
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
  
  // F1 搜索范围: 200-1000 Hz
  const f1MinBin = freqToBin(200);
  const f1MaxBin = freqToBin(1000);
  
  // F2 搜索范围: 800-3000 Hz
  const f2MinBin = freqToBin(800);
  const f2MaxBin = freqToBin(3000);
  
  // 找 F1 峰值
  let f1Bin = f1MinBin;
  let f1Max = -Infinity;
  for (let i = f1MinBin; i <= f1MaxBin && i < spectrum.length; i++) {
    if (spectrum[i] > f1Max) {
      f1Max = spectrum[i];
      f1Bin = i;
    }
  }
  
  // 找 F2 峰值（排除 F1 附近）
  let f2Bin = f2MinBin;
  let f2Max = -Infinity;
  const f1ProtectedBins = freqToBin(300); // F1 周围 300Hz 保护区
  
  for (let i = f2MinBin; i <= f2MaxBin && i < spectrum.length; i++) {
    if (Math.abs(i - f1Bin) < f1ProtectedBins) continue;
    if (spectrum[i] > f2Max) {
      f2Max = spectrum[i];
      f2Bin = i;
    }
  }
  
  return {
    f1: binToFreq(f1Bin),
    f2: binToFreq(f2Bin)
  };
}

function guessVowel(f1: number, f2: number): string | null {
  // 基于标准元音图的粗略分类
  // 这个分类基于元音四边形的典型位置
  
  // U: 低 F1, 低 F2 (后高元音)
  if (f1 < 450 && f2 < 1200) return 'U';
  
  // I: 低 F1, 高 F2 (前高元音)
  if (f1 < 450 && f2 > 1800) return 'I';
  
  // A: 高 F1, 中 F2 (低元音)
  if (f1 > 600 && f2 > 1000 && f2 < 2000) return 'A';
  
  // O: 中 F1, 低 F2 (后中元音)
  if (f1 >= 400 && f1 <= 700 && f2 < 1200) return 'O';
  
  // E: 中 F1, 高 F2 (前中元音)
  if (f1 >= 400 && f1 <= 700 && f2 > 1600) return 'E';
  
  return null;
}

function matchCurrentConfig(f1: number, f2: number): string | null {
  for (const [vowel, range] of Object.entries(DEFAULT_VOWEL_FORMANTS)) {
    if (f1 >= range.f1[0] && f1 <= range.f1[1] &&
        f2 >= range.f2[0] && f2 <= range.f2[1]) {
      return vowel;
    }
  }
  return null;
}

// ==================== 波形光标处理 ====================
function handleWaveformMouseMove(event: MouseEvent) {
  const canvas = waveformCanvas.value;
  const buffer = audioBuffer.value;
  if (!canvas || !buffer) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const ratio = x / canvas.width;
  const timeMs = ratio * buffer.duration * 1000;
  
  cursorInfo.value = {
    visible: true,
    x: x,
    timeMs: timeMs
  };
}

function handleWaveformMouseLeave() {
  cursorInfo.value.visible = false;
}

function handleWaveformClick(event: MouseEvent) {
  const canvas = waveformCanvas.value;
  const buffer = audioBuffer.value;
  if (!canvas || !buffer) return;
  
  const rect = canvas.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const ratio = x / canvas.width;
  const timeMs = ratio * buffer.duration * 1000;
  
  // 添加标记点
  clickMarks.value.push({ x, timeMs });
}

function clearClickMarks() {
  clickMarks.value = [];
}

function drawWaveform() {
  const canvas = waveformCanvas.value;
  const buffer = audioBuffer.value;
  if (!canvas || !buffer) return;
  
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = buffer.getChannelData(0);
  
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  
  // 绘制波形
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
    
    const y1 = ((1 + min) / 2) * height;
    const y2 = ((1 + max) / 2) * height;
    
    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  ctx.stroke();
  
  // 绘制序列和音节标记
  for (const seq of sequences.value) {
    // 序列背景
    const seqX1 = (seq.start / buffer.duration) * width;
    const seqX2 = (seq.end / buffer.duration) * width;
    ctx.fillStyle = 'rgba(254, 202, 87, 0.15)';
    ctx.fillRect(seqX1, 0, seqX2 - seqX1, height);
    
    // 音节标记
    for (const syl of seq.syllables) {
      const x1 = (syl.start / buffer.duration) * width;
      const x2 = (syl.end / buffer.duration) * width;
      ctx.fillStyle = 'rgba(72, 219, 251, 0.3)';
      ctx.fillRect(x1, height * 0.1, x2 - x1, height * 0.8);
    }
  }
}

function drawFormantPlot() {
  const canvas = formantPlotCanvas.value;
  if (!canvas || !analysisResults.value.length) return;
  
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const padding = 50;
  
  // 坐标轴范围
  const f1Min = 100, f1Max = 1100;  // Y 轴 (F1)
  const f2Min = 500, f2Max = 3500;  // X 轴 (F2)
  
  // 清除画布
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  
  // 坐标转换
  const toX = (f2: number) => padding + (f2 - f2Min) / (f2Max - f2Min) * (width - 2 * padding);
  const toY = (f1: number) => padding + (f1 - f1Min) / (f1Max - f1Min) * (height - 2 * padding);
  
  // 绘制网格
  ctx.strokeStyle = '#333';
  ctx.lineWidth = 1;
  for (let f1 = 200; f1 <= 1000; f1 += 200) {
    const y = toY(f1);
    ctx.beginPath();
    ctx.moveTo(padding, y);
    ctx.lineTo(width - padding, y);
    ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.fillText(`${f1}`, 5, y + 3);
  }
  for (let f2 = 1000; f2 <= 3000; f2 += 500) {
    const x = toX(f2);
    ctx.beginPath();
    ctx.moveTo(x, padding);
    ctx.lineTo(x, height - padding);
    ctx.stroke();
    ctx.fillStyle = '#888';
    ctx.fillText(`${f2}`, x - 15, height - 10);
  }
  
  // 绘制当前配置的范围框
  ctx.lineWidth = 2;
  const colors: Record<string, string> = {
    U: '#9b59b6',
    I: '#48dbfb',
    E: '#2ecc71',
    A: '#feca57',
    O: '#ff6b6b'
  };
  
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
  
  // 绘制数据点
  for (const result of analysisResults.value) {
    const x = toX(result.f2);
    const y = toY(result.f1);
    
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.fillStyle = colors[result.guessedVowel || ''] || '#888';
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();
  }
  
  // 坐标轴标签
  ctx.fillStyle = '#fff';
  ctx.font = '12px sans-serif';
  ctx.fillText('F2 (Hz) →', width / 2 - 30, height - 25);
  ctx.save();
  ctx.translate(15, height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText('F1 (Hz) →', -30, 0);
  ctx.restore();
}

function exportResults() {
  const data = {
    audioFile: 'oiia-oiia-sound.mp3',
    duration: audioBuffer.value?.duration,
    params: { ...params },
    sequences: sequences.value,
    results: analysisResults.value,
    stats: vowelStats.value,
    suggestedConfig: suggestedConfig.value
  };
  
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'vowel-analysis-results.json';
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

.control-panel {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
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

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: white;
  border: 1px solid #444;
}

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

section {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
}

section h2 {
  margin: 0 0 16px 0;
  font-size: 1.2rem;
  color: #feca57;
}

.waveform-section canvas {
  width: 100%;
  height: 150px;
  border-radius: 8px;
}

.waveform-container {
  position: relative;
  cursor: crosshair;
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

.click-mark {
  position: absolute;
  top: 0;
  width: 2px;
  height: 150px;
  background: #00d2d3;
  pointer-events: none;
  z-index: 9;
}

.click-mark .mark-time {
  position: absolute;
  bottom: -24px;
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

.cursor-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 8px;
  padding: 8px 12px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
}

.marks-info {
  color: #00d2d3;
  font-size: 0.85rem;
}

.btn-small {
  padding: 4px 12px;
  font-size: 0.8rem;
}

.time-markers {
  display: flex;
  justify-content: space-between;
  color: #888;
  font-size: 0.8rem;
  margin-top: 8px;
}

.segments-timeline {
  position: relative;
  height: 40px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
}

.segment-marker {
  position: absolute;
  height: 100%;
  background: rgba(254, 202, 87, 0.5);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.8rem;
  transition: all 0.2s;
}

.segment-marker:hover,
.segment-marker.active {
  background: rgba(254, 202, 87, 0.8);
}

.plot-container {
  display: flex;
  gap: 20px;
  align-items: flex-start;
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

.results-table {
  width: 100%;
  border-collapse: collapse;
}

.results-table th,
.results-table td {
  padding: 10px;
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

.results-table tr.highlight {
  background: rgba(254, 202, 87, 0.2);
}

.vowel-cell {
  font-weight: bold;
}

.vowel-cell.u { color: #9b59b6; }
.vowel-cell.i { color: #48dbfb; }
.vowel-cell.e { color: #2ecc71; }
.vowel-cell.a { color: #feca57; }
.vowel-cell.o { color: #ff6b6b; }

.match-cell.match { color: #2ecc71; }
.match-cell.no-match { color: #e94560; }

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 16px;
}

.stat-card {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 16px;
}

.stat-card h3 {
  margin: 0 0 12px 0;
  font-size: 1.5rem;
}

.stat-card h3.u { color: #9b59b6; }
.stat-card h3.i { color: #48dbfb; }
.stat-card h3.e { color: #2ecc71; }
.stat-card h3.a { color: #feca57; }
.stat-card h3.o { color: #ff6b6b; }

.stat-row {
  display: flex;
  justify-content: space-between;
  padding: 4px 0;
  border-bottom: 1px solid #333;
}

.config-code {
  background: rgba(0, 0, 0, 0.5);
  padding: 16px;
  border-radius: 8px;
  overflow-x: auto;
  font-family: 'Fira Code', monospace;
  font-size: 0.9rem;
  margin-bottom: 16px;
}

/* 分析参数 */
.params-section {
  background: rgba(255, 255, 255, 0.03);
}

.params-section h3 {
  margin: 0 0 12px 0;
  color: #888;
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

/* 序列卡片 */
.sequences-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sequence-card {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 16px;
}

.sequence-header {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.sequence-header h3 {
  margin: 0;
  color: #feca57;
}

.sequence-time {
  color: #888;
  font-size: 0.85rem;
}

.syllable-count {
  background: rgba(72, 219, 251, 0.2);
  color: #48dbfb;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
}

/* 音节时间线 */
.syllables-timeline {
  position: relative;
  height: 36px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 6px;
  margin-bottom: 12px;
}

.syllable-marker {
  position: absolute;
  height: 100%;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-size: 0.85rem;
  font-weight: bold;
  transition: all 0.2s;
  min-width: 24px;
}

.syllable-marker.u { background: rgba(155, 89, 182, 0.6); color: #fff; }
.syllable-marker.i { background: rgba(72, 219, 251, 0.6); color: #000; }
.syllable-marker.e { background: rgba(46, 204, 113, 0.6); color: #000; }
.syllable-marker.a { background: rgba(254, 202, 87, 0.6); color: #000; }
.syllable-marker.o { background: rgba(255, 107, 107, 0.6); color: #fff; }
.syllable-marker.unknown { background: rgba(136, 136, 136, 0.6); color: #fff; }

.syllable-marker:hover,
.syllable-marker.selected {
  transform: scaleY(1.1);
  z-index: 1;
}

.syllable-marker.u:hover, .syllable-marker.u.selected { background: rgba(155, 89, 182, 0.9); }
.syllable-marker.i:hover, .syllable-marker.i.selected { background: rgba(72, 219, 251, 0.9); }
.syllable-marker.e:hover, .syllable-marker.e.selected { background: rgba(46, 204, 113, 0.9); }
.syllable-marker.a:hover, .syllable-marker.a.selected { background: rgba(254, 202, 87, 0.9); }
.syllable-marker.o:hover, .syllable-marker.o.selected { background: rgba(255, 107, 107, 0.9); }

/* 序列结果 */
.sequence-result {
  display: flex;
  align-items: center;
  gap: 8px;
}

.sequence-result .label {
  color: #888;
}

.vowel-sequence {
  display: flex;
  gap: 2px;
}

.vowel-char {
  padding: 4px 8px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 0.9rem;
}

.vowel-char.u { background: rgba(155, 89, 182, 0.3); color: #9b59b6; }
.vowel-char.i { background: rgba(72, 219, 251, 0.3); color: #48dbfb; }
.vowel-char.e { background: rgba(46, 204, 113, 0.3); color: #2ecc71; }
.vowel-char.a { background: rgba(254, 202, 87, 0.3); color: #feca57; }
.vowel-char.o { background: rgba(255, 107, 107, 0.3); color: #ff6b6b; }
.vowel-char.unknown { background: rgba(136, 136, 136, 0.3); color: #888; }

/* 音节详情 */
.syllable-detail {
  background: rgba(72, 219, 251, 0.1);
  border: 1px solid #48dbfb;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.detail-item {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-item label {
  color: #888;
  font-size: 0.85rem;
}

.detail-item span {
  font-size: 1.1rem;
  font-weight: bold;
}

.vowel-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 4px;
  font-size: 1.2rem;
}

.vowel-badge.u { background: rgba(155, 89, 182, 0.3); color: #9b59b6; }
.vowel-badge.i { background: rgba(72, 219, 251, 0.3); color: #48dbfb; }
.vowel-badge.e { background: rgba(46, 204, 113, 0.3); color: #2ecc71; }
.vowel-badge.a { background: rgba(254, 202, 87, 0.3); color: #feca57; }
.vowel-badge.o { background: rgba(255, 107, 107, 0.3); color: #ff6b6b; }

/* 可点击的表格行 */
.results-table tbody tr {
  cursor: pointer;
}
</style>
