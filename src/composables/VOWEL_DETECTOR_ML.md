# 元音检测模块集成指南

## 概述

已将训练好的 CNN 模型集成到主程序中，替代原有的共振峰检测方式。

## 文件结构

```
src/composables/
├── useVowelDetector.ts      # 原始的共振峰检测器（保留供参考）
└── useVowelDetectorML.ts    # ✨ 新的 TensorFlow.js 检测器

public/models/
└── vowel/
    ├── model.json           # 模型结构定义
    └── group1-shard1of1.bin # 量化后的权重（~70KB）
```

## 快速开始

### 1. 在 Vue 组件中使用

```typescript
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';

export default {
  setup() {
    const { 
      confirmedVowel,
      currentResult,
      isListening,
      start,
      stop,
      onVowelDetected,
      onError
    } = useVowelDetectorML({
      modelPath: '/models/vowel/model.json'  // 可选，默认值就是这个
    });

    // 监听元音检测事件
    onVowelDetected((vowel, result) => {
      console.log(`检测到: ${vowel}`);
      console.log(`置信度: ${result.confidence.toFixed(2)}`);
    });

    // 监听错误
    onError((err) => {
      console.error('检测错误:', err);
    });

    const handleStart = async () => {
      try {
        await start();
        console.log('检测已启动');
      } catch (err) {
        console.error('启动失败:', err);
      }
    };

    const handleStop = () => {
      stop();
      console.log('检测已停止');
    };

    return {
      confirmedVowel,
      currentResult,
      isListening,
      handleStart,
      handleStop
    };
  }
};
```

## API 参考

### `useVowelDetectorML(config?)`

#### 参数

```typescript
interface VowelDetectorConfig {
  modelPath?: string;  // 模型路径，默认: '/models/vowel/model.json'
  // 其他配置项与原检测器兼容
}
```

#### 返回值

```typescript
{
  // 响应式状态
  currentResult: Ref<VowelDetectionResult | null>;  // 最新检测结果
  confirmedVowel: Ref<Vowel | null>;               // 确认的元音 (A/E/I/O/U)
  isListening: Ref<boolean>;                       // 是否正在监听
  isInitialized: Ref<boolean>;                     // 是否已初始化
  error: Ref<string | null>;                       // 错误信息

  // 方法
  start: () => Promise<void>;        // 启动检测
  stop: () => void;                  // 停止检测
  reset: () => void;                 // 重置并释放资源
  onVowelDetected: (callback) => void;  // 注册元音检测回调
  onSilence: (callback) => void;        // 注册静音检测回调
  onError: (callback) => void;          // 注册错误回调
}
```

#### VowelDetectionResult

```typescript
{
  vowel: Vowel | null;        // 检测到的元音 (A/E/I/O/U 或 null)
  status: DetectionStatus;     // 检测状态 ('detected'|'ambiguous'|'silence'|'noise')
  confidence: number;          // 置信度 [0, 1]
  formants: { f1: 0, f2: 0 }; // ML 模型不使用，保留用于兼容性
  volume: number;              // 音量 (dB)
  timestamp: number;           // 时间戳 (ms)
}
```

## 模型信息

### 架构
- **输入**: 210ms 原始波形 (3360 samples @ 16kHz)
- **特征提取**: MelSpectrogram (19 时间步 × 40 Mel 频带)
- **分类**: CNN (3层卷积 + 全连接)
- **输出**: 6 类 softmax (A/E/I/O/U/silence)

### 性能
- **参数量**: ~72K
- **大小**: ~107KB (Keras格式) → ~70KB (TF.js 量化)
- **延迟**: ~50-100ms (CPU) / ~10-20ms (GPU)
- **准确率**: ~92% (测试集)

### 特征
✅ 端到端 Mel 特征提取 (模型内部完成)
✅ uint8 量化（减小模型体积）
✅ 跨平台推理（浏览器 + Node.js）
✅ 自适应的声学环境

## 迁移指南

### 从原有检测器切换

**之前:**
```typescript
import { useVowelDetector } from '@/composables/useVowelDetector';
const detector = useVowelDetector();
```

**现在:**
```typescript
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';
const detector = useVowelDetectorML();
```

### API 兼容性

两个检测器的返回值完全兼容，可以无缝切换：

```typescript
// ✅ 这样的代码无需修改
const { confirmedVowel, start, stop, onVowelDetected } = useVowelDetectorML();
onVowelDetected((vowel, result) => {
  // 相同的处理逻辑
});
```

## 故障排除

### 模型加载失败

**问题**: `模型加载失败: fetch failed`

**解决**:
1. 确认 `public/models/vowel/model.json` 存在
2. 检查 CORS 配置（开发环境应自动允许）
3. 验证网络连接
4. 检查浏览器控制台的详细错误

### 识别准确率低

**可能原因**:
- 背景噪音太大 → 建议在安静环境测试
- 麦克风质量差 → 考虑使用降噪功能
- 发音方式不标准 → 参考发音提示 (Hints)

**改进方案**:
1. 调整静音阈值: 修改 `useVowelDetectorML` 中的阈值
2. 增加置信度要求: 提高分类阈值
3. 使用多帧平均: 收集多个连续预测进行投票

### 内存泄漏

确保正确清理资源：

```typescript
onUnmounted(() => {
  detector.reset();  // 必须调用！
});
```

## 性能优化

### 减少计算量
```typescript
// 每 100ms 分析一次而不是每帧
const frameTime = 100; // ms
```

### GPU 加速
```typescript
// 在支持 WebGL 的设备上自动启用
await tf.setBackend('webgl'); // 或 'wasm'
```

### 内存管理
```typescript
// 模型加载后手动管理内存
model.dispose(); // 不再需要时清理
```

## 常见问题

**Q: 可以同时运行两个检测器吗？**
A: 不建议。两个都需要麦克风访问权限，会相互干扰。

**Q: 可以修改模型以支持其他元音吗？**
A: 可以，但需要重新训练。参考 `model/Vowel_CNN_Training.ipynb`。

**Q: 离线使用支持吗？**
A: 支持！模型在首次加载后会被缓存在 IndexedDB 中。

**Q: 如何导出检测结果？**
A: 在 `onVowelDetected` 回调中收集结果，转发到后端即可。

## 进阶用法

### 获取详细的预测概率

```typescript
// 目前 useVowelDetectorML 只返回最高概率
// 如需所有类别的概率，可修改源代码的 analyzeAudio 函数：

// 在 useVowelDetectorML.ts 中修改返回值
const result: VowelDetectionResult = {
  vowel: vowel,
  status,
  confidence: maxProb,
  formants: { f1: 0, f2: 0 },
  volume,
  timestamp: now,
  probabilities: Array.from(probabilities) // ← 添加这行
};
```

### 实时可视化

```typescript
const detector = useVowelDetectorML();

watch(() => detector.currentResult.value, (result) => {
  if (result) {
    console.log(`元音: ${result.vowel}, 置信度: ${result.confidence}`);
    // 更新 UI，绘制波形等
  }
});
```

## 相关文件

- [训练脚本](../model/Vowel_CNN_Training.ipynb)
- [原始配置](./config/vowels.ts)
- [原始检测器](./useVowelDetector.ts)
