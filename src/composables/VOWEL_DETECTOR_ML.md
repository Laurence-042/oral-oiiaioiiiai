# 元音检测模块集成指南

## 概述

使用训练好的 CNN 模型进行实时元音识别，替代原有的共振峰检测方式。音频采集与重采样由 AudioWorklet 在独立线程完成，主线程仅负责推理与 UI 更新。

项目同时保留了两套检测器（CNN / MFCC），在 GameView 中可切换，默认使用 MFCC。

## 项目全貌

### 路由 & 视图

| 路径 | 视图 | 说明 |
|------|------|------|
| `/game` (默认) | `GameView.vue` | 主游戏界面，支持 CNN/MFCC 切换，集成计分、BGM、分享、排行榜 |
| `/debug` | `DebugView.vue` | 统一的实时检测调试 UI，可切换 CNN/MFCC，查看识别延迟、概率分布等 |
| `/analyzer` | `AudioAnalyzer.vue` | 离线音频分析工具，加载音频文件或麦克风录音，查看频谱/共振峰特征 |
| `/media-processor` | `MediaProcessor.vue` | 素材加工工具，从 MP4 视频中提取音频片段和帧图片供资源包使用 |

### Composables

| 文件 | 说明 |
|------|------|
| `useVowelDetectorML.ts` | **CNN 检测器** — TensorFlow.js 模型推理，本文档重点 |
| `useVowelDetector.ts` | **MFCC/共振峰检测器** — FFT + F1/F2 匹配，延迟低，安静环境推荐 |
| `useGameState.ts` | 游戏状态机 — 计分、连击、阶段晋升、序列校验、中断处理 |
| `useDynamicBGM.ts` | 动态 BGM 引擎 — 懒加载 Tone.js，按阶段启停合成器轨道 |
| `useResourcePack.ts` | 资源包加载器 — 阶段配置、文案、BGM 配置、音节音频 |
| `useShareCapture.ts` | 分享图生成 — Canvas 绘制结算卡 + QR code |
| `useHighlights.ts` | 高光时刻记录 — 阶段提升、连击里程碑、完美循环等 |
| `useHighlightRenderer.ts` | 高光卡片渲染 — 将高光时刻绘制为可分享的 Canvas 图片 |
| `useLeaderboard.ts` | 排行榜 API 客户端 — 对接 Cloudflare Worker 后端 |

### Workers

| 文件 | 说明 |
|------|------|
| `workers/vowelAudioProcessor.ts` | AudioWorklet 处理器 — 音频采集 + 16kHz 重采样，运行在独立音频线程 |

### 配置

| 文件 | 说明 |
|------|------|
| `config/vowels.ts` | 元音序列预设（standard/simple）、共振峰频率配置、频率分析常量 |
| `config/stages.ts` | 阶段定义 — 分数阈值、视觉效果配置（旋转、粒子、色差等） |

### 类型定义

所有游戏相关类型在 `types/game.ts`，包括 `Vowel`、`VowelDetectionResult`、`VowelDetectorHookReturn`、`GameStats`、`StageVisualConfig` 等。

## 文件结构

```
src/
├── composables/
│   ├── useVowelDetectorML.ts        # ✨ CNN TensorFlow.js 检测器
│   ├── useVowelDetector.ts          # MFCC/共振峰检测器
│   ├── useGameState.ts              # 游戏状态机
│   ├── useDynamicBGM.ts             # 动态 BGM
│   ├── useResourcePack.ts           # 资源包加载
│   ├── useShareCapture.ts           # 分享图生成
│   ├── useHighlights.ts             # 高光时刻
│   ├── useHighlightRenderer.ts      # 高光卡片渲染
│   └── useLeaderboard.ts            # 排行榜客户端
├── workers/
│   └── vowelAudioProcessor.ts       # AudioWorklet（采集 + 重采样）
├── views/
│   ├── GameView.vue                 # 主游戏
│   ├── DebugView.vue                # 检测调试
│   ├── AudioAnalyzer.vue            # 音频分析
│   └── MediaProcessor.vue           # 素材加工
├── config/
│   ├── vowels.ts                    # 序列 & 共振峰
│   └── stages.ts                    # 阶段配置
└── types/
    └── game.ts                      # 全部类型定义

public/models/vowel/
├── model.json                       # 模型结构
└── group1-shard1of1.bin             # uint8 量化权重（~70KB）
```

## 两套检测器对比

| | CNN (`useVowelDetectorML`) | MFCC (`useVowelDetector`) |
|---|---|---|
| 原理 | TF.js CNN 模型推理 | FFT → F1/F2 共振峰峰值匹配 |
| 延迟 | 较高（模型推理 + 缓冲） | 较低（直接频域分析） |
| 抗噪 | 较强 | 较弱 |
| 安静环境 | 与 MFCC 差异不大 | 推荐 |
| 依赖 | TensorFlow.js（懒加载） | 无额外依赖 |
| 音频处理 | AudioWorklet 独立线程 | AnalyserNode |
| 接口 | `VowelDetectorHookReturn` | `VowelDetectorHookReturn`（完全兼容） |

GameView 中通过 `detectorMode` 切换，默认 `'mfcc'`，游戏进行中不可切换。

## 快速开始

### 在 Vue 组件中使用

```typescript
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';

const {
  confirmedVowel,
  currentResult,
  isListening,
  latestProbabilities,
  start,
  stop,
  reset,
  onVowelDetected,
  onSilence,
  onError,
  debugData,
  getAudioDiagnostics
} = useVowelDetectorML({
  modelPath: '/models/vowel/model.json'  // 可选，默认值就是这个
});

// 注册回调（必须在 start() 之前）
onVowelDetected((vowel, result) => {
  console.log(`检测到: ${vowel}, 置信度: ${result.confidence.toFixed(2)}`);
});

onSilence((duration) => {
  console.log(`静音持续: ${duration}ms`);
});

onError((err) => {
  console.error('检测错误:', err);
});

// 启动 / 停止
onMounted(() => start());
onUnmounted(() => reset());  // 必须调用 reset() 释放资源
```

### 调试工作流

1. `npm run dev` → 访问 `/debug`
2. 选择 CNN 或 MFCC 模式
3. 点击"启动监听"，授权麦克风
4. 对着麦克风说元音 (A/E/I/O/U)
5. 观察：置信度 (>80%)、延迟 (<100ms)、音量 (>-40dB)

离线分析：访问 `/analyzer`，可加载音频文件查看频谱和共振峰分布，用于调参。

## API 参考

### `useVowelDetectorML(config?)`

#### 参数

```typescript
interface VowelDetectorConfig {
  modelPath?: string;          // 模型路径，默认: '<BASE_URL>models/vowel/model.json'
  fftSize?: number;            // FFT 大小，默认 2048
  sampleRate?: number;         // 采样率，默认 44100
  frameTime?: number;          // 分帧时间 (ms)，默认 50
  silenceThreshold?: number;   // 静音阈值 (dB)，默认 -50
  confirmationFrames?: number; // 确认帧数，默认 2
  vowelFormants?: VowelFormantConfig; // 共振峰配置（兼容旧检测器）
}
```

#### 返回值 `VowelDetectorHookReturn`

```typescript
{
  // 响应式状态
  currentResult: Ref<VowelDetectionResult | null>;  // 最新检测结果
  confirmedVowel: Ref<Vowel | null>;                // 确认的元音（经 Schmitt 触发器稳定过滤）
  isListening: Ref<boolean>;                        // 是否正在监听
  isInitialized: Ref<boolean>;                      // 是否已初始化（音频 + 模型）
  error: Ref<string | null>;                        // 错误信息
  latestProbabilities: Ref<number[] | null>;         // 各类别概率 [A,E,I,O,U,silence]

  // 控制方法
  start: () => Promise<void>;   // 初始化音频 + 模型并开始检测
  stop: () => void;             // 暂停检测（保留资源）
  reset: () => void;            // 停止并释放所有资源

  // 事件回调
  onVowelDetected: (cb: (vowel: Vowel, result: VowelDetectionResult) => void) => void;
  onSilence: (cb: (duration: number) => void) => void;
  onError: (cb: (error: Error) => void) => void;

  // 调试
  debugData: Ref<VowelDetectorDebugData>;           // 原始音频波形（节流 200ms）
  getAudioDiagnostics: () => Record<string, unknown>; // 运行时诊断信息
}
```

#### VowelDetectionResult

```typescript
{
  vowel: Vowel | null;         // 检测到的元音 (A/E/I/O/U) 或 null
  status: DetectionStatus;      // 'detected' | 'ambiguous' | 'silence' | 'noise'
  confidence: number;           // 置信度 [0, 1]
  formants: { f1: 0, f2: 0 };  // ML 模型不使用，保留用于接口兼容
  volume: number;               // 音量 (dB)
  timestamp: number;            // performance.now() 时间戳 (ms)
}
```

## 架构细节

### 数据流

```
麦克风 → AudioContext → AudioWorkletNode (vowelAudioProcessor)
    ↓
AudioWorklet 线程：采集 + 线性插值重采样至 16kHz → 循环缓冲区（3360 样本）
    ↓  port.postMessage (每 ~40ms)
主线程：pendingAudioBuffer → requestAnimationFrame 循环
    ↓
计算音量 (RMS→dB) → 静音检测 (< silenceThreshold)
    ↓  非静音
tf.tidy()：tensor2d [1, 3360] → model.predict() → softmax 概率 [6]
    ↓
Schmitt 触发器滞回过滤（减少元音抖动）
    ↓
VowelDetectionResult → confirmedVowel / 回调触发
    ↓
GameView: connectVowelDetectorToGameState() → 计分 / 阶段 / BGM
```

### AudioWorklet 处理器

音频采集与重采样在 `workers/vowelAudioProcessor.ts` 中完成，运行在独立音频线程：

- **重采样**：线性插值从浏览器原生采样率（44.1k/48k）→ 16kHz
- **缓冲**：循环缓冲区维护最新 3360 个 16kHz 样本（210ms 窗口）
- **发送频率**：每 ~40ms 发送一次快照（~25 次/秒）

### Schmitt 触发器

用于减少元音切换抖动：

| 参数 | 值 | 说明 |
|------|-----|------|
| `HYSTERESIS_HIGH` | 0.6 | 新元音确认阈值 |
| `HYSTERESIS_LOW` | 0.45 | 已确认元音丢失阈值 |
| `SWITCH_MARGIN` | 0.08 | 切换到新元音需超过旧元音的余量 |

### 持续发音重触发

连续发同一元音时，每 300ms (`SUSTAINED_RE_EMIT_INTERVAL`) 重新触发 `onVowelDetected`，支持序列中连续相同元音（如 I→I→I）。

### 游戏集成

GameView 中检测器输出通过 `connectVowelDetectorToGameState()` 接入游戏状态机：

1. `onVowelDetected` → `useGameState.handleVowel()` → 序列校验 → 计分/连击
2. `onSilence` → 静音超时中断检测
3. 阶段变化 → `useDynamicBGM` 启停轨道 + 视觉效果更新
4. 中断 → 生成 `GameSnapshot` → `useShareCapture` 渲染结算图

## 模型信息

### 架构
- **输入**: 210ms 原始波形 (3360 samples @ 16kHz)
- **特征提取**: MelSpectrogram (19 时间步 × 40 Mel 频带)，模型内部完成
- **分类**: CNN (3 层卷积 + 全连接)
- **输出**: 6 类 softmax (A / E / I / O / U / silence)
- **类别索引**: `['A', 'E', 'I', 'O', 'U', 'silence']`

### 训练数据
- **数据集**: Kaggle Dataset of Vowels (独立元音录音)
- **数据增强**: 拼接 2-4 条元音 + 噪声叠加 + 音量抖动 → 提取 210ms 窗口
- **训练笔记本**: `model/Vowel_CNN_Training_Hillenbrand.ipynb`

### 性能
| 指标 | 数值 |
|------|------|
| 参数量 | ~72K |
| 模型大小 | ~70KB (TF.js uint8 量化) |
| 推理延迟 | ~50-100ms (CPU) / ~10-20ms (GPU) |
| 测试集准确率 | ~92% |

### 已知局限

当前模型基于 Kaggle 孤立元音数据集训练（替代了早期 TIMIT 版本）。主要问题：

- **延迟较高**：CNN 推理 + AudioWorklet 缓冲开销，端到端延迟高于 MFCC 方案
- **安静环境优势不明显**：在安静环境、快速发音场景下，识别效果未显著优于 MFCC 检测器
- 模型仍有调优空间（能量阈值、数据增强参数等），但我燃尽了

## 迁移指南

### 从原检测器切换

```typescript
// 之前
import { useVowelDetector } from '@/composables/useVowelDetector';
const detector = useVowelDetector();

// 现在
import { useVowelDetectorML } from '@/composables/useVowelDetectorML';
const detector = useVowelDetectorML();
```

两个检测器均返回 `VowelDetectorHookReturn`，接口完全兼容。

## TensorFlow.js 内存管理

```typescript
// 推理时使用 tf.tidy() 自动清理中间张量
const probabilities = tf.tidy(() => {
  const input = tf.tensor2d(audioData, [1, INPUT_SAMPLES]);
  const predictions = model.predict(input) as tf.Tensor;
  return Array.from(predictions.dataSync());
});

// 组件卸载时调用 reset() 释放模型
onUnmounted(() => {
  detector.reset();  // 必须调用！
});
```

TensorFlow.js 懒加载：首次调用 `start()` 时才 `import('@tensorflow/tfjs')`，避免未使用时加载整个运行时。

## 故障排除

### 模型加载失败

**问题**: `模型加载失败: fetch failed`

**排查**:
1. 确认 `public/models/vowel/model.json` 和 `.bin` 文件存在
2. 检查浏览器 Network 面板的 404 / CORS 错误
3. 生产环境需要 HTTPS（`getUserMedia` 要求安全上下文）

### 识别准确率低

- 检查音量指示是否 > -40dB（太小则麦克风未正确激活）
- 在安静环境测试，背景噪音会降低准确率
- 确认 TF.js 后端：`tf.getBackend()` 应为 `'webgl'`（GPU 加速）
- 使用 `/debug` 页对比 CNN / MFCC 两种模式的识别效果
- 使用 `/analyzer` 离线分析音频，检查共振峰分布是否符合预期

### 内存泄漏

- 开发模式热更新不会自动清理 TensorFlow 资源 → 硬刷新页面
- 确保每个使用检测器的组件在 `onUnmounted` 中调用 `reset()`

### 诊断信息

使用 `getAudioDiagnostics()` 获取运行时状态：

```typescript
const diag = detector.getAudioDiagnostics();
// {
//   detectorType: 'ml',
//   targetSampleRate: 16000,
//   actualSampleRate: 44100,
//   inputSamples: 3360,
//   expectedDurationMs: 210,
//   audioContextState: 'running',
//   audioProcessing: 'AudioWorklet',
//   ...
// }
```

## 相关文件

- [类型定义](../types/game.ts) — `VowelDetectorHookReturn`, `VowelDetectionResult` 等
- [AudioWorklet 处理器](../workers/vowelAudioProcessor.ts) — 音频采集与重采样
- [元音配置](../config/vowels.ts) — 序列预设与共振峰频率
- [阶段配置](../config/stages.ts) — 分数阈值与视觉效果
- [MFCC 检测器](./useVowelDetector.ts) — 共振峰检测（低延迟方案）
- [游戏状态机](./useGameState.ts) — 计分、连击、阶段逻辑
- [训练笔记本](../../model/Vowel_CNN_Training_Hillenbrand.ipynb) — 模型训练
- [排行榜后端](../../worker/) — Cloudflare Worker 排行榜服务
