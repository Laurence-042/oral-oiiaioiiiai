# 🚀 ML 检测器调试测试快速启动

## 文件清单

### ✅ 已完成的文件

```
src/
├── composables/
│   └── useVowelDetectorML.ts              ✨ TensorFlow.js 检测器 (已修复所有编译错误)
│
├── components/
│   └── VowelDetectorMLDemo.vue            演示组件
│
└── views/
    └── DebugMLDetector.vue               🎯 完整调试测试页面 (新建)

src/types/
└── game.ts                                ✅ 已更新 (添加 modelPath, 支持 silence)

public/models/vowel/
├── model.json                             ✅ 模型文件 (37KB)
└── group1-shard1of1.bin                   ✅ 权重文件 (69KB)
```

## ⚙️ 集成步骤

### 1. 路由配置

在你的 router 中添加调试页面路由：

```typescript
// src/router/index.ts
import DebugMLDetector from '@/views/DebugMLDetector.vue';

export const routes = [
  // ... 其他路由
  {
    path: '/debug/ml-detector',
    name: 'DebugMLDetector',
    component: DebugMLDetector,
    meta: { title: 'ML检测器调试' }
  }
];
```

### 2. 在开发模式启动

```bash
# 确保所有依赖已安装
npm install

# 启动开发服务器
npm run dev

# 访问: http://localhost:5173/debug/ml-detector
```

## 🎯 调试页面功能

### 📊 快速统计
- 检测总数
- 准确率评估
- 平均延迟
- 运行状态

### 🔴 实时检测
- 当前检测元音（大字体）
- 置信度进度条
- 音量级别实时显示
- 各分类概率分布

### ⚙️ 控制面板
- 启动/停止监听
- 重置统计数据
- 调试信息切换
- 错误提示

### 📋 检测历史
- 显示最近50条检测
- 时间戳、元音、置信度、持续时间
- 清空历史功能

### ⚡ 性能分析
- 推理时间统计（最小/平均/最大）
- 置信度范围
- 音量分布
- 元音分布图表

### 🐛 调试信息
- **原始数据**: 当前状态 JSON
- **配置**: 模型配置参数
- **内存**: JS 堆内存使用情况

## 🔧 测试工作流

```
1. 打开调试页面
   ↓
2. 查看初始化状态
   - 模型加载: ✅ 完成或 ⏳ 等待
   - 麦克风访问: ⏳ 等待中 (用户需要授权)
   ↓
3. 点击 "启动监听" 按钮
   - 浏览器会请求麦克风权限
   - 同意后开始实时检测
   ↓
4. 对着麦克风发音 (A, E, I, O, U)
   - 观察实时检测结果
   - 查看置信度变化
   - 检查音量水平
   ↓
5. 检查性能指标
   - 推理延迟是否 < 100ms
   - 置信度是否 > 50%
   - 元音分布是否合理
   ↓
6. 使用调试信息排查问题
   - 查看原始数据
   - 检查内存使用
```

## 🔍 常见问题排查

### 问题 1: "模型加载失败"

**原因**: 模型文件找不到

**解决**:
```bash
# 1. 验证文件是否存在
ls public/models/vowel/

# 2. 检查模型路径是否正确
# 开发: /models/vowel/model.json
# 生产: /models/vowel/model.json (路径保持一致)

# 3. 如果缺少文件，从 model/tfjs_model/ 复制
cp model/tfjs_model/* public/models/vowel/
```

### 问题 2: "麦克风访问被拒绝"

**原因**: 用户未授予麦克风权限 或 HTTPS 要求

**解决**:
- 检查浏览器权限设置
- 允许该网站使用麦克风
- 开发时确保使用 HTTPS 或 localhost

### 问题 3: "没有检测到任何声音"

**原因**: 麦克风输入问题 或 音量过低

**解决**:
```typescript
// 在调试页面检查音量指标
// 应该看到 "音量级别" 显示变化
// 如果始终 < -40dB，则麦克风可能有问题

// 增加麦克风增益 (如果浏览器支持)
const audioContext = new AudioContext();
const gainNode = audioContext.createGain();
gainNode.gain.value = 2.0; // 增加 6dB
```

### 问题 4: "置信度始终很低"

**原因**: 发音与训练数据差异大 或 模型需要调优

**解决**:
- 尝试改变发音方式（更接近 IPA 标准）
- 在干净的环境中测试
- 检查是否有背景噪音
- 可能需要用中文数据重新训练模型

## 📊 性能基准

基于现有模型的理想目标：

| 指标 | 期望值 | 可接受范围 |
|------|--------|----------|
| 推理延迟 | 50-100ms | < 150ms ✓ |
| 置信度 | > 80% | > 50% ✓ |
| 准确率 | 92% | > 85% ✓ |
| 内存占用 | < 50MB | < 100MB ✓ |

## ✅ 测试检查清单

在集成到主程序前，请验证：

- [ ] 模型文件已复制到 `public/models/vowel/`
- [ ] `@tensorflow/tfjs` 已安装（`npm list @tensorflow/tfjs`）
- [ ] 编译无错误 (`npm run build` 成功)
- [ ] 调试页面能加载 (访问 `/debug/ml-detector`)
- [ ] 麦克风权限能正常请求
- [ ] 能检测到发音（至少 3 次不同的元音）
- [ ] 置信度通常 > 60%
- [ ] 推理延迟 < 150ms
- [ ] 无浏览器控制台错误

## 🚀 下一步集成

一旦调试测试通过，就可以：

1. **集成到游戏主组件**
   ```typescript
   import { useVowelDetectorML } from '@/composables/useVowelDetectorML';
   
   const detector = useVowelDetectorML();
   detector.onVowelDetected((vowel, result) => {
     // 处理游戏逻辑
   });
   ```

2. **替换原共振峰检测器**
   - 在 GamePlay.vue 中用 useVowelDetectorML 替换 useVowelDetector
   - API 完全兼容，无需修改游戏逻辑

3. **优化超参数**
   - 根据实际使用场景调整置信度阈值
   - 可能需要收集用户数据进行微调

## 📞 支持信息

如遇到问题，请检查：

1. [useVowelDetectorML.ts](../composables/useVowelDetectorML.ts) - 完整实现
2. [VOWEL_DETECTOR_ML.md](../composables/VOWEL_DETECTOR_ML.md) - API 文档
3. [VowelDetectorMLDemo.vue](../components/VowelDetectorMLDemo.vue) - 简单示例
4. 浏览器开发者工具的 Console 标签（查看详细错误）

---

**准备就绪!** 🎉 现在可以开始调试和测试 ML 检测器了。
