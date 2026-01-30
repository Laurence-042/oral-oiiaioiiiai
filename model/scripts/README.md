# 元音识别模型训练

## 环境依赖

```bash
pip install tensorflow numpy scipy soundfile scikit-learn matplotlib tensorflowjs
```

## 使用步骤

### 1. 准备 TIMIT 数据集

将 TIMIT 数据集放到 `model/timit/` 目录，结构如下：
```
timit/
├── TRAIN/
│   ├── DR1/
│   │   ├── FCJF0/
│   │   │   ├── SA1.WAV
│   │   │   ├── SA1.PHN
│   │   │   └── ...
│   │   └── ...
│   └── ...
└── TEST/
    └── ...
```

### 2. 提取元音片段

```bash
cd model/scripts
python extract_vowels.py
```

这会从 TIMIT 数据集中提取所有元音片段，保存到 `model/data/vowel_segments.npz`

### 3. 准备训练数据

```bash
python prepare_dataset.py
```

这会：
- 按说话者划分训练/验证/测试集
- 预提取 Mel 特征
- 保存到 `model/data/dataset.npz`

### 4. 训练模型

```bash
python train.py
```

训练完成后会生成：
- `model/output/vowel_model.keras` - Keras 模型
- `model/output/saved_model/` - SavedModel 格式
- `model/output/training_history.png` - 训练曲线
- `model/output/confusion_matrix.png` - 混淆矩阵

### 5. 转换为 TensorFlow.js

```bash
python convert_tfjs.py
```

输出：
- `model/output/tfjs_model/model.json` - TF.js 模型
- `model/output/tfjs_model/group1-shard1of1.bin` - 权重文件
- `model/output/vowel-detector.js` - JavaScript 使用示例

## 在主项目中使用

将 `model/output/tfjs_model/` 复制到 Vue 项目的 `public/models/vowel/` 目录，然后：

```javascript
import { VowelDetector, RealtimeVowelStream } from '@/utils/vowel-detector';

const detector = new VowelDetector();
await detector.load('/models/vowel/model.json');

// 单次预测
const result = detector.predict(audioSamples);
console.log(result.vowel, result.confidence);

// 实时流处理
const stream = new RealtimeVowelStream(detector);
stream.onVowelStart = (vowel) => console.log('开始:', vowel);
stream.onVowelEnd = (vowel) => console.log('结束:', vowel);
```
