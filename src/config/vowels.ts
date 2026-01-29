import type { Vowel, VowelFormantConfig, VowelDetectorConfig } from '@/types/game';

// ==================== 序列配置 ====================

/**
 * 预设序列配置
 * 用户可以选择不同的发音序列
 */
export interface SequencePreset {
  /** 预设名称 */
  name: string;
  /** 描述 */
  description: string;
  /** 元音序列（用于识别匹配） */
  sequence: Vowel[];
  /** 发音提示（显示给用户） */
  hints: string[];
}

/**
 * 预设序列列表
 */
export const SEQUENCE_PRESETS: Record<string, SequencePreset> = {
  /** 标准版：更接近实际发音 u-i-i-a-i-o-u-i-i-i-a-i */
  standard: {
    name: '标准版',
    description: '更接近实际发音: oo-ee-ee-ah-ee-oh-oo-ee-ee-ee-ah-ee',
    sequence: ['U', 'I', 'I', 'A', 'I', 'O', 'U', 'I', 'I', 'I', 'A', 'I'],
    hints: ['U', 'I', 'I', 'A', 'I', 'O', 'U', 'I', 'I', 'I', 'A', 'I']
  },
  /** 简化版：只用 O/I/A 三个元音 */
  simple: {
    name: '流行版',
    description: '只用三个元音: O-I-I-A-I-O-I-I-I-A-I',
    sequence: ['O', 'I', 'I', 'A', 'I', 'O', 'I', 'I', 'I', 'A', 'I'],
    hints: ['O', 'I', 'I', 'A', 'I', 'O', 'I', 'I', 'I', 'A', 'I']
  }
};

/** 当前激活的预设 key */
export let currentPresetKey = 'standard';

/** 获取当前预设 */
export function getCurrentPreset(): SequencePreset {
  return SEQUENCE_PRESETS[currentPresetKey] ?? SEQUENCE_PRESETS.standard;
}

/** 切换预设 */
export function setPreset(key: string): void {
  if (SEQUENCE_PRESETS[key]) {
    currentPresetKey = key;
  }
}

/** 目标序列（动态获取） */
export function getTargetSequence(): Vowel[] {
  return getCurrentPreset().sequence;
}

/** 发音提示（动态获取） */
export function getPronunciationHints(): string[] {
  return getCurrentPreset().hints;
}

/** 
 * 向后兼容的静态导出
 * @deprecated 请使用 getTargetSequence() 和 getPronunciationHints()
 */
export const TARGET_SEQUENCE: Vowel[] = SEQUENCE_PRESETS.standard.sequence;
export const PRONUNCIATION_HINTS: string[] = SEQUENCE_PRESETS.standard.hints;

/**
 * 获取序列位置的发音提示
 */
export function getPronunciationHint(index: number): string {
  return getCurrentPreset().hints[index] ?? '';
}

/**
 * 获取完整序列的发音提示文字
 */
export function getSequenceHintText(): string {
  return getCurrentPreset().hints.join('-');
}

// ==================== 元音共振峰配置 ====================

/**
 * 元音共振峰参考值 (Hz)
 * 
 * 基于国际语音学的元音共振峰研究数据
 * F1 (第一共振峰): 与舌位高低相关，舌位越低 F1 越高
 * F2 (第二共振峰): 与舌位前后相关，舌位越前 F2 越高
 * 
 * | 元音 | F1 范围      | F2 范围       | 特征描述           |
 * |------|-------------|---------------|-------------------|
 * | U    | 300-450 Hz  | 600-1000 Hz   | F1/F2 都很低 (后高) |
 * | I    | 200-400 Hz  | 2000-3000 Hz  | F1 低，F2 高 (前高) |
 * | E    | 400-600 Hz  | 1800-2400 Hz  | F1 中，F2 高 (前中) |
 * | A    | 700-1000 Hz | 1200-1800 Hz  | F1 高，F2 中 (央低) |
 * | O    | 400-600 Hz  | 800-1200 Hz   | F1 中，F2 低 (后中) |
 */

//这是标准元音共振峰范围配置，但oiiaioiiiai游戏中需要做调整以提升识别率
export const DEFAULT_VOWEL_FORMANTS: VowelFormantConfig = {
  U: {
    f1: [300, 450],
    f2: [600, 1000]
  },
  I: {
    f1: [200, 400],
    f2: [2000, 3000]
  },
  E: {
    f1: [400, 600],
    f2: [1800, 2400]
  },
  A: {
    f1: [700, 1000],
    f2: [1200, 1800]
  },
  O: {
    f1: [400, 600],
    f2: [800, 1200]
  }
};

/**
export const DEFAULT_VOWEL_FORMANTS: VowelFormantConfig = {
  U: {
    f1: [230, 330],
    f2: [718, 1500]
  },
  I: {
    f1: [200, 400],
    f2: [2000, 3000]
  },
  E: {
    f1: [400, 600],
    f2: [1800, 2400]
  },
  A: {
    f1: [700, 1000],
    f2: [1400, 2000]
  },
  O: {
    f1: [400, 800],
    f2: [800, 1200]
  }
};
 */

/**
 * 元音检测器默认配置
 */
export const DEFAULT_VOWEL_DETECTOR_CONFIG: Required<VowelDetectorConfig> = {
  /** FFT 大小，影响频率分辨率 */
  fftSize: 2048,
  /** 采样率 */
  sampleRate: 44100,
  /** 分帧时间 (ms)，每帧进行一次 FFT 分析。越小响应越快 */
  frameTime: 30,
  /** 静音阈值 (dB)，低于此值视为静音。RMS 音量通常在 -60 ~ 0 范围 */
  silenceThreshold: -35,
  /** 确认帧数，设为 1 实现即时响应，适合快速发音 */
  confirmationFrames: 1,
  /** 元音共振峰配置 */
  vowelFormants: DEFAULT_VOWEL_FORMANTS
};

/**
 * 音节检测配置
 * 用于从音频中分割序列和音节
 */
export const SYLLABLE_DETECTION_CONFIG = {
  /** 序列之间的最小间隔 (ms) - 超过此间隔视为新序列 */
  sequenceGapMs: 300,
  /** 音节之间的最小间隔 (ms) - 小于此间隔的发声段会合并 */
  syllableGapMs: 20,
  /** 最小音节时长 (ms) - 短于此时长的发声段会被忽略 */
  minSyllableDurationMs: 50,
  /** 能量阈值倍数 - 相对于噪声底的倍数，用于判断是否为有效发声 */
  energyThresholdMultiplier: 500
};

/**
 * 频率分析常量
 */
export const FREQUENCY_ANALYSIS = {
  /** 人声基频范围 (Hz) */
  VOICE_FREQUENCY_RANGE: {
    min: 80,   // 成年男性低音
    max: 400   // 儿童/女性高音
  },
  /** 共振峰分析频率范围 (Hz) */
  FORMANT_FREQUENCY_RANGE: {
    min: 200,
    max: 3500
  },
  /** 噪声过滤阈值 */
  NOISE_FLOOR: -60,  // dB
  /** 有效语音最小能量 */
  MIN_VOICE_ENERGY: -40  // dB
};

/**
 * 计算频率分辨率
 * @param sampleRate 采样率
 * @param fftSize FFT 大小
 * @returns 每个 bin 的频率宽度 (Hz)
 */
export function getFrequencyResolution(sampleRate: number, fftSize: number): number {
  return sampleRate / fftSize;
}

/**
 * 频率转 FFT bin 索引
 * @param frequency 目标频率 (Hz)
 * @param sampleRate 采样率
 * @param fftSize FFT 大小
 * @returns bin 索引
 */
export function frequencyToBin(frequency: number, sampleRate: number, fftSize: number): number {
  return Math.round(frequency * fftSize / sampleRate);
}

/**
 * FFT bin 索引转频率
 * @param bin bin 索引
 * @param sampleRate 采样率
 * @param fftSize FFT 大小
 * @returns 频率 (Hz)
 */
export function binToFrequency(bin: number, sampleRate: number, fftSize: number): number {
  return bin * sampleRate / fftSize;
}
