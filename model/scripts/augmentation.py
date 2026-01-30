"""
数据增强模块
"""
import numpy as np
import tensorflow as tf
from config import AUGMENTATION, AUG_PROB, SAMPLE_RATE


def apply_gain(audio, min_db=-12, max_db=12):
    """随机增益"""
    gain_db = np.random.uniform(min_db, max_db)
    gain_linear = 10 ** (gain_db / 20)
    return audio * gain_linear


def apply_noise(audio, noise_factor=0.005):
    """添加白噪声"""
    noise = np.random.randn(*audio.shape) * noise_factor
    return audio + noise


def apply_time_stretch(audio, rate_range=(0.9, 1.1)):
    """
    时间拉伸（简化版本：通过重采样实现）
    注意：这会改变音高，但对于元音识别影响不大
    """
    rate = np.random.uniform(*rate_range)
    
    # 计算新长度
    original_length = len(audio)
    new_length = int(original_length / rate)
    
    # 重采样
    indices = np.linspace(0, original_length - 1, new_length)
    stretched = np.interp(indices, np.arange(original_length), audio)
    
    # 裁剪或填充到原始长度
    if len(stretched) > original_length:
        # 从中间裁剪
        start = (len(stretched) - original_length) // 2
        stretched = stretched[start:start + original_length]
    elif len(stretched) < original_length:
        # 在两端填充
        pad_total = original_length - len(stretched)
        pad_left = pad_total // 2
        pad_right = pad_total - pad_left
        stretched = np.pad(stretched, (pad_left, pad_right), mode='edge')
    
    return stretched.astype(np.float32)


def apply_spec_augment(mel_spec, freq_mask_max=5, time_mask_max=3):
    """
    SpecAugment: 在 Mel 频谱上应用遮挡
    
    Args:
        mel_spec: [time, mels] 或 [time, mels, 1]
        freq_mask_max: 最大频率遮挡带数
        time_mask_max: 最大时间遮挡帧数
    """
    spec = mel_spec.copy()
    squeeze = False
    
    if spec.ndim == 3:
        spec = spec[:, :, 0]
        squeeze = True
    
    time_steps, n_mels = spec.shape
    
    # 频率遮挡
    if freq_mask_max > 0:
        f = np.random.randint(0, freq_mask_max + 1)
        f0 = np.random.randint(0, max(1, n_mels - f))
        spec[:, f0:f0 + f] = 0
    
    # 时间遮挡
    if time_mask_max > 0:
        t = np.random.randint(0, time_mask_max + 1)
        t0 = np.random.randint(0, max(1, time_steps - t))
        spec[t0:t0 + t, :] = 0
    
    if squeeze:
        spec = spec[:, :, np.newaxis]
    
    return spec


def augment_audio(audio, augment_config=AUGMENTATION, aug_prob=AUG_PROB):
    """
    对原始音频应用数据增强
    """
    audio = audio.copy()
    
    # 随机增益
    if np.random.random() < aug_prob.get('gain', 0.5):
        min_db, max_db = augment_config.get('gain_db', (-12, 12))
        audio = apply_gain(audio, min_db, max_db)
    
    # 添加噪声
    if np.random.random() < aug_prob.get('noise', 0.3):
        noise_factor = augment_config.get('noise_factor', 0.005)
        audio = apply_noise(audio, noise_factor)
    
    # 时间拉伸
    if np.random.random() < aug_prob.get('time_stretch', 0.2):
        rate_range = augment_config.get('time_stretch', (0.9, 1.1))
        audio = apply_time_stretch(audio, rate_range)
    
    # 归一化防止溢出
    max_val = np.max(np.abs(audio))
    if max_val > 1.0:
        audio = audio / max_val
    
    return audio.astype(np.float32)


def augment_mel_spec(mel_spec, augment_config=AUGMENTATION, aug_prob=AUG_PROB):
    """
    对 Mel 频谱应用 SpecAugment
    """
    if np.random.random() < aug_prob.get('spec_augment', 0.3):
        freq_mask_max = augment_config.get('freq_mask_max', 5)
        time_mask_max = augment_config.get('time_mask_max', 3)
        mel_spec = apply_spec_augment(mel_spec, freq_mask_max, time_mask_max)
    
    return mel_spec


class AudioAugmentationLayer(tf.keras.layers.Layer):
    """
    TensorFlow 层：在训练时应用音频增强
    """
    
    def __init__(self, gain_range=(-12, 12), noise_factor=0.005, **kwargs):
        super().__init__(**kwargs)
        self.gain_range = gain_range
        self.noise_factor = noise_factor
    
    def call(self, inputs, training=None):
        if training:
            # 随机增益
            gain_db = tf.random.uniform([], self.gain_range[0], self.gain_range[1])
            gain_linear = tf.pow(10.0, gain_db / 20.0)
            inputs = inputs * gain_linear
            
            # 添加噪声
            noise = tf.random.normal(tf.shape(inputs), stddev=self.noise_factor)
            inputs = inputs + noise
            
            # 限制范围
            inputs = tf.clip_by_value(inputs, -1.0, 1.0)
        
        return inputs


if __name__ == '__main__':
    # 测试增强
    print("测试数据增强...")
    
    # 生成测试音频
    test_audio = np.sin(2 * np.pi * 440 * np.arange(3360) / 16000).astype(np.float32)
    
    print(f"原始音频: min={test_audio.min():.3f}, max={test_audio.max():.3f}")
    
    augmented = augment_audio(test_audio)
    print(f"增强后: min={augmented.min():.3f}, max={augmented.max():.3f}")
    
    # 测试 Mel 增强
    test_mel = np.random.randn(21, 40, 1).astype(np.float32)
    augmented_mel = augment_mel_spec(test_mel)
    print(f"Mel 增强完成: shape={augmented_mel.shape}")
