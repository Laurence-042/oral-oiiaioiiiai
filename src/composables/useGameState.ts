import { ref, computed, onUnmounted, type Ref, type ComputedRef } from 'vue';
import type {
  Vowel,
  GameState,
  Stage,
  GameStats,
  GameSnapshot,
  GameConfig,
  InterruptReason,
  FreeModeConfig,
  StageChangeCallback,
  ComboBreakCallback,
  PerfectCycleCallback,
  ScoreUpdateCallback
} from '@/types/game';
import {
  STAGE_THRESHOLDS,
  calculateStage,
  getStageName,
  calculateComboMultiplier,
  TIMING_CONFIG,
  SCORE_CONFIG
} from '@/config/stages';
import { TARGET_SEQUENCE } from '@/config/vowels';

/**
 * useGameState Hook 返回类型
 */
export interface UseGameStateReturn {
  /** 响应式状态 */
  state: Ref<GameState>;
  stats: Ref<GameStats>;
  snapshot: Ref<GameSnapshot | null>;
  
  /** 计算属性 */
  currentStage: ComputedRef<Stage>;
  isPlaying: ComputedRef<boolean>;
  sequenceProgress: ComputedRef<number>;
  
  /** 动作方法 */
  startGame: () => void;
  processVowel: (vowel: Vowel) => void;
  interrupt: (reason: InterruptReason) => void;
  showShare: () => void;
  reset: () => void;
  
  /** 自由模式控制 */
  setFreeMode: (config: Partial<FreeModeConfig>) => void;
  freeMode: Ref<FreeModeConfig>;
  
  /** 事件回调 */
  onStageChange: (callback: StageChangeCallback) => void;
  onComboBreak: (callback: ComboBreakCallback) => void;
  onPerfectCycle: (callback: PerfectCycleCallback) => void;
  onScoreUpdate: (callback: ScoreUpdateCallback) => void;
}

/**
 * 创建初始游戏统计数据
 */
function createInitialStats(): GameStats {
  return {
    score: 0,
    combo: 0,
    maxCombo: 0,
    stage: 1,
    stageName: '初醒',
    comboMultiplier: 1,
    perfectCycles: 0,
    sequenceIndex: 0,
    consecutiveErrors: 0,
    lastVowelTime: 0,
    startTime: 0
  };
}

/**
 * 游戏状态管理 Composable
 * 
 * 管理游戏的核心状态机，包括：
 * - 游戏状态（idle/playing/interrupted/sharing）
 * - 分数计算与连击系统
 * - Stage 1-5 的切换逻辑
 * - 序列验证（oiiaioiiiai）
 * 
 * @example
 * ```ts
 * const { state, stats, startGame, processVowel, onStageChange } = useGameState();
 * 
 * onStageChange((from, to) => {
 *   console.log(`Stage ${from} -> ${to}`);
 * });
 * 
 * startGame();
 * processVowel('O'); // 开始发音
 * ```
 */
export function useGameState(config?: GameConfig): UseGameStateReturn {
  // ==================== 配置合并 ====================
  const cfg = {
    silenceTimeout: TIMING_CONFIG.SILENCE_TIMEOUT,
    maxConsecutiveErrors: TIMING_CONFIG.MAX_CONSECUTIVE_ERRORS,
    baseScore: SCORE_CONFIG.BASE_SCORE,
    perfectCycleBonus: SCORE_CONFIG.PERFECT_CYCLE_BONUS,
    speedBonusThreshold: TIMING_CONFIG.SPEED_BONUS_THRESHOLD,
    speedBonusScore: SCORE_CONFIG.SPEED_BONUS,
    ...config
  };

  // ==================== 响应式状态 ====================
  const state = ref<GameState>('idle');
  const stats = ref<GameStats>(createInitialStats());
  const snapshot = ref<GameSnapshot | null>(null);
  
  const freeMode = ref<FreeModeConfig>({
    enabled: false,
    lockedStage: undefined,
    disableInterrupt: false,
    anyVowelMode: false,
    rotationSpeed: undefined,
    effectIntensity: undefined
  });

  // ==================== 计算属性 ====================
  const currentStage = computed<Stage>(() => {
    if (freeMode.value.enabled && freeMode.value.lockedStage) {
      return freeMode.value.lockedStage;
    }
    return stats.value.stage;
  });

  const isPlaying = computed(() => state.value === 'playing');

  const sequenceProgress = computed(() => {
    return stats.value.sequenceIndex / TARGET_SEQUENCE.length;
  });

  // ==================== 内部状态 ====================
  let silenceCheckInterval: ReturnType<typeof setInterval> | null = null;

  // ==================== 事件回调 ====================
  const stageChangeCallbacks: StageChangeCallback[] = [];
  const comboBreakCallbacks: ComboBreakCallback[] = [];
  const perfectCycleCallbacks: PerfectCycleCallback[] = [];
  const scoreUpdateCallbacks: ScoreUpdateCallback[] = [];

  function onStageChange(callback: StageChangeCallback): void {
    stageChangeCallbacks.push(callback);
  }

  function onComboBreak(callback: ComboBreakCallback): void {
    comboBreakCallbacks.push(callback);
  }

  function onPerfectCycle(callback: PerfectCycleCallback): void {
    perfectCycleCallbacks.push(callback);
  }

  function onScoreUpdate(callback: ScoreUpdateCallback): void {
    scoreUpdateCallbacks.push(callback);
  }

  function emitStageChange(from: Stage, to: Stage): void {
    stageChangeCallbacks.forEach(cb => cb(from, to));
  }

  function emitComboBreak(combo: number, reason: InterruptReason): void {
    comboBreakCallbacks.forEach(cb => cb(combo, reason));
  }

  function emitPerfectCycle(cycleCount: number): void {
    perfectCycleCallbacks.forEach(cb => cb(cycleCount));
  }

  function emitScoreUpdate(score: number, delta: number): void {
    scoreUpdateCallbacks.forEach(cb => cb(score, delta));
  }

  // ==================== 分数计算 ====================
  /**
   * 计算单次正确发音的得分
   * 
   * 公式：
   * - 基础分：10 分
   * - 连击倍率：1 + floor(combo / 10) * 0.1，最高 3x
   * - 速度加成：发音间隔 < 300ms 时额外 +5 分
   */
  function calculateScore(timeSinceLastVowel: number): number {
    let score = cfg.baseScore;
    
    // 连击倍率
    const multiplier = calculateComboMultiplier(stats.value.combo);
    stats.value.comboMultiplier = multiplier;
    score *= multiplier;
    
    // 速度加成
    if (timeSinceLastVowel > 0 && timeSinceLastVowel < cfg.speedBonusThreshold) {
      score += cfg.speedBonusScore;
    }
    
    return Math.floor(score);
  }

  // ==================== 阶段更新 ====================
  function updateStage(): void {
    // 自由模式锁定阶段时不更新
    if (freeMode.value.enabled && freeMode.value.lockedStage) {
      return;
    }

    const newStage = calculateStage(stats.value.score);
    if (newStage !== stats.value.stage) {
      const oldStage = stats.value.stage;
      stats.value.stage = newStage;
      stats.value.stageName = getStageName(newStage);
      emitStageChange(oldStage, newStage);
    }
  }

  // ==================== 处理元音输入 ====================
  /**
   * 处理检测到的元音
   * 验证序列，更新分数和连击
   */
  function processVowel(vowel: Vowel): void {
    if (state.value !== 'playing') return;
    
    const now = Date.now();
    const timeDelta = stats.value.lastVowelTime > 0 
      ? now - stats.value.lastVowelTime 
      : 0;
    
    // 获取期望的元音
    const expectedVowel = TARGET_SEQUENCE[stats.value.sequenceIndex];
    
    // 自由模式：任意元音都算正确
    if (freeMode.value.enabled && freeMode.value.anyVowelMode) {
      handleCorrectVowel(timeDelta, now);
      return;
    }
    
    // 正常模式：检查序列
    if (vowel === expectedVowel) {
      handleCorrectVowel(timeDelta, now);
    } else {
      handleWrongVowel();
    }
  }

  /**
   * 处理正确的元音
   */
  function handleCorrectVowel(timeDelta: number, now: number): void {
    const scoreGain = calculateScore(timeDelta);
    
    // 更新统计
    stats.value.score += scoreGain;
    stats.value.combo++;
    stats.value.maxCombo = Math.max(stats.value.maxCombo, stats.value.combo);
    stats.value.consecutiveErrors = 0;
    stats.value.lastVowelTime = now;
    
    // 推进序列
    stats.value.sequenceIndex = (stats.value.sequenceIndex + 1) % TARGET_SEQUENCE.length;
    
    // 检查完美循环（完成一轮 oiiaioiiiai）
    if (stats.value.sequenceIndex === 0) {
      stats.value.score += cfg.perfectCycleBonus;
      stats.value.perfectCycles++;
      emitPerfectCycle(stats.value.perfectCycles);
    }
    
    // 更新阶段
    updateStage();
    
    // 触发分数更新事件
    emitScoreUpdate(stats.value.score, scoreGain);
  }

  /**
   * 处理错误的元音
   */
  function handleWrongVowel(): void {
    stats.value.consecutiveErrors++;
    
    // 自由模式禁用中断时不检查
    if (freeMode.value.enabled && freeMode.value.disableInterrupt) {
      return;
    }
    
    // 连续错误达到阈值，中断游戏
    if (stats.value.consecutiveErrors >= cfg.maxConsecutiveErrors) {
      interrupt('consecutive_errors');
    }
  }

  // ==================== 静音超时处理 ====================
  /**
   * 处理静音事件（由 useVowelDetector 调用）
   */
  function handleSilence(duration: number): void {
    if (state.value !== 'playing') return;
    
    // 自由模式禁用中断时不检查
    if (freeMode.value.enabled && freeMode.value.disableInterrupt) {
      return;
    }
    
    if (duration >= cfg.silenceTimeout) {
      interrupt('silence_timeout');
    }
  }

  // ==================== 游戏控制 ====================
  /**
   * 开始游戏
   */
  function startGame(): void {
    if (state.value === 'playing') return;
    
    // 重置统计（但保留自由模式设置）
    stats.value = createInitialStats();
    stats.value.startTime = Date.now();
    
    // 如果自由模式锁定了阶段，设置初始阶段
    if (freeMode.value.enabled && freeMode.value.lockedStage) {
      stats.value.stage = freeMode.value.lockedStage;
      stats.value.stageName = getStageName(freeMode.value.lockedStage);
    }
    
    state.value = 'playing';
    snapshot.value = null;
  }

  /**
   * 中断游戏
   */
  function interrupt(reason: InterruptReason): void {
    if (state.value !== 'playing') return;
    
    const combo = stats.value.combo;
    
    // 创建快照
    snapshot.value = {
      score: stats.value.score,
      maxCombo: stats.value.maxCombo,
      stage: stats.value.stage,
      stageName: stats.value.stageName,
      perfectCycles: stats.value.perfectCycles,
      duration: Date.now() - stats.value.startTime,
      timestamp: Date.now()
    };
    
    state.value = 'interrupted';
    
    // 触发连击中断事件
    if (combo > 0) {
      emitComboBreak(combo, reason);
    }
  }

  /**
   * 显示分享界面
   */
  function showShare(): void {
    if (state.value === 'interrupted' || state.value === 'playing') {
      if (state.value === 'playing') {
        interrupt('manual');
      }
      state.value = 'sharing';
    }
  }

  /**
   * 重置游戏状态
   */
  function reset(): void {
    state.value = 'idle';
    stats.value = createInitialStats();
    snapshot.value = null;
    
    if (silenceCheckInterval) {
      clearInterval(silenceCheckInterval);
      silenceCheckInterval = null;
    }
  }

  /**
   * 设置自由模式配置
   */
  function setFreeMode(newConfig: Partial<FreeModeConfig>): void {
    freeMode.value = {
      ...freeMode.value,
      ...newConfig
    };
    
    // 如果锁定了阶段且正在游戏中，立即应用
    if (state.value === 'playing' && newConfig.lockedStage) {
      stats.value.stage = newConfig.lockedStage;
      stats.value.stageName = getStageName(newConfig.lockedStage);
    }
  }

  // ==================== 生命周期 ====================
  onUnmounted(() => {
    if (silenceCheckInterval) {
      clearInterval(silenceCheckInterval);
    }
  });

  // ==================== 返回 ====================
  return {
    state,
    stats,
    snapshot,
    currentStage,
    isPlaying,
    sequenceProgress,
    startGame,
    processVowel,
    interrupt,
    showShare,
    reset,
    setFreeMode,
    freeMode,
    onStageChange,
    onComboBreak,
    onPerfectCycle,
    onScoreUpdate
  };
}

/**
 * 创建连接 useVowelDetector 和 useGameState 的辅助函数
 * 
 * @example
 * ```ts
 * const vowelDetector = useVowelDetector();
 * const gameState = useGameState();
 * 
 * // 自动连接两个 composable
 * connectVowelDetectorToGameState(vowelDetector, gameState);
 * ```
 */
export function connectVowelDetectorToGameState(
  vowelDetector: {
    onVowelDetected: (callback: (vowel: Vowel, result: unknown) => void) => void;
    onSilence: (callback: (duration: number) => void) => void;
  },
  gameState: {
    processVowel: (vowel: Vowel) => void;
    interrupt: (reason: InterruptReason) => void;
    state: Ref<GameState>;
    freeMode: Ref<FreeModeConfig>;
  },
  options?: {
    silenceTimeout?: number;
  }
): void {
  const silenceTimeout = options?.silenceTimeout ?? TIMING_CONFIG.SILENCE_TIMEOUT;

  // 连接元音检测
  vowelDetector.onVowelDetected((vowel) => {
    gameState.processVowel(vowel);
  });

  // 连接静音检测
  vowelDetector.onSilence((duration) => {
    if (gameState.state.value !== 'playing') return;
    
    // 自由模式禁用中断时不检查
    if (gameState.freeMode.value.enabled && gameState.freeMode.value.disableInterrupt) {
      return;
    }
    
    if (duration >= silenceTimeout) {
      gameState.interrupt('silence_timeout');
    }
  });
}
