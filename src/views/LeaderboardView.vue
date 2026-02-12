<template>
  <div class="leaderboard-view">
    <header class="lb-header">
      <button class="btn-back" @click="$router.push('/game')">← 返回</button>
      <h1 class="lb-title">🏆 全网合唱排行榜 🏆</h1>
    </header>

    <!-- 全局统计 -->
    <div v-if="globalStats" class="lb-stats">
      <div class="stat-item">
        <span class="stat-number">{{ globalStats.totalPlays.toLocaleString() }}</span>
        <span class="stat-label">人对着猫叫过</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">{{ globalStats.totalOiiia.toLocaleString() }}</span>
        <span class="stat-label">累计 OIIIA 次数</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">{{ globalStats.highestScore.toLocaleString() }}</span>
        <span class="stat-label">最高分记录</span>
      </div>
    </div>

    <!-- 不可用提示 -->
    <div v-if="!isAvailable" class="lb-unavailable">
      <p>🚧 排行榜服务未配置</p>
      <p class="hint">需在环境变量 <code>VITE_LEADERBOARD_API</code> 中设置 Worker URL</p>
    </div>

    <!-- 加载 / 错误 -->
    <div v-else-if="loading" class="lb-loading">
      <div class="spinner"></div>
      <p>加载排行榜…</p>
    </div>
    <div v-else-if="error" class="lb-error">
      <p>😿 加载失败: {{ error }}</p>
      <button class="btn primary" @click="load">重试</button>
    </div>

    <!-- 排行榜列表 -->
    <div v-else class="lb-list">
      <div v-if="scores.length === 0" class="lb-empty">
        <p>还没有人上榜，成为第一个吧！ 🐱</p>
      </div>
      <div
        v-for="(entry, idx) in scores"
        :key="entry.id"
        class="lb-row"
        :class="{ gold: idx === 0, silver: idx === 1, bronze: idx === 2 }"
      >
        <span class="lb-rank">{{ rankIcon(idx) }}</span>
        <div class="lb-info">
          <span class="lb-name">{{ entry.name }}</span>
          <span class="lb-meta">
            Stage {{ entry.stage }} · {{ entry.maxCombo }}x连击 · {{ formatDuration(entry.duration) }}
          </span>
        </div>
        <span class="lb-score">{{ entry.score.toLocaleString() }}</span>
      </div>
    </div>

    <footer class="lb-footer">
      <button class="btn primary" @click="load" :disabled="loading">🔄 刷新</button>
    </footer>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useLeaderboard } from '@/composables/useLeaderboard';

const { scores, globalStats, loading, error, isAvailable, fetchLeaderboard, fetchStats } = useLeaderboard();

function rankIcon(idx: number): string {
  if (idx === 0) return '👑';
  if (idx === 1) return '🥈';
  if (idx === 2) return '🥉';
  return `${idx + 1}`;
}

function formatDuration(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return m > 0 ? `${m}分${sec}秒` : `${sec}秒`;
}

async function load() {
  await Promise.all([fetchLeaderboard(50), fetchStats()]);
}

onMounted(() => {
  if (isAvailable.value) load();
});
</script>

<style scoped>
.leaderboard-view {
  min-height: 100dvh;
  background: linear-gradient(135deg, #0a0a2e 0%, #1a1a4e 50%, #0a0a2e 100%);
  color: #fff;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px;
  font-family: system-ui, -apple-system, sans-serif;
}

/* Header */
.lb-header {
  width: 100%;
  max-width: 600px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}
.btn-back {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #fff;
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  white-space: nowrap;
}
.btn-back:hover { background: rgba(255, 255, 255, 0.2); }
.lb-title {
  font-size: 20px;
  font-weight: 700;
  flex: 1;
  text-align: center;
}

/* Stats */
.lb-stats {
  width: 100%;
  max-width: 600px;
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}
.stat-item {
  flex: 1;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 12px;
  text-align: center;
}
.stat-number {
  display: block;
  font-size: 22px;
  font-weight: 700;
  color: #ffd700;
}
.stat-label {
  display: block;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.6);
  margin-top: 4px;
}

/* List */
.lb-list {
  width: 100%;
  max-width: 600px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1;
}
.lb-row {
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  padding: 12px 16px;
  transition: background 0.2s;
}
.lb-row:hover { background: rgba(255, 255, 255, 0.1); }
.lb-row.gold { border-color: rgba(255, 215, 0, 0.4); background: rgba(255, 215, 0, 0.08); }
.lb-row.silver { border-color: rgba(192, 192, 192, 0.3); background: rgba(192, 192, 192, 0.06); }
.lb-row.bronze { border-color: rgba(205, 127, 50, 0.3); background: rgba(205, 127, 50, 0.06); }

.lb-rank {
  font-size: 20px;
  min-width: 36px;
  text-align: center;
}
.lb-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.lb-name {
  font-size: 15px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.lb-meta {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}
.lb-score {
  font-size: 18px;
  font-weight: 700;
  color: #ffd700;
  font-variant-numeric: tabular-nums;
}

/* States */
.lb-unavailable, .lb-loading, .lb-error, .lb-empty {
  width: 100%;
  max-width: 600px;
  text-align: center;
  padding: 48px 16px;
  color: rgba(255, 255, 255, 0.6);
}
.lb-unavailable .hint { font-size: 12px; margin-top: 8px; }
.lb-unavailable code {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 12px;
}
.spinner {
  width: 32px; height: 32px;
  border: 3px solid rgba(255, 255, 255, 0.15);
  border-top-color: #ffd700;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto 12px;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* Buttons */
.btn {
  padding: 8px 20px;
  border-radius: 10px;
  border: none;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn:disabled { opacity: 0.5; cursor: default; }
.btn.primary {
  background: linear-gradient(135deg, #ffd700, #ffaa00);
  color: #1a1a2e;
}
.btn.primary:hover:not(:disabled) { opacity: 0.9; }

/* Footer */
.lb-footer {
  width: 100%;
  max-width: 600px;
  margin-top: 24px;
  text-align: center;
}
</style>
