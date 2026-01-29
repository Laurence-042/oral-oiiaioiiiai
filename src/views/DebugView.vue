<template>
  <div class="debug-view">
    <header class="debug-header">
      <h1>🐱 OIIAIOIIIAI 元音识别调试</h1>
      <p class="subtitle">测试麦克风输入和元音检测功能</p>
    </header>

    <!-- 控制面板 -->
    <section class="control-panel">
      <button 
        class="btn btn-primary" 
        @click="toggleListening"
        :disabled="!!error"
      >
        {{ isListening ? '🛑 停止监听' : '🎤 开始监听' }}
      </button>
      
      <span class="status-indicator" :class="gameStatusClass">
        {{ gameStatusText }}
      </span>
    </section>

    <!-- 错误提示 -->
    <div v-if="error" class="error-banner">
      ⚠️ {{ error }}
    </div>

    <!-- 主要显示区域 -->
    <div class="main-display">
      <!-- 当前元音 -->
      <div class="vowel-display" :class="confirmedVowel?.toLowerCase()">
        <span class="vowel-label">当前元音</span>
        <span class="vowel-char">{{ confirmedVowel || '-' }}</span>
        <span class="vowel-confidence" v-if="currentResult">
          置信度: {{ (currentResult.confidence * 100).toFixed(0) }}%
        </span>
      </div>

      <!-- 序列进度 -->
      <div class="sequence-display">
        <span class="sequence-label">目标序列</span>
        <div class="sequence-chars">
          <span 
            v-for="(char, index) in targetSequence" 
            :key="index"
            class="seq-char"
            :class="{ 
              'active': index === stats.sequenceIndex,
              'done': index < stats.sequenceIndex || (stats.sequenceIndex === 0 && stats.perfectCycles > 0)
            }"
          >
            {{ char }}
          </span>
        </div>
        <span class="cycle-count">完美循环: {{ stats.perfectCycles }} 次</span>
      </div>
    </div>

    <!-- 数据面板 -->
    <div class="data-panels">
      <!-- 共振峰数据 -->
      <div class="panel formant-panel">
        <h3>📊 共振峰数据</h3>
        <div class="formant-data" v-if="currentResult">
          <div class="formant-item">
            <label>F1 (第一共振峰)</label>
            <span class="value">{{ currentResult.formants.f1.toFixed(0) }} Hz</span>
            <div class="bar-container">
              <div 
                class="bar f1-bar" 
                :style="{ width: `${Math.min(100, currentResult.formants.f1 / 12)}%` }"
              ></div>
            </div>
          </div>
          <div class="formant-item">
            <label>F2 (第二共振峰)</label>
            <span class="value">{{ currentResult.formants.f2.toFixed(0) }} Hz</span>
            <div class="bar-container">
              <div 
                class="bar f2-bar" 
                :style="{ width: `${Math.min(100, currentResult.formants.f2 / 35)}%` }"
              ></div>
            </div>
          </div>
          <div class="formant-item">
            <label>音量</label>
            <span class="value">{{ currentResult.volume.toFixed(1) }} dB</span>
            <div class="bar-container">
              <div 
                class="bar volume-bar" 
                :style="{ width: `${Math.max(0, Math.min(100, (currentResult.volume + 60) * 2))}%` }"
              ></div>
              <div class="threshold-marker" :style="{ left: `${(-35 + 60) * 2}%` }"></div>
            </div>
          </div>
          <div class="formant-item">
            <label>状态</label>
            <span class="value status" :class="currentResult.status">
              {{ statusLabels[currentResult.status] }}
            </span>
          </div>
        </div>
        <div v-else class="no-data">等待音频输入...</div>
      </div>

      <!-- 游戏状态 -->
      <div class="panel game-panel">
        <h3>🎮 游戏状态</h3>
        <div class="game-stats">
          <div class="stat-item">
            <label>状态</label>
            <span class="value state" :class="state">{{ stateLabels[state] }}</span>
          </div>
          <div class="stat-item">
            <label>分数</label>
            <span class="value score">{{ stats.score.toLocaleString() }}</span>
          </div>
          <div class="stat-item">
            <label>连击</label>
            <span class="value combo">{{ stats.combo }}x</span>
          </div>
          <div class="stat-item">
            <label>最高连击</label>
            <span class="value">{{ stats.maxCombo }}x</span>
          </div>
          <div class="stat-item">
            <label>连击倍率</label>
            <span class="value multiplier">{{ stats.comboMultiplier.toFixed(1) }}x</span>
          </div>
          <div class="stat-item">
            <label>阶段</label>
            <span class="value stage" :class="`stage-${stats.stage}`">
              Stage {{ stats.stage }}: {{ stats.stageName }}
            </span>
          </div>
          <div class="stat-item">
            <label>连续错误</label>
            <span class="value errors" :class="{ warning: stats.consecutiveErrors > 0 }">
              {{ stats.consecutiveErrors }} / 3
            </span>
          </div>
        </div>
      </div>

      <!-- 元音参考 -->
      <div class="panel reference-panel">
        <h3>📖 元音共振峰参考</h3>
        <table class="reference-table">
          <thead>
            <tr>
              <th>元音</th>
              <th>F1 (Hz)</th>
              <th>F2 (Hz)</th>
            </tr>
          </thead>
          <tbody>
            <tr class="vowel-o">
              <td><strong>O</strong></td>
              <td>400 - 600</td>
              <td>800 - 1200</td>
            </tr>
            <tr class="vowel-i">
              <td><strong>I</strong></td>
              <td>200 - 400</td>
              <td>2000 - 3000</td>
            </tr>
            <tr class="vowel-a">
              <td><strong>A</strong></td>
              <td>700 - 1000</td>
              <td>1200 - 1800</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 事件日志 -->
    <div class="panel log-panel">
      <h3>📝 事件日志 <button class="btn-clear" @click="clearLogs">清空</button></h3>
      <div class="log-container" ref="logContainer">
        <div 
          v-for="(log, index) in logs" 
          :key="index" 
          class="log-item"
          :class="log.type"
        >
          <span class="log-time">{{ log.time }}</span>
          <span class="log-message">{{ log.message }}</span>
        </div>
        <div v-if="logs.length === 0" class="no-logs">暂无日志</div>
      </div>
    </div>

    <!-- 频谱可视化 -->
    <div class="panel spectrum-panel">
      <h3>🌈 频谱可视化</h3>
      <canvas ref="spectrumCanvas" width="600" height="150"></canvas>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue';
import { useVowelDetector } from '@/composables/useVowelDetector';
import { useGameState } from '@/composables/useGameState';
import { TARGET_SEQUENCE } from '@/config/vowels';
import type { GameState, DetectionStatus } from '@/types/game';

// ==================== Composables ====================
const {
  currentResult,
  confirmedVowel,
  isListening,
  isInitialized,
  error,
  start,
  stop,
  reset: resetDetector,
  onVowelDetected,
  onSilence,
  onError,
  debugData
} = useVowelDetector();

const {
  state,
  stats,
  isPlaying,
  startGame,
  processVowel,
  interrupt,
  reset: resetGame,
  freeMode,
  onStageChange,
  onComboBreak,
  onPerfectCycle,
  onScoreUpdate
} = useGameState();

// ==================== 状态 ====================
const targetSequence = TARGET_SEQUENCE;
const logs = ref<{ time: string; message: string; type: string }[]>([]);
const logContainer = ref<HTMLDivElement | null>(null);
const spectrumCanvas = ref<HTMLCanvasElement | null>(null);
let animationId: number | null = null;

// 游戏状态文字
const gameStatusClass = computed(() => {
  if (!isListening.value) return 'offline';
  return state.value;
});

const gameStatusText = computed(() => {
  if (!isListening.value) return '🔇 未监听';
  switch (state.value) {
    case 'idle': return '⏳ 等待发出 "O"...';
    case 'playing': return '🎮 游戏中';
    case 'interrupted': return '💔 已中断 - 发出 "O" 重新开始';
    case 'sharing': return '📤 分享中';
    default: return '';
  }
});

// ==================== 标签映射 ====================
const stateLabels: Record<GameState, string> = {
  idle: '待机',
  playing: '游戏中',
  interrupted: '已中断',
  sharing: '分享中'
};

const statusLabels: Record<DetectionStatus, string> = {
  detected: '✅ 检测到',
  silence: '🔇 静音',
  noise: '🔊 噪音',
  ambiguous: '❓ 模糊'
};

// ==================== 方法 ====================
async function toggleListening() {
  if (isListening.value) {
    stop();
    resetGame();
    addLog('停止监听', 'info');
  } else {
    try {
      await start();
      addLog('开始监听麦克风 - 发出 "O" 开始游戏', 'success');
    } catch (e) {
      addLog(`启动失败: ${e}`, 'error');
    }
  }
}

function addLog(message: string, type: string = 'info') {
  const now = new Date();
  const time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}.${now.getMilliseconds().toString().padStart(3, '0')}`;
  logs.value.push({ time, message, type });
  
  // 保持日志数量
  if (logs.value.length > 100) {
    logs.value.shift();
  }
  
  // 滚动到底部
  nextTick(() => {
    if (logContainer.value) {
      logContainer.value.scrollTop = logContainer.value.scrollHeight;
    }
  });
}

function clearLogs() {
  logs.value = [];
}

// ==================== 自动游戏控制 ====================
// 检测到 "O" 时自动开始游戏
onVowelDetected((vowel, result) => {
  addLog(`检测到元音: ${vowel} (置信度: ${(result.confidence * 100).toFixed(0)}%)`, 'vowel');
  
  // 如果游戏未开始或已中断，检测到 O 时自动开始
  if ((state.value === 'idle' || state.value === 'interrupted') && vowel === 'O') {
    startGame();
    addLog('🎮 游戏自动开始！', 'success');
  }
  
  // 游戏进行中，处理元音
  if (state.value === 'playing') {
    processVowel(vowel);
  }
});

// 静音超时自动中断
onSilence((duration) => {
  if (duration > 500 && duration % 500 < 50) {
    addLog(`静音中... ${(duration / 1000).toFixed(1)}s`, 'silence');
  }
  
  // 游戏进行中，静音超过 1.5 秒自动中断
  if (state.value === 'playing' && duration >= 1500) {
    interrupt('silence_timeout');
  }
});

onError((err) => {
  addLog(`错误: ${err.message}`, 'error');
});

onStageChange((from, to) => {
  addLog(`🎉 阶段提升! Stage ${from} → Stage ${to}`, 'stage');
});

onComboBreak((combo, reason) => {
  const reasonText = reason === 'silence_timeout' ? '静音超时' : 
                     reason === 'consecutive_errors' ? '连续错误' : '手动中断';
  addLog(`💔 连击中断: ${combo}x (原因: ${reasonText})`, 'break');
});

onPerfectCycle((count) => {
  addLog(`✨ 完美循环 #${count}!`, 'perfect');
});

onScoreUpdate((score, delta) => {
  if (delta > 0) {
    addLog(`+${delta} 分 (总分: ${score})`, 'score');
  }
});

// ==================== 频谱绘制 ====================
function drawSpectrum() {
  const canvas = spectrumCanvas.value;
  const data = debugData.value.frequencyData;
  
  if (!canvas || !data) {
    animationId = requestAnimationFrame(drawSpectrum);
    return;
  }
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  const width = canvas.width;
  const height = canvas.height;
  
  // 清空画布
  ctx.fillStyle = '#1a1a2e';
  ctx.fillRect(0, 0, width, height);
  
  // 只绘制前 256 个 bin（低频部分，包含人声）
  const binCount = Math.min(256, data.length);
  const barWidth = width / binCount;
  
  for (let i = 0; i < binCount; i++) {
    // 将 dB 值转换为高度 (-100 ~ 0 dB)
    const value = data[i];
    const normalizedValue = Math.max(0, (value + 100) / 100);
    const barHeight = normalizedValue * height;
    
    // 根据频率设置颜色
    const hue = (i / binCount) * 240; // 从红到蓝
    ctx.fillStyle = `hsl(${hue}, 80%, ${50 + normalizedValue * 30}%)`;
    
    ctx.fillRect(
      i * barWidth,
      height - barHeight,
      barWidth - 1,
      barHeight
    );
  }
  
  // 绘制共振峰标记
  if (currentResult.value && currentResult.value.status === 'detected') {
    const f1 = currentResult.value.formants.f1;
    const f2 = currentResult.value.formants.f2;
    
    // F1 标记 (假设 0-4000Hz 映射到 0-256 bins)
    const f1Bin = Math.floor(f1 / 4000 * binCount);
    const f2Bin = Math.floor(f2 / 4000 * binCount);
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 2;
    
    // F1
    ctx.beginPath();
    ctx.moveTo(f1Bin * barWidth, 0);
    ctx.lineTo(f1Bin * barWidth, height);
    ctx.stroke();
    ctx.fillStyle = '#00ff00';
    ctx.font = '10px monospace';
    ctx.fillText(`F1: ${f1.toFixed(0)}Hz`, f1Bin * barWidth + 2, 12);
    
    // F2
    ctx.strokeStyle = '#ff00ff';
    ctx.beginPath();
    ctx.moveTo(f2Bin * barWidth, 0);
    ctx.lineTo(f2Bin * barWidth, height);
    ctx.stroke();
    ctx.fillStyle = '#ff00ff';
    ctx.fillText(`F2: ${f2.toFixed(0)}Hz`, f2Bin * barWidth + 2, 24);
  }
  
  animationId = requestAnimationFrame(drawSpectrum);
}

// ==================== 生命周期 ====================
onMounted(async () => {
  addLog('调试页面已加载', 'info');
  drawSpectrum();
  
  // 自动开始监听
  try {
    await start();
    addLog('开始监听麦克风 - 发出 "O" 开始游戏', 'success');
  } catch (e) {
    addLog(`自动启动失败: ${e}`, 'error');
  }
});

onUnmounted(() => {
  if (animationId) {
    cancelAnimationFrame(animationId);
  }
});
</script>

<style scoped>
.debug-view {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
  color: #fff;
  padding: 20px;
  font-family: 'Segoe UI', system-ui, sans-serif;
}

.debug-header {
  text-align: center;
  margin-bottom: 24px;
}

.debug-header h1 {
  font-size: 2rem;
  margin: 0;
  background: linear-gradient(90deg, #ff6b6b, #feca57, #48dbfb);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.subtitle {
  color: #888;
  margin-top: 8px;
}

/* 控制面板 */
.control-panel {
  display: flex;
  gap: 12px;
  justify-content: center;
  margin-bottom: 24px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(135deg, #e94560, #ff6b6b);
  color: white;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(233, 69, 96, 0.4);
}

.btn-secondary {
  background: linear-gradient(135deg, #0f3460, #16213e);
  color: white;
  border: 1px solid #e94560;
}

.btn-outline {
  background: transparent;
  color: #888;
  border: 1px solid #444;
}

.btn-outline:hover {
  border-color: #888;
  color: #fff;
}

/* 状态指示器 */
.status-indicator {
  display: flex;
  align-items: center;
  padding: 12px 24px;
  border-radius: 8px;
  font-size: 1rem;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid #333;
}

.status-indicator.offline {
  color: #666;
}

.status-indicator.idle {
  color: #feca57;
  border-color: #feca57;
  animation: pulse 2s ease-in-out infinite;
}

.status-indicator.playing {
  color: #00d2d3;
  border-color: #00d2d3;
  background: rgba(0, 210, 211, 0.1);
}

.status-indicator.interrupted {
  color: #e94560;
  border-color: #e94560;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}

/* 错误提示 */
.error-banner {
  background: rgba(233, 69, 96, 0.2);
  border: 1px solid #e94560;
  color: #ff6b6b;
  padding: 12px 20px;
  border-radius: 8px;
  margin-bottom: 24px;
  text-align: center;
}

/* 主显示区 */
.main-display {
  display: flex;
  gap: 24px;
  justify-content: center;
  margin-bottom: 24px;
}

.vowel-display {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 24px 48px;
  text-align: center;
  border: 2px solid #333;
  transition: all 0.2s;
}

.vowel-display.o {
  border-color: #ff6b6b;
  box-shadow: 0 0 20px rgba(255, 107, 107, 0.3);
}

.vowel-display.i {
  border-color: #48dbfb;
  box-shadow: 0 0 20px rgba(72, 219, 251, 0.3);
}

.vowel-display.a {
  border-color: #feca57;
  box-shadow: 0 0 20px rgba(254, 202, 87, 0.3);
}

.vowel-label {
  display: block;
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 8px;
}

.vowel-char {
  display: block;
  font-size: 4rem;
  font-weight: bold;
  line-height: 1;
}

.vowel-confidence {
  display: block;
  color: #888;
  font-size: 0.85rem;
  margin-top: 8px;
}

/* 序列显示 */
.sequence-display {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 16px;
  padding: 24px;
  text-align: center;
}

.sequence-label {
  display: block;
  color: #888;
  font-size: 0.9rem;
  margin-bottom: 12px;
}

.sequence-chars {
  display: flex;
  gap: 4px;
  justify-content: center;
}

.seq-char {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  font-weight: bold;
  transition: all 0.2s;
}

.seq-char.active {
  background: #e94560;
  transform: scale(1.2);
}

.seq-char.done {
  background: rgba(72, 219, 251, 0.3);
  color: #48dbfb;
}

.cycle-count {
  display: block;
  color: #feca57;
  font-size: 0.9rem;
  margin-top: 12px;
}

/* 数据面板 */
.data-panels {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.panel {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 16px;
}

.panel h3 {
  margin: 0 0 12px 0;
  font-size: 1rem;
  color: #ddd;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

/* 共振峰数据 */
.formant-item {
  margin-bottom: 12px;
}

.formant-item label {
  display: block;
  color: #888;
  font-size: 0.8rem;
  margin-bottom: 4px;
}

.formant-item .value {
  font-weight: bold;
  font-size: 1.1rem;
}

.bar-container {
  height: 6px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
  margin-top: 4px;
  overflow: visible;
  position: relative;
}

.bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.1s;
}

.threshold-marker {
  position: absolute;
  top: -2px;
  width: 2px;
  height: 10px;
  background: #e94560;
  border-radius: 1px;
}

.f1-bar { background: linear-gradient(90deg, #ff6b6b, #feca57); }
.f2-bar { background: linear-gradient(90deg, #48dbfb, #ff9ff3); }
.volume-bar { background: linear-gradient(90deg, #00d2d3, #54a0ff); }

.status.detected { color: #00d2d3; }
.status.silence { color: #888; }
.status.noise { color: #feca57; }
.status.ambiguous { color: #ff9ff3; }

.no-data {
  color: #666;
  text-align: center;
  padding: 20px;
}

/* 游戏状态 */
.game-stats {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item label {
  display: block;
  color: #888;
  font-size: 0.75rem;
}

.stat-item .value {
  font-weight: bold;
  font-size: 1rem;
}

.state.idle { color: #888; }
.state.playing { color: #00d2d3; }
.state.interrupted { color: #e94560; }
.state.sharing { color: #feca57; }

.score { color: #feca57; font-size: 1.3rem !important; }
.combo { color: #ff6b6b; }
.multiplier { color: #48dbfb; }

.stage-1 { color: #888; }
.stage-2 { color: #ff6b6b; }
.stage-3 { color: #feca57; }
.stage-4 { color: #ff9ff3; }
.stage-5 { color: #48dbfb; }

.errors.warning { color: #e94560; }

/* 参考表 */
.reference-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.reference-table th,
.reference-table td {
  padding: 8px;
  text-align: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.reference-table th {
  color: #888;
  font-weight: normal;
}

.vowel-o td:first-child { color: #ff6b6b; }
.vowel-i td:first-child { color: #48dbfb; }
.vowel-a td:first-child { color: #feca57; }

/* 日志面板 */
.log-panel {
  margin-bottom: 16px;
}

.btn-clear {
  background: transparent;
  border: 1px solid #444;
  color: #888;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.75rem;
  cursor: pointer;
}

.btn-clear:hover {
  border-color: #888;
  color: #fff;
}

.log-container {
  height: 150px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 8px;
  font-family: 'Consolas', monospace;
  font-size: 0.8rem;
}

.log-item {
  padding: 4px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
}

.log-time {
  color: #666;
  margin-right: 8px;
}

.log-item.info .log-message { color: #888; }
.log-item.success .log-message { color: #00d2d3; }
.log-item.error .log-message { color: #e94560; }
.log-item.vowel .log-message { color: #feca57; }
.log-item.silence .log-message { color: #666; }
.log-item.stage .log-message { color: #ff9ff3; }
.log-item.break .log-message { color: #e94560; }
.log-item.perfect .log-message { color: #48dbfb; }
.log-item.score .log-message { color: #00d2d3; }

.no-logs {
  color: #666;
  text-align: center;
  padding: 20px;
}

/* 频谱面板 */
.spectrum-panel canvas {
  width: 100%;
  height: 150px;
  border-radius: 8px;
}
</style>
