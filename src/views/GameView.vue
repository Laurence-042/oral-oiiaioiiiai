<template>
  <div class="game-view" :class="{ mobile: isMobile }">
    <!-- ==================== 加载界面 ==================== -->
    <div v-if="packLoading" class="loading-overlay">
      <div class="loading-card">
        <div class="loading-spinner"></div>
        <p class="loading-text">加载资源包...</p>
        <div class="loading-bar-track">
          <div class="loading-bar-fill" :style="{ width: packProgress + '%' }"></div>
        </div>
        <span class="loading-pct">{{ packProgress }}%</span>
      </div>
    </div>

    <!-- ==================== 结算遮罩 ==================== -->
    <Transition name="overlay">
      <div v-if="state === 'interrupted'" class="result-overlay" @click.self="handleRestart">
        <div class="result-card">
          <div class="result-icon">{{ interruptIcon }}</div>
          <h2 class="result-title">{{ interruptTitle }}</h2>
          <p class="result-reason">{{ interruptReasonText }}</p>

          <div class="result-stats">
            <div class="result-stat main">
              <span class="result-label">最终得分</span>
              <span class="result-value">{{ snapshot?.score ?? stats.score }}</span>
            </div>
            <div class="result-stat">
              <span class="result-label">最高连击</span>
              <span class="result-value">{{ snapshot?.maxCombo ?? stats.maxCombo }}x</span>
            </div>
            <div class="result-stat">
              <span class="result-label">到达阶段</span>
              <span class="result-value">{{ snapshot?.stageName ?? stats.stageName }}</span>
            </div>
            <div class="result-stat">
              <span class="result-label">完美循环</span>
              <span class="result-value">{{ snapshot?.perfectCycles ?? stats.perfectCycles }}</span>
            </div>
            <div class="result-stat">
              <span class="result-label">持续时间</span>
              <span class="result-value">{{ formattedDuration }}</span>
            </div>
          </div>

          <div class="result-actions">
            <button class="btn primary large" @click="handleRestart">🔄 再来一次</button>
            <button class="btn ghost" @click="handleBackToIdle">返回首页</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ==================== 顶栏 ==================== -->
    <header class="game-header">
      <div class="header-left">
        <h1 class="game-title">OIIAIOIIIAI</h1>
      </div>
      <div class="header-right">
        <!-- 资源包选择 -->
        <select
          v-if="availablePacks.length > 1"
          class="pack-select"
          :value="currentPackId"
          :disabled="state === 'playing'"
          @change="onPackChange"
        >
          <option v-for="p in availablePacks" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <!-- 检测器切换 -->
        <div class="detector-toggle" :class="{ disabled: state === 'playing' }">
          <button class="toggle-btn" :class="{ active: detectorMode === 'ml' }"
            :disabled="state === 'playing'" @click="switchDetector('ml')">CNN</button>
          <button class="toggle-btn" :class="{ active: detectorMode === 'mfcc' }"
            :disabled="state === 'playing'" @click="switchDetector('mfcc')">MFCC</button>
        </div>
        <span class="pill" :class="isListening ? 'on' : 'off'">
          {{ isListening ? '🎤' : '🔇' }}
        </span>
      </div>
    </header>

    <!-- ==================== 主区域 ==================== -->
    <main class="game-main">
      <!-- 分数面板 -->
      <section class="score-strip">
        <div class="score-item">
          <span class="score-val highlight">{{ stats.score }}</span>
          <span class="score-lbl">分数</span>
        </div>
        <div class="score-item">
          <span class="score-val">{{ stats.combo }}x</span>
          <span class="score-lbl">连击</span>
        </div>
        <div class="score-item">
          <span class="score-val">{{ stats.stageName }}</span>
          <span class="score-lbl">阶段</span>
        </div>
        <div class="score-item">
          <span class="score-val">{{ stats.perfectCycles }}</span>
          <span class="score-lbl">循环</span>
        </div>
      </section>

      <!-- 精灵动画区域 -->
      <section class="sprite-area">
        <div class="sprite-container" :style="spriteContainerStyle">
          <img
            v-if="displayFrame"
            :src="displayFrame.src"
            class="sprite-img"
            :style="spriteStyle"
            alt="sprite"
          />
        </div>
      </section>

      <!-- 序列进度 + 检测信息 -->
      <section class="sequence-area">
        <div class="sequence-track">
          <span
            v-for="(vowel, idx) in packSequence"
            :key="idx"
            class="seq-dot"
            :class="{
              active: idx === stats.sequenceIndex,
              done: idx < stats.sequenceIndex || (stats.perfectCycles > 0 && idx >= stats.sequenceIndex)
            }"
          >{{ vowel }}</span>
        </div>

        <div class="detect-row">
          <div class="detect-vowel" :class="{ active: confirmedVowel && confirmedVowel !== 'silence' }">
            {{ confirmedVowel && confirmedVowel !== 'silence' ? confirmedVowel : '—' }}
          </div>
          <div class="detect-bars">
            <div class="mini-bar">
              <span class="mini-label">置信度</span>
              <div class="mini-track"><div class="mini-fill conf" :style="{ width: confPct + '%' }"></div></div>
              <span class="mini-val">{{ confPct }}%</span>
            </div>
            <div class="mini-bar">
              <span class="mini-label">音量</span>
              <div class="mini-track"><div class="mini-fill vol" :style="{ width: volPct + '%' }"></div></div>
              <span class="mini-val">{{ currentResult?.volume?.toFixed(0) ?? '--' }}dB</span>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- ==================== 底栏 ==================== -->
    <footer class="game-footer">
      <button class="btn primary" :disabled="state === 'playing' || packLoading" @click="handleStart">
        {{ state === 'idle' ? '🎤 开始游戏' : '🔄 重新开始' }}
      </button>
      <button class="btn" :disabled="state !== 'playing'" @click="handleStop">⏸ 暂停</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref, onMounted, onUnmounted } from 'vue';
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';
import { useVowelDetector } from '@/composables/useVowelDetector';
import { useGameState, connectVowelDetectorToGameState } from '@/composables/useGameState';
import { useResourcePack } from '@/composables/useResourcePack';
import { getStageVisualConfig } from '@/config/stages';
import type { InterruptReason, VowelDetectorHookReturn } from '@/types/game';

type DetectorMode = 'ml' | 'mfcc';

// ==================== 响应式布局 ====================
const isMobile = ref(false);
function checkMobile() {
  isMobile.value = window.innerWidth < 768;
}
onMounted(() => {
  checkMobile();
  window.addEventListener('resize', checkMobile);
});
onUnmounted(() => {
  window.removeEventListener('resize', checkMobile);
});

// ==================== 检测器 ====================
const mlDetector = useVowelDetectorML();
const mfccDetector = useVowelDetector();
const detectorMode = ref<DetectorMode>('ml');
const activeDetector = computed<VowelDetectorHookReturn>(() =>
  detectorMode.value === 'ml' ? mlDetector : mfccDetector
);

// ==================== 游戏状态 ====================
const game = useGameState();
connectVowelDetectorToGameState(mlDetector, game);
connectVowelDetectorToGameState(mfccDetector, game);

const currentResult = computed(() => activeDetector.value.currentResult.value);
const confirmedVowel = computed(() => activeDetector.value.confirmedVowel.value);
const isListening = computed(() => activeDetector.value.isListening.value);
const { stats, state, snapshot, startGame, interrupt, reset: resetGame } = game;

const confPct = computed(() => Math.round((currentResult.value?.confidence ?? 0) * 100));
const volPct = computed(() => Math.max(0, Math.min(100, (currentResult.value?.volume ?? -100) + 100)));

// ==================== 资源包 ====================
const resPack = useResourcePack();
const {
  loading: packLoading,
  loadProgress: packProgress,
  availablePacks,
  currentPackId,
  loadedPack,
  sequence: packSequence
} = resPack;

// ==================== 精灵动画 ====================
const currentFrameIndex = ref(0);
const animationSpeedRatio = ref(1);           // 平滑后的速率比
const rawSpeedRatio = ref(1);                 // 原始速率比
const SMOOTH_FACTOR = 0.15;                    // EMA 平滑系数
let animationRAF = 0;
let lastFrameTime = 0;
let frameAccumulator = 0;

const stageConfig = computed(() => getStageVisualConfig(game.currentStage.value));

/** 每帧基础持续时间 (ms)：总音节时长 / 循环帧数 */
const baseFrameDuration = computed(() => {
  const pack = loadedPack.value;
  if (!pack || pack.animationFrames.length === 0) return 100;
  return (pack.totalSyllableDuration * 1000) / pack.animationFrames.length;
});

/** 当前显示的帧图片 */
const displayFrame = computed(() => {
  const pack = loadedPack.value;
  if (!pack) return null;
  if (state.value !== 'playing') return pack.idleFrame;
  if (pack.animationFrames.length === 0) return pack.idleFrame;
  return pack.animationFrames[currentFrameIndex.value % pack.animationFrames.length];
});

/** 精灵容器样式 (旋转) */
const spriteContainerStyle = computed(() => {
  if (state.value !== 'playing') return {};
  const cfg = stageConfig.value;
  const dur = 360 / cfg.cat.rotationSpeed;
  return {
    animation: `spin ${dur}s linear infinite`
  };
});

/** 精灵图片样式 */
const spriteStyle = computed(() => {
  const cfg = stageConfig.value;
  return { transform: `scale(${cfg.cat.scale})` };
});

/** 帧动画循环 */
function startAnimation() {
  lastFrameTime = performance.now();
  frameAccumulator = 0;
  currentFrameIndex.value = 0;

  function tick(now: number) {
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    // 平滑速率更新 (EMA)
    animationSpeedRatio.value += (rawSpeedRatio.value - animationSpeedRatio.value) * SMOOTH_FACTOR;

    // 帧时间 = 基础帧时间 / 速率比
    const effectiveDuration = baseFrameDuration.value / animationSpeedRatio.value;
    frameAccumulator += dt;

    if (effectiveDuration > 0 && frameAccumulator >= effectiveDuration) {
      const steps = Math.floor(frameAccumulator / effectiveDuration);
      const pack = loadedPack.value;
      if (pack && pack.animationFrames.length > 0) {
        currentFrameIndex.value = (currentFrameIndex.value + steps) % pack.animationFrames.length;
      }
      frameAccumulator %= effectiveDuration;
    }

    animationRAF = requestAnimationFrame(tick);
  }

  animationRAF = requestAnimationFrame(tick);
}

function stopAnimation() {
  if (animationRAF) {
    cancelAnimationFrame(animationRAF);
    animationRAF = 0;
  }
}

// ==================== 音节播放 ====================
let lastPlayerVowelTime = 0;
let playerIntervals: number[] = [];
const INTERVAL_WINDOW = 6;

/** 播放指定序列位置的 syllable 音频 */
function playExpectedSyllable(seqIndex: number) {
  resPack.playSyllable(seqIndex);
}

// 监听 sequenceIndex 变化 → 播放对应音节 + 计算速度比
watch(
  () => stats.value.sequenceIndex,
  (newIdx) => {
    if (state.value !== 'playing') return;

    // 播放新的期望音节（允许叠加）
    playExpectedSyllable(newIdx);

    // 计算玩家速度
    const now = performance.now();
    if (lastPlayerVowelTime > 0) {
      const interval = now - lastPlayerVowelTime;
      playerIntervals.push(interval);
      if (playerIntervals.length > INTERVAL_WINDOW) {
        playerIntervals.shift();
      }
      updateSpeedRatio();
    }
    lastPlayerVowelTime = now;
  }
);

/** 根据玩家平均间隔 vs 音节平均时长计算速率比 */
function updateSpeedRatio() {
  if (playerIntervals.length < 2) {
    rawSpeedRatio.value = 1;
    return;
  }
  const avgPlayerInterval = playerIntervals.reduce((a, b) => a + b, 0) / playerIntervals.length;
  const pack = loadedPack.value;
  if (!pack || pack.syllables.length === 0) return;
  const avgSyllableDuration = (pack.totalSyllableDuration * 1000) / pack.syllables.length;
  // 玩家越快 → ratio 越大 → 动画越快
  const ratio = avgSyllableDuration / avgPlayerInterval;
  rawSpeedRatio.value = Math.max(0.3, Math.min(4.0, ratio));
}

// ==================== 中断原因 ====================
const lastInterruptReason = ref<InterruptReason | null>(null);

const interruptIcon = computed(() => {
  const s = snapshot.value;
  if (!s) return '😿';
  if (s.perfectCycles >= 3) return '🏆';
  if (s.stage >= 4) return '🔥';
  if (s.stage >= 2) return '😸';
  return '😿';
});

const interruptTitle = computed(() => {
  const s = snapshot.value;
  if (!s) return '游戏结束';
  if (s.perfectCycles >= 3) return '太强了！';
  if (s.stage >= 4) return '非常厉害！';
  if (s.stage >= 2) return '不错的表现！';
  return '再接再厉！';
});

const interruptReasonText = computed(() => {
  switch (lastInterruptReason.value) {
    case 'silence_timeout': return '静音超时 — 超过 1.5 秒没有发音';
    case 'consecutive_errors': return '连续发音错误';
    case 'manual': return '手动暂停';
    default: return '';
  }
});

const formattedDuration = computed(() => {
  const ms = snapshot.value?.duration ?? (Date.now() - stats.value.startTime);
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return mins > 0 ? `${mins}分${remainSecs}秒` : `${remainSecs}秒`;
});

// ==================== 状态联动 ====================
watch(state, (newState, oldState) => {
  if (newState === 'playing' && oldState !== 'playing') {
    startAnimation();
    playExpectedSyllable(stats.value.sequenceIndex);
    lastPlayerVowelTime = 0;
    playerIntervals = [];
    rawSpeedRatio.value = 1;
    animationSpeedRatio.value = 1;
  }
  if (newState !== 'playing' && oldState === 'playing') {
    stopAnimation();
  }
  if (newState === 'interrupted' && oldState === 'playing') {
    activeDetector.value.stop();
  }
});

game.onComboBreak((_combo, reason) => {
  lastInterruptReason.value = reason;
});

// ==================== 用户操作 ====================
const switchDetector = (mode: DetectorMode) => {
  if (mode === detectorMode.value || state.value === 'playing') return;
  activeDetector.value.stop();
  resetGame();
  lastInterruptReason.value = null;
  detectorMode.value = mode;
};

async function onPackChange(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  if (id === currentPackId.value) return;
  try { await resPack.loadPack(id); } catch { /* handled via resPack.error */ }
}

const handleStart = async () => {
  try {
    if (!loadedPack.value) await resPack.loadPack(currentPackId.value);
    if (state.value === 'interrupted') resetGame();
    await activeDetector.value.start();
    startGame();
    lastInterruptReason.value = null;
  } catch (err) {
    console.error('启动失败', err);
  }
};

const handleStop = () => {
  lastInterruptReason.value = 'manual';
  activeDetector.value.stop();
  interrupt('manual');
};

const handleRestart = async () => {
  resetGame();
  try {
    await activeDetector.value.start();
    startGame();
    lastInterruptReason.value = null;
  } catch (err) {
    console.error('重新启动失败', err);
  }
};

const handleBackToIdle = () => {
  activeDetector.value.stop();
  resetGame();
  lastInterruptReason.value = null;
};

// ==================== 初始化 ====================
onMounted(async () => {
  await resPack.fetchAvailablePacks();
  try { await resPack.loadPack(currentPackId.value); } catch { /* handled */ }
});

onUnmounted(() => {
  stopAnimation();
  resPack.dispose();
});
</script>

<style scoped>
/* ==================== 根布局 ==================== */
.game-view {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: #0d1117;
  color: #e6edf3;
  overflow: hidden;
  user-select: none;
}

/* ==================== 加载 ==================== */
.loading-overlay {
  position: fixed; inset: 0; z-index: 200;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.85);
}
.loading-card {
  text-align: center;
  display: flex; flex-direction: column; align-items: center; gap: 16px;
}
.loading-spinner {
  width: 48px; height: 48px;
  border: 4px solid rgba(255,255,255,0.15);
  border-top-color: #58a6ff;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
.loading-text { font-size: 15px; color: #8b949e; }
.loading-bar-track {
  width: 200px; height: 6px;
  background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;
}
.loading-bar-fill {
  height: 100%;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  border-radius: 3px; transition: width 0.2s;
}
.loading-pct { font-size: 12px; color: #8b949e; }

/* ==================== 顶栏 ==================== */
.game-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 20px;
  background: rgba(0,0,0,0.3);
  flex-shrink: 0;
}
.game-title {
  font-size: 20px; letter-spacing: 3px; font-weight: 800;
  background: linear-gradient(90deg, #58a6ff, #a371f7);
  -webkit-background-clip: text; -webkit-text-fill-color: transparent;
  background-clip: text;
}
.header-right {
  display: flex; align-items: center; gap: 10px;
}
.pack-select {
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 6px;
  color: #e6edf3; padding: 4px 8px; font-size: 12px;
  cursor: pointer;
}
.pack-select:disabled { opacity: 0.5; cursor: not-allowed; }

.detector-toggle {
  display: flex; background: rgba(255,255,255,0.06);
  border-radius: 6px; overflow: hidden;
  border: 1px solid rgba(255,255,255,0.1);
}
.detector-toggle.disabled { opacity: 0.5; }
.toggle-btn {
  padding: 4px 10px; border: none; background: transparent;
  color: rgba(255,255,255,0.4); font-size: 11px; font-weight: 600;
  letter-spacing: 1px; cursor: pointer; transition: all 0.2s;
}
.toggle-btn.active { background: rgba(88,160,255,0.35); color: #fff; }
.toggle-btn:disabled { cursor: not-allowed; }

.pill {
  padding: 4px 10px; border-radius: 999px; font-size: 12px;
  background: rgba(255,255,255,0.1);
}
.pill.on { background: rgba(88,160,255,0.35); }

/* ==================== 主区域 ==================== */
.game-main {
  flex: 1; display: flex; flex-direction: column;
  min-height: 0;
}

/* ==================== 分数面板 ==================== */
.score-strip {
  display: flex; justify-content: center; gap: 24px;
  padding: 10px 20px;
  flex-shrink: 0;
}
.score-item {
  display: flex; flex-direction: column; align-items: center; gap: 2px;
}
.score-val {
  font-size: 18px; font-weight: 700; font-variant-numeric: tabular-nums;
}
.score-val.highlight { font-size: 26px; color: #58a6ff; }
.score-lbl {
  font-size: 11px; color: #8b949e;
  text-transform: uppercase; letter-spacing: 1px;
}

/* ==================== 精灵区域 ==================== */
.sprite-area {
  flex: 1; display: flex; align-items: center; justify-content: center;
  padding: 16px; min-height: 0;
}
.sprite-container {
  max-width: 360px; max-height: 360px;
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
}
.sprite-img {
  max-width: 100%; max-height: 100%;
  object-fit: contain; image-rendering: auto;
  filter: drop-shadow(0 0 20px rgba(88,160,255,0.3));
}

/* ==================== 序列 & 检测 ==================== */
.sequence-area {
  padding: 12px 20px;
  flex-shrink: 0;
}
.sequence-track {
  display: flex; justify-content: center; gap: 6px;
  flex-wrap: wrap; margin-bottom: 12px;
}
.seq-dot {
  width: 32px; height: 32px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; font-size: 13px; font-weight: 600;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.35);
  transition: all 0.2s;
}
.seq-dot.done {
  background: rgba(76,212,164,0.15);
  color: rgba(76,212,164,0.7);
}
.seq-dot.active {
  background: rgba(255,205,86,0.45);
  color: #1a1a2e;
  transform: scale(1.2);
  box-shadow: 0 0 12px rgba(255,205,86,0.4);
}

.detect-row {
  display: flex; align-items: center; gap: 16px; justify-content: center;
}
.detect-vowel {
  width: 56px; height: 56px;
  display: flex; align-items: center; justify-content: center;
  font-size: 28px; font-weight: 800;
  border-radius: 14px;
  background: rgba(255,255,255,0.06);
  border: 2px solid transparent;
  transition: all 0.2s; flex-shrink: 0;
}
.detect-vowel.active {
  border-color: rgba(88,160,255,0.6);
  box-shadow: 0 0 16px rgba(88,160,255,0.3);
  background: rgba(88,160,255,0.12);
}

.detect-bars {
  display: flex; flex-direction: column; gap: 6px;
  flex: 1; max-width: 280px;
}
.mini-bar {
  display: grid; grid-template-columns: 52px 1fr 48px;
  align-items: center; gap: 8px; font-size: 11px;
}
.mini-label { color: #8b949e; }
.mini-track {
  height: 6px; background: rgba(255,255,255,0.08);
  border-radius: 3px; overflow: hidden;
}
.mini-fill {
  height: 100%; border-radius: 3px; transition: width 0.15s;
}
.mini-fill.conf { background: linear-gradient(90deg, #f97583, #ffd33d); }
.mini-fill.vol { background: linear-gradient(90deg, #4cd4a4, #58a6ff); }
.mini-val {
  color: #8b949e; text-align: right; font-variant-numeric: tabular-nums;
}

/* ==================== 底栏 ==================== */
.game-footer {
  display: flex; gap: 10px; justify-content: center;
  padding: 12px 20px 20px; flex-shrink: 0;
}

/* ==================== 按钮 ==================== */
.btn {
  padding: 10px 20px; border-radius: 10px; border: none;
  background: rgba(255,255,255,0.1); color: #e6edf3;
  font-size: 14px; cursor: pointer; transition: all 0.2s;
}
.btn.primary {
  background: linear-gradient(135deg, #58a6ff, #a371f7);
  color: #0d1117; font-weight: 700;
}
.btn.ghost {
  background: transparent; border: 1px solid rgba(255,255,255,0.15);
}
.btn:disabled { opacity: 0.4; cursor: not-allowed; }
.btn.large {
  padding: 14px 28px; font-size: 16px; border-radius: 14px;
}

/* ==================== 结算遮罩 ==================== */
.result-overlay {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(10px);
}
.result-card {
  background: linear-gradient(145deg, rgba(22,27,34,0.97), rgba(13,17,23,0.99));
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 24px; padding: 36px 32px;
  max-width: 400px; width: calc(100% - 32px);
  text-align: center;
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
}
.result-icon { font-size: 52px; margin-bottom: 6px; }
.result-title {
  font-size: 26px; font-weight: 700;
  letter-spacing: 2px; margin-bottom: 4px;
}
.result-reason { font-size: 13px; color: #8b949e; margin-bottom: 24px; }
.result-stats {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; margin-bottom: 28px;
}
.result-stat {
  background: rgba(255,255,255,0.04);
  border-radius: 12px; padding: 12px 10px;
}
.result-stat.main {
  grid-column: 1 / -1;
  background: rgba(88,160,255,0.1);
  border: 1px solid rgba(88,160,255,0.2);
  padding: 16px 10px;
}
.result-label {
  display: block; font-size: 10px; color: #8b949e;
  text-transform: uppercase; letter-spacing: 1px; margin-bottom: 4px;
}
.result-value { display: block; font-size: 20px; font-weight: 700; }
.result-stat.main .result-value { font-size: 32px; }
.result-actions { display: flex; flex-direction: column; gap: 10px; }

/* ==================== 动画 ==================== */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* ==================== 过渡 ==================== */
.overlay-enter-active { transition: opacity 0.3s ease; }
.overlay-enter-active .result-card {
  transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease;
}
.overlay-leave-active { transition: opacity 0.2s ease; }
.overlay-leave-active .result-card {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.overlay-enter-from { opacity: 0; }
.overlay-enter-from .result-card {
  opacity: 0; transform: scale(0.92) translateY(20px);
}
.overlay-leave-to { opacity: 0; }
.overlay-leave-to .result-card {
  opacity: 0; transform: scale(0.96) translateY(-10px);
}

/* ==================== 竖屏移动端适配 ==================== */
.mobile .game-header { padding: 8px 14px; }
.mobile .game-title { font-size: 16px; letter-spacing: 2px; }
.mobile .header-right { gap: 6px; }

.mobile .score-strip { gap: 14px; padding: 8px 14px; }
.mobile .score-val { font-size: 15px; }
.mobile .score-val.highlight { font-size: 22px; }
.mobile .score-lbl { font-size: 10px; }

.mobile .sprite-container { max-width: 260px; max-height: 260px; }

.mobile .sequence-area { padding: 10px 14px; }
.mobile .seq-dot {
  width: 26px; height: 26px; font-size: 11px; border-radius: 6px;
}
.mobile .detect-vowel {
  width: 48px; height: 48px; font-size: 24px; border-radius: 12px;
}

.mobile .game-footer { padding: 10px 14px 16px; }
.mobile .btn { padding: 10px 16px; font-size: 13px; }
.mobile .btn.large { padding: 12px 20px; font-size: 15px; }

/* 横屏 PC: 让精灵区域更大 */
@media (min-width: 769px) and (orientation: landscape) {
  .sprite-container { max-width: 420px; max-height: 420px; }
  .score-strip { gap: 40px; }
}
</style>
