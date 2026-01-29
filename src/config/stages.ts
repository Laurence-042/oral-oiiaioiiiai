import type { Stage, StageThreshold, StageVisualConfig } from '@/types/game';

/**
 * 阶段分数阈值配置
 * 
 * 一轮完整的 "oiiaioiiiai" 约得 200-250 分
 * | 阶段 | 触发分数 | 大约所需轮数 |
 * |------|----------|--------------|
 * | 1    | 0        | 开局         |
 * | 2    | 500      | ~2 轮        |
 * | 3    | 2000     | ~8 轮        |
 * | 4    | 5000     | ~20 轮       |
 * | 5    | 10000    | ~40 轮       |
 */
export const STAGE_THRESHOLDS: StageThreshold[] = [
  { stage: 1, name: '初醒', scoreThreshold: 0 },
  { stage: 2, name: '躁动', scoreThreshold: 500 },
  { stage: 3, name: '狂热', scoreThreshold: 2000 },
  { stage: 4, name: '超度', scoreThreshold: 5000 },
  { stage: 5, name: '神猫', scoreThreshold: 10000 }
];

/**
 * 根据分数计算当前阶段
 */
export function calculateStage(score: number): Stage {
  for (let i = STAGE_THRESHOLDS.length - 1; i >= 0; i--) {
    if (score >= STAGE_THRESHOLDS[i].scoreThreshold) {
      return STAGE_THRESHOLDS[i].stage;
    }
  }
  return 1;
}

/**
 * 获取阶段名称
 */
export function getStageName(stage: Stage): string {
  const threshold = STAGE_THRESHOLDS.find(t => t.stage === stage);
  return threshold?.name ?? '未知';
}

/**
 * 阶段视觉效果完整配置
 */
export const STAGE_VISUAL_CONFIGS: StageVisualConfig[] = [
  {
    id: 1,
    name: '初醒',
    scoreThreshold: 0,
    cat: {
      rotationSpeed: 60,      // 60°/s，较慢
      scale: 1.0,
      trailEffect: false
    },
    background: {
      color: '#1a1a2e',
      gradient: 'linear-gradient(180deg, #1a1a2e 0%, #16213e 100%)',
      particles: {
        enabled: false,
        count: 0,
        speed: 0,
        size: [0, 0],
        colors: []
      }
    },
    audio: {
      sfxPitch: 1.0
    },
    screenEffects: {
      shake: 0,
      vignette: 0.2,
      chromatic: 0
    }
  },
  {
    id: 2,
    name: '躁动',
    scoreThreshold: 500,
    cat: {
      rotationSpeed: 120,     // 加速到 120°/s
      scale: 1.05,
      trailEffect: false
    },
    background: {
      color: '#0f3460',
      gradient: 'linear-gradient(180deg, #0f3460 0%, #16213e 100%)',
      particles: {
        enabled: true,
        count: 20,
        speed: 1,
        size: [2, 4],
        colors: ['#e94560', '#ff6b6b']
      }
    },
    audio: {
      sfxPitch: 1.05
    },
    screenEffects: {
      shake: 0,
      vignette: 0.15,
      chromatic: 0
    }
  },
  {
    id: 3,
    name: '狂热',
    scoreThreshold: 2000,
    cat: {
      rotationSpeed: 240,     // 快速旋转
      scale: 1.1,
      trailEffect: true
    },
    background: {
      color: '#e94560',
      gradient: 'linear-gradient(180deg, #e94560 0%, #0f3460 100%)',
      particles: {
        enabled: true,
        count: 50,
        speed: 2,
        size: [3, 6],
        colors: ['#ff6b6b', '#feca57', '#48dbfb']
      }
    },
    audio: {
      sfxPitch: 1.1
    },
    screenEffects: {
      shake: 0.02,            // 轻微抖动
      vignette: 0.1,
      chromatic: 0.002
    }
  },
  {
    id: 4,
    name: '超度',
    scoreThreshold: 5000,
    cat: {
      rotationSpeed: 360,     // 1圈/秒
      scale: 1.15,
      trailEffect: true
    },
    background: {
      color: '#ff6b6b',
      gradient: 'linear-gradient(180deg, #ff6b6b 0%, #e94560 50%, #0f3460 100%)',
      particles: {
        enabled: true,
        count: 100,
        speed: 3,
        size: [4, 8],
        colors: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff']
      }
    },
    audio: {
      sfxPitch: 1.2
    },
    screenEffects: {
      shake: 0.04,
      vignette: 0.05,
      chromatic: 0.005
    }
  },
  {
    id: 5,
    name: '神猫',
    scoreThreshold: 10000,
    cat: {
      rotationSpeed: 540,     // 1.5圈/秒，极速
      scale: 1.2,
      trailEffect: true
    },
    background: {
      color: '#feca57',
      gradient: 'conic-gradient(from 0deg, #ff6b6b, #feca57, #48dbfb, #ff9ff3, #54a0ff, #ff6b6b)',
      particles: {
        enabled: true,
        count: 200,
        speed: 5,
        size: [5, 12],
        colors: ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff', '#5f27cd', '#00d2d3']
      },
      shader: 'rainbow-vortex'
    },
    audio: {
      bgm: 'stage5-bgm.mp3',
      sfxPitch: 1.3
    },
    screenEffects: {
      shake: 0.06,
      vignette: 0,
      chromatic: 0.01
    }
  }
];

/**
 * 获取阶段视觉配置
 */
export function getStageVisualConfig(stage: Stage): StageVisualConfig {
  return STAGE_VISUAL_CONFIGS.find(c => c.id === stage) ?? STAGE_VISUAL_CONFIGS[0];
}

/**
 * 根据分数获取视觉配置
 */
export function getVisualConfigByScore(score: number): StageVisualConfig {
  const stage = calculateStage(score);
  return getStageVisualConfig(stage);
}

/**
 * 游戏时间相关常量
 */
export const TIMING_CONFIG = {
  /** 静音超时 (ms) */
  SILENCE_TIMEOUT: 1500,
  /** 连续错误阈值 */
  MAX_CONSECUTIVE_ERRORS: 3,
  /** 速度加成阈值 (ms) */
  SPEED_BONUS_THRESHOLD: 300
};

/**
 * 分数相关常量
 */
export const SCORE_CONFIG = {
  /** 基础得分 */
  BASE_SCORE: 10,
  /** 完美循环奖励 */
  PERFECT_CYCLE_BONUS: 50,
  /** 速度加成分数 */
  SPEED_BONUS: 5,
  /** 最大连击倍率 */
  MAX_COMBO_MULTIPLIER: 3,
  /** 倍率增长间隔（每 N 连击增加 10%） */
  COMBO_MULTIPLIER_INTERVAL: 10
};

/**
 * 计算连击倍率
 * 公式: 1 + floor(combo / 10) * 0.1, 最高 3x
 */
export function calculateComboMultiplier(combo: number): number {
  const multiplier = 1 + Math.floor(combo / SCORE_CONFIG.COMBO_MULTIPLIER_INTERVAL) * 0.1;
  return Math.min(SCORE_CONFIG.MAX_COMBO_MULTIPLIER, multiplier);
}
