<template>
  <div class="processor-view">
    <header class="processor-header">
      <h1>🎬 素材加工工具</h1>
      <p class="subtitle">从 MP4 视频中提取游戏所需的音频和图像素材</p>
    </header>

    <!-- 步骤导航 -->
    <nav class="step-nav">
      <button
        v-for="s in steps"
        :key="s.id"
        class="step-btn"
        :class="{ active: step === s.id, done: s.id < step, disabled: s.id > step && !canAdvanceTo(s.id) }"
        @click="goToStep(s.id)"
      >
        <span class="step-num">{{ s.id }}</span>
        <span class="step-label">{{ s.label }}</span>
      </button>
    </nav>

    <!-- 状态条 -->
    <div v-if="statusMsg" class="status-banner" :class="statusType">{{ statusMsg }}</div>

    <!-- ====================== STEP 1: 视频导入 & 片段分割 ====================== -->
    <section v-show="step === 1" class="step-panel">
      <h2>📂 导入视频 &amp; 片段分割</h2>
      <p class="step-desc">上传 MP4 文件，在静音处设置分割点，保留完整音频（含渐弱尾音）。取消勾选不需要的片段后合并。</p>

      <div class="control-row">
        <label class="btn btn-primary file-input-label">
          📁 选择 MP4 文件
          <input type="file" accept="video/mp4,video/*" @change="handleVideoSelect" hidden :disabled="processing" />
        </label>
        <button class="btn btn-secondary" @click="resetAll" :disabled="processing">🗑️ 重置</button>
      </div>

      <!-- 分割参数 -->
      <div class="params-section" v-if="videoFile">
        <h3>分割参数</h3>
        <div class="params-grid">
          <label>
            静音阈值 (dB):
            <input type="number" v-model.number="splitParams.silenceThresholdDb" min="-80" max="-10" step="1" />
          </label>
          <label>
            最小静音时长 (ms):
            <input type="number" v-model.number="splitParams.minSilenceDurationMs" min="50" max="2000" step="50" />
          </label>
          <label>
            最小片段时长 (ms):
            <input type="number" v-model.number="splitParams.minSegmentDurationMs" min="50" max="2000" step="50" />
          </label>
        </div>
        <div class="control-row" style="margin-top: 12px">
          <button class="btn btn-primary" @click="splitBysilence" :disabled="processing || !audioBuffer">
            {{ processing ? '处理中...' : '🔪 按静音分割' }}
          </button>
        </div>
      </div>

      <!-- 波形 + 片段预览 -->
      <div class="waveform-section" v-if="audioBuffer">
        <h3>📊 音频波形 <span class="hint">(点击波形添加分割点，拖动标记调整位置)</span></h3>
        <div class="waveform-container interactive"
             @mousedown="(e) => onWaveformMouseDown(e, 'segment')"
             @mousemove="(e) => onWaveformMouseMove(e, 'segment')"
             @mouseup="onWaveformMouseUp"
             @mouseleave="onWaveformMouseUp">
          <canvas ref="waveformCanvas" width="1400" height="160"></canvas>
          <!-- Draggable split markers -->
          <div v-for="(sp, idx) in segmentSplitPoints" :key="'seg-sp-'+idx"
               class="split-marker"
               :class="{ dragging: dragState.active && dragState.target === 'segment' && dragState.index === idx }"
               :style="{ left: (sp / (audioBuffer.duration * 1000)) * 100 + '%' }"
               @mousedown.stop.prevent="startDragSplit(idx, 'segment', $event)">
            <div class="marker-line"></div>
            <div class="marker-handle">
              <span class="marker-time">{{ formatMs(sp) }}</span>
              <button class="marker-remove" @mousedown.stop.prevent="removeSplitPoint(idx, 'segment')" title="删除">✕</button>
            </div>
          </div>
          <!-- Cursor for adding -->
          <div v-if="cursorInfo.visible && cursorInfo.target === 'segment'"
               class="cursor-line" :style="{ left: cursorInfo.x + 'px' }">
            <div class="cursor-time">{{ formatMs(cursorInfo.timeMs) }}</div>
          </div>
        </div>
        <div class="time-markers">
          <span>0s</span>
          <span>{{ (audioBuffer.duration / 2).toFixed(2) }}s</span>
          <span>{{ audioBuffer.duration.toFixed(2) }}s</span>
        </div>
      </div>

      <!-- 片段列表 -->
      <div class="segments-section" v-if="segments.length">
        <h3>🎞️ 分割片段 ({{ segments.length }})</h3>
        <div class="segment-actions">
          <button class="btn btn-small" @click="selectAllSegments">全选</button>
          <button class="btn btn-small" @click="deselectAllSegments">全不选</button>
          <span class="selected-count">已选: {{ selectedSegments.length }} / {{ segments.length }}</span>
        </div>
        <div class="segments-grid">
          <div
            v-for="(seg, idx) in segments"
            :key="idx"
            class="segment-card"
            :class="{ selected: seg.selected, playing: playingSegmentIdx === idx }"
            @click="toggleSegmentSelection(idx)"
          >
            <div class="seg-header">
              <input type="checkbox" :checked="seg.selected" @click.stop="toggleSegmentSelection(idx)" />
              <span class="seg-idx">#{{ idx + 1 }}</span>
              <span class="seg-time">{{ formatMs(seg.startMs) }} – {{ formatMs(seg.endMs) }}</span>
              <span class="seg-dur">{{ (seg.endMs - seg.startMs).toFixed(0) }}ms</span>
            </div>
            <canvas :ref="el => setSegCanvasRef(el, idx)" :width="200" :height="48" class="seg-mini-wave"></canvas>
            <div class="seg-controls">
              <button class="btn btn-small" @click.stop="playSegment(idx)" :disabled="playingSegmentIdx !== null">
                ▶
              </button>
              <button class="btn btn-small" @click.stop="stopPlayback" v-if="playingSegmentIdx === idx">
                ⏹
              </button>
            </div>
          </div>
        </div>
        <div class="control-row" style="margin-top:16px">
          <button class="btn btn-primary" @click="mergeSelectedSegments" :disabled="selectedSegments.length === 0 || processing">
            🔗 合并选中片段 → 步骤 2
          </button>
        </div>
      </div>

      <!-- 视频预览 -->
      <div class="video-preview" v-if="videoUrl">
        <h3>🎥 视频预览</h3>
        <video ref="videoEl" :src="videoUrl" controls class="preview-video"></video>
      </div>
    </section>

    <!-- ====================== STEP 2: 音频音节切分 ====================== -->
    <section v-show="step === 2" class="step-panel">
      <h2>✂️ 音节切分 → WAV</h2>
      <p class="step-desc">在能量谷值处设置分割点，保留完整音频（含渐弱尾音）。取消勾选不需要的片段后导出 WAV。</p>

      <!-- 切分参数 -->
      <div class="params-section" v-if="mergedBuffer">
        <h3>切分参数</h3>
        <div class="params-grid">
          <label>
            音节间隔 (ms):
            <input type="number" v-model.number="syllableParams.gapMs" min="10" max="500" step="5" />
          </label>
          <label>
            最小音节时长 (ms):
            <input type="number" v-model.number="syllableParams.minDurationMs" min="20" max="300" step="10" />
          </label>
          <label>
            能量阈值倍数:
            <input type="number" v-model.number="syllableParams.energyMultiplier" min="100" max="5000" step="100" />
          </label>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button class="btn btn-primary" @click="detectSyllables" :disabled="processing">
            🔍 检测音节
          </button>
        </div>
      </div>

      <!-- 合并波形 -->
      <div class="waveform-section" v-if="mergedBuffer">
        <h3>📊 合并音频波形 <span class="hint">(点击波形添加分割点，拖动标记调整位置)</span></h3>
        <div class="waveform-container interactive"
             @mousedown="(e) => onWaveformMouseDown(e, 'syllable')"
             @mousemove="(e) => onWaveformMouseMove(e, 'syllable')"
             @mouseup="onWaveformMouseUp"
             @mouseleave="onWaveformMouseUp">
          <canvas ref="mergedWaveCanvas" width="1400" height="160"></canvas>
          <!-- Draggable split markers -->
          <div v-for="(sp, idx) in syllableSplitPoints" :key="'syl-sp-'+idx"
               class="split-marker syl-marker"
               :class="{ dragging: dragState.active && dragState.target === 'syllable' && dragState.index === idx }"
               :style="{ left: (sp / (mergedBuffer.duration * 1000)) * 100 + '%' }"
               @mousedown.stop.prevent="startDragSplit(idx, 'syllable', $event)">
            <div class="marker-line"></div>
            <div class="marker-handle">
              <span class="marker-time">{{ formatMs(sp) }}</span>
              <button class="marker-remove" @mousedown.stop.prevent="removeSplitPoint(idx, 'syllable')" title="删除">✕</button>
            </div>
          </div>
          <!-- Cursor -->
          <div v-if="cursorInfo.visible && cursorInfo.target === 'syllable'"
               class="cursor-line" :style="{ left: cursorInfo.x + 'px' }">
            <div class="cursor-time">{{ formatMs(cursorInfo.timeMs) }}</div>
          </div>
        </div>
        <div class="time-markers">
          <span>0s</span>
          <span>{{ (mergedBuffer.duration / 2).toFixed(2) }}s</span>
          <span>{{ mergedBuffer.duration.toFixed(2) }}s</span>
        </div>
      </div>

      <!-- 音节列表 -->
      <div class="syllables-section" v-if="syllables.length">
        <h3>🔤 检测到的音节 ({{ syllables.length }})</h3>
        <div class="segment-actions">
          <button class="btn btn-small" @click="selectAllSyllables">全选</button>
          <button class="btn btn-small" @click="deselectAllSyllables">全不选</button>
          <span class="selected-count">已选: {{ selectedSyllables.length }} / {{ syllables.length }}</span>
        </div>
        <div class="syllables-grid">
          <div
            v-for="(syl, idx) in syllables"
            :key="idx"
            class="syllable-card"
            :class="{ selected: syl.selected, playing: playingSyllableIdx === idx }"
            @click="toggleSyllableSelection(idx)"
          >
            <input type="checkbox" :checked="syl.selected" @click.stop="toggleSyllableSelection(idx)" />
            <span class="syl-idx">#{{ idx + 1 }}</span>
            <input
              type="text" class="syl-label" :value="syl.label" maxlength="6"
              @input="syl.label = ($event.target as HTMLInputElement).value.toUpperCase()"
              @click.stop placeholder="元音"
            />
            <span class="syl-time">{{ formatMs(syl.startMs) }} – {{ formatMs(syl.endMs) }}</span>
            <span class="syl-dur">{{ (syl.endMs - syl.startMs).toFixed(0) }}ms</span>
            <button class="btn btn-small" @click.stop="playSyllable(idx)" :disabled="playingSyllableIdx !== null">▶</button>
            <button class="btn btn-small" @click.stop="stopSyllablePlayback" v-if="playingSyllableIdx === idx">⏹</button>
          </div>
        </div>
        <div class="control-row" style="margin-top:16px">
          <button class="btn btn-primary" @click="exportSyllableWavs" :disabled="selectedSyllables.length === 0 || processing">
            💾 导出选中 WAV ZIP ({{ selectedSyllables.length }})
          </button>
          <button class="btn btn-secondary" @click="goToStep(3)">
            ▶ 进入步骤 3 (帧提取)
          </button>
        </div>
      </div>
    </section>

    <!-- ====================== STEP 3: 视频帧提取 & 绿幕去除 ====================== -->
    <section v-show="step === 3" class="step-panel">
      <h2>🖼️ 帧提取 &amp; 绿幕去除</h2>
      <p class="step-desc">从视频中提取唯一帧，去除绿幕背景，导出为透明 PNG。</p>

      <!-- 帧提取参数 -->
      <div class="params-section" v-if="videoUrl">
        <h3>提取参数</h3>
        <div class="params-grid">
          <label>
            采样帧率 (fps):
            <input type="number" v-model.number="frameParams.sampleFps" min="1" max="30" step="1" />
          </label>
          <label>
            去重阈值 (%):
            <input type="number" v-model.number="frameParams.dedupThreshold" min="0" max="30" step="1" />
          </label>
          <label>
            色相容差:
            <input type="number" v-model.number="frameParams.chromaHueTolerance" min="5" max="60" step="5" />
          </label>
          <label>
            饱和度最小:
            <input type="number" v-model.number="frameParams.chromaSatMin" min="10" max="100" step="5" />
          </label>
          <label>
            绿幕色相中心:
            <input type="number" v-model.number="frameParams.chromaHueCenter" min="60" max="180" step="5" />
          </label>
        </div>
        <div class="control-row" style="margin-top:12px">
          <button class="btn btn-primary" @click="extractFrames" :disabled="processing || !videoUrl">
            {{ processing ? '提取中...' : '📷 提取帧' }}
          </button>
          <span v-if="selectedSegments.length > 0" class="selected-count">
            将从 {{ selectedSegments.length }} 个选中片段提取
          </span>
          <span v-else class="selected-count" style="color: #888;">
            未分割或未选中片段，将从完整视频提取
          </span>
        </div>
        <div v-if="frameProgress" class="progress-bar-wrapper">
          <div class="progress-bar" :style="{ width: frameProgress + '%' }"></div>
          <span class="progress-text">{{ frameProgress.toFixed(0) }}%</span>
        </div>
      </div>

      <!-- 帧预览 -->
      <div class="frames-section" v-if="uniqueFrames.length">
        <h3>📸 唯一帧 ({{ uniqueFrames.length }})</h3>
        <div class="segment-actions">
          <button class="btn btn-small" @click="selectAllFrames">全选</button>
          <button class="btn btn-small" @click="deselectAllFrames">全不选</button>
          <span class="selected-count">已选: {{ selectedFrames.length }} / {{ uniqueFrames.length }}</span>
        </div>
        <div class="frames-grid">
          <div
            v-for="(frm, idx) in uniqueFrames"
            :key="idx"
            class="frame-card"
            :class="{ selected: frm.selected, unselected: !frm.selected }"
            @click="toggleFrameSelection(idx)"
          >
            <input type="checkbox" :checked="frm.selected" @click.stop="toggleFrameSelection(idx)" />
            <img :src="frm.dataUrl" :alt="'Frame ' + (idx + 1)" class="frame-thumb" />
            <div class="frame-info">
              <span>#{{ idx + 1 }}</span>
              <span>{{ frm.timeS.toFixed(2) }}s</span>
            </div>
          </div>
        </div>
        <div class="control-row" style="margin-top:16px">
          <button class="btn btn-primary" @click="applyChromaKeyAll" :disabled="processing || selectedFrames.length === 0">
            🟩 去绿幕 ({{ selectedFrames.length }})
          </button>
          <button class="btn btn-secondary" @click="exportAllFrames" :disabled="processing || selectedFrames.length === 0">
            💾 导出选中 PNG ZIP ({{ selectedFrames.length }})
          </button>
        </div>
      </div>

      <!-- 去绿幕预览 -->
      <div class="frames-section" v-if="chromaFrames.length">
        <h3>🎭 去绿幕结果 ({{ chromaFrames.length }})</h3>
        <div class="segment-actions">
          <button class="btn btn-small" @click="selectAllChromaFrames">全选</button>
          <button class="btn btn-small" @click="deselectAllChromaFrames">全不选</button>
          <span class="selected-count">已选: {{ selectedChromaFrames.length }} / {{ chromaFrames.length }}</span>
        </div>
        <div class="frames-grid checkerboard-bg">
          <div
            v-for="(frm, idx) in chromaFrames"
            :key="idx"
            class="frame-card"
            :class="{ selected: frm.selected, unselected: !frm.selected }"
            @click="toggleChromaFrameSelection(idx)"
          >
            <input type="checkbox" :checked="frm.selected" @click.stop="toggleChromaFrameSelection(idx)" />
            <img :src="frm.dataUrl" :alt="'Chroma ' + (idx + 1)" class="frame-thumb" />
            <div class="frame-info">
              <span>#{{ idx + 1 }}</span>
            </div>
          </div>
        </div>
        <div class="control-row" style="margin-top:16px">
          <button class="btn btn-primary" @click="exportChromaFrames" :disabled="processing || selectedChromaFrames.length === 0">
            💾 导出去绿幕 PNG ZIP ({{ selectedChromaFrames.length }})
          </button>
        </div>
      </div>
    </section>

    <!-- 隐藏元素 -->
    <canvas ref="offscreenCanvas" style="display:none"></canvas>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, nextTick, onUnmounted, type ComponentPublicInstance } from 'vue';
import JSZip from 'jszip';
import { getTargetSequence } from '@/config/vowels';

// ==================== 类型定义 ====================
interface Segment {
  startMs: number;
  endMs: number;
  selected: boolean;
}

interface SyllableSegment {
  startMs: number;
  endMs: number;
  selected: boolean;
  label: string;
}

interface FrameData {
  timeS: number;
  dataUrl: string;
  imageData?: ImageData;
  selected: boolean;
}

// ==================== 步骤定义 ====================
const steps = [
  { id: 1, label: '视频分割' },
  { id: 2, label: '音节 WAV' },
  { id: 3, label: '帧提取 PNG' }
];
const step = ref(1);

function canAdvanceTo(target: number): boolean {
  if (target === 1) return true;
  if (target === 2) return !!mergedBuffer.value;
  if (target === 3) return !!videoUrl.value;
  return false;
}

function goToStep(target: number) {
  if (canAdvanceTo(target) || target <= step.value) {
    step.value = target;
  }
}

// ==================== 状态 ====================
const processing = ref(false);
const statusMsg = ref('');
const statusType = ref<'info' | 'success' | 'error'>('info');

const videoFile = ref<File | null>(null);
const videoUrl = ref('');
const audioBuffer = ref<AudioBuffer | null>(null);
const mergedBuffer = ref<AudioBuffer | null>(null);

const segments = ref<Segment[]>([]);
const syllables = ref<SyllableSegment[]>([]);
const uniqueFrames = ref<FrameData[]>([]);
const chromaFrames = ref<FrameData[]>([]);

const frameProgress = ref(0);

// 播放状态
const playingSegmentIdx = ref<number | null>(null);
const playingSyllableIdx = ref<number | null>(null);
let playbackSource: AudioBufferSourceNode | null = null;
let playbackCtx: AudioContext | null = null;

// Canvas refs
const waveformCanvas = ref<HTMLCanvasElement | null>(null);
const mergedWaveCanvas = ref<HTMLCanvasElement | null>(null);
const offscreenCanvas = ref<HTMLCanvasElement | null>(null);
const videoEl = ref<HTMLVideoElement | null>(null);
const segCanvasRefs = reactive<Record<number, HTMLCanvasElement | null>>({});

// ==================== 参数 ====================
const splitParams = reactive({
  silenceThresholdDb: -35,
  minSilenceDurationMs: 200,
  minSegmentDurationMs: 80
});

const syllableParams = reactive({
  gapMs: 40,
  minDurationMs: 50,
  energyMultiplier: 1000
});

const frameParams = reactive({
  sampleFps: 10,
  dedupThreshold: 5,
  chromaHueCenter: 120,
  chromaHueTolerance: 30,
  chromaSatMin: 40
});

// ==================== 计算属性 ====================
const selectedSegments = computed(() => segments.value.filter(s => s.selected));
const selectedSyllables = computed(() => syllables.value.filter(s => s.selected));
const selectedFrames = computed(() => uniqueFrames.value.filter(f => f.selected));
const selectedChromaFrames = computed(() => chromaFrames.value.filter(f => f.selected));

// ==================== 工具函数 ====================
function formatMs(ms: number): string {
  const s = ms / 1000;
  return s.toFixed(2) + 's';
}

function setSegCanvasRef(el: Element | ComponentPublicInstance | null, idx: number) {
  if (el && el instanceof HTMLCanvasElement) {
    segCanvasRefs[idx] = el;
  }
}

function setStatus(msg: string, type: 'info' | 'success' | 'error' = 'info') {
  statusMsg.value = msg;
  statusType.value = type;
}

// ==================== 分割点 & 拖动 ====================
// Split points are the interior boundaries (in ms).
// Segments / syllables are rebuilt from them.
const segmentSplitPoints = ref<number[]>([]);
const syllableSplitPoints = ref<number[]>([]);

const dragState = reactive({
  active: false,
  target: '' as 'segment' | 'syllable',
  index: -1,
});

const cursorInfo = reactive({
  visible: false,
  x: 0,
  timeMs: 0,
  target: '' as 'segment' | 'syllable',
});

function rebuildSegmentsFromSplits() {
  if (!audioBuffer.value) return;
  const totalMs = audioBuffer.value.duration * 1000;
  const pts = [0, ...segmentSplitPoints.value, totalMs];
  // Preserve existing selection state where possible
  const oldSegs = segments.value;
  const newSegs: Segment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const startMs = pts[i];
    const endMs = pts[i + 1];
    // Try to match to old segment that overlapped this range
    const matched = oldSegs.find(s =>
      Math.abs(s.startMs - startMs) < 50 && Math.abs(s.endMs - endMs) < 50
    );
    newSegs.push({ startMs, endMs, selected: matched ? matched.selected : true });
  }
  segments.value = newSegs;
  nextTick(() => {
    drawWaveform(waveformCanvas.value, audioBuffer.value!, newSegs);
    for (let i = 0; i < newSegs.length; i++) drawSegmentMiniWave(i);
  });
}

function rebuildSyllablesFromSplits() {
  if (!mergedBuffer.value) return;
  const totalMs = mergedBuffer.value.duration * 1000;
  const pts = [0, ...syllableSplitPoints.value, totalMs];
  const oldSyls = syllables.value;
  const newSyls: SyllableSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const startMs = pts[i];
    const endMs = pts[i + 1];
    const matched = oldSyls.find(s =>
      Math.abs(s.startMs - startMs) < 50 && Math.abs(s.endMs - endMs) < 50
    );
    const seq = getTargetSequence();
    const fallbackLabel = seq[i % seq.length] ?? '';
    newSyls.push({ startMs, endMs, selected: matched ? matched.selected : true, label: matched?.label ?? fallbackLabel });
  }
  syllables.value = newSyls;
  nextTick(() => {
    drawWaveform(mergedWaveCanvas.value, mergedBuffer.value!, undefined, newSyls);
  });
}

function getCanvasTimeMs(e: MouseEvent, target: 'segment' | 'syllable'): number {
  const canvas = target === 'segment' ? waveformCanvas.value : mergedWaveCanvas.value;
  const buf = target === 'segment' ? audioBuffer.value : mergedBuffer.value;
  if (!canvas || !buf) return 0;
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
  return (x / rect.width) * buf.duration * 1000;
}

function startDragSplit(idx: number, target: 'segment' | 'syllable', _e: MouseEvent) {
  dragState.active = true;
  dragState.target = target;
  dragState.index = idx;
  cursorInfo.visible = false;
}

function onWaveformMouseDown(e: MouseEvent, target: 'segment' | 'syllable') {
  // Only add a split point if we're not clicking on an existing marker
  // (marker clicks are handled by startDragSplit with .stop.prevent)
  if (dragState.active) return;
  const timeMs = getCanvasTimeMs(e, target);
  const pts = target === 'segment' ? segmentSplitPoints : syllableSplitPoints;

  // Don't add too close to start/end
  const buf = target === 'segment' ? audioBuffer.value : mergedBuffer.value;
  if (!buf) return;
  const totalMs = buf.duration * 1000;
  if (timeMs < 10 || timeMs > totalMs - 10) return;

  // Don't add too close to existing split
  if (pts.value.some(sp => Math.abs(sp - timeMs) < 20)) return;

  pts.value.push(timeMs);
  pts.value.sort((a, b) => a - b);

  if (target === 'segment') rebuildSegmentsFromSplits();
  else rebuildSyllablesFromSplits();
}

function onWaveformMouseMove(e: MouseEvent, target: 'segment' | 'syllable') {
  if (dragState.active && dragState.target === target) {
    // Dragging a split point
    const timeMs = getCanvasTimeMs(e, target);
    const pts = target === 'segment' ? segmentSplitPoints : syllableSplitPoints;
    const buf = target === 'segment' ? audioBuffer.value : mergedBuffer.value;
    if (!buf) return;
    const totalMs = buf.duration * 1000;

    // Clamp between neighbors (or 0/totalMs)
    const idx = dragState.index;
    const minMs = idx > 0 ? pts.value[idx - 1] + 5 : 5;
    const maxMs = idx < pts.value.length - 1 ? pts.value[idx + 1] - 5 : totalMs - 5;
    pts.value[idx] = Math.max(minMs, Math.min(maxMs, timeMs));

    if (target === 'segment') rebuildSegmentsFromSplits();
    else rebuildSyllablesFromSplits();
  } else {
    // Show cursor
    const canvas = target === 'segment' ? waveformCanvas.value : mergedWaveCanvas.value;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    cursorInfo.visible = true;
    cursorInfo.x = e.clientX - rect.left;
    cursorInfo.timeMs = getCanvasTimeMs(e, target);
    cursorInfo.target = target;
  }
}

function onWaveformMouseUp() {
  if (dragState.active) {
    dragState.active = false;
  }
  cursorInfo.visible = false;
}

function removeSplitPoint(idx: number, target: 'segment' | 'syllable') {
  const pts = target === 'segment' ? segmentSplitPoints : syllableSplitPoints;
  pts.value.splice(idx, 1);
  if (target === 'segment') rebuildSegmentsFromSplits();
  else rebuildSyllablesFromSplits();
}

// ==================== STEP 1: 视频导入 & 分割 ====================
async function handleVideoSelect(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;

  resetAll();
  videoFile.value = file;
  videoUrl.value = URL.createObjectURL(file);

  processing.value = true;
  setStatus(`正在解码 ${file.name} 的音频...`);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const audioCtx = new AudioContext({ sampleRate: 44100 });
    audioBuffer.value = await audioCtx.decodeAudioData(arrayBuffer);
    audioCtx.close();

    setStatus(`音频解码完成 (${audioBuffer.value.duration.toFixed(2)}s)`, 'success');
    await nextTick();
    drawWaveform(waveformCanvas.value, audioBuffer.value);
  } catch (err) {
    setStatus(`音频解码失败: ${err}`, 'error');
  } finally {
    processing.value = false;
    input.value = '';
  }
}

function splitBysilence() {
  if (!audioBuffer.value) return;
  processing.value = true;
  setStatus('正在分析静音片段...');

  try {
    const buf = audioBuffer.value;
    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;

    // RMS energy per 10ms frame
    const frameSize = Math.floor(sr * 0.01);
    const hopSize = Math.floor(frameSize / 2);
    const thresholdLinear = Math.pow(10, splitParams.silenceThresholdDb / 20);

    // Compute per-frame RMS
    const frames: { timeMs: number; rms: number }[] = [];
    for (let i = 0; i < data.length - frameSize; i += hopSize) {
      let sum = 0;
      for (let j = 0; j < frameSize; j++) {
        sum += data[i + j] * data[i + j];
      }
      frames.push({ timeMs: (i / sr) * 1000, rms: Math.sqrt(sum / frameSize) });
    }

    // Detect silent regions (continuous frames below threshold)
    const hopDurationMs = (hopSize / sr) * 1000;
    const minSilenceFrames = Math.ceil(splitParams.minSilenceDurationMs / hopDurationMs);
    let silentRun = 0;
    let silentStart = 0;

    interface SilentRegion { startMs: number; endMs: number }
    const silentRegions: SilentRegion[] = [];

    for (let i = 0; i < frames.length; i++) {
      if (frames[i].rms < thresholdLinear) {
        if (silentRun === 0) silentStart = i;
        silentRun++;
      } else {
        if (silentRun >= minSilenceFrames) {
          silentRegions.push({
            startMs: frames[silentStart].timeMs,
            endMs: frames[i].timeMs
          });
        }
        silentRun = 0;
      }
    }
    // Trailing silence
    if (silentRun >= minSilenceFrames) {
      silentRegions.push({
        startMs: frames[silentStart].timeMs,
        endMs: frames[frames.length - 1].timeMs
      });
    }

    // Place split points at the midpoint of each silent region
    const totalMs = buf.duration * 1000;
    const splitPoints: number[] = [];
    for (const region of silentRegions) {
      const mid = (region.startMs + region.endMs) / 2;
      splitPoints.push(mid);
    }

    // Build segments from 0 → split1 → split2 → ... → end
    // This keeps ALL audio including fade-out tails
    const boundaries = [0, ...splitPoints, totalMs];
    const rawSegments: Segment[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startMs = boundaries[i];
      const endMs = boundaries[i + 1];
      if (endMs - startMs >= splitParams.minSegmentDurationMs) {
        rawSegments.push({ startMs, endMs, selected: true });
      }
    }

    // If no silent regions found, treat whole audio as one segment
    if (rawSegments.length === 0) {
      rawSegments.push({ startMs: 0, endMs: totalMs, selected: true });
    }

    segments.value = rawSegments;

    // Populate split points (interior boundaries between segments)
    segmentSplitPoints.value = [];
    for (let i = 0; i < rawSegments.length - 1; i++) {
      segmentSplitPoints.value.push(rawSegments[i].endMs);
    }

    setStatus(`在 ${silentRegions.length} 处静音设置分割点 → ${rawSegments.length} 个片段 (可拖动调整)`, 'success');

    // Draw segment mini waveforms
    nextTick(() => {
      drawWaveform(waveformCanvas.value, buf, rawSegments);
      for (let i = 0; i < rawSegments.length; i++) {
        drawSegmentMiniWave(i);
      }
    });
  } catch (err) {
    setStatus(`分割失败: ${err}`, 'error');
  } finally {
    processing.value = false;
  }
}

// ==================== 片段操作 ====================
function toggleSegmentSelection(idx: number) {
  segments.value[idx].selected = !segments.value[idx].selected;
}

function selectAllSegments() {
  segments.value.forEach(s => (s.selected = true));
}

function deselectAllSegments() {
  segments.value.forEach(s => (s.selected = false));
}

function toggleSyllableSelection(idx: number) {
  syllables.value[idx].selected = !syllables.value[idx].selected;
}

function selectAllSyllables() {
  syllables.value.forEach(s => (s.selected = true));
}

function deselectAllSyllables() {
  syllables.value.forEach(s => (s.selected = false));
}

function toggleFrameSelection(idx: number) {
  uniqueFrames.value[idx].selected = !uniqueFrames.value[idx].selected;
}

function selectAllFrames() {
  uniqueFrames.value.forEach(f => (f.selected = true));
}

function deselectAllFrames() {
  uniqueFrames.value.forEach(f => (f.selected = false));
}

function toggleChromaFrameSelection(idx: number) {
  chromaFrames.value[idx].selected = !chromaFrames.value[idx].selected;
}

function selectAllChromaFrames() {
  chromaFrames.value.forEach(f => (f.selected = true));
}

function deselectAllChromaFrames() {
  chromaFrames.value.forEach(f => (f.selected = false));
}

function playSegment(idx: number) {
  if (!audioBuffer.value) return;
  stopPlayback();

  const seg = segments.value[idx];
  const startSec = seg.startMs / 1000;
  const durSec = (seg.endMs - seg.startMs) / 1000;

  playbackCtx = new AudioContext();
  playbackSource = playbackCtx.createBufferSource();
  playbackSource.buffer = audioBuffer.value;
  playbackSource.connect(playbackCtx.destination);
  playbackSource.start(0, startSec, durSec);
  playingSegmentIdx.value = idx;

  playbackSource.onended = () => {
    playingSegmentIdx.value = null;
  };
}

function stopPlayback() {
  if (playbackSource) {
    try { playbackSource.stop(); } catch {}
    playbackSource = null;
  }
  if (playbackCtx) {
    playbackCtx.close();
    playbackCtx = null;
  }
  playingSegmentIdx.value = null;
}

async function mergeSelectedSegments() {
  if (!audioBuffer.value || selectedSegments.value.length === 0) return;

  processing.value = true;
  setStatus('正在合并选中片段...');

  try {
    const buf = audioBuffer.value;
    const sr = buf.sampleRate;
    const channelData = buf.getChannelData(0);

    // Compute total merged length
    let totalSamples = 0;
    for (const seg of selectedSegments.value) {
      const start = Math.floor((seg.startMs / 1000) * sr);
      const end = Math.floor((seg.endMs / 1000) * sr);
      totalSamples += end - start;
    }

    const audioCtx = new AudioContext({ sampleRate: sr });
    const merged = audioCtx.createBuffer(1, totalSamples, sr);
    const mergedData = merged.getChannelData(0);

    let offset = 0;
    for (const seg of selectedSegments.value) {
      const start = Math.floor((seg.startMs / 1000) * sr);
      const end = Math.floor((seg.endMs / 1000) * sr);
      for (let i = start; i < end && i < channelData.length; i++) {
        mergedData[offset++] = channelData[i];
      }
    }

    audioCtx.close();
    mergedBuffer.value = merged;

    setStatus(`合并完成 (${merged.duration.toFixed(2)}s)`, 'success');
    step.value = 2;

    await nextTick();
    drawWaveform(mergedWaveCanvas.value, merged);
  } catch (err) {
    setStatus(`合并失败: ${err}`, 'error');
  } finally {
    processing.value = false;
  }
}

// ==================== STEP 2: 音节检测 ====================
function detectSyllables() {
  if (!mergedBuffer.value) return;
  processing.value = true;
  setStatus('正在检测音节分割点...');

  try {
    const buf = mergedBuffer.value;
    const data = buf.getChannelData(0);
    const sr = buf.sampleRate;
    const totalMs = buf.duration * 1000;

    // Energy analysis with 10ms frames
    const frameSize = Math.floor(sr * 0.01);
    const hopSize = Math.floor(frameSize / 4);
    const energies: { timeMs: number; energy: number }[] = [];

    for (let i = 0; i < data.length - frameSize; i += hopSize) {
      let e = 0;
      for (let j = 0; j < frameSize; j++) {
        e += data[i + j] * data[i + j];
      }
      energies.push({ timeMs: (i / sr) * 1000, energy: Math.sqrt(e / frameSize) });
    }

    // Smooth (3-point moving average)
    const smoothed = energies.map((e, i) => {
      if (i === 0 || i === energies.length - 1) return e;
      return {
        timeMs: e.timeMs,
        energy: (energies[i - 1].energy + e.energy + energies[i + 1].energy) / 3
      };
    });

    // Adaptive threshold for valley detection
    const sorted = smoothed.map(e => e.energy).sort((a, b) => a - b);
    const maxEnergy = sorted[sorted.length - 1];
    const factor = syllableParams.energyMultiplier / 1000;
    const valleyThreshold = maxEnergy * 0.3 * factor;

    // Find all energy valley points (local minima below threshold)
    const valleys: number[] = [];
    for (let i = 2; i < smoothed.length - 2; i++) {
      const c = smoothed[i].energy;
      if (
        c < smoothed[i - 1].energy &&
        c < smoothed[i + 1].energy &&
        c < smoothed[i - 2].energy &&
        c < smoothed[i + 2].energy &&
        c < valleyThreshold
      ) {
        valleys.push(i);
      }
    }

    // Filter valleys too close together (keep at least minDurationMs apart)
    const hopMs = (hopSize / sr) * 1000;
    const minGapFrames = Math.floor(syllableParams.minDurationMs / hopMs);
    const filteredValleys: number[] = [];
    for (const v of valleys) {
      if (filteredValleys.length === 0 || v - filteredValleys[filteredValleys.length - 1] >= minGapFrames) {
        filteredValleys.push(v);
      }
    }

    // Also detect silence gaps (continuous low-energy regions ≥ gapMs) and place split at midpoint
    const thresholdLinear = maxEnergy * 0.05 * factor;
    const minGapMs = syllableParams.gapMs;
    let gapStart = -1;
    const gapSplitPoints: number[] = [];

    for (let i = 0; i < smoothed.length; i++) {
      if (smoothed[i].energy < thresholdLinear) {
        if (gapStart < 0) gapStart = i;
      } else {
        if (gapStart >= 0) {
          const gapStartMs = smoothed[gapStart].timeMs;
          const gapEndMs = smoothed[i].timeMs;
          if (gapEndMs - gapStartMs >= minGapMs) {
            gapSplitPoints.push((gapStartMs + gapEndMs) / 2);
          }
          gapStart = -1;
        }
      }
    }
    // Trailing gap
    if (gapStart >= 0) {
      const gapStartMs = smoothed[gapStart].timeMs;
      const gapEndMs = smoothed[smoothed.length - 1].timeMs;
      if (gapEndMs - gapStartMs >= minGapMs) {
        gapSplitPoints.push((gapStartMs + gapEndMs) / 2);
      }
    }

    // Merge valley split points and gap split points, dedup
    const allSplitPoints = new Set<number>();
    for (const vi of filteredValleys) {
      allSplitPoints.add(smoothed[vi].timeMs);
    }
    for (const sp of gapSplitPoints) {
      allSplitPoints.add(sp);
    }

    const sortedSplits = [...allSplitPoints].sort((a, b) => a - b);

    // Filter splits that are too close together
    const finalSplits: number[] = [];
    for (const sp of sortedSplits) {
      if (finalSplits.length === 0 || sp - finalSplits[finalSplits.length - 1] >= syllableParams.minDurationMs) {
        finalSplits.push(sp);
      }
    }

    // Build segments from 0 → split1 → split2 → ... → end
    const boundaries = [0, ...finalSplits, totalMs];
    const result: SyllableSegment[] = [];
    for (let i = 0; i < boundaries.length - 1; i++) {
      const startMs = boundaries[i];
      const endMs = boundaries[i + 1];
      if (endMs - startMs >= syllableParams.minDurationMs) {
        const seq = getTargetSequence();
        const vowelLabel = seq[result.length % seq.length] ?? '';
        result.push({ startMs, endMs, selected: true, label: vowelLabel });
      }
    }

    if (result.length === 0) {
      const seq = getTargetSequence();
      result.push({ startMs: 0, endMs: totalMs, selected: true, label: seq[0] ?? '' });
    }

    syllables.value = result;

    // Populate split points (interior boundaries between syllables)
    syllableSplitPoints.value = [];
    for (let i = 0; i < result.length - 1; i++) {
      syllableSplitPoints.value.push(result[i].endMs);
    }

    setStatus(`在 ${finalSplits.length} 处设置分割点 → ${result.length} 个音节 (可拖动调整)`, 'success');

    nextTick(() => {
      drawWaveform(mergedWaveCanvas.value, buf, undefined, result);
    });
  } catch (err) {
    setStatus(`检测失败: ${err}`, 'error');
  } finally {
    processing.value = false;
  }
}

function playSyllable(idx: number) {
  if (!mergedBuffer.value) return;
  stopSyllablePlayback();

  const syl = syllables.value[idx];
  const startSec = syl.startMs / 1000;
  const durSec = (syl.endMs - syl.startMs) / 1000;

  playbackCtx = new AudioContext();
  playbackSource = playbackCtx.createBufferSource();
  playbackSource.buffer = mergedBuffer.value;
  playbackSource.connect(playbackCtx.destination);
  playbackSource.start(0, startSec, durSec);
  playingSyllableIdx.value = idx;

  playbackSource.onended = () => {
    playingSyllableIdx.value = null;
  };
}

function stopSyllablePlayback() {
  if (playbackSource) {
    try { playbackSource.stop(); } catch {}
    playbackSource = null;
  }
  if (playbackCtx) {
    playbackCtx.close();
    playbackCtx = null;
  }
  playingSyllableIdx.value = null;
}

async function exportSyllableWavs() {
  const toExport = selectedSyllables.value;
  if (!mergedBuffer.value || toExport.length === 0) return;
  processing.value = true;
  setStatus('正在打包 WAV 文件...');

  try {
    const buf = mergedBuffer.value;
    const sr = buf.sampleRate;
    const channelData = buf.getChannelData(0);
    const zip = new JSZip();

    for (let i = 0; i < toExport.length; i++) {
      const syl = toExport[i];
      const startSample = Math.floor((syl.startMs / 1000) * sr);
      const endSample = Math.floor((syl.endMs / 1000) * sr);
      const length = endSample - startSample;
      if (length <= 0) continue;

      const audioCtx = new AudioContext({ sampleRate: sr });
      const sylBuf = audioCtx.createBuffer(1, length, sr);
      const sylData = sylBuf.getChannelData(0);
      for (let j = 0; j < length; j++) {
        sylData[j] = channelData[startSample + j] || 0;
      }

      const wavBlob = audioBufferToWav(sylBuf);
      const label = syl.label || 'X';
      zip.file(`${String(i + 1).padStart(3, '0')}_${label}.wav`, wavBlob);
      audioCtx.close();
    }

    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, 'syllables.zip');
    setStatus(`已导出 ${toExport.length} 个 WAV 文件 (ZIP)`, 'success');
  } catch (err) {
    setStatus(`导出失败: ${err}`, 'error');
  } finally {
    processing.value = false;
  }
}

// ==================== STEP 3: 帧提取 ====================
async function extractFrames() {
  if (!videoEl.value || !videoUrl.value) return;
  processing.value = true;
  frameProgress.value = 0;
  uniqueFrames.value = [];
  chromaFrames.value = [];

  const video = videoEl.value;
  const canvas = offscreenCanvas.value!;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;

  try {
    // Ensure video metadata is loaded
    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= 1) return resolve();
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('视频加载失败'));
    });

    const interval = 1 / frameParams.sampleFps;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Build time ranges from selected segments (Step 1), or full duration if none
    const timeRanges: { startS: number; endS: number }[] = [];
    if (selectedSegments.value.length > 0) {
      for (const seg of selectedSegments.value) {
        timeRanges.push({ startS: seg.startMs / 1000, endS: seg.endMs / 1000 });
      }
      setStatus(`正在从 ${timeRanges.length} 个选中片段提取帧...`);
    } else {
      timeRanges.push({ startS: 0, endS: video.duration });
      setStatus('正在从完整视频提取帧...');
    }

    // Calculate total frames for progress
    let totalFrames = 0;
    for (const range of timeRanges) {
      totalFrames += Math.floor((range.endS - range.startS) / interval);
    }

    const allFrames: FrameData[] = [];
    let processed = 0;

    for (const range of timeRanges) {
      const rangeFrames = Math.floor((range.endS - range.startS) / interval);
      for (let i = 0; i < rangeFrames; i++) {
        const t = range.startS + i * interval;
        video.currentTime = t;

        await new Promise<void>((resolve) => {
          video.onseeked = () => resolve();
        });

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/png');

        allFrames.push({ timeS: t, dataUrl, imageData, selected: true });
        processed++;
        frameProgress.value = (processed / totalFrames) * 100;

        // Yield to keep UI responsive
        if (processed % 5 === 0) await new Promise(r => setTimeout(r, 0));
      }
    }

    // Deduplication: compare consecutive frames by pixel difference
    const dedupResult: FrameData[] = [allFrames[0]];

    for (let i = 1; i < allFrames.length; i++) {
      const diff = computeFrameDiff(allFrames[i - 1].imageData!, allFrames[i].imageData!);
      if (diff > frameParams.dedupThreshold) {
        dedupResult.push(allFrames[i]);
      }
    }

    uniqueFrames.value = dedupResult;
    const rangeLabel = selectedSegments.value.length > 0
      ? ` (从 ${selectedSegments.value.length} 个片段)`
      : '';
    setStatus(`提取完成${rangeLabel}: ${allFrames.length} 帧 → ${dedupResult.length} 唯一帧`, 'success');
  } catch (err) {
    setStatus(`帧提取失败: ${err}`, 'error');
  } finally {
    processing.value = false;
    frameProgress.value = 0;
  }
}

function computeFrameDiff(a: ImageData, b: ImageData): number {
  const len = a.data.length;
  let totalDiff = 0;
  const pixels = len / 4;

  // Sample every 4th pixel for speed
  for (let i = 0; i < len; i += 16) {
    totalDiff += Math.abs(a.data[i] - b.data[i]);       // R
    totalDiff += Math.abs(a.data[i + 1] - b.data[i + 1]); // G
    totalDiff += Math.abs(a.data[i + 2] - b.data[i + 2]); // B
  }

  const sampledPixels = Math.floor(pixels / 4);
  const avgDiff = totalDiff / (sampledPixels * 3);
  return (avgDiff / 255) * 100; // percentage
}

function applyChromaKeyAll() {
  const framesToProcess = selectedFrames.value;
  if (framesToProcess.length === 0) {
    setStatus('请先选中要去绿幕的帧', 'error');
    return;
  }

  processing.value = true;
  setStatus(`正在对 ${framesToProcess.length} 帧去除绿幕...`);

  try {
    const canvas = offscreenCanvas.value!;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    const results: FrameData[] = [];

    for (const frm of framesToProcess) {
      if (!frm.imageData) continue;

      const copy = new ImageData(
        new Uint8ClampedArray(frm.imageData.data),
        frm.imageData.width,
        frm.imageData.height
      );

      applyChromaKey(copy);

      canvas.width = copy.width;
      canvas.height = copy.height;
      ctx.putImageData(copy, 0, 0);

      results.push({
        timeS: frm.timeS,
        dataUrl: canvas.toDataURL('image/png'),
        selected: true
      });
    }

    chromaFrames.value = results;
    setStatus(`去绿幕完成: ${results.length} 帧`, 'success');
  } catch (err) {
    setStatus(`去绿幕失败: ${err}`, 'error');
  } finally {
    processing.value = false;
  }
}

function applyChromaKey(imageData: ImageData) {
  const d = imageData.data;
  const hueCenter = frameParams.chromaHueCenter;
  const hueTol = frameParams.chromaHueTolerance;
  const satMin = frameParams.chromaSatMin / 100;

  for (let i = 0; i < d.length; i += 4) {
    const r = d[i] / 255;
    const g = d[i + 1] / 255;
    const b = d[i + 2] / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;
    const lightness = (max + min) / 2;
    const saturation = delta === 0 ? 0 : delta / (1 - Math.abs(2 * lightness - 1));

    let hue = 0;
    if (delta !== 0) {
      if (max === r) hue = 60 * (((g - b) / delta) % 6);
      else if (max === g) hue = 60 * ((b - r) / delta + 2);
      else hue = 60 * ((r - g) / delta + 4);
      if (hue < 0) hue += 360;
    }

    // Check if this pixel is "green screen"
    const hueDist = Math.min(Math.abs(hue - hueCenter), 360 - Math.abs(hue - hueCenter));
    if (hueDist <= hueTol && saturation >= satMin) {
      // Make transparent
      d[i + 3] = 0;
    }
  }
}

async function exportAllFrames() {
  const frames = selectedFrames.value;
  if (frames.length === 0) {
    setStatus('请先选中要导出的帧', 'error');
    return;
  }
  processing.value = true;
  setStatus('正在打包帧 PNG...');

  try {
    const zip = new JSZip();
    for (let i = 0; i < frames.length; i++) {
      const blob = dataUrlToBlob(frames[i].dataUrl);
      zip.file(`frame_${String(i + 1).padStart(3, '0')}.png`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, 'frames.zip');
    setStatus(`已导出 ${frames.length} 帧 (ZIP)`, 'success');
  } catch (err) {
    setStatus(`导出失败: ${err}`, 'error');
  } finally {
    processing.value = false;
  }
}

async function exportChromaFrames() {
  const frames = selectedChromaFrames.value;
  if (frames.length === 0) {
    setStatus('请先选中要导出的去绿幕帧', 'error');
    return;
  }
  processing.value = true;
  setStatus('正在打包去绿幕 PNG...');

  try {
    const zip = new JSZip();
    for (let i = 0; i < frames.length; i++) {
      const blob = dataUrlToBlob(frames[i].dataUrl);
      zip.file(`chroma_${String(i + 1).padStart(3, '0')}.png`, blob);
    }
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(zipBlob, 'chroma_frames.zip');
    setStatus(`已导出 ${frames.length} 去绿幕帧 (ZIP)`, 'success');
  } catch (err) {
    setStatus(`导出失败: ${err}`, 'error');
  } finally {
    processing.value = false;
  }
}

// ==================== 波形绘制 ====================
function drawWaveform(
  canvas: HTMLCanvasElement | null,
  buffer: AudioBuffer,
  highlightSegments?: Segment[],
  highlightSyllables?: SyllableSegment[]
) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = buffer.getChannelData(0);

  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);

  // Find max amplitude for dynamic scaling
  let maxAmp = 0;
  for (let i = 0; i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > maxAmp) maxAmp = v;
  }
  const displayMax = maxAmp * 1.1 || 1;

  // Draw highlight regions
  if (highlightSegments) {
    for (const seg of highlightSegments) {
      const x1 = (seg.startMs / 1000 / buffer.duration) * width;
      const x2 = (seg.endMs / 1000 / buffer.duration) * width;
      ctx.fillStyle = seg.selected ? 'rgba(254, 202, 87, 0.15)' : 'rgba(136, 136, 136, 0.08)';
      ctx.fillRect(x1, 0, x2 - x1, height);

      // Segment boundary lines
      ctx.strokeStyle = seg.selected ? '#feca57' : '#555';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, 0); ctx.lineTo(x1, height);
      ctx.moveTo(x2, 0); ctx.lineTo(x2, height);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (highlightSyllables) {
    for (const syl of highlightSyllables) {
      const x1 = (syl.startMs / 1000 / buffer.duration) * width;
      const x2 = (syl.endMs / 1000 / buffer.duration) * width;
      ctx.fillStyle = syl.selected ? 'rgba(72, 219, 251, 0.25)' : 'rgba(136, 136, 136, 0.08)';
      ctx.fillRect(x1, height * 0.1, x2 - x1, height * 0.8);

      // Syllable boundary lines
      ctx.strokeStyle = syl.selected ? '#48dbfb' : '#555';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, height * 0.1); ctx.lineTo(x1, height * 0.9);
      ctx.moveTo(x2, height * 0.1); ctx.lineTo(x2, height * 0.9);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Draw waveform
  ctx.strokeStyle = '#48dbfb';
  ctx.lineWidth = 1;
  ctx.beginPath();

  const step = Math.ceil(data.length / width);
  for (let i = 0; i < width; i++) {
    let min = 1.0, max_ = -1.0;
    for (let j = 0; j < step; j++) {
      const idx = i * step + j;
      if (idx < data.length) {
        if (data[idx] < min) min = data[idx];
        if (data[idx] > max_) max_ = data[idx];
      }
    }
    const y1 = height / 2 - (min / displayMax) * (height / 2);
    const y2 = height / 2 - (max_ / displayMax) * (height / 2);
    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  ctx.stroke();
}

function drawSegmentMiniWave(idx: number) {
  const canvas = segCanvasRefs[idx];
  const buf = audioBuffer.value;
  if (!canvas || !buf) return;

  const seg = segments.value[idx];
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = buf.getChannelData(0);
  const sr = buf.sampleRate;

  const startSample = Math.floor((seg.startMs / 1000) * sr);
  const endSample = Math.floor((seg.endMs / 1000) * sr);
  const segLength = endSample - startSample;

  ctx.fillStyle = '#111';
  ctx.fillRect(0, 0, width, height);

  if (segLength <= 0) return;

  let maxAmp = 0;
  for (let i = startSample; i < endSample && i < data.length; i++) {
    const v = Math.abs(data[i]);
    if (v > maxAmp) maxAmp = v;
  }
  const displayMax = maxAmp * 1.1 || 1;

  ctx.strokeStyle = '#48dbfb';
  ctx.lineWidth = 1;
  ctx.beginPath();

  const step = Math.ceil(segLength / width);
  for (let i = 0; i < width; i++) {
    let min = 1.0, max_ = -1.0;
    for (let j = 0; j < step; j++) {
      const sIdx = startSample + i * step + j;
      if (sIdx < endSample && sIdx < data.length) {
        if (data[sIdx] < min) min = data[sIdx];
        if (data[sIdx] > max_) max_ = data[sIdx];
      }
    }
    const y1 = height / 2 - (min / displayMax) * (height / 2);
    const y2 = height / 2 - (max_ / displayMax) * (height / 2);
    ctx.moveTo(i, y1);
    ctx.lineTo(i, y2);
  }
  ctx.stroke();
}

// ==================== WAV 编码 ====================
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1;
  const sampleRate = buffer.sampleRate;
  const bitDepth = 16;
  const data = buffer.getChannelData(0);
  const dataLength = data.length * (bitDepth / 8);
  const bufferLength = 44 + dataLength;

  const ab = new ArrayBuffer(bufferLength);
  const view = new DataView(ab);

  writeStr(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataLength, true);
  writeStr(view, 8, 'WAVE');
  writeStr(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitDepth / 8), true);
  view.setUint16(32, numChannels * (bitDepth / 8), true);
  view.setUint16(34, bitDepth, true);
  writeStr(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  let offset = 44;
  for (let i = 0; i < data.length; i++) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([ab], { type: 'audio/wav' });
}

function writeStr(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

// ==================== 下载工具 ====================
function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function dataUrlToBlob(dataUrl: string): Blob {
  const parts = dataUrl.split(',');
  const mime = parts[0].match(/:(.*?);/)![1];
  const raw = atob(parts[1]);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

// ==================== 重置 ====================
function resetAll() {
  stopPlayback();
  stopSyllablePlayback();

  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value);
  }
  videoFile.value = null;
  videoUrl.value = '';
  audioBuffer.value = null;
  mergedBuffer.value = null;
  segments.value = [];
  syllables.value = [];
  segmentSplitPoints.value = [];
  syllableSplitPoints.value = [];
  uniqueFrames.value = [];
  chromaFrames.value = [];
  frameProgress.value = 0;
  statusMsg.value = '';
  step.value = 1;
}

// ==================== 清理 ====================
onUnmounted(() => {
  stopPlayback();
  stopSyllablePlayback();
  if (videoUrl.value) {
    URL.revokeObjectURL(videoUrl.value);
  }
});
</script>

<style scoped>
.processor-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
  padding: 20px;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.processor-header {
  text-align: center;
  margin-bottom: 24px;
}

.processor-header h1 {
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

/* 步骤导航 */
.step-nav {
  display: flex;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.step-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 20px;
  border: 2px solid #333;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.3);
  color: #888;
  cursor: pointer;
  transition: all 0.2s;
}

.step-btn.active {
  border-color: #feca57;
  color: #feca57;
  background: rgba(254, 202, 87, 0.1);
}

.step-btn.done {
  border-color: #2ecc71;
  color: #2ecc71;
  background: rgba(46, 204, 113, 0.1);
}

.step-btn.disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.step-num {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: currentColor;
  color: #1a1a2e;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 0.8rem;
}

.step-label {
  font-size: 0.9rem;
}

/* 通用 */
.status-banner {
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 24px;
  text-align: center;
}
.status-banner.info { background: rgba(72, 219, 251, 0.2); border: 1px solid #48dbfb; }
.status-banner.success { background: rgba(46, 204, 113, 0.2); border: 1px solid #2ecc71; }
.status-banner.error { background: rgba(233, 69, 96, 0.2); border: 1px solid #e94560; }

.control-row {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}
.btn:disabled { opacity: 0.5; cursor: not-allowed; }
.btn-primary { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
.btn-secondary { background: rgba(255, 255, 255, 0.1); color: white; border: 1px solid #444; }
.btn-small { padding: 6px 12px; font-size: 0.85rem; }
.file-input-label { display: inline-block; }

.step-panel {
  max-width: 1500px;
  margin: 0 auto;
}

.step-panel h2 {
  color: #feca57;
  margin: 0 0 8px 0;
}

.step-desc {
  color: #888;
  margin: 0 0 20px 0;
}

/* 参数 */
.params-section {
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  padding: 16px;
  margin-bottom: 24px;
}
.params-section h3 { margin: 0 0 12px 0; color: #888; font-size: 0.9rem; }

.params-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}
.params-grid label {
  display: flex; flex-direction: column; gap: 4px;
  font-size: 0.85rem; color: #aaa;
}
.params-grid input {
  width: 120px; padding: 8px;
  border: 1px solid #444; border-radius: 4px;
  background: rgba(0, 0, 0, 0.3); color: #fff;
}

/* 波形 */
.waveform-section { margin-bottom: 20px; }
.waveform-section h3 { margin: 0 0 12px 0; font-size: 1rem; color: #48dbfb; }
.waveform-container { position: relative; }
.waveform-container.interactive { cursor: crosshair; }
.waveform-container canvas { width: 100%; height: 160px; border-radius: 8px; }

.hint { font-size: 0.75rem; color: #666; font-weight: normal; }

/* Split markers */
.split-marker {
  position: absolute;
  top: 0;
  height: 160px;
  transform: translateX(-50%);
  z-index: 10;
  cursor: ew-resize;
  user-select: none;
}
.split-marker .marker-line {
  position: absolute;
  left: 50%;
  top: 0;
  width: 2px;
  height: 100%;
  background: #feca57;
  transform: translateX(-50%);
  pointer-events: none;
}
.split-marker.syl-marker .marker-line {
  background: #48dbfb;
}
.split-marker.dragging .marker-line {
  width: 3px;
  background: #ff6b6b;
}
.split-marker .marker-handle {
  position: absolute;
  bottom: -28px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(0, 0, 0, 0.8);
  border: 1px solid #feca57;
  border-radius: 4px;
  padding: 2px 6px;
  white-space: nowrap;
  opacity: 0;
  transition: opacity 0.15s;
  pointer-events: none;
}
.split-marker.syl-marker .marker-handle {
  border-color: #48dbfb;
}
.split-marker:hover .marker-handle,
.split-marker.dragging .marker-handle {
  opacity: 1;
  pointer-events: auto;
}
.marker-time {
  font-size: 0.7rem;
  color: #feca57;
}
.syl-marker .marker-time {
  color: #48dbfb;
}
.marker-remove {
  background: #e74c3c;
  color: #fff;
  border: none;
  border-radius: 50%;
  width: 16px;
  height: 16px;
  font-size: 9px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  line-height: 1;
}
.marker-remove:hover {
  background: #ff6b6b;
}

/* Cursor line */
.cursor-line {
  position: absolute;
  top: 0;
  width: 1px;
  height: 160px;
  background: rgba(255, 107, 107, 0.6);
  pointer-events: none;
  z-index: 5;
}
.cursor-time {
  position: absolute;
  top: -22px;
  left: 50%;
  transform: translateX(-50%);
  background: #ff6b6b;
  color: #fff;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.7rem;
  font-weight: bold;
  white-space: nowrap;
}

.time-markers {
  display: flex; justify-content: space-between;
  color: #888; font-size: 0.8rem; margin-top: 8px;
}

/* 片段列表 */
.segments-section h3 { color: #48dbfb; margin: 0 0 12px 0; }

.segment-actions {
  display: flex; gap: 12px; align-items: center; margin-bottom: 12px;
}
.selected-count { color: #feca57; font-size: 0.85rem; }

.segments-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}

.segment-card {
  background: rgba(0, 0, 0, 0.3);
  border: 2px solid transparent;
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  transition: all 0.2s;
}
.segment-card.selected { border-color: #feca57; background: rgba(254, 202, 87, 0.08); }
.segment-card.playing { border-color: #2ecc71; }
.segment-card:hover { background: rgba(255, 255, 255, 0.05); }

.seg-header {
  display: flex; align-items: center; gap: 8px; margin-bottom: 6px;
  font-size: 0.8rem;
}
.seg-header input[type="checkbox"] { accent-color: #feca57; }
.seg-idx { color: #feca57; font-weight: bold; }
.seg-time { color: #888; }
.seg-dur { color: #48dbfb; margin-left: auto; }

.seg-mini-wave { width: 100%; height: 48px; border-radius: 4px; }

.seg-controls {
  display: flex; gap: 6px; margin-top: 6px;
}

/* 音节 */
.syllables-section h3 { color: #48dbfb; margin: 0 0 12px 0; }

.syllables-grid {
  display: flex; flex-direction: column; gap: 8px;
}

.syllable-card {
  display: flex; align-items: center; gap: 12px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 10px 16px;
  transition: all 0.2s;
}
.syllable-card { cursor: pointer; border: 2px solid transparent; }
.syllable-card.selected { border-color: #feca57; background: rgba(254, 202, 87, 0.08); }
.syllable-card.playing { border-color: #2ecc71; background: rgba(46, 204, 113, 0.1); }
.syllable-card input[type="checkbox"] { accent-color: #feca57; }

.syl-idx { color: #feca57; font-weight: bold; min-width: 36px; }
.syl-label {
  width: 48px;
  padding: 2px 6px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: #ff6b6b;
  font-weight: 700;
  font-size: 0.85rem;
  text-align: center;
  text-transform: uppercase;
}
.syl-label:focus {
  outline: none;
  border-color: #feca57;
  background: rgba(255, 255, 255, 0.15);
}
.syl-time { color: #888; font-size: 0.85rem; }
.syl-dur { color: #48dbfb; font-size: 0.85rem; }

/* 视频预览 */
.video-preview { margin-top: 20px; }
.video-preview h3 { color: #48dbfb; margin: 0 0 12px 0; }

.preview-video {
  width: 100%;
  max-width: 640px;
  border-radius: 8px;
  background: #000;
}

/* 帧预览 */
.frames-section { margin-top: 20px; }
.frames-section h3 { color: #48dbfb; margin: 0 0 12px 0; }

.frames-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 12px;
}

.frames-grid.checkerboard-bg {
  background:
    repeating-conic-gradient(#333 0% 25%, #222 0% 50%) 50% / 20px 20px;
  border-radius: 8px;
  padding: 12px;
}

.frame-card {
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  position: relative;
  border: 2px solid transparent;
  transition: border-color 0.2s, opacity 0.2s;
}

.frame-card.selected {
  border-color: #feca57;
}

.frame-card.unselected {
  opacity: 0.5;
}

.frame-card:hover {
  border-color: rgba(254, 202, 87, 0.5);
  opacity: 1;
}

.frame-card input[type="checkbox"] {
  position: absolute;
  top: 6px;
  left: 6px;
  z-index: 1;
  cursor: pointer;
}

.frame-thumb {
  width: 100%;
  aspect-ratio: 16/9;
  object-fit: cover;
  display: block;
}

.frame-info {
  display: flex; justify-content: space-between;
  padding: 6px 8px; font-size: 0.75rem; color: #888;
}

/* 进度条 */
.progress-bar-wrapper {
  margin-top: 12px;
  position: relative;
  height: 24px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 12px;
  overflow: hidden;
}

.progress-bar {
  height: 100%;
  background: linear-gradient(90deg, #667eea, #764ba2);
  border-radius: 12px;
  transition: width 0.2s;
}

.progress-text {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.8rem;
  font-weight: bold;
  color: #fff;
}
</style>
