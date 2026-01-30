# What

这是一个子项目，目的是用训练一个大小不超过5MB（TinyML）的CNN，用于流式元音识别

# Why

在OIIAIOIIIAI项目中，最初使用了MFCC提取F1、F2来判断元音的方式，但是F1、F2会因为玩家的录音设备出现很大的偏移，其中甚至出现了 I 在经过录制后被识别成 E 的情况，但人耳听起来却不觉得像是 E。

考虑到这游戏的核心卖点就是魔性和元音识别，不能准确识别元音，那这游戏就和声控太鼓达人没啥区别了，所以这问题必须被解决。

考虑到这本质上是个在非受控环境下的边缘计算语音识别，需要很强的健壮性，我决定使用训练一个小CNN来处理这个任务

# How

## 1. 数据来源

### TIMIT Dataset (model/timit)
- 位置：`model/timit/`
- 内容：包含音频(.wav)和对齐标注(.phn)
- 提取：找出所有元音音素片段
  - A: /aa/, /ae/, /ah/, /ao/, /aw/, /ax/, /ay/
  - E: /eh/, /ey/, /er/, /axr/
  - I: /ih/, /iy/, /ix/
  - O: /ow/, /oy/
  - U: /uh/, /uw/, /ux/

### 音素到元音的映射
```python
PHONEME_TO_VOWEL = {
    # A 类
    'aa': 'A', 'ae': 'A', 'ah': 'A', 'ao': 'A', 'aw': 'A', 'ax': 'A', 'ay': 'A',
    # E 类
    'eh': 'E', 'ey': 'E', 'er': 'E', 'axr': 'E',
    # I 类
    'ih': 'I', 'iy': 'I', 'ix': 'I',
    # O 类
    'ow': 'O', 'oy': 'O',
    # U 类
    'uh': 'U', 'uw': 'U', 'ux': 'U',
}
```

## 2. 数据处理流程

### 音频参数
```python
SAMPLE_RATE = 16000       # 16kHz 采样率
FRAME_LENGTH = 400        # 25ms 帧长 = 400 samples @ 16kHz
FRAME_STEP = 160          # 10ms 帧移 = 160 samples
FFT_LENGTH = 512          # FFT 点数
N_MELS = 40               # 40 个 Mel 频带
CONTEXT_FRAMES = 21       # 上下文帧数 (±10帧，约 210ms 上下文)
INPUT_SAMPLES = 3360      # 210ms @ 16kHz = 3360 samples
```

### 关键设计：特征提取集成到模型内部

**问题**：Python (librosa/scipy) 和 JS 的信号处理实现可能有细微差异，导致推理结果不一致。

**解决方案**：使用 TensorFlow 内置的 `tf.signal` API 做特征提取，让它成为模型的一部分，导出到 TF.js 后行为完全一致。

```python
import tensorflow as tf

def create_mel_filterbank(num_mels=40, num_spectrogram_bins=257, 
                          sample_rate=16000, lower_freq=0, upper_freq=8000):
    """创建 Mel 滤波器组（作为常量嵌入模型）"""
    linear_to_mel = tf.signal.linear_to_mel_weight_matrix(
        num_mel_bins=num_mels,
        num_spectrogram_bins=num_spectrogram_bins,
        sample_rate=sample_rate,
        lower_edge_hertz=lower_freq,
        upper_edge_hertz=upper_freq
    )
    return linear_to_mel

class MelSpectrogram(tf.keras.layers.Layer):
    """Mel频谱提取层 - 会被导出到TF.js"""
    
    def __init__(self, frame_length=400, frame_step=160, fft_length=512,
                 num_mels=40, sample_rate=16000, **kwargs):
        super().__init__(**kwargs)
        self.frame_length = frame_length
        self.frame_step = frame_step
        self.fft_length = fft_length
        self.num_mels = num_mels
        self.sample_rate = sample_rate
        
        # Mel滤波器作为不可训练权重
        self.mel_filterbank = self.add_weight(
            name='mel_filterbank',
            shape=(fft_length // 2 + 1, num_mels),
            initializer=tf.constant_initializer(
                create_mel_filterbank(num_mels, fft_length // 2 + 1, sample_rate)
            ),
            trainable=False
        )
    
    def call(self, waveform):
        # waveform: [batch, samples]
        
        # STFT
        stft = tf.signal.stft(
            waveform,
            frame_length=self.frame_length,
            frame_step=self.frame_step,
            fft_length=self.fft_length,
            window_fn=tf.signal.hann_window
        )
        
        # 幅度谱
        magnitude = tf.abs(stft)
        
        # Mel滤波
        mel = tf.matmul(magnitude, self.mel_filterbank)
        
        # 对数压缩
        log_mel = tf.math.log(mel + 1e-6)
        
        # 添加通道维度 [batch, time, mels, 1]
        return tf.expand_dims(log_mel, -1)
```

### 完整流程（在模型内部）
```
原始波形 [batch, 3360]
    ↓
STFT (frame=400, step=160, fft=512)
    ↓
[batch, 21, 257] 复数频谱
    ↓
取幅度
    ↓
[batch, 21, 257] 幅度谱
    ↓
Mel滤波器矩阵相乘
    ↓
[batch, 21, 40] Mel频谱
    ↓
取对数
    ↓
[batch, 21, 40, 1] Log-Mel特征
    ↓
CNN 分类
```

### 好处
- **训练和推理完全一致**：特征提取是模型的一部分
- **JS端代码极简**：只需传入原始音频采样点
- **无需维护两套代码**：Python和JS使用相同的TF算子

## 3. 数据增强

### 时域增强 (在提取特征前)
```python
augmentations = {
    'gain': (-12, 12),           # 随机增益 ±12dB
    'noise': ('white', 0.005),   # 白噪声 SNR ~40dB
    'room_reverb': (0.1, 0.4),   # 轻度混响
    'time_stretch': (0.9, 1.1),  # 时间拉伸 ±10%
}
```

### 频域增强 (在Mel频谱上)
```python
spec_augment = {
    'freq_mask': (1, 5),         # 频率遮挡 1-5 个频带
    'time_mask': (1, 3),         # 时间遮挡 1-3 帧
}
```

### 增强概率
- 每个样本 50% 概率应用增益变化
- 30% 概率加噪
- 20% 概率加混响
- 训练时在线增强，不预先生成

## 4. 模型架构

### 目标约束
- 参数量 < 500K (量化后 < 2MB)
- 单帧推理 < 10ms (在中端手机 WebGL)
- 准确率 > 90%

### 完整模型定义
```python
import tensorflow as tf

def create_vowel_model():
    # 输入：原始波形
    waveform_input = tf.keras.Input(shape=(3360,), name='waveform')
    
    # 特征提取层（集成到模型）
    x = MelSpectrogram(
        frame_length=400,
        frame_step=160,
        fft_length=512,
        num_mels=40,
        sample_rate=16000,
        name='mel_spectrogram'
    )(waveform_input)
    # x shape: [batch, 21, 40, 1]
    
    # CNN 分类部分
    x = tf.keras.layers.Conv2D(32, (3, 3), activation='relu', padding='same')(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.MaxPooling2D((2, 2))(x)
    # → [batch, 10, 20, 32]
    
    x = tf.keras.layers.Conv2D(64, (3, 3), activation='relu', padding='same')(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.MaxPooling2D((2, 2))(x)
    # → [batch, 5, 10, 64]
    
    x = tf.keras.layers.Conv2D(64, (3, 3), activation='relu', padding='same')(x)
    x = tf.keras.layers.BatchNormalization()(x)
    x = tf.keras.layers.GlobalAveragePooling2D()(x)
    # → [batch, 64]
    
    x = tf.keras.layers.Dense(32, activation='relu')(x)
    x = tf.keras.layers.Dropout(0.3)(x)
    
    # 输出：6类 (A, E, I, O, U, silence)
    output = tf.keras.layers.Dense(6, activation='softmax', name='vowel_output')(x)
    
    model = tf.keras.Model(inputs=waveform_input, outputs=output)
    return model
```

### 参数估算
- MelSpectrogram层：~10K（滤波器矩阵，不可训练）
- Conv层 + BN：~60K
- Dense层：~2K
- **总计：~72K 参数 → 量化后 ~80KB**

## 5. 训练配置

```python
training_config = {
    'optimizer': 'Adam',
    'learning_rate': 0.001,
    'batch_size': 64,
    'epochs': 50,
    'early_stopping': {
        'patience': 10,
        'monitor': 'val_accuracy'
    },
    'class_weights': 'balanced',  # 处理类别不平衡
}
```

### 数据划分
- 训练集: 80%
- 验证集: 10%
- 测试集: 10%
- **按说话者划分**，确保同一人的数据不同时出现在训练和测试集

## 6. 转换为 TensorFlow.js

```bash
# 训练完成后
tensorflowjs_converter \
    --input_format=keras \
    --output_format=tfjs_graph_model \
    --quantize_uint8 \
    model.h5 \
    ./tfjs_model/
```

### 输出文件
```
tfjs_model/
├── model.json        # 模型结构
└── group1-shard1of1.bin  # 权重 (量化后 ~60KB)
```

## 7. 浏览器端推理

### JS端代码极简
```javascript
import * as tf from '@tensorflow/tfjs';

class VowelDetector {
  constructor() {
    this.model = null;
    this.sampleRate = 16000;
    this.inputSamples = 3360;  // 210ms
  }
  
  async load(modelPath) {
    this.model = await tf.loadGraphModel(modelPath);
  }
  
  /**
   * 预测元音
   * @param audioSamples Float32Array of 3360 samples (210ms @ 16kHz)
   * @returns {vowel: string, confidence: number}
   */
  predict(audioSamples) {
    return tf.tidy(() => {
      // 直接传入原始波形，特征提取在模型内部完成
      const input = tf.tensor2d([audioSamples], [1, this.inputSamples]);
      const output = this.model.predict(input);
      const probs = output.dataSync();
      
      const vowels = ['A', 'E', 'I', 'O', 'U', 'silence'];
      const maxIdx = probs.indexOf(Math.max(...probs));
      
      return {
        vowel: vowels[maxIdx],
        confidence: probs[maxIdx],
        probabilities: Object.fromEntries(vowels.map((v, i) => [v, probs[i]]))
      };
    });
  }
}

// 使用示例
const detector = new VowelDetector();
await detector.load('/models/vowel/model.json');

// 从麦克风获取音频后
const result = detector.predict(audioSamples);
console.log(result);  // { vowel: 'A', confidence: 0.92, probabilities: {...} }
```

### 实时流处理
```javascript
class RealtimeVowelStream {
  constructor(detector) {
    this.detector = detector;
    this.buffer = new Float32Array(3360);
    this.writePos = 0;
    
    // 施密特触发器状态
    this.currentVowel = 'silence';
    this.highThreshold = 0.7;
    this.lowThreshold = 0.4;
  }
  
  // 每 10ms 调用一次，传入 160 个新采样点
  pushSamples(samples) {
    // 移动缓冲区
    this.buffer.copyWithin(0, 160);
    this.buffer.set(samples, 3360 - 160);
    
    // 推理
    const result = this.detector.predict(this.buffer);
    
    // 施密特触发器逻辑
    if (this.currentVowel === 'silence') {
      if (result.vowel !== 'silence' && result.confidence > this.highThreshold) {
        this.currentVowel = result.vowel;
        this.onVowelStart(result.vowel);
      }
    } else {
      if (result.vowel === 'silence' && result.confidence > this.lowThreshold) {
        this.onVowelEnd(this.currentVowel);
        this.currentVowel = 'silence';
      } else if (result.vowel !== this.currentVowel && 
                 result.vowel !== 'silence' && 
                 result.confidence > this.highThreshold) {
        this.onVowelEnd(this.currentVowel);
        this.currentVowel = result.vowel;
        this.onVowelStart(result.vowel);
      }
    }
  }
  
  onVowelStart(vowel) { /* 回调 */ }
  onVowelEnd(vowel) { /* 回调 */ }
}
```

### 预期性能
- 模型加载：< 100ms
- 单帧推理：~5ms (WebGL) / ~15ms (WASM)
- 总延迟：~30-50ms（可接受，人耳感知阈值约100ms）

## 8. 文件结构

```
model/
├── hint.md                 # 本文档
├── timit/                  # TIMIT 数据集 (不提交到git)
├── scripts/
│   ├── extract_vowels.py   # 从TIMIT提取元音片段
│   ├── prepare_dataset.py  # 生成训练数据
│   ├── train.py            # 训练脚本
│   └── convert_tfjs.py     # 转换为TF.js格式
├── data/                   # 处理后的数据 (不提交到git)
│   ├── train/
│   ├── val/
│   └── test/
├── checkpoints/            # 训练检查点 (不提交到git)
└── output/
    └── tfjs_model/         # 最终模型 (提交到git)
```

## 9. 验收标准

- [ ] 测试集准确率 > 90%
- [ ] 混淆矩阵中 I/E 和 O/U 的混淆率 < 10%
- [ ] 模型文件 < 500KB (量化后)
- [ ] 浏览器推理 < 10ms/帧
- [ ] 通过真实手机录音测试