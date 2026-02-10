import { ref, type Ref } from 'vue';
import type { Stage } from '@/types/game';

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
  | 'stage-up'       // 阶段提升
  | 'combo-milestone' // 连击里程碑
  | 'perfect-cycle'  // 完美循环
  | 'final';         // 结束前最后一帧

/** 连击里程碑阈值 */
const COMBO_MILESTONES = [10, 25, 50, 100, 200, 500];

/** 最多保留的高光数 */
const MAX_HIGHLIGHTS = 8;

// ==================== Composable ====================

export interface UseHighlightsReturn {
  /** 所有高光时刻 */
  highlights: Ref<HighlightMoment[]>;
  /** 记录高光时刻（纯数据，零开销） */
  capture: (reason: HighlightReason, label: string, score: number, combo: number, stage: Stage) => void;
  /** 当阶段变化时自动判定 */
  onStageUp: (from: Stage, to: Stage, score: number, combo: number) => void;
  /** 当连击更新时自动判定是否命中里程碑 */
  onComboUpdate: (combo: number, score: number, stage: Stage) => void;
  /** 当完美循环时自动记录 */
  onPerfectCycle: (count: number, score: number, combo: number, stage: Stage) => void;
  /** 记录最后时刻 */
  captureFinal: (score: number, combo: number, stage: Stage) => void;
  /** 清空 */
  clear: () => void;
}

export function useHighlights(): UseHighlightsReturn {
  const highlights = ref<HighlightMoment[]>([]);
  let nextId = 0;
  /** 已触发过的连击里程碑（避免重复） */
  const firedComboMilestones = new Set<number>();

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
  }

  const STAGE_NAMES: Record<number, string> = {
    1: '初醒', 2: '躁动', 3: '狂热', 4: '超度', 5: '神猫'
  };

  function onStageUp(from: Stage, to: Stage, score: number, combo: number) {
    if (to > from) {
      capture('stage-up', `⬆ ${STAGE_NAMES[to] ?? `Stage ${to}`}`, score, combo, to);
    }
  }

  function onComboUpdate(combo: number, score: number, stage: Stage) {
    for (const milestone of COMBO_MILESTONES) {
      if (combo >= milestone && !firedComboMilestones.has(milestone)) {
        firedComboMilestones.add(milestone);
        capture('combo-milestone', `🔥 ${milestone} 连击`, score, combo, stage);
        break;
      }
    }
  }

  function onPerfectCycle(count: number, score: number, combo: number, stage: Stage) {
    capture('perfect-cycle', `✨ 完美循环 ×${count}`, score, combo, stage);
  }

  function captureFinal(score: number, combo: number, stage: Stage) {
    capture('final', '🏁 最终时刻', score, combo, stage);
  }

  function clear() {
    highlights.value = [];
    firedComboMilestones.clear();
  }

  return {
    highlights,
    capture,
    onStageUp,
    onComboUpdate,
    onPerfectCycle,
    captureFinal,
    clear
  };
}
