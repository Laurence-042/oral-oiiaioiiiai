// ==================== 元音检测相关类型 ====================

/** 元音类型 */
export type Vowel = 'O' | 'I' | 'A';

/** 检测结果状态 */
export type DetectionStatus = 'detected' | 'silence' | 'noise' | 'ambiguous';

/** 单次检测结果 */
export interface VowelDetectionResult {
  /** 检测到的元音，无法识别时为 null */
  vowel: Vowel | null;
  /** 检测状态 */
  status: DetectionStatus;
  /** 置信度 0-1 */
  confidence: number;
  /** 原始共振峰数据 */
  formants: {
    f1: number;  // 第一共振峰频率 (Hz)
    f2: number;  // 第二共振峰频率 (Hz)
  };
  /** 音量级别 (dB) */
  volume: number;
  /** 时间戳 */
  timestamp: number;
}

/** 元音共振峰范围配置 */
export interface VowelFormantRange {
  f1: [number, number];  // [min, max] Hz
  f2: [number, number];  // [min, max] Hz
}

/** 元音共振峰配置 */
export interface VowelFormantConfig {
  O: VowelFormantRange;
  I: VowelFormantRange;
  A: VowelFormantRange;
}

/** 元音识别配置 */
export interface VowelDetectorConfig {
  /** FFT 大小，默认 2048 */
  fftSize?: number;
  /** 采样率，默认 44100 */
  sampleRate?: number;
  /** 分帧时间 (ms)，默认 50 */
  frameTime?: number;
  /** 静音阈值 (dB)，默认 -50 */
  silenceThreshold?: number;
  /** 确认帧数，默认 2 */
  confirmationFrames?: number;
  /** 元音共振峰配置（可覆盖默认值） */
  vowelFormants?: VowelFormantConfig;
}

// ==================== 游戏状态相关类型 ====================

/** 游戏主状态 */
export type GameState = 'idle' | 'playing' | 'interrupted' | 'sharing';

/** 视觉阶段 1-5 */
export type Stage = 1 | 2 | 3 | 4 | 5;

/** 中断原因 */
export type InterruptReason = 'silence_timeout' | 'consecutive_errors' | 'manual';

/** 阶段配置 */
export interface StageThreshold {
  stage: Stage;
  name: string;
  scoreThreshold: number;
}

/** 游戏统计数据 */
export interface GameStats {
  /** 当前分数 */
  score: number;
  /** 当前连击数 */
  combo: number;
  /** 最高连击数 */
  maxCombo: number;
  /** 当前阶段 */
  stage: Stage;
  /** 阶段名称 */
  stageName: string;
  /** 当前连击倍率 */
  comboMultiplier: number;
  /** 完美循环次数 */
  perfectCycles: number;
  /** 序列进度 (0-10) */
  sequenceIndex: number;
  /** 连续错误次数 */
  consecutiveErrors: number;
  /** 上次有效发音时间 */
  lastVowelTime: number;
  /** 游戏开始时间 */
  startTime: number;
}

/** 游戏数据快照（用于分享） */
export interface GameSnapshot {
  score: number;
  maxCombo: number;
  stage: Stage;
  stageName: string;
  perfectCycles: number;
  duration: number;
  timestamp: number;
}

/** 自由模式配置 */
export interface FreeModeConfig {
  /** 是否启用 */
  enabled: boolean;
  /** 锁定阶段 */
  lockedStage?: Stage;
  /** 禁用中断 */
  disableInterrupt?: boolean;
  /** 任意元音模式（不检查序列） */
  anyVowelMode?: boolean;
  /** 自定义旋转速度 (0-500%) */
  rotationSpeed?: number;
  /** 自定义特效强度 (0-200%) */
  effectIntensity?: number;
}

/** 游戏配置 */
export interface GameConfig {
  /** 静音超时 (ms)，默认 1500 */
  silenceTimeout?: number;
  /** 连续错误阈值，默认 3 */
  maxConsecutiveErrors?: number;
  /** 基础得分，默认 10 */
  baseScore?: number;
  /** 完美循环奖励，默认 50 */
  perfectCycleBonus?: number;
  /** 速度加成阈值 (ms)，默认 300 */
  speedBonusThreshold?: number;
  /** 速度加成分数，默认 5 */
  speedBonusScore?: number;
  /** 自由模式配置 */
  freeMode?: FreeModeConfig;
}

// ==================== 视觉效果相关类型 ====================

/** 粒子效果配置 */
export interface ParticleConfig {
  enabled: boolean;
  count: number;
  speed: number;
  size: [number, number];
  colors: string[];
}

/** 屏幕效果配置 */
export interface ScreenEffectsConfig {
  /** 抖动强度 0-1 */
  shake: number;
  /** 暗角强度 0-1 */
  vignette: number;
  /** 色差强度 0-1 */
  chromatic: number;
}

/** 阶段视觉配置 */
export interface StageVisualConfig {
  id: Stage;
  name: string;
  scoreThreshold: number;
  cat: {
    /** 旋转速度 (deg/s) */
    rotationSpeed: number;
    /** 缩放 */
    scale: number;
    /** 残影效果 */
    trailEffect: boolean;
    /** 可选替换图片 */
    sprite?: string;
  };
  background: {
    color: string;
    gradient?: string;
    particles: ParticleConfig;
    shader?: string;
  };
  audio: {
    bgm?: string;
    /** 音效变调 */
    sfxPitch: number;
  };
  screenEffects: ScreenEffectsConfig;
}

// ==================== 事件回调类型 ====================

/** 元音检测回调 */
export type VowelDetectedCallback = (vowel: Vowel, result: VowelDetectionResult) => void;

/** 静音回调 */
export type SilenceCallback = (duration: number) => void;

/** 阶段变化回调 */
export type StageChangeCallback = (from: Stage, to: Stage) => void;

/** 连击中断回调 */
export type ComboBreakCallback = (combo: number, reason: InterruptReason) => void;

/** 完美循环回调 */
export type PerfectCycleCallback = (cycleCount: number) => void;

/** 分数更新回调 */
export type ScoreUpdateCallback = (score: number, delta: number) => void;

/** 错误回调 */
export type ErrorCallback = (error: Error) => void;
