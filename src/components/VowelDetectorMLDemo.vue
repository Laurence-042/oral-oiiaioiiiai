<template>
  <div class="vowel-detector-demo">
    <h2>🎤 元音检测器 - TensorFlow.js 版本</h2>
    
    <!-- 状态指示 -->
    <div class="status-panel">
      <div class="status-item">
        <span class="label">状态:</span>
        <span class="value" :class="{ active: isListening }">
          {{ isListening ? '🔴 监听中' : '⚪ 已停止' }}
        </span>
      </div>
      
      <div class="status-item">
        <span class="label">初始化:</span>
        <span class="value">{{ isInitialized ? '✅ 就绪' : '⏳ 等待中' }}</span>
      </div>
      
      <div v-if="error" class="status-item error">
        <span class="label">错误:</span>
        <span class="value">{{ error }}</span>
      </div>
    </div>

    <!-- 实时检测结果 -->
    <div class="detection-panel">
      <div class="detected-vowel">
        <div class="label">检测到的元音:</div>
        <div class="vowel-display" :class="{ active: confirmedVowel }">
          {{ confirmedVowel || '--' }}
        </div>
      </div>

      <div v-if="currentResult" class="result-details">
        <p>
          <strong>置信度:</strong>
          <span>{{ (currentResult.confidence * 100).toFixed(1) }}%</span>
          <div class="confidence-bar">
            <div 
              class="confidence-fill"
              :style="{ width: `${currentResult.confidence * 100}%` }"
            ></div>
          </div>
        </p>
        
        <p>
          <strong>音量:</strong>
          <span>{{ currentResult.volume.toFixed(1) }} dB</span>
        </p>
        
        <p>
          <strong>状态:</strong>
          <span>{{ currentResult.status }}</span>
        </p>
      </div>
    </div>

    <!-- 控制按钮 -->
    <div class="controls">
      <button 
        @click="handleStart" 
        :disabled="isListening"
        class="btn btn-start"
      >
        启动检测
      </button>
      
      <button 
        @click="handleStop" 
        :disabled="!isListening"
        class="btn btn-stop"
      >
        停止检测
      </button>
      
      <button 
        @click="handleReset"
        class="btn btn-reset"
      >
        重置
      </button>
    </div>

    <!-- 检测序列 -->
    <div class="sequence-panel">
      <h3>📝 检测序列</h3>
      <div class="sequence">
        <div 
          v-for="(vowel, index) in detectedSequence"
          :key="index"
          class="sequence-item"
        >
          {{ vowel }}
        </div>
      </div>
      <p class="sequence-count">已检测: {{ detectedSequence.length }} 个元音</p>
    </div>

    <!-- 调试信息 -->
    <details class="debug-panel">
      <summary>🔧 调试信息</summary>
      <pre>{{ debugInfo }}</pre>
    </details>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';

// 使用 ML 检测器
const detector = useVowelDetectorML({
  modelPath: '/models/vowel/model.json'
});

const {
  currentResult,
  confirmedVowel,
  isListening,
  isInitialized,
  error,
  start,
  stop,
  reset,
  onVowelDetected,
  onError
} = detector;

// 本地状态
const detectedSequence = ref<string[]>([]);

// 计算属性
const debugInfo = computed(() => {
  return JSON.stringify(
    {
      isListening: isListening.value,
      isInitialized: isInitialized.value,
      confirmedVowel: confirmedVowel.value,
      currentResult: currentResult.value,
      sequenceLength: detectedSequence.value.length
    },
    null,
    2
  );
});

// 方法
const handleStart = async () => {
  try {
    await start();
  } catch (err) {
    console.error('启动失败:', err);
  }
};

const handleStop = () => {
  stop();
};

const handleReset = () => {
  reset();
  detectedSequence.value = [];
};

// 初始化回调
onMounted(() => {
  // 监听元音检测
  onVowelDetected((vowel, result) => {
    console.log(`✅ 检测到: ${vowel}, 置信度: ${result.confidence.toFixed(2)}`);
    detectedSequence.value.push(vowel);
  });

  // 监听错误
  onError((err) => {
    console.error('❌ 检测错误:', err);
  });
});
</script>

<style scoped>
.vowel-detector-demo {
  max-width: 600px;
  margin: 20px auto;
  padding: 20px;
  background: #f5f5f5;
  border-radius: 8px;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
}

h2 {
  color: #333;
  margin-top: 0;
}

/* 状态面板 */
.status-panel {
  background: white;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 15px;
  border-left: 4px solid #1890ff;
}

.status-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 8px 0;
  font-size: 14px;
}

.status-item.error {
  color: #ff4d4f;
}

.label {
  font-weight: 600;
  color: #666;
}

.value {
  color: #999;
}

.value.active {
  color: #ff4d4f;
  font-weight: bold;
}

/* 检测面板 */
.detection-panel {
  background: white;
  padding: 20px;
  border-radius: 6px;
  margin-bottom: 15px;
  text-align: center;
}

.detected-vowel {
  margin-bottom: 20px;
}

.detected-vowel .label {
  font-size: 14px;
  color: #999;
  margin-bottom: 10px;
}

.vowel-display {
  font-size: 48px;
  font-weight: bold;
  color: #ccc;
  padding: 20px;
  background: #fafafa;
  border-radius: 4px;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.3s;
}

.vowel-display.active {
  color: #1890ff;
  background: #e6f7ff;
  box-shadow: 0 2px 8px rgba(24, 144, 255, 0.2);
}

.result-details {
  text-align: left;
  margin-top: 15px;
  font-size: 14px;
  color: #666;
}

.result-details p {
  margin: 8px 0;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.result-details strong {
  color: #333;
}

.confidence-bar {
  flex: 1;
  margin-left: 10px;
  height: 6px;
  background: #e8e8e8;
  border-radius: 3px;
  overflow: hidden;
  min-width: 100px;
}

.confidence-fill {
  height: 100%;
  background: linear-gradient(90deg, #52c41a, #1890ff);
  transition: width 0.3s;
}

/* 控制按钮 */
.controls {
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
}

.btn {
  flex: 1;
  padding: 10px 16px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-start {
  background: #52c41a;
  color: white;
}

.btn-start:hover:not(:disabled) {
  background: #389e0d;
}

.btn-stop {
  background: #ff4d4f;
  color: white;
}

.btn-stop:hover:not(:disabled) {
  background: #cf1322;
}

.btn-reset {
  background: #999;
  color: white;
}

.btn-reset:hover {
  background: #666;
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 序列面板 */
.sequence-panel {
  background: white;
  padding: 15px;
  border-radius: 6px;
  margin-bottom: 15px;
}

.sequence-panel h3 {
  margin-top: 0;
  color: #333;
  font-size: 16px;
}

.sequence {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 10px;
  min-height: 36px;
}

.sequence-item {
  background: #1890ff;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  font-weight: bold;
  font-size: 14px;
}

.sequence-count {
  margin: 0;
  color: #999;
  font-size: 12px;
}

/* 调试面板 */
.debug-panel {
  background: #fafafa;
  padding: 10px;
  border-radius: 4px;
  margin-top: 15px;
}

.debug-panel summary {
  cursor: pointer;
  color: #666;
  font-size: 12px;
  user-select: none;
}

.debug-panel pre {
  background: white;
  padding: 10px;
  border-radius: 4px;
  font-size: 11px;
  overflow-x: auto;
  margin: 10px 0 0 0;
  color: #333;
}
</style>
