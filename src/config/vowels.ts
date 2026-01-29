import type { Vowel, VowelFormantConfig, VowelDetectorConfig } from '@/types/game';

/**
 * 目标发音序列: oiiaioiiiai
 * 共 11 个音节，循环播放
 */
export const TARGET_SEQUENCE: Vowel[] = [
  'O', 'I', 'I', 'A', 'I', 'O', 'I', 'I', 'I', 'A', 'I'
];

/**
 * 元音共振峰参考值 (Hz)
 * 
 * 基于国际语音学的元音共振峰研究数据
 * F1 (第一共振峰): 与舌位高低相关，舌位越低 F1 越高
 * F2 (第二共振峰): 与舌位前后相关，舌位越前 F2 越高
 * 
 * | 元音 | F1 范围      | F2 范围       | 特征描述     |
 * |------|-------------|---------------|-------------|
 * | O    | 400-600 Hz  | 800-1200 Hz   | F1/F2 都较低 |
 * | I    | 200-400 Hz  | 2000-3000 Hz  | F1 低，F2 高 |
 * | A    | 700-1000 Hz | 1200-1800 Hz  | F1 高，F2 中 |
 */
export const DEFAULT_VOWEL_FORMANTS: VowelFormantConfig = {
  O: {
    f1: [400, 600],
    f2: [800, 1200]
  },
  I: {
    f1: [200, 400],
    f2: [2000, 3000]
  },
  A: {
    f1: [700, 1000],
    f2: [1200, 1800]
  }
};

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
