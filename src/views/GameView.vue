<template>
  <div class="game-view" :style="backgroundStyle">
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
            <button class="btn primary large" @click="handleRestart">
              🔄 再来一次
            </button>
            <button class="btn ghost" @click="handleBackToIdle">
              返回首页
            </button>
          </div>
        </div>
      </div>
    </Transition>

    <header class="game-header">
      <div class="title-block">
        <h1>OIIAIOIIIAI</h1>
        <p class="subtitle">对着猫叫，成为传说</p>
      </div>
      <div class="status-block">
        <div class="detector-toggle" :class="{ disabled: state === 'playing' }">
          <button
            class="toggle-btn" :class="{ active: detectorMode === 'ml' }"
            :disabled="state === 'playing'"
            @click="switchDetector('ml')"
          >CNN</button>
          <button
            class="toggle-btn" :class="{ active: detectorMode === 'mfcc' }"
            :disabled="state === 'playing'"
            @click="switchDetector('mfcc')"
          >MFCC</button>
        </div>
        <span class="pill" :class="gameState">{{ gameStateLabel }}</span>
        <span class="pill" :class="isListening ? 'on' : 'off'">
          {{ isListening ? '🎤 监听中' : '🎤 已停止' }}
        </span>
      </div>
    </header>

    <main class="game-main">
      <section class="score-panel">
        <div class="score-item">
          <div class="label">分数</div>
          <div class="value score">{{ stats.score }}</div>
        </div>
        <div class="score-item">
          <div class="label">连击</div>
          <div class="value">{{ stats.combo }}x</div>
        </div>
        <div class="score-item">
          <div class="label">阶段</div>
          <div class="value">{{ stats.stageName }}</div>
        </div>
        <div class="score-item">
          <div class="label">完美循环</div>
          <div class="value">{{ stats.perfectCycles }}</div>
        </div>
      </section>

      <section class="detector-panel">
        <div class="vowel-display" :class="{ active: confirmedVowel }">
          <span class="vowel-text">{{ confirmedVowel || '—' }}</span>
          <span class="vowel-label">当前识别</span>
        </div>

        <div class="detector-stats">
          <div class="stat">
            <span class="label">置信度</span>
            <div class="bar">
              <div class="fill" :style="{ width: `${(currentResult?.confidence ?? 0) * 100}%` }"></div>
            </div>
            <span class="value">{{ ((currentResult?.confidence ?? 0) * 100).toFixed(0) }}%</span>
          </div>
          <div class="stat">
            <span class="label">音量</span>
            <div class="bar volume">
              <div class="fill" :style="{ width: `${Math.max(0, (currentResult?.volume ?? -100) + 100)}%` }"></div>
            </div>
            <span class="value">{{ currentResult?.volume?.toFixed(1) ?? '--' }} dB</span>
          </div>
          <div class="stat">
            <span class="label">状态</span>
            <span class="value">{{ currentResult?.status ?? 'idle' }}</span>
          </div>
        </div>
      </section>

      <section class="sequence-panel">
        <div class="sequence-header">
          <h2>目标序列</h2>
          <div class="progress">
            <div class="progress-bar">
              <div class="progress-fill" :style="{ width: `${sequenceProgress * 100}%` }"></div>
            </div>
            <span>{{ Math.round(sequenceProgress * 100) }}%</span>
          </div>
        </div>

        <div class="sequence">
          <span
            v-for="(vowel, index) in sequence"
            :key="`${vowel}-${index}`"
            class="sequence-item"
            :class="{ active: index === stats.sequenceIndex }"
          >
            {{ hints[index] || vowel }}
          </span>
        </div>

        <div class="expected">
          <span class="label">下一发音</span>
          <span class="value">{{ expectedVowel || '—' }}</span>
        </div>
      </section>
    </main>

    <footer class="game-footer">
      <button
        class="btn primary"
        :disabled="state === 'playing'"
        @click="handleStart"
      >
        {{ state === 'idle' ? '开始游戏' : '重新开始' }}
      </button>
      <button class="btn" :disabled="state !== 'playing'" @click="handleStop">
        暂停
      </button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { computed, watch, ref } from 'vue';
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';
import { useVowelDetector } from '@/composables/useVowelDetector';
import { useGameState, connectVowelDetectorToGameState } from '@/composables/useGameState';
import { getTargetSequence, getPronunciationHints } from '@/config/vowels';
import { getStageVisualConfig } from '@/config/stages';
import type { InterruptReason, VowelDetectorHookReturn } from '@/types/game';

type DetectorMode = 'ml' | 'mfcc';

// 两个检测器都在 setup 阶段创建（composable 规则）
const mlDetector = useVowelDetectorML();
const mfccDetector = useVowelDetector();

const detectorMode = ref<DetectorMode>('ml');
const activeDetector = computed<VowelDetectorHookReturn>(() =>
  detectorMode.value === 'ml' ? mlDetector : mfccDetector
);

const game = useGameState();

// 连接两个检测器到游戏状态（回调内部会检查 playing 状态，不会冲突）
connectVowelDetectorToGameState(mlDetector, game);
connectVowelDetectorToGameState(mfccDetector, game);

// 代理当前活跃检测器的响应式属性
const currentResult = computed(() => activeDetector.value.currentResult.value);
const confirmedVowel = computed(() => activeDetector.value.confirmedVowel.value);
const isListening = computed(() => activeDetector.value.isListening.value);

const { stats, state, snapshot, sequenceProgress, startGame, interrupt, reset: resetGame } = game;

// 记录中断原因，用于结算界面文案
const lastInterruptReason = ref<InterruptReason | null>(null);

const sequence = computed(() => getTargetSequence());
const hints = computed(() => getPronunciationHints());
const expectedVowel = computed(() => sequence.value[stats.value.sequenceIndex] ?? '');

const stageConfig = computed(() => getStageVisualConfig(game.currentStage.value));
const backgroundStyle = computed(() => ({
  background: stageConfig.value.background.gradient ?? stageConfig.value.background.color
}));

const gameState = computed(() => state.value);
const gameStateLabel = computed(() => {
  if (state.value === 'playing') return '进行中';
  if (state.value === 'interrupted') return '已中断';
  if (state.value === 'sharing') return '分享中';
  return '待开始';
});

// ==================== 结算面板计算属性 ====================
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

// ==================== 监听游戏状态变化 ====================
// 当游戏被自动中断时（静音超时 / 连续错误），同步停止检测器
watch(state, (newState, oldState) => {
  if (newState === 'interrupted' && oldState === 'playing') {
    activeDetector.value.stop();
  }
});

// 监听中断事件，记录原因
game.onComboBreak((_combo, reason) => {
  lastInterruptReason.value = reason;
});

// ==================== 检测器切换 ====================
const switchDetector = (mode: DetectorMode) => {
  if (mode === detectorMode.value) return;
  if (state.value === 'playing') return; // 游戏中不允许切换

  // 停止并重置当前检测器
  activeDetector.value.stop();
  resetGame();
  lastInterruptReason.value = null;

  detectorMode.value = mode;
};

// ==================== 用户操作 ====================
const handleStart = async () => {
  try {
    // 如果是从中断状态重新开始，先重置
    if (state.value === 'interrupted') {
      resetGame();
    }
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
</script>

<style scoped>
.game-view {
  min-height: 100vh;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 24px;
  background-size: cover;
  background-position: center;
}

.game-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.title-block h1 {
  font-size: 36px;
  letter-spacing: 4px;
}

.subtitle {
  color: rgba(255, 255, 255, 0.7);
  margin-top: 4px;
}

.status-block {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.detector-toggle {
  display: flex;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.detector-toggle.disabled {
  opacity: 0.5;
}

.toggle-btn {
  padding: 5px 12px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.toggle-btn.active {
  background: rgba(88, 160, 255, 0.4);
  color: #fff;
}

.toggle-btn:disabled {
  cursor: not-allowed;
}

.pill {
  padding: 6px 14px;
  border-radius: 999px;
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
  background: rgba(255, 255, 255, 0.15);
}

.pill.playing {
  background: rgba(76, 212, 164, 0.4);
}

.pill.interrupted {
  background: rgba(255, 107, 107, 0.4);
}

.pill.sharing {
  background: rgba(255, 205, 86, 0.4);
}

.pill.on {
  background: rgba(88, 160, 255, 0.4);
}

.pill.off {
  background: rgba(255, 255, 255, 0.1);
}

.game-main {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  gap: 20px;
}

.score-panel,
.detector-panel,
.sequence-panel {
  background: rgba(0, 0, 0, 0.35);
  border-radius: 18px;
  padding: 24px;
  backdrop-filter: blur(10px);
}

.score-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 16px;
}

.score-item .label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.score-item .value {
  font-size: 22px;
  font-weight: 600;
}

.score-item .value.score {
  font-size: 32px;
}

.detector-panel {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.vowel-display {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
  border: 1px solid transparent;
}

.vowel-display.active {
  border-color: rgba(88, 160, 255, 0.6);
  box-shadow: 0 0 20px rgba(88, 160, 255, 0.3);
}

.vowel-text {
  font-size: 48px;
  font-weight: 700;
}

.vowel-label {
  display: block;
  margin-top: 8px;
  color: rgba(255, 255, 255, 0.6);
}

.detector-stats {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.stat {
  display: grid;
  grid-template-columns: 90px 1fr 60px;
  align-items: center;
  gap: 12px;
  font-size: 13px;
}

.stat .label {
  color: rgba(255, 255, 255, 0.6);
}

.stat .bar {
  height: 8px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
}

.stat .bar.volume .fill {
  background: linear-gradient(90deg, #4cd4a4, #4aa0ff);
}

.stat .fill {
  height: 100%;
  background: linear-gradient(90deg, #ff6b6b, #ffcc70);
}

.sequence-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.sequence {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.sequence-item {
  padding: 6px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  font-size: 14px;
}

.sequence-item.active {
  background: rgba(255, 205, 86, 0.5);
  color: #1a1a2e;
}

.expected {
  margin-top: 16px;
  display: flex;
  justify-content: space-between;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.7);
}

.progress {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.7);
}

.progress-bar {
  width: 120px;
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, #4cd4a4, #4aa0ff);
}

.game-footer {
  display: flex;
  gap: 12px;
  justify-content: center;
  padding-bottom: 24px;
}

.btn {
  padding: 10px 20px;
  border-radius: 10px;
  border: none;
  background: rgba(255, 255, 255, 0.15);
  color: white;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn.primary {
  background: linear-gradient(90deg, #4cd4a4, #4aa0ff);
  color: #0d1b2a;
  font-weight: 600;
}

.btn.ghost {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.2);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@media (max-width: 768px) {
  .game-view {
    padding: 20px;
  }

  .game-header {
    flex-direction: column;
    align-items: flex-start;
  }

  .score-panel {
    grid-template-columns: repeat(2, minmax(120px, 1fr));
  }

  .stat {
    grid-template-columns: 80px 1fr 50px;
  }

  .result-card {
    margin: 16px;
    padding: 28px 20px;
  }
}

/* ==================== 结算遮罩 ==================== */
.result-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(0, 0, 0, 0.7);
  backdrop-filter: blur(8px);
}

.result-card {
  background: linear-gradient(145deg, rgba(30, 30, 60, 0.95), rgba(15, 15, 35, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  padding: 40px 36px;
  max-width: 420px;
  width: 100%;
  text-align: center;
  box-shadow: 0 24px 80px rgba(0, 0, 0, 0.5);
}

.result-icon {
  font-size: 56px;
  margin-bottom: 8px;
}

.result-title {
  font-size: 28px;
  font-weight: 700;
  letter-spacing: 2px;
  margin-bottom: 6px;
}

.result-reason {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 28px;
}

.result-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 32px;
}

.result-stat {
  background: rgba(255, 255, 255, 0.06);
  border-radius: 14px;
  padding: 14px 12px;
}

.result-stat.main {
  grid-column: 1 / -1;
  background: rgba(88, 160, 255, 0.12);
  border: 1px solid rgba(88, 160, 255, 0.25);
  padding: 18px 12px;
}

.result-stat .result-label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 4px;
}

.result-stat .result-value {
  display: block;
  font-size: 22px;
  font-weight: 700;
}

.result-stat.main .result-value {
  font-size: 36px;
}

.result-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.btn.large {
  padding: 14px 24px;
  font-size: 16px;
  border-radius: 14px;
}

/* ==================== 过渡动画 ==================== */
.overlay-enter-active {
  transition: opacity 0.3s ease;
}
.overlay-enter-active .result-card {
  transition: transform 0.35s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.3s ease;
}
.overlay-leave-active {
  transition: opacity 0.2s ease;
}
.overlay-leave-active .result-card {
  transition: transform 0.2s ease, opacity 0.2s ease;
}

.overlay-enter-from {
  opacity: 0;
}
.overlay-enter-from .result-card {
  opacity: 0;
  transform: scale(0.9) translateY(20px);
}

.overlay-leave-to {
  opacity: 0;
}
.overlay-leave-to .result-card {
  opacity: 0;
  transform: scale(0.95) translateY(-10px);
}
</style>
