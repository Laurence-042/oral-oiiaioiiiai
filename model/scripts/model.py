"""
模型定义 - 包含 Mel 频谱提取层和 CNN 分类器
"""
import tensorflow as tf
import numpy as np
from config import (
    SAMPLE_RATE, FRAME_LENGTH, FRAME_STEP, FFT_LENGTH, 
    N_MELS, INPUT_SAMPLES, NUM_CLASSES
)


def create_mel_filterbank(num_mels=N_MELS, num_spectrogram_bins=FFT_LENGTH // 2 + 1,
                          sample_rate=SAMPLE_RATE, lower_freq=0.0, upper_freq=8000.0):
    """创建 Mel 滤波器组矩阵"""
    return tf.signal.linear_to_mel_weight_matrix(
        num_mel_bins=num_mels,
        num_spectrogram_bins=num_spectrogram_bins,
        sample_rate=sample_rate,
        lower_edge_hertz=lower_freq,
        upper_edge_hertz=upper_freq
    ).numpy()


class MelSpectrogram(tf.keras.layers.Layer):
    """
    Mel 频谱提取层 - 将原始波形转换为 Log-Mel 特征
    该层会被导出到 TensorFlow.js，确保训练和推理一致
    """
    
    def __init__(self, frame_length=FRAME_LENGTH, frame_step=FRAME_STEP, 
                 fft_length=FFT_LENGTH, num_mels=N_MELS, 
                 sample_rate=SAMPLE_RATE, **kwargs):
        super().__init__(**kwargs)
        self.frame_length = frame_length
        self.frame_step = frame_step
        self.fft_length = fft_length
        self.num_mels = num_mels
        self.sample_rate = sample_rate
        
    def build(self, input_shape):
        # Mel 滤波器作为不可训练权重
        mel_filterbank = create_mel_filterbank(
            num_mels=self.num_mels,
            num_spectrogram_bins=self.fft_length // 2 + 1,
            sample_rate=self.sample_rate
        )
        self.mel_filterbank = self.add_weight(
            name='mel_filterbank',
            shape=mel_filterbank.shape,
            initializer=tf.constant_initializer(mel_filterbank),
            trainable=False
        )
        super().build(input_shape)
    
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
        
        # Mel 滤波
        mel = tf.matmul(magnitude, self.mel_filterbank)
        
        # 对数压缩
        log_mel = tf.math.log(mel + 1e-6)
        
        # 添加通道维度 [batch, time, mels, 1]
        return tf.expand_dims(log_mel, -1)
    
    def get_config(self):
        config = super().get_config()
        config.update({
            'frame_length': self.frame_length,
            'frame_step': self.frame_step,
            'fft_length': self.fft_length,
            'num_mels': self.num_mels,
            'sample_rate': self.sample_rate,
        })
        return config


def create_vowel_model(include_mel_layer=True):
    """
    创建元音识别模型
    
    Args:
        include_mel_layer: 是否包含 Mel 特征提取层
            - True: 输入原始波形，用于最终导出
            - False: 输入预提取的 Mel 特征，用于加速训练
    """
    if include_mel_layer:
        # 完整模型：输入原始波形
        waveform_input = tf.keras.Input(shape=(INPUT_SAMPLES,), name='waveform')
        x = MelSpectrogram(name='mel_spectrogram')(waveform_input)
    else:
        # 训练时使用：输入预提取的 Mel 特征
        x = tf.keras.Input(shape=(21, N_MELS, 1), name='mel_input')
        waveform_input = x
    
    # CNN 分类部分
    x = tf.keras.layers.Conv2D(32, (3, 3), activation='relu', padding='same', name='conv1')(x if include_mel_layer else waveform_input)
    x = tf.keras.layers.BatchNormalization(name='bn1')(x)
    x = tf.keras.layers.MaxPooling2D((2, 2), name='pool1')(x)
    # → [batch, 10, 20, 32]
    
    x = tf.keras.layers.Conv2D(64, (3, 3), activation='relu', padding='same', name='conv2')(x)
    x = tf.keras.layers.BatchNormalization(name='bn2')(x)
    x = tf.keras.layers.MaxPooling2D((2, 2), name='pool2')(x)
    # → [batch, 5, 10, 64]
    
    x = tf.keras.layers.Conv2D(64, (3, 3), activation='relu', padding='same', name='conv3')(x)
    x = tf.keras.layers.BatchNormalization(name='bn3')(x)
    x = tf.keras.layers.GlobalAveragePooling2D(name='gap')(x)
    # → [batch, 64]
    
    x = tf.keras.layers.Dense(32, activation='relu', name='dense1')(x)
    x = tf.keras.layers.Dropout(0.3, name='dropout')(x)
    
    # 输出：6 类 (A, E, I, O, U, silence)
    output = tf.keras.layers.Dense(NUM_CLASSES, activation='softmax', name='vowel_output')(x)
    
    model = tf.keras.Model(inputs=waveform_input, outputs=output, name='vowel_classifier')
    return model


def create_full_model_from_weights(feature_model):
    """
    从训练好的特征模型创建完整模型（包含 Mel 层）
    用于最终导出到 TensorFlow.js
    """
    full_model = create_vowel_model(include_mel_layer=True)
    
    # 复制权重（跳过 Mel 层）
    for layer in feature_model.layers:
        if layer.name in ['conv1', 'bn1', 'conv2', 'bn2', 'conv3', 'bn3', 'dense1', 'vowel_output']:
            full_model.get_layer(layer.name).set_weights(layer.get_weights())
    
    return full_model


if __name__ == '__main__':
    # 测试模型创建
    print("创建完整模型（含 Mel 层）...")
    model_full = create_vowel_model(include_mel_layer=True)
    model_full.summary()
    
    print("\n创建特征模型（不含 Mel 层）...")
    model_feat = create_vowel_model(include_mel_layer=False)
    model_feat.summary()
    
    # 测试推理
    print("\n测试推理...")
    test_input = np.random.randn(1, INPUT_SAMPLES).astype(np.float32)
    output = model_full.predict(test_input, verbose=0)
    print(f"输入形状: {test_input.shape}")
    print(f"输出形状: {output.shape}")
    print(f"输出概率: {output[0]}")
