import { ref, computed, type Ref } from 'vue';
import type {
  LeaderboardEntry,
  LeaderboardStats,
  ScoreSubmitPayload,
  ScoreSubmitResponse,
  GameSnapshot,
  GameStats,
} from '@/types/game';

/**
 * 排行榜 API 客户端
 *
 * Worker URL 通过 `VITE_LEADERBOARD_API` 环境变量配置：
 *   - 开发时在 `.env.local` 里设为 `http://localhost:8787`
 *   - 生产构建在 `.env.production` 里设为实际 Worker URL
 *
 * 若未配置则排行榜功能静默不可用。
 */

const API_BASE = import.meta.env.VITE_LEADERBOARD_API as string | undefined;

/* ---------- 持久化昵称 ---------- */

const NICKNAME_KEY = 'oiia:nickname';

function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

function saveNickname(name: string) {
  try {
    localStorage.setItem(NICKNAME_KEY, name);
  } catch { /* quota / private mode */ }
}

/* ---------- composable ---------- */

export function useLeaderboard(packId: Ref<string>) {
  const isAvailable = computed(() => !!API_BASE);

  // 排行榜数据
  const scores = ref<LeaderboardEntry[]>([]);
  const globalStats = ref<LeaderboardStats | null>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  // 提交状态
  const submitting = ref(false);
  const submitResult = ref<ScoreSubmitResponse | null>(null);
  const nickname = ref(loadNickname());

  /** 拉取排行榜 */
  async function fetchLeaderboard(limit = 20) {
    if (!API_BASE) return;
    loading.value = true;
    error.value = null;
    try {
      const res = await fetch(`${API_BASE}/api/leaderboard?limit=${limit}&packId=${encodeURIComponent(packId.value)}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      scores.value = data.scores;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '网络错误';
    } finally {
      loading.value = false;
    }
  }

  /** 拉取全局统计 */
  async function fetchStats() {
    if (!API_BASE) return;
    try {
      const res = await fetch(`${API_BASE}/api/stats?packId=${encodeURIComponent(packId.value)}`);
      if (!res.ok) return;
      globalStats.value = await res.json();
    } catch { /* silent */ }
  }

  /** 从 GameSnapshot + GameStats 构建提交数据 */
  function buildPayload(name: string, snap: GameSnapshot, stats: GameStats): ScoreSubmitPayload {
    return {
      name,
      packId: packId.value,
      score: snap.score,
      maxCombo: snap.maxCombo,
      stage: snap.stage,
      stageName: snap.stageName,
      perfectCycles: snap.perfectCycles,
      duration: snap.duration,
      totalVowels: stats.totalVowels,
      correctVowels: stats.correctVowels,
    };
  }

  /** 提交分数 */
  async function submitScore(
    name: string,
    snap: GameSnapshot,
    stats: GameStats,
  ): Promise<ScoreSubmitResponse | null> {
    if (!API_BASE) return null;

    const trimmed = name.trim();
    if (!trimmed) {
      error.value = '请输入昵称';
      return null;
    }

    submitting.value = true;
    error.value = null;
    submitResult.value = null;

    try {
      const payload = buildPayload(trimmed, snap, stats);
      const res = await fetch(`${API_BASE}/api/scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        error.value = data.error ?? `HTTP ${res.status}`;
        return null;
      }

      submitResult.value = data as ScoreSubmitResponse;
      saveNickname(trimmed);
      nickname.value = trimmed;
      return data as ScoreSubmitResponse;
    } catch (e: unknown) {
      error.value = e instanceof Error ? e.message : '网络错误';
      return null;
    } finally {
      submitting.value = false;
    }
  }

  /** 重置提交状态 (新一局时) */
  function resetSubmit() {
    submitResult.value = null;
    error.value = null;
  }

  return {
    // 状态
    isAvailable,
    scores,
    globalStats,
    loading,
    error,
    submitting,
    submitResult,
    nickname,
    // 方法
    fetchLeaderboard,
    fetchStats,
    submitScore,
    resetSubmit,
  };
}
