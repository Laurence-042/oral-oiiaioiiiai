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

    <!-- ==================== 预备遮罩 ==================== -->
    <Transition name="overlay">
      <div v-if="state === 'ready'" class="ready-overlay">
        <div class="ready-card">
          <div class="ready-icon">🎤</div>
          <h2 class="ready-title">预备</h2>
          <p class="ready-hint">请发出 <strong>"{{ readyVowel }}"</strong> 音开始游戏</p>
          <div class="ready-pulse-ring"></div>
        </div>
      </div>
    </Transition>

    <!-- ==================== 暂停遮罩 ==================== -->
    <Transition name="overlay">
      <div v-if="state === 'paused' && countdownValue <= 0" class="pause-overlay">
        <div class="pause-card">
          <div class="pause-icon">⏸</div>
          <h2 class="pause-title">已暂停</h2>
          <div class="pause-stats-row">
            <span>🎯 {{ stats.score }} 分</span>
            <span>🔥 {{ stats.combo }}x 连击</span>
          </div>
          <div class="pause-actions">
            <button class="btn primary large" @click="handleResume">▶ 继续游戏</button>
            <button class="btn ghost" @click="handleQuitFromPause">🏠 结束并返回</button>
          </div>
        </div>
      </div>
    </Transition>

    <!-- ==================== 倒计时遮罩 ==================== -->
    <Transition name="overlay">
      <div v-if="countdownValue > 0" class="countdown-overlay">
        <div class="countdown-number" :key="countdownValue">{{ countdownValue }}</div>
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
          :disabled="state === 'playing' || state === 'ready' || state === 'paused'"
          @change="onPackChange"
        >
          <option v-for="p in availablePacks" :key="p.id" :value="p.id">{{ p.name }}</option>
        </select>
        <!-- 检测器切换 -->
        <div class="detector-toggle" :class="{ disabled: state === 'playing' || state === 'ready' || state === 'paused' }">
          <button class="toggle-btn" :class="{ active: detectorMode === 'ml' }"
            :disabled="state === 'playing' || state === 'ready' || state === 'paused'" @click="switchDetector('ml')">CNN</button>
          <button class="toggle-btn" :class="{ active: detectorMode === 'mfcc' }"
            :disabled="state === 'playing' || state === 'ready' || state === 'paused'" @click="switchDetector('mfcc')">MFCC</button>
        </div>
        <span class="pill" :class="isListening ? 'on' : 'off'">
          {{ isListening ? '🎤' : '🔇' }}
        </span>
      </div>
    </header>

    <!-- ==================== 特效层 ==================== -->
    <!-- 暗角 -->
    <div class="vignette-layer" :style="vignetteStyle"></div>

    <!-- ==================== 主区域 ==================== -->
    <main class="game-main" :style="mainStyle">
      <!-- 神猫动态光背景 -->
      <Transition name="aurora-fade">
        <div v-if="showAurora" class="main-aurora">
          <div class="main-aurora-ring ring-1"></div>
          <div class="main-aurora-ring ring-2"></div>
          <div class="main-aurora-ring ring-3"></div>
        </div>
      </Transition>

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
      <section class="sprite-area" :style="spriteAreaStyle">
        <!-- 粒子层（猫之下、背景之上） -->
        <canvas ref="particleCanvas" class="particle-layer"></canvas>
        <!-- 残影层 -->
        <img
          v-for="(trail, ti) in trailFrames"
          :key="'trail-' + ti"
          :src="trail.src"
          class="sprite-trail"
          :style="trailStyle(ti)"
          alt=""
        />
        <!-- 主精灵 -->
        <div
          class="sprite-container"
          :class="{ faint: isFainting }"
          :style="spriteContainerStyle"
        >
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
        <div class="sequence-window">
          <TransitionGroup name="seq-slide" tag="div" class="sequence-track">
            <span
              v-for="item in visibleSequence"
              :key="item.key"
              class="seq-dot"
              :class="{
                active: item.isCurrent,
                done: item.isPast
              }"
            >{{ item.vowel }}</span>
          </TransitionGroup>
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
      <button class="btn primary" :disabled="state === 'playing' || state === 'ready' || state === 'paused' || packLoading" @click="handleStart">
        {{ state === 'idle' ? '🎤 开始游戏' : '🔄 重新开始' }}
      </button>
      <button class="btn" :disabled="state !== 'playing' && state !== 'ready'" @click="handleStop">
        {{ state === 'ready' ? '✕ 取消' : '⏸ 暂停' }}
      </button>
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
import { isFuzzyMatch } from '@/config/vowels';
import type { InterruptReason, Vowel, VowelDetectorHookReturn, VowelDetectionResult } from '@/types/game';

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
const detectorMode = ref<DetectorMode>('mfcc');
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
const { stats, state, snapshot, startGame, pauseGame, resumeGame, interrupt, reset: resetGame } = game;

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

// ==================== 序列滑动窗口 ====================
const SEQ_PAST_COUNT = 2;    // 左侧已发过的音数
const SEQ_FUTURE_COUNT = 4;  // 右侧即将发的音数

interface SeqWindowItem {
  vowel: string;
  key: string;         // 唯一 key（含循环计数，避免 TransitionGroup 复用）
  isCurrent: boolean;
  isPast: boolean;
}

const visibleSequence = computed<SeqWindowItem[]>(() => {
  const seq = packSequence.value;
  if (seq.length === 0) return [];
  const idx = stats.value.sequenceIndex;
  const cycles = stats.value.perfectCycles;
  const len = seq.length;
  const items: SeqWindowItem[] = [];

  for (let offset = -SEQ_PAST_COUNT; offset <= SEQ_FUTURE_COUNT; offset++) {
    const rawPos = idx + offset;
    // 计算实际循环和序列内位置
    let cycleNum = cycles;
    let seqPos = rawPos;
    if (rawPos < 0) {
      // 上一轮循环
      seqPos = ((rawPos % len) + len) % len;
      cycleNum = cycles - 1;
    } else if (rawPos >= len) {
      seqPos = rawPos % len;
      cycleNum = cycles + Math.floor(rawPos / len);
    }
    items.push({
      vowel: seq[seqPos],
      key: `c${cycleNum}-i${seqPos}-o${offset}`,
      isCurrent: offset === 0,
      isPast: offset < 0
    });
  }
  return items;
});

// ==================== 精灵动画 ====================
const currentFrameIndex = ref(0);
const animationSpeedRatio = ref(1);           // 平滑后的速率比
const rawSpeedRatio = ref(1);                 // 原始速率比
const SMOOTH_FACTOR = 0.15;                    // EMA 平滑系数
let animationRAF = 0;
let lastFrameTime = 0;
let frameAccumulator = 0;

const stageConfig = computed(() => getStageVisualConfig(game.currentStage.value));

/** 神猫阶段(5)启用极光背景 */
const showAurora = computed(() => state.value === 'playing' && game.currentStage.value === 5);

// ==================== 视觉特效 ====================

/** 震动系统：每次发音触发一次冲击，快速衰减 */
const shakeOffset = ref({ x: 0, y: 0 });
let shakeRAF = 0;
let shakeEnergy = 0;            // 当前震动能量 (0-1)
const SHAKE_DECAY = 0.88;       // 每帧衰减系数（越小衰减越快）
const SHAKE_THRESHOLD = 0.005;  // 低于此值归零

/** 触发一次震动冲击 */
function triggerShake() {
  const intensity = stageConfig.value.screenEffects.shake;
  if (intensity <= 0 || state.value !== 'playing') return;
  // 叠加能量，但不超过 1
  shakeEnergy = Math.min(1, shakeEnergy + 0.6);
}

const mainStyle = computed(() => {
  const cfg = stageConfig.value;
  // 神猫阶段用深色底色，让内部 aurora 光效显现
  const isAurora = showAurora.value;
  const bg = state.value !== 'playing'
    ? 'linear-gradient(180deg, #0d1117 0%, #161b22 100%)'
    : isAurora
      ? 'radial-gradient(ellipse at center, #1a0a2e 0%, #0d0520 40%, #050210 100%)'
      : cfg.background.gradient;
  const sx = shakeOffset.value.x;
  const sy = shakeOffset.value.y;
  return {
    background: bg,
    transform: (sx || sy) ? `translate(${sx}px, ${sy}px)` : undefined,
    transition: state.value === 'playing' ? 'background 1.5s ease' : 'background 0.6s ease'
  };
});

function startShake() {
  function tick() {
    if (shakeEnergy > SHAKE_THRESHOLD && state.value === 'playing') {
      const intensity = stageConfig.value.screenEffects.shake;
      const amp = intensity * 300 * shakeEnergy;
      shakeOffset.value = {
        x: (Math.random() - 0.5) * 2 * amp,
        y: (Math.random() - 0.5) * 2 * amp
      };
      shakeEnergy *= SHAKE_DECAY;
    } else {
      shakeEnergy = 0;
      if (shakeOffset.value.x !== 0 || shakeOffset.value.y !== 0) {
        shakeOffset.value = { x: 0, y: 0 };
      }
    }
    shakeRAF = requestAnimationFrame(tick);
  }
  shakeRAF = requestAnimationFrame(tick);
}

function stopShake() {
  if (shakeRAF) { cancelAnimationFrame(shakeRAF); shakeRAF = 0; }
  shakeEnergy = 0;
  shakeOffset.value = { x: 0, y: 0 };
}

/** 暗角 */
const vignetteStyle = computed(() => {
  const v = stageConfig.value.screenEffects.vignette;
  if (v <= 0) return { opacity: '0' };
  return { opacity: String(v) };
});

/** 色差滤镜 (sprite) */
const chromaticStyle = computed(() => {
  const c = stageConfig.value.screenEffects.chromatic;
  if (c <= 0) return {};
  // c is ~0.002–0.01 → translate to px offset for text-shadow / drop-shadow trick
  // We'll use CSS filter trick via drop-shadow layers
  const px = c * 500; // 0.01 → 5px
  return {
    filter: `drop-shadow(${px}px 0 0 rgba(255,0,0,0.4)) drop-shadow(-${px}px 0 0 rgba(0,100,255,0.4))`
  };
});

/** 精灵区域样式 (position context for trails) */
const spriteAreaStyle = computed(() => {
  return { position: 'relative' as const };
});

// ==================== 残影 (trail) ====================
const MAX_TRAILS = 4;
const trailHistory = ref<HTMLImageElement[]>([]);
let trailInterval = 0;

const trailFrames = computed(() => {
  if (!stageConfig.value.cat.trailEffect || state.value !== 'playing') return [];
  return trailHistory.value;
});

function trailStyle(index: number) {
  const total = trailFrames.value.length;
  const opacity = 0.15 - index * (0.1 / MAX_TRAILS);
  const scale = stageConfig.value.cat.scale * (0.95 - index * 0.04);
  const offset = (index + 1) * 8;
  return {
    opacity: Math.max(0.03, opacity),
    transform: `scale(${scale}) translate(${offset}px, ${offset}px)`,
    position: 'absolute' as const,
    zIndex: total - index
  };
}

function startTrail() {
  trailHistory.value = [];
  trailInterval = window.setInterval(() => {
    const frame = displayFrame.value;
    if (!frame || !stageConfig.value.cat.trailEffect) {
      trailHistory.value = [];
      return;
    }
    trailHistory.value = [frame, ...trailHistory.value].slice(0, MAX_TRAILS);
  }, 80);
}

function stopTrail() {
  if (trailInterval) { clearInterval(trailInterval); trailInterval = 0; }
  trailHistory.value = [];
}

// ==================== 粒子系统 ====================
const particleCanvas = ref<HTMLCanvasElement | null>(null);
let particleRAF = 0;
let particles: Array<{ x: number; y: number; vx: number; vy: number; size: number; color: string; life: number }> = [];

function startParticles() {
  const canvas = particleCanvas.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  function resize() {
    if (!canvas) return;
    canvas.width = canvas.offsetWidth * devicePixelRatio;
    canvas.height = canvas.offsetHeight * devicePixelRatio;
  }
  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);

  /** 从中心生成一个粒子 */
  function spawnParticle(w: number, h: number, cfg: { speed: number; size: [number, number]; colors: string[] }) {
    const cx = w / 2;
    const cy = h / 2;
    const angle = Math.random() * Math.PI * 2;
    const speed = (0.5 + Math.random() * 1.5) * cfg.speed;
    const colors = cfg.colors.length > 0 ? cfg.colors : ['#ffffff'];
    return {
      x: cx + (Math.random() - 0.5) * 20 * devicePixelRatio,
      y: cy + (Math.random() - 0.5) * 20 * devicePixelRatio,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: cfg.size[0] + Math.random() * (cfg.size[1] - cfg.size[0]),
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 0.4 + Math.random() * 0.6
    };
  }

  function tick() {
    if (!canvas || !ctx) return;
    const cfg = stageConfig.value.background.particles;
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    if (!cfg.enabled || state.value !== 'playing') {
      particles = [];
      particleRAF = requestAnimationFrame(tick);
      return;
    }

    // spawn to target count
    while (particles.length < cfg.count) {
      particles.push(spawnParticle(w, h, cfg));
    }
    if (particles.length > cfg.count) particles.length = cfg.count;

    // update & draw
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.005;

      if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
        // respawn from center
        const np = spawnParticle(w, h, cfg);
        p.x = np.x; p.y = np.y;
        p.vx = np.vx; p.vy = np.vy;
        p.size = np.size; p.color = np.color;
        p.life = np.life;
        continue;
      }

      const r = p.size * devicePixelRatio;
      ctx.globalAlpha = Math.min(1, p.life * 2);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    particleRAF = requestAnimationFrame(tick);
  }

  particleRAF = requestAnimationFrame(tick);
}

function stopParticles() {
  if (particleRAF) { cancelAnimationFrame(particleRAF); particleRAF = 0; }
  particles = [];
  const canvas = particleCanvas.value;
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx?.clearRect(0, 0, canvas.width, canvas.height);
  }
}

// ==================== 猫晕倒动画 ====================
const isFainting = ref(false);

// ==================== 预备状态（等待首音） ====================
/** 序列第一个元音（用于 ready 界面提示） */
const readyVowel = computed(() => {
  const seq = packSequence.value;
  return seq.length > 0 ? seq[0] : 'U';
});

/** 在 ready 状态下监听首元音以正式开始 */
function setupReadyTrigger() {
  const onVowelForReady = (vowel: string, result?: VowelDetectionResult, mode?: DetectorMode) => {
    if (state.value !== 'ready') return;
    if (vowel === 'silence') return;
    if (mode && mode !== detectorMode.value) return;
    if (!result || result.status !== 'detected') return;
    if (result.confidence < 0.5) return;
    if (result.volume < -45) return;
    // 检查是否为序列第一个元音（允许模糊匹配）
    const expected = readyVowel.value as Vowel;
    if (vowel !== expected && !isFuzzyMatch(expected, vowel as Vowel)) return;
    // 正式开始
    startGame();
  };

  mlDetector.onVowelDetected((vowel, result) => onVowelForReady(vowel, result, 'ml'));
  mfccDetector.onVowelDetected((vowel, result) => onVowelForReady(vowel, result, 'mfcc'));
}

/** 每帧基础持续时间 (ms)：总音节时长 / 循环帧数 */
const baseFrameDuration = computed(() => {
  const pack = loadedPack.value;
  if (!pack || pack.animationFrames.length === 0) return 100;
  return (pack.totalSyllableDuration * 1000) / pack.animationFrames.length;
});

/** 当前显示的帧图片 */
const IDLE_SPEED_THRESHOLD = 0.08; // 速率低于此值显示静止帧

const displayFrame = computed(() => {
  const pack = loadedPack.value;
  if (!pack) return null;
  if (state.value !== 'playing') return pack.idleFrame;
  if (pack.animationFrames.length === 0) return pack.idleFrame;
  // 速率过低 → 显示静止帧
  if (animationSpeedRatio.value < IDLE_SPEED_THRESHOLD) return pack.idleFrame;
  return pack.animationFrames[currentFrameIndex.value % pack.animationFrames.length];
});

/** 精灵旋转角度（JS 驱动，与速率联动） */
const spriteRotation = ref(0);

/** 精灵容器样式 (旋转) */
const spriteContainerStyle = computed(() => {
  if (state.value !== 'playing') return {};
  return {
    transform: `rotate(${spriteRotation.value}deg)`
  };
});

/** 精灵图片样式 */
const spriteStyle = computed(() => {
  const cfg = stageConfig.value;
  return {
    transform: `scale(${cfg.cat.scale})`,
    ...chromaticStyle.value
  };
});

/** 速度衰减：用户停止发音后速率指数衰减至 0 */
let lastVowelInputTime = 0;
const SPEED_DECAY_DELAY = 400;   // 停止发音后多久开始衰减 (ms)
const SPEED_DECAY_FACTOR = 0.92; // 每帧衰减系数

/** 帧动画循环 */
function startAnimation() {
  lastFrameTime = performance.now();
  frameAccumulator = 0;
  currentFrameIndex.value = 0;
  spriteRotation.value = 0;

  function tick(now: number) {
    const dt = now - lastFrameTime;
    lastFrameTime = now;

    // 检查是否需要衰减速率（停止发音后延迟衰减）
    const timeSinceInput = now - lastVowelInputTime;
    if (lastVowelInputTime > 0 && timeSinceInput > SPEED_DECAY_DELAY) {
      rawSpeedRatio.value *= SPEED_DECAY_FACTOR;
      if (rawSpeedRatio.value < 0.01) rawSpeedRatio.value = 0;
    }

    // 平滑速率更新 (EMA)
    animationSpeedRatio.value += (rawSpeedRatio.value - animationSpeedRatio.value) * SMOOTH_FACTOR;
    if (animationSpeedRatio.value < 0.01) animationSpeedRatio.value = 0;

    // 旋转角度更新（基于阶段配置转速 × 速率比）
    const rotSpeed = stageConfig.value.cat.rotationSpeed; // deg/s
    const degreesPerFrame = rotSpeed * animationSpeedRatio.value * (dt / 1000);
    spriteRotation.value = (spriteRotation.value + degreesPerFrame) % 360;

    // 帧动画：速率足够高时推进帧
    if (animationSpeedRatio.value >= IDLE_SPEED_THRESHOLD) {
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

/** 播放指定序列位置的 syllable 音频 (带阶段变调) */
function playExpectedSyllable(seqIndex: number) {
  resPack.playSyllable(seqIndex, stageConfig.value.audio.sfxPitch);
}

// 监听 sequenceIndex 变化 → 播放对应音节 + 计算速度比
watch(
  () => stats.value.sequenceIndex,
  (newIdx) => {
    if (state.value !== 'playing') return;

    // 播放新的期望音节（允许叠加）
    playExpectedSyllable(newIdx);

    // 触发震动冲击
    triggerShake();

    // 记录最近发音时间（用于速度衰减）
    const now = performance.now();
    lastVowelInputTime = now;
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
    case 'manual': return '手动结束';
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
    isFainting.value = false;
    if (oldState === 'paused') {
      // 从暂停恢复 — 重启动画 & 特效，但不重置速度等
      startAnimation();
      startShake();
      startTrail();
      lastVowelInputTime = performance.now();
    } else {
      // 全新开始
      startAnimation();
      startShake();
      startParticles();
      startTrail();
      playExpectedSyllable(stats.value.sequenceIndex);
      lastPlayerVowelTime = 0;
      lastVowelInputTime = performance.now();
      playerIntervals = [];
      rawSpeedRatio.value = 1;
      animationSpeedRatio.value = 1;
    }
  }
  if (newState !== 'playing' && oldState === 'playing') {
    stopAnimation();
    stopShake();
    stopTrail();
  }
  if (newState === 'paused' && oldState === 'playing') {
    // 暂停：停止特效，不晕倒，不停检测器（倒计时恢复后继续用）
  }
  if (newState === 'interrupted') {
    if (oldState === 'playing') {
      isFainting.value = true;
    }
    activeDetector.value.stop();
    // 清理倒计时（从 handleQuitFromPause 路径）
    if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = 0; }
    countdownValue.value = 0;
  }
});

game.onComboBreak((_combo, reason) => {
  lastInterruptReason.value = reason;
});

// ==================== 用户操作 ====================
const switchDetector = (mode: DetectorMode) => {
  if (mode === detectorMode.value || state.value === 'playing' || state.value === 'ready' || state.value === 'paused') return;
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
    // 进入 ready 状态 → 启动检测器 → 等待玩家发出首音
    state.value = 'ready';
    lastInterruptReason.value = null;
    await activeDetector.value.start();
  } catch (err) {
    console.error('启动失败', err);
  }
};

// ==================== 暂停 & 倒计时 ====================
const countdownValue = ref(0);
let countdownTimer = 0;

const handleStop = () => {
  if (state.value === 'ready') {
    // ready 状态取消 → 回到 idle
    activeDetector.value.stop();
    resetGame();
    lastInterruptReason.value = null;
    return;
  }
  // playing → paused
  pauseGame();
};

const handleResume = () => {
  if (state.value !== 'paused') return;
  // 开始 3 秒倒计时
  countdownValue.value = 3;
  if (countdownTimer) clearInterval(countdownTimer);
  countdownTimer = window.setInterval(() => {
    countdownValue.value--;
    if (countdownValue.value <= 0) {
      clearInterval(countdownTimer);
      countdownTimer = 0;
      // 恢复游戏
      resumeGame();
    }
  }, 1000);
};

const handleQuitFromPause = () => {
  // 从暂停彻底退出
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = 0; }
  countdownValue.value = 0;
  activeDetector.value.stop();
  // 先恢复 playing 以便 interrupt 能创建快照
  if (state.value === 'paused') {
    state.value = 'playing';
  }
  lastInterruptReason.value = 'manual';
  interrupt('manual');
};

const handleRestart = async () => {
  isFainting.value = false;
  resetGame();
  try {
    activeDetector.value.stop();
    // 进入 ready 状态等待首音
    state.value = 'ready';
    lastInterruptReason.value = null;
    await activeDetector.value.start();
  } catch (err) {
    console.error('重新启动失败', err);
  }
};

const handleBackToIdle = () => {
  isFainting.value = false;
  activeDetector.value.stop();
  resetGame();
  lastInterruptReason.value = null;
};

// ==================== 初始化 ====================
setupReadyTrigger();

onMounted(async () => {
  await resPack.fetchAvailablePacks();
  try { await resPack.loadPack(currentPackId.value); } catch { /* handled */ }
  startParticles(); // 初始化 canvas（idle 时不渲染粒子）
});

onUnmounted(() => {
  stopAnimation();
  stopShake();
  stopParticles();
  stopTrail();
  if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = 0; }
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
  position: relative;
}

/* ==================== 特效层 ==================== */
.particle-layer {
  position: absolute; inset: -50%; z-index: 0;
  width: 200%; height: 200%;
  pointer-events: none;
}
.vignette-layer {
  position: fixed; inset: 0; z-index: 2;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.8) 100%);
  transition: opacity 0.5s ease;
}

.game-header, .game-main, .game-footer { position: relative; z-index: 3; }

/* ==================== 残影 ==================== */
.sprite-trail {
  max-width: 100%; max-height: 100%;
  object-fit: contain;
  pointer-events: none;
  transition: opacity 0.15s ease;
  position: relative; z-index: 1;
}

/* ==================== 猫晕倒 ==================== */
.sprite-container.faint {
  animation: faint-fall 0.8s ease-in forwards !important;
}
@keyframes faint-fall {
  0%   { transform: rotate(0deg) scale(1); opacity: 1; filter: none; }
  30%  { transform: rotate(15deg) scale(1.05); opacity: 1; }
  100% { transform: rotate(90deg) scale(0.7) translateY(60px); opacity: 0.3; filter: grayscale(0.8); }
}

/* ==================== 发声重启提示 ==================== */
.voice-restart-hint {
  margin-top: 14px;
  font-size: 12px; color: #8b949e;
  animation: hint-pulse 2s ease-in-out infinite;
}
@keyframes hint-pulse {
  0%, 100% { opacity: 0.5; }
  50% { opacity: 1; }
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
  border-radius: 0;
  will-change: background, transform;
  position: relative;
  overflow: hidden;
}

/* ==================== 神猫动态光背景 ==================== */
.main-aurora {
  position: absolute; inset: -60%; z-index: 0;
  width: 220%; height: 220%;
  pointer-events: none;
}
.main-aurora-ring {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  will-change: transform, opacity;
}
.main-aurora-ring.ring-1 {
  background: conic-gradient(
    from 0deg,
    rgba(255,107,107,0.5),
    rgba(254,202,87,0.4),
    rgba(72,219,251,0.45),
    rgba(255,159,243,0.4),
    rgba(84,160,255,0.45),
    rgba(255,107,107,0.5)
  );
  filter: blur(50px);
  mix-blend-mode: screen;
  animation: main-aurora-spin 8s linear infinite;
}
.main-aurora-ring.ring-2 {
  inset: 15%;
  background: conic-gradient(
    from 180deg,
    rgba(84,160,255,0.45),
    rgba(95,39,205,0.35),
    rgba(0,210,211,0.5),
    rgba(254,202,87,0.35),
    rgba(255,107,107,0.4),
    rgba(84,160,255,0.45)
  );
  filter: blur(70px);
  mix-blend-mode: screen;
  animation: main-aurora-spin-rev 12s linear infinite;
}
.main-aurora-ring.ring-3 {
  inset: 25%;
  background: radial-gradient(
    ellipse at center,
    rgba(255,255,255,0.15) 0%,
    rgba(255,159,243,0.2) 30%,
    rgba(72,219,251,0.1) 60%,
    transparent 80%
  );
  filter: blur(40px);
  animation: main-aurora-pulse 5s ease-in-out infinite;
}

@keyframes main-aurora-spin {
  from { transform: rotate(0deg) scale(1); }
  50%  { transform: rotate(180deg) scale(1.08); }
  to   { transform: rotate(360deg) scale(1); }
}
@keyframes main-aurora-spin-rev {
  from { transform: rotate(0deg) scale(1.05); }
  50%  { transform: rotate(-180deg) scale(0.92); }
  to   { transform: rotate(-360deg) scale(1.05); }
}
@keyframes main-aurora-pulse {
  0%, 100% { transform: scale(1); opacity: 0.6; }
  50%      { transform: scale(1.15); opacity: 1; }
}

.aurora-fade-enter-active { transition: opacity 1.5s ease; }
.aurora-fade-leave-active { transition: opacity 0.8s ease; }
.aurora-fade-enter-from,
.aurora-fade-leave-to { opacity: 0; }

/* ==================== 分数面板 ==================== */
.score-strip {
  display: flex; justify-content: center; gap: 24px;
  padding: 10px 20px;
  flex-shrink: 0;
  position: relative; z-index: 1;
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
  position: relative; z-index: 1;
}
.sprite-container {
  max-width: 360px; max-height: 360px;
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  position: relative; z-index: 2;
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
  position: relative; z-index: 1;
}
.sequence-window {
  display: flex; justify-content: center;
  margin-bottom: 12px;
  overflow: hidden;
}
.sequence-track {
  display: flex; gap: 6px;
  position: relative;
}
.seq-dot {
  width: 36px; height: 36px;
  display: flex; align-items: center; justify-content: center;
  border-radius: 8px; font-size: 14px; font-weight: 600;
  background: rgba(255,255,255,0.06);
  color: rgba(255,255,255,0.35);
  flex-shrink: 0;
  transition: background 0.25s, color 0.25s, transform 0.25s, box-shadow 0.25s, opacity 0.25s;
}
.seq-dot.done {
  background: rgba(76,212,164,0.15);
  color: rgba(76,212,164,0.55);
  opacity: 0.7;
}
.seq-dot.active {
  background: rgba(255,205,86,0.5);
  color: #1a1a2e;
  transform: scale(1.25);
  box-shadow: 0 0 14px rgba(255,205,86,0.5);
}
/* TransitionGroup 动画 */
.seq-slide-enter-active,
.seq-slide-leave-active {
  transition: all 0.3s ease;
}
.seq-slide-enter-from {
  opacity: 0; transform: translateX(20px) scale(0.6);
}
.seq-slide-leave-to {
  opacity: 0; transform: translateX(-20px) scale(0.6);
}
.seq-slide-leave-active {
  position: absolute;
}
.seq-slide-move {
  transition: transform 0.3s ease;
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

/* ==================== 预备遮罩 ==================== */
.ready-overlay {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);
}
.ready-card {
  text-align: center; position: relative;
}
.ready-icon {
  font-size: 64px; margin-bottom: 12px;
  animation: ready-bounce 1.5s ease-in-out infinite;
}
.ready-title {
  font-size: 28px; font-weight: 700; letter-spacing: 4px;
  margin-bottom: 12px;
}
.ready-hint {
  font-size: 16px; color: #8b949e;
}
.ready-hint strong {
  font-size: 24px; color: #58a6ff;
  display: inline-block; margin: 0 4px;
}
.ready-pulse-ring {
  position: absolute;
  top: 50%; left: 50%;
  transform: translate(-50%, -50%);
  width: 120px; height: 120px;
  border-radius: 50%;
  border: 2px solid rgba(88,160,255,0.4);
  animation: pulse-ring 2s ease-out infinite;
  pointer-events: none;
}
@keyframes ready-bounce {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-12px); }
}
@keyframes pulse-ring {
  0% { width: 80px; height: 80px; opacity: 1; }
  100% { width: 200px; height: 200px; opacity: 0; }
}

/* ==================== 暂停遮罩 ==================== */
.pause-overlay {
  position: fixed; inset: 0; z-index: 100;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.7); backdrop-filter: blur(8px);
}
.pause-card {
  text-align: center;
  background: linear-gradient(145deg, rgba(22,27,34,0.97), rgba(13,17,23,0.99));
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 24px; padding: 36px 32px;
  max-width: 360px; width: calc(100% - 32px);
  box-shadow: 0 24px 64px rgba(0,0,0,0.5);
}
.pause-icon { font-size: 52px; margin-bottom: 8px; }
.pause-title {
  font-size: 26px; font-weight: 700;
  letter-spacing: 3px; margin-bottom: 16px;
}
.pause-stats-row {
  display: flex; justify-content: center; gap: 20px;
  font-size: 14px; color: #8b949e; margin-bottom: 28px;
}
.pause-actions {
  display: flex; flex-direction: column; gap: 10px;
}

/* ==================== 倒计时遮罩 ==================== */
.countdown-overlay {
  position: fixed; inset: 0; z-index: 150;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(4px);
}
.countdown-number {
  font-size: 120px; font-weight: 800;
  color: #fff;
  text-shadow: 0 0 40px rgba(88,160,255,0.6), 0 0 80px rgba(163,113,247,0.3);
  animation: countdown-pop 1s ease-out;
}
@keyframes countdown-pop {
  0% { transform: scale(2); opacity: 0; }
  30% { transform: scale(0.9); opacity: 1; }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); opacity: 1; }
}

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
  width: 30px; height: 30px; font-size: 12px; border-radius: 6px;
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
