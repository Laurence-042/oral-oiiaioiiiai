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
      <div v-if="state === 'interrupted'" class="result-overlay">
        <!-- 扇形卡片轮播 -->
        <CardFan
          :count="fanCardCount"
          :initialIndex="fanActiveIndex"
          @update:activeIndex="(i: number) => fanActiveIndex = i"
        >
          <!-- 卡片 0: 分享图 -->
          <template #card-0>
            <div class="fan-card-inner card-share">
              <img v-if="shareImageUrl" :src="shareImageUrl" class="card-full-img" alt="分享图片" draggable="true" />
              <div v-else class="card-placeholder">生成中…</div>
            </div>
          </template>

          <!-- 卡片 1: 结算卡 -->
          <template #card-1>
            <div class="fan-card-inner card-result">
              <div class="result-icon">{{ interruptIcon }}</div>
              <h2 class="result-title">{{ interruptTitle }}</h2>
              <p class="result-subtitle">{{ interruptSubtitle }}</p>
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

              <!-- 排行榜提交（内嵌在结算卡中） -->
              <div v-if="leaderboard.isAvailable.value" class="lb-submit-section">
                <div v-if="leaderboard.submitResult.value" class="lb-submitted">
                  <span>✅ 已上榜！{{ leaderboard.submitResult.value.rank ? `第 ${leaderboard.submitResult.value.rank} 名` : '' }}</span>
                </div>
                <div v-else class="lb-submit-row">
                  <input
                    v-model="leaderboard.nickname.value"
                    class="lb-nickname-input"
                    type="text"
                    maxlength="20"
                    placeholder="输入昵称上榜…"
                    @keydown.enter="handleSubmitScore"
                  />
                  <button
                    class="btn primary"
                    :disabled="leaderboard.submitting.value || !leaderboard.nickname.value.trim()"
                    @click="handleSubmitScore"
                  >
                    {{ leaderboard.submitting.value ? '…' : '🏆' }}
                  </button>
                </div>
                <p v-if="leaderboard.error.value" class="lb-error">{{ leaderboard.error.value }}</p>
              </div>
            </div>
          </template>

          <!-- 卡片 2: 排行榜 -->
          <template v-if="leaderboard.isAvailable.value" #card-2>
            <div class="fan-card-inner card-leaderboard">
              <h3 class="lb-card-title">🏆 排行榜</h3>

              <!-- 全局统计 -->
              <div v-if="leaderboard.globalStats.value" class="lb-card-stats">
                <span>{{ leaderboard.globalStats.value.totalPlays }} 人{{ loadedPack?.textConfig?.leaderboardText?.participateVerb ?? '参与' }}</span>
                <span>·</span>
                <span>累计{{ loadedPack?.textConfig?.leaderboardText?.unit ?? 'OIIIA' }} {{ leaderboard.globalStats.value.totalOiiia.toLocaleString() }} 次</span>
              </div>

              <div v-if="leaderboard.loading.value" class="lb-card-loading">
                <div class="spinner"></div>
              </div>
              <div v-else-if="leaderboard.scores.value.length === 0" class="lb-card-empty">
                还没有人上榜 🐱
              </div>
              <div v-else class="lb-card-list">
                <div
                  v-for="(entry, idx) in leaderboard.scores.value.slice(0, 15)"
                  :key="entry.id"
                  class="lb-card-row"
                  :class="{ gold: idx === 0, silver: idx === 1, bronze: idx === 2 }"
                >
                  <span class="lb-card-rank">{{ idx === 0 ? '👑' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : (idx + 1) }}</span>
                  <span class="lb-card-name">{{ entry.name }}</span>
                  <span class="lb-card-score">{{ entry.score.toLocaleString() }}</span>
                </div>
              </div>
            </div>
          </template>

          <!-- 卡片 3+: 高光时刻 -->
          <template v-for="(hl, hi) in hlMoments.highlights.value" :key="hl.id" #['card-'+(hi+hlCardStart)]>
            <div class="fan-card-inner card-highlight">
              <img
                v-if="highlightImageUrls[hi]"
                :src="highlightImageUrls[hi]"
                class="card-full-img"
                :alt="hl.label"
                draggable="true"
              />
              <div v-else class="card-placeholder">
                <span>{{ hl.label }}</span>
              </div>
            </div>
          </template>
        </CardFan>

        <!-- 操作按钮 (在扇形卡片下方) -->
        <div class="result-actions">
          <p class="share-hint">👆 左右滑动查看更多 · 长按图片保存分享</p>
          <button class="btn primary large" @click="handleRestart">🔄 再来一次</button>
          <button class="btn ghost" @click="handleBackToIdle">返回首页</button>
        </div>
      </div>
    </Transition>

    <!-- ==================== 高光弹出提示 ==================== -->
    <TransitionGroup name="hl-toast" tag="div" class="hl-toast-container">
      <div
        v-for="toast in hlMoments.toasts.value"
        :key="toast.id"
        class="hl-toast"
        :class="toast.reason"
      >
        {{ toast.label }}
      </div>
    </TransitionGroup>

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
        <div class="detector-toggle-wrap">
          <div class="detector-toggle" :class="{ disabled: state === 'playing' || state === 'ready' || state === 'paused' }">
            <button class="toggle-btn" :class="{ active: detectorMode === 'ml' }"
              :disabled="state === 'playing' || state === 'ready' || state === 'paused'" @click="switchDetector('ml')">CNN</button>
            <button class="toggle-btn" :class="{ active: detectorMode === 'mfcc' }"
              :disabled="state === 'playing' || state === 'ready' || state === 'paused'" @click="switchDetector('mfcc')">MFCC</button>
          </div>
          <div class="detector-tip" tabindex="0"
            @mouseenter="positionTip" @focus="positionTip">
            <span class="tip-icon">?</span>
            <div class="tip-popup" ref="tipPopupRef">
              <p><strong>MFCC</strong>：延迟低，安静环境推荐</p>
              <p><strong>CNN</strong>：抗噪更强，但延迟较高，安静时识别不如 MFCC</p>
            </div>
          </div>
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
import { useDynamicBGM } from '@/composables/useDynamicBGM';
import { useShareCapture, generateCopywriting } from '@/composables/useShareCapture';
import { useHighlights } from '@/composables/useHighlights';
import { renderHighlightCard } from '@/composables/useHighlightRenderer';
import { useLeaderboard } from '@/composables/useLeaderboard';
import CardFan from '@/components/CardFan.vue';
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

// tooltip 定位
const tipPopupRef = ref<HTMLDivElement | null>(null);
function positionTip(e: Event) {
  const trigger = e.currentTarget as HTMLElement;
  const popup = tipPopupRef.value;
  if (!trigger || !popup) return;
  const rect = trigger.getBoundingClientRect();
  const pw = 220; // tip-popup width
  let left = rect.right - pw;
  if (left < 8) left = 8;
  popup.style.top = `${rect.bottom + 8}px`;
  popup.style.left = `${left}px`;
}

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

// ==================== 动态 BGM ====================
const bgm = useDynamicBGM();

// ==================== 分享系统 ====================
const shareCapture = useShareCapture();
const hlMoments = useHighlights();
const shareImageUrl = ref<string | null>(null);
/** 高光卡片图片 URL 列表（与 hlMoments.highlights 一一对应） */
const highlightImageUrls = ref<string[]>([]);
/** 结算扇形卡当前索引 */
const fanActiveIndex = ref(0);
/** 结算扇形卡总数 */
const fanCardCount = computed(() => {
  // 分享图 + 结算卡 + 排行榜卡(可选) + 高光卡片数
  const lbCard = leaderboard.isAvailable.value ? 1 : 0;
  return 1 + 1 + lbCard + hlMoments.highlights.value.length;
});
/** 高光卡片起始索引（分享图+结算卡+排行榜卡） */
const hlCardStart = computed(() => leaderboard.isAvailable.value ? 3 : 2);

/** 生成所有高光卡片图片 */
async function generateHighlightCards() {
  const pack = loadedPack.value;
  if (!pack) return;
  const stageNames = pack.textConfig.stages?.map(s => s.name) ?? ['初醒', '躁动', '狂热', '超度', '神猫'];
  const urls: string[] = [];
  for (const hl of hlMoments.highlights.value) {
    try {
      const blob = await renderHighlightCard({
        moment: hl,
        spriteFrames: pack.animationFrames,
        stageNames,
      });
      if (blob) {
        urls.push(URL.createObjectURL(blob));
      } else {
        urls.push('');
      }
    } catch {
      urls.push('');
    }
  }
  // 清理旧的
  highlightImageUrls.value.forEach(u => { if (u) URL.revokeObjectURL(u); });
  highlightImageUrls.value = urls;
}

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

const leaderboard = useLeaderboard(currentPackId);

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

/** 最高阶段启用极光背景 */
const showAurora = computed(() => state.value === 'playing' && game.currentStage.value >= game.stageCount.value);

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
let particleEnergy = 0;             // 当前粒子能量 (0-1)
const PARTICLE_DECAY = 0.95;        // 每帧衰减
const PARTICLE_THRESHOLD = 0.01;    // 低于此值停止生成

/** 触发一次粒子爆发 */
function triggerParticles() {
  const cfg = stageConfig.value.background.particles;
  if (!cfg.enabled || state.value !== 'playing') return;
  particleEnergy = Math.min(1, particleEnergy + 0.5);
}

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
      particleEnergy = 0;
      particleRAF = requestAnimationFrame(tick);
      return;
    }

    // 能量衰减
    if (particleEnergy > PARTICLE_THRESHOLD) {
      particleEnergy *= PARTICLE_DECAY;
    } else {
      particleEnergy = 0;
    }

    // 根据能量比例生成新粒子（每帧最多生成 spawnBatch 个）
    const targetActive = Math.floor(cfg.count * particleEnergy);
    const spawnBatch = Math.min(targetActive - particles.length, Math.ceil(cfg.count * 0.15));
    for (let s = 0; s < spawnBatch; s++) {
      particles.push(spawnParticle(w, h, cfg));
    }

    // 更新 & 绘制（已生成的粒子自然消亡，不会重生）
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= 0.008;

      if (p.life <= 0 || p.x < -20 || p.x > w + 20 || p.y < -20 || p.y > h + 20) {
        particles.splice(i, 1);
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
    // 正式开始，并立即推进序列（首音直接算分，不需要重复发）
    startGame();
    game.processVowel(vowel as Vowel);
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

    // 触发震动 & 粒子冲击
    triggerShake();
    triggerParticles();

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

  // 同步 BGM BPM
  const bpm = 60000 / avgPlayerInterval;
  bgm.setBPM(bpm);
}

// ==================== 中断文案 ====================
const lastInterruptReason = ref<InterruptReason | null>(null);

const interruptCopy = computed(() => {
  const s = snapshot.value;
  if (!s) return { title: '游戏结束', subtitle: '' };
  const textCfg = resPack.loadedPack.value?.textConfig;
  return generateCopywriting(s, textCfg);
});

const interruptIcon = computed(() => {
  const s = snapshot.value;
  if (!s) return '😿';
  const maxStage = game.stageCount.value;
  if (s.perfectCycles >= 3) return '🏆';
  if (s.stage >= maxStage - 1) return '🔥';
  if (s.stage >= Math.ceil(maxStage * 0.4)) return '😸';
  return '🐱';
});

const interruptTitle = computed(() => interruptCopy.value.title);
const interruptSubtitle = computed(() => interruptCopy.value.subtitle);

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

// ==================== 统一复位 ====================
/** 完全重置一局游戏的运行时状态（不含检测器启停） */
function resetPlayState() {
  isFainting.value = false;

  // 速度 & 发音间隔
  lastPlayerVowelTime = 0;
  playerIntervals = [];
  rawSpeedRatio.value = 1;
  animationSpeedRatio.value = 1;

  // 高光
  hlMoments.clear();

  // 上一局的图片素材
  if (shareImageUrl.value) { URL.revokeObjectURL(shareImageUrl.value); shareImageUrl.value = null; }
  highlightImageUrls.value.forEach(u => { if (u) URL.revokeObjectURL(u); });
  highlightImageUrls.value = [];

  // 排行榜
  leaderboard.resetSubmit();

  // 游戏逻辑
  resetGame();
  lastInterruptReason.value = null;
}

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
      bgm.start();
    } else {
      // 全新开始
      startAnimation();
      startShake();
      startParticles();
      startTrail();
      playExpectedSyllable(stats.value.sequenceIndex);
      lastVowelInputTime = performance.now();
      // 启动 BGM
      bgm.setStage(game.currentStage.value);
      bgm.start();
    }
  }
  if (newState !== 'playing' && oldState === 'playing') {
    hlMoments.captureFinal(stats.value.score, stats.value.combo, game.currentStage.value);
    stopAnimation();
    stopShake();
    stopTrail();
    bgm.stop();
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

    // 自动生成分享图片 + 高光卡片
    const snap = snapshot.value;
    if (snap) {
      const textCfg = loadedPack.value?.textConfig;
      shareCapture.generateShareImage(snap, textCfg).then((blob) => {
        if (blob) {
          if (shareImageUrl.value) URL.revokeObjectURL(shareImageUrl.value);
          shareImageUrl.value = URL.createObjectURL(blob);
        }
      });
      generateHighlightCards();
      // 拉取排行榜数据
      leaderboard.fetchLeaderboard(15);
      leaderboard.fetchStats();
      fanActiveIndex.value = 1; // 默认显示结算卡
    }
  }
});

game.onComboBreak((_combo, reason) => {
  lastInterruptReason.value = reason;
});

// ==================== 高光时刻 ====================
game.onStageChange((_from, to) => {
  bgm.setStage(to);
  hlMoments.onStageUp(_from, to, stats.value.score, stats.value.combo);
});

game.onPerfectCycle((count) => {
  hlMoments.onPerfectCycle(count, stats.value.score, stats.value.combo, game.currentStage.value);
});

game.onScoreUpdate(() => {
  hlMoments.onComboUpdate(stats.value.combo, stats.value.score, game.currentStage.value);
  // 精准里程碑：基于累计正确发音数
  hlMoments.onAccuracyUpdate(stats.value.correctVowels, stats.value.score, game.currentStage.value);
  // 极速检测：利用最近的发音间隔
  if (playerIntervals.length >= 4) {
    const avgMs = playerIntervals.reduce((a, b) => a + b, 0) / playerIntervals.length;
    hlMoments.onSpeedUpdate(avgMs, playerIntervals.length, stats.value.score, stats.value.combo, game.currentStage.value);
  }
});

// ==================== 用户操作 ====================
const switchDetector = (mode: DetectorMode) => {
  if (mode === detectorMode.value || state.value === 'playing' || state.value === 'ready' || state.value === 'paused') return;
  activeDetector.value.stop();
  resetPlayState();
  detectorMode.value = mode;
};

async function onPackChange(e: Event) {
  const id = (e.target as HTMLSelectElement).value;
  if (id === currentPackId.value) return;
  try {
    await resPack.loadPack(id);
    // 切换资源包后重新拉取对应排行榜
    leaderboard.fetchLeaderboard(15);
    leaderboard.fetchStats();
  } catch { /* handled via resPack.error */ }
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
  resetPlayState();
  try {
    activeDetector.value.stop();
    state.value = 'ready';
    await activeDetector.value.start();
  } catch (err) {
    console.error('重新启动失败', err);
  }
};

const handleBackToIdle = () => {
  resetPlayState();
  activeDetector.value.stop();
};

/** 提交分数到排行榜 */
const handleSubmitScore = async () => {
  const snap = snapshot.value;
  if (!snap) return;
  const result = await leaderboard.submitScore(leaderboard.nickname.value, snap, stats.value);
  // 上榜成功后刷新排行榜数据
  if (result) {
    leaderboard.fetchLeaderboard(15);
    leaderboard.fetchStats();
  }
};

// ==================== 初始化 ====================
setupReadyTrigger();

onMounted(async () => {
  await resPack.fetchAvailablePacks();
  try { await resPack.loadPack(currentPackId.value); } catch { /* handled */ }
  startParticles(); // 初始化 canvas（idle 时不渲染粒子）

  // 初始化 BGM
  const pack = loadedPack.value;
  if (pack?.bgmConfig) {
    bgm.init(pack.bgmConfig);
  }
});

// 资源包切换时重新初始化 BGM + 文案配置
watch(loadedPack, (pack) => {
  if (pack?.bgmConfig) {
    bgm.init(pack.bgmConfig);
  }
  if (pack?.textConfig) {
    hlMoments.setTextConfig(pack.textConfig);
    game.setTextConfig(pack.textConfig);
  }
});

onUnmounted(() => {
  stopAnimation();
  stopShake();
  stopParticles();
  stopTrail();
  bgm.dispose();
  if (shareImageUrl.value) URL.revokeObjectURL(shareImageUrl.value);
  highlightImageUrls.value.forEach(u => { if (u) URL.revokeObjectURL(u); });
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

.game-header, .game-main, .game-footer { position: relative; }

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

.detector-toggle-wrap {
  display: flex; align-items: center; gap: 4px;
  position: relative;
}
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

/* tooltip */
.detector-tip {
  width: 16px; height: 16px; border-radius: 50%;
  background: rgba(255,255,255,0.1);
  color: rgba(255,255,255,0.45); font-size: 10px; font-weight: 700;
  display: flex; align-items: center; justify-content: center;
  cursor: help; flex-shrink: 0;
  border: 1px solid rgba(255,255,255,0.15);
}
.tip-popup {
  display: none;
  position: fixed;
  width: 220px; padding: 10px 12px;
  background: #1c2028; border: 1px solid rgba(255,255,255,0.12);
  border-radius: 8px; box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  font-size: 12px; line-height: 1.5; color: #c9d1d9;
  z-index: 200;
  pointer-events: none;
}
.tip-popup p { margin: 0 0 4px; }
.tip-popup p:last-child { margin-bottom: 0; }
.detector-tip:hover .tip-popup,
.detector-tip:focus .tip-popup { display: block; }

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
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 20px;
  background: rgba(0,0,0,0.75); backdrop-filter: blur(10px);
  padding: 20px 0;
  overflow: hidden;
}

/* ── 扇形卡片内容 ── */
.fan-card-inner {
  width: 100%; height: 100%;
  border-radius: 16px;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(22,27,34,0.97), rgba(13,17,23,0.99));
  border: 1px solid rgba(255,255,255,0.1);
  box-shadow: 0 16px 48px rgba(0,0,0,0.5);
}

.card-full-img {
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}

.card-placeholder {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  color: #6e7681; font-size: 14px;
}

/* 结算卡内部 */
.card-result {
  padding: 24px 20px;
  text-align: center;
  display: flex; flex-direction: column;
  overflow-y: auto;
  /* 让 pointer 事件穿透给 fan-track 处理拖拽 */
  touch-action: none;
}

.result-icon { font-size: 44px; margin-bottom: 4px; }
.result-title {
  font-size: 22px; font-weight: 700;
  letter-spacing: 2px; margin-bottom: 4px;
}
.result-subtitle {
  font-size: 13px; color: #8b949e; margin-bottom: 2px;
}
.result-reason { font-size: 11px; color: #6e7681; margin-bottom: 16px; }
.result-stats {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 8px;
}
.result-stat {
  background: rgba(255,255,255,0.04);
  border-radius: 10px; padding: 10px 8px;
}
.result-stat.main {
  grid-column: 1 / -1;
  background: rgba(88,160,255,0.1);
  border: 1px solid rgba(88,160,255,0.2);
  padding: 14px 8px;
}
.result-label {
  display: block; font-size: 10px; color: #8b949e;
  text-transform: uppercase; letter-spacing: 1px; margin-bottom: 3px;
}
.result-value { display: block; font-size: 18px; font-weight: 700; }
.result-stat.main .result-value { font-size: 28px; }

/* 操作按钮区 */
.result-actions {
  display: flex; flex-direction: column; gap: 10px;
  width: min(80vw, 320px);
  align-items: stretch;
}
.share-hint {
  font-size: 11px; color: #6e7681; text-align: center;
  animation: hint-fade 3s ease-in-out infinite;
}
@keyframes hint-fade {
  0%, 100% { opacity: 0.6; }
  50% { opacity: 1; }
}

/* 排行榜提交（结算卡内嵌） */
.lb-submit-section {
  display: flex; flex-direction: column; gap: 6px;
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.08);
}
.lb-submit-row {
  display: flex; gap: 8px;
}
.lb-nickname-input {
  flex: 1;
  padding: 8px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.06);
  color: #e6edf3;
  font-size: 14px;
  outline: none;
  min-width: 0;
}
.lb-nickname-input::placeholder { color: rgba(255,255,255,0.3); }
.lb-nickname-input:focus { border-color: rgba(255, 215, 0, 0.5); }
.lb-submitted {
  display: flex; align-items: center; justify-content: center; gap: 6px;
  padding: 4px;
  font-size: 13px; font-weight: 600;
  color: #3fb950;
}
.lb-error {
  font-size: 12px; color: #f85149; text-align: center; margin: 0;
}

/* 排行榜卡片 */
.card-leaderboard {
  padding: 16px 14px;
  display: flex; flex-direction: column;
  overflow-y: auto;
  touch-action: none;
}
.lb-card-title {
  font-size: 18px; font-weight: 700;
  text-align: center; margin-bottom: 4px;
}
.lb-card-stats {
  font-size: 11px; color: #8b949e;
  text-align: center; margin-bottom: 12px;
  display: flex; gap: 4px; justify-content: center;
}
.lb-card-loading, .lb-card-empty {
  flex: 1; display: flex; align-items: center; justify-content: center;
  color: #6e7681; font-size: 14px;
}
.lb-card-loading .spinner {
  width: 24px; height: 24px;
  border: 2px solid rgba(255,255,255,0.1);
  border-top-color: #ffd700;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.lb-card-list {
  display: flex; flex-direction: column; gap: 4px;
  flex: 1;
}
.lb-card-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 10px;
  border-radius: 8px;
  background: rgba(255,255,255,0.03);
  font-size: 13px;
}
.lb-card-row.gold { background: rgba(255,215,0,0.08); }
.lb-card-row.silver { background: rgba(192,192,192,0.06); }
.lb-card-row.bronze { background: rgba(205,127,50,0.06); }
.lb-card-rank { min-width: 24px; text-align: center; font-size: 14px; }
.lb-card-name {
  flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-weight: 500;
}
.lb-card-score {
  font-weight: 700; color: #ffd700;
  font-variant-numeric: tabular-nums;
}

/* ==================== 高光弹出提示 ==================== */
.hl-toast-container {
  position: fixed;
  top: 50%; left: 50%;
  transform: translate(-50%, -120%);
  z-index: 90;
  display: flex; flex-direction: column-reverse;
  align-items: center; gap: 8px;
  pointer-events: none;
}
.hl-toast {
  padding: 8px 18px;
  border-radius: 20px;
  background: rgba(13,17,23,0.9);
  border: 1px solid rgba(255,255,255,0.15);
  color: #e6edf3;
  font-size: 14px; font-weight: 600;
  white-space: nowrap;
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  backdrop-filter: blur(6px);
}
.hl-toast.stage-up { border-color: rgba(163,113,247,0.4); color: #d2a8ff; }
.hl-toast.combo-milestone { border-color: rgba(255,123,114,0.4); color: #ffa198; }
.hl-toast.perfect-cycle { border-color: rgba(88,166,255,0.4); color: #79c0ff; }
.hl-toast.speed-burst { border-color: rgba(254,202,87,0.4); color: #feca57; }
.hl-toast.accuracy-streak { border-color: rgba(72,219,251,0.4); color: #48dbfb; }

.hl-toast-enter-active {
  transition: all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
}
.hl-toast-leave-active {
  transition: all 0.5s ease;
}
.hl-toast-enter-from {
  opacity: 0; transform: translateY(30px) scale(0.8);
}
.hl-toast-leave-to {
  opacity: 0; transform: translateY(-20px) scale(0.9);
}

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
.overlay-enter-active .card-fan {
  transition: transform 0.35s cubic-bezier(0.16,1,0.3,1), opacity 0.3s ease;
}
.overlay-leave-active { transition: opacity 0.2s ease; }
.overlay-leave-active .card-fan {
  transition: transform 0.2s ease, opacity 0.2s ease;
}
.overlay-enter-from { opacity: 0; }
.overlay-enter-from .card-fan {
  opacity: 0; transform: scale(0.92) translateY(20px);
}
.overlay-leave-to { opacity: 0; }
.overlay-leave-to .card-fan {
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

.mobile .result-title { font-size: 22px; }
.mobile .result-stats { gap: 8px; }
.mobile .result-stat { padding: 10px 8px; }
.mobile .share-hint { font-size: 11px; }

.mobile .game-footer { padding: 10px 14px 16px; }
.mobile .btn { padding: 10px 16px; font-size: 13px; }
.mobile .btn.large { padding: 12px 20px; font-size: 15px; }

/* 横屏 PC: 让精灵区域更大 */
@media (min-width: 769px) and (orientation: landscape) {
  .sprite-container { max-width: 420px; max-height: 420px; }
  .score-strip { gap: 40px; }
}
</style>
