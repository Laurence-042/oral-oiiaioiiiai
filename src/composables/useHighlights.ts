import { ref, type ComputedRef, type Ref } from 'vue';
import type { Stage, ResolvedPackTextConfig } from '@/types/game';
import { getStageName as getStageNameFromConfig } from '@/config/stages';

// ==================== 类型 ====================

export interface HighlightMoment {
  /** 唯一 ID */
  id: number;
  /** 触发原因 */
  reason: HighlightReason;
  /** 显示标签 */
  label: string;
  /** 捕获时游戏数据 */
  score: number;
  combo: number;
  stage: Stage;
  /** 捕获时间戳 */
  timestamp: number;
}

export type HighlightReason =
  | 'stage-up'         // 阶段提升
  | 'combo-milestone'  // 连击里程碑
  | 'perfect-cycle'    // 完美循环
  | 'speed-burst'      // 发音极速
  | 'accuracy-streak'  // 精准连击
  | 'final';           // 结束前最后一帧

/** 连击里程碑阈值 */
const COMBO_MILESTONES = [10, 25, 50, 100, 200, 500];

/** 精准连击里程碑（无错误连续正确发音数） */
const ACCURACY_MILESTONES = [20, 50, 100, 200];

/** 极速阈值：平均间隔低于此值(ms)触发 */
const SPEED_BURST_THRESHOLD_MS = 180;

/** 极速需要至少连续多少个才算 */
const SPEED_BURST_MIN_STREAK = 6;

/** 最多保留的高光数 */
const MAX_HIGHLIGHTS = 8;

/** 弹出提示最大并发数 */
const MAX_TOASTS = 3;

/** 弹出提示持续时间 (ms) */
const TOAST_DURATION = 2000;

// ==================== Toast 类型 ====================

export interface HighlightToast {
  id: number;
  label: string;
  reason: HighlightReason;
}

// ==================== Composable ====================

export interface UseHighlightsReturn {
  /** 所有高光时刻 */
  highlights: Ref<HighlightMoment[]>;
  /** 当前弹出的 toast 列表 */
  toasts: Ref<HighlightToast[]>;
  /** 记录高光时刻（纯数据，零开销） */
  capture: (reason: HighlightReason, label: string, score: number, combo: number, stage: Stage) => void;
  /** 当阶段变化时自动判定 */
  onStageUp: (from: Stage, to: Stage, score: number, combo: number) => void;
  /** 当连击更新时自动判定是否命中里程碑 */
  onComboUpdate: (combo: number, score: number, stage: Stage) => void;
  /** 当完美循环时自动记录 */
  onPerfectCycle: (count: number, score: number, combo: number, stage: Stage) => void;
  /** 当速度数据更新时检查是否极速 */
  onSpeedUpdate: (avgIntervalMs: number, streak: number, score: number, combo: number, stage: Stage) => void;
  /** 当精度数据更新时检查是否达到累计正确里程碑 */
  onAccuracyUpdate: (correctCount: number, score: number, stage: Stage) => void;
  /** 记录最后时刻 */
  captureFinal: (score: number, combo: number, stage: Stage) => void;
  /** 获取阶段名称 */
  getStageName: (stage: Stage) => string;
  /** 清空 */
  clear: () => void;
}

export function useHighlights(textConfig: ComputedRef<ResolvedPackTextConfig>): UseHighlightsReturn {
  const highlights = ref<HighlightMoment[]>([]);
  const toasts = ref<HighlightToast[]>([]);
  let nextId = 0;
  /** 已触发过的连击里程碑（避免重复） */
  const firedComboMilestones = new Set<number>();
  /** 已触发过的精准连击里程碑 */
  const firedAccuracyMilestones = new Set<number>();
  /** 是否已触发过极速高光（每局只触发一次） */
  let firedSpeedBurst = false;

  function getStageName(stage: Stage): string {
    return getStageNameFromConfig(stage, textConfig.value);
  }

  /** 格式化模板字符串 */
  function formatLabel(template: string, vars: Record<string, string | number>): string {
    let result = template;
    for (const [key, val] of Object.entries(vars)) {
      result = result.split(`{${key}}`).join(String(val));
    }
    return result;
  }

  /** 弹出 toast 通知 */
  function pushToast(label: string, reason: HighlightReason) {
    const toast: HighlightToast = { id: nextId, label, reason };
    toasts.value = [...toasts.value.slice(-(MAX_TOASTS - 1)), toast];
    setTimeout(() => {
      toasts.value = toasts.value.filter(t => t.id !== toast.id);
    }, TOAST_DURATION);
  }

  function capture(reason: HighlightReason, label: string, score: number, combo: number, stage: Stage) {
    const moment: HighlightMoment = {
      id: nextId++,
      reason,
      label,
      score,
      combo,
      stage,
      timestamp: Date.now(),
    };
    highlights.value.push(moment);

    if (highlights.value.length > MAX_HIGHLIGHTS) {
      highlights.value = highlights.value.slice(-MAX_HIGHLIGHTS);
    }

    // final 不弹 toast
    if (reason !== 'final') {
      pushToast(label, reason);
    }
  }

  function onStageUp(from: Stage, to: Stage, score: number, combo: number) {
    if (to > from) {
      const label = formatLabel(textConfig.value.highlightLabels['stage-up'], { stageName: getStageName(to) });
      capture('stage-up', label, score, combo, to);
    }
  }

  function onComboUpdate(combo: number, score: number, stage: Stage) {
    for (const milestone of COMBO_MILESTONES) {
      if (combo >= milestone && !firedComboMilestones.has(milestone)) {
        firedComboMilestones.add(milestone);
        const label = formatLabel(textConfig.value.highlightLabels['combo-milestone'], { combo: milestone });
        capture('combo-milestone', label, score, combo, stage);
        break;
      }
    }
  }

  function onPerfectCycle(count: number, score: number, combo: number, stage: Stage) {
    const label = formatLabel(textConfig.value.highlightLabels['perfect-cycle'], { count });
    capture('perfect-cycle', label, score, combo, stage);
  }

  function onSpeedUpdate(avgIntervalMs: number, streak: number, score: number, combo: number, stage: Stage) {
    if (firedSpeedBurst) return;
    if (streak < SPEED_BURST_MIN_STREAK) return;
    if (avgIntervalMs > SPEED_BURST_THRESHOLD_MS || avgIntervalMs <= 0) return;
    firedSpeedBurst = true;
    const speed = (1000 / avgIntervalMs).toFixed(1);
    const label = formatLabel(textConfig.value.highlightLabels['speed-burst'], { speed });
    capture('speed-burst', label, score, combo, stage);
  }

  function onAccuracyUpdate(correctCount: number, score: number, stage: Stage) {
    for (const milestone of ACCURACY_MILESTONES) {
      if (correctCount >= milestone && !firedAccuracyMilestones.has(milestone)) {
        firedAccuracyMilestones.add(milestone);
        const label = formatLabel(textConfig.value.highlightLabels['accuracy-streak'], { count: milestone });
        capture('accuracy-streak', label, score, correctCount, stage);
        break;
      }
    }
  }

  function captureFinal(score: number, combo: number, stage: Stage) {
    const label = formatLabel(textConfig.value.highlightLabels['final'], {});
    capture('final', label, score, combo, stage);
  }

  function clear() {
    highlights.value = [];
    toasts.value = [];
    firedComboMilestones.clear();
    firedAccuracyMilestones.clear();
    firedSpeedBurst = false;
  }

  return {
    highlights,
    toasts,
    capture,
    onStageUp,
    onComboUpdate,
    onPerfectCycle,
    onSpeedUpdate,
    onAccuracyUpdate,
    captureFinal,
    getStageName,
    clear
  };
}
