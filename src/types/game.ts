import type { Ref } from 'vue';

// ==================== 元音检测相关类型 ====================

/** 
 * 元音类型
 * - U: /u/ 如 "oo" in "boot"
 * - I: /i/ 如 "ee" in "see"
 * - E: /e/ 如 "e" in "bed"
 * - A: /ɑ/ 如 "ah" in "father"
 * - O: /oʊ/ 如 "o" in "go"
 * - silence: 静音
 */
export type Vowel = 'U' | 'I' | 'E' | 'A' | 'O' | 'silence';

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

/** 元音检测调试数据 */
export interface VowelDetectorDebugData {
  frequencyData: Float32Array | null;
  timeData: Float32Array | null;
}

/** 元音共振峰范围配置 */
export interface VowelFormantRange {
  f1: [number, number];  // [min, max] Hz
  f2: [number, number];  // [min, max] Hz
}

/** 元音共振峰配置 */
export type VowelFormantConfig = Record<Vowel, VowelFormantRange>;

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
  /** TensorFlow.js 模型路径 (ML 检测器) */
  modelPath?: string;
}

/** 元音检测器 Hook 返回类型（Formant/ML 共用） */
export interface VowelDetectorHookReturn {
  /** 当前检测结果（响应式） */
  currentResult: Ref<VowelDetectionResult | null>;
  /** 当前确认的元音（经过稳定性过滤） */
  confirmedVowel: Ref<Vowel | null>;
  /** 检测器状态 */
  isListening: Ref<boolean>;
  isInitialized: Ref<boolean>;
  error: Ref<string | null>;
  /** 最新的各类别概率分布（ML 模型可用） */
  latestProbabilities: Ref<number[] | null>;
  /** 控制方法 */
  start: () => Promise<void>;
  stop: () => void;
  reset: () => void;
  /** 事件回调注册 */
  onVowelDetected: (callback: VowelDetectedCallback) => void;
  onSilence: (callback: SilenceCallback) => void;
  onError: (callback: ErrorCallback) => void;
  /** 调试用：原始音频数据 */
  debugData: Ref<VowelDetectorDebugData>;
  /** 诊断方法 */
  getAudioDiagnostics: () => Record<string, unknown>;
}

// ==================== 游戏状态相关类型 ====================

/** 游戏主状态 */
export type GameState = 'idle' | 'ready' | 'playing' | 'paused' | 'interrupted' | 'sharing';

/** 视觉阶段 (1-based, 数量由资源包定义，默认 5) */
export type Stage = number;

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
  /** 总发音次数 */
  totalVowels: number;
  /** 正确发音次数 */
  correctVowels: number;
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
  /** 错误计数防抖 (ms)，默认 250 */
  errorDebounceMs?: number;
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

// ==================== 动态 BGM 类型 ====================

/** 合成器类型 */
export type BGMSynthType = 'membrane' | 'metal' | 'noise' | 'am' | 'fm' | 'mono' | 'duo';

/** 单个合成器通道配置 */
export interface BGMTrackConfig {
  /** 轨道标识 */
  id: string;
  /** 合成器类型 */
  synth: BGMSynthType;
  /** 合成器参数 (传给 Tone.js 构造器) */
  options?: Record<string, unknown>;
  /** 效果器链，如 ["distortion", "reverb"] */
  effects?: Array<{ type: string; options?: Record<string, unknown> }>;
  /** 音量 (dB) */
  volume: number;
  /** Tone.js Sequence pattern: 音符或 null (休止)，支持数组 (和弦) */
  pattern: Array<string | string[] | null>;
  /** 每拍细分 "4n" | "8n" | "16n" 等 */
  subdivision: string;
  /** 在哪些阶段启用 (1-5) */
  stages: number[];
  /** 是否随阶段动态改变音量 (可选) */
  stageVolumes?: Record<number, number>;
}

/** 资源包 BGM 配置 (bgm.json) */
export interface BGMConfig {
  /** 基础 BPM (玩家无发音时的节奏) */
  baseBPM: number;
  /** BPM 范围限制 */
  bpmRange: [number, number];
  /** 主音量 (dB) */
  masterVolume: number;
  /** 全部轨道 */
  tracks: BGMTrackConfig[];
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

// ==================== 资源包文案配置类型 ====================

/** 文案变体 (标题 + 副标题) */
export interface CopywritingVariant {
  title: string;
  subtitle: string;
}

/** 高光标签模板 (支持 {stageName} {combo} {count} {speed} {accuracy} 占位符) */
export interface HighlightLabelTemplates {
  'stage-up': string;         // e.g. "⬆ {stageName}"
  'combo-milestone': string;  // e.g. "🔥 {combo} 连击"
  'perfect-cycle': string;    // e.g. "✨ 完美循环 ×{count}"
  'speed-burst': string;      // e.g. "⚡ 极速 {speed}/s"
  'accuracy-streak': string;  // e.g. "🎯 精准 ×{count}"
  'final': string;            // e.g. "🏁 最终时刻"
}

/** 资源包单阶段配置 */
export interface PackStageConfig {
  /** 阶段名称 */
  name: string;
  /** 触发分数阈值 */
  scoreThreshold: number;
  /** 该阶段的分享文案池 */
  copywriting?: CopywritingVariant[];
}

/** 资源包文案配置 (全部可选，有默认 fallback) */
export interface PackTextConfig {
  /** 阶段定义 (数量、名称、分数阈值、文案) */
  stages?: PackStageConfig[];
  /** 高光标签模板 */
  highlightLabels?: Partial<HighlightLabelTemplates>;
  /** 高连击/高循环特殊文案 */
  specialCopywriting?: CopywritingVariant[];
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

// ==================== 排行榜类型 ====================

/** 排行榜单条记录 */
export interface LeaderboardEntry {
  id: string;
  name: string;
  score: number;
  maxCombo: number;
  stage: number;
  stageName: string;
  perfectCycles: number;
  duration: number;
  totalVowels: number;
  correctVowels: number;
  createdAt: number;
}

/** 全局统计 */
export interface LeaderboardStats {
  totalPlays: number;
  totalOiiia: number;
  highestScore: number;
  updatedAt: number;
}

/** 提交分数请求体 */
export interface ScoreSubmitPayload {
  name: string;
  score: number;
  maxCombo: number;
  stage: number;
  stageName: string;
  perfectCycles: number;
  duration: number;
  totalVowels: number;
  correctVowels: number;
}

/** 提交分数响应 */
export interface ScoreSubmitResponse {
  ok: boolean;
  id: string;
  rank: number | null;
  stats: LeaderboardStats;
}
