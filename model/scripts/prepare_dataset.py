"""
准备训练数据集 - 划分训练/验证/测试集，预提取 Mel 特征
"""
import os
import json
import numpy as np
from sklearn.model_selection import train_test_split
import tensorflow as tf

from config import (
    DATA_DIR, VOWEL_CLASSES, INPUT_SAMPLES,
    SAMPLE_RATE, FRAME_LENGTH, FRAME_STEP, FFT_LENGTH, N_MELS
)


def extract_mel_features(audio_batch):
    """
    提取 Mel 频谱特征（使用 TensorFlow，与模型内部实现一致）
    """
    # STFT
    stft = tf.signal.stft(
        audio_batch,
        frame_length=FRAME_LENGTH,
        frame_step=FRAME_STEP,
        fft_length=FFT_LENGTH,
        window_fn=tf.signal.hann_window
    )
    
    # 幅度谱
    magnitude = tf.abs(stft)
    
    # Mel 滤波器
    mel_filterbank = tf.signal.linear_to_mel_weight_matrix(
        num_mel_bins=N_MELS,
        num_spectrogram_bins=FFT_LENGTH // 2 + 1,
        sample_rate=SAMPLE_RATE,
        lower_edge_hertz=0.0,
        upper_edge_hertz=8000.0
    )
    
    # Mel 滤波
    mel = tf.matmul(magnitude, mel_filterbank)
    
    # 对数压缩
    log_mel = tf.math.log(mel + 1e-6)
    
    # 添加通道维度
    return tf.expand_dims(log_mel, -1).numpy()


def load_extracted_data():
    """加载提取的元音数据"""
    data_path = os.path.join(DATA_DIR, 'vowel_segments.npz')
    speaker_path = os.path.join(DATA_DIR, 'speaker_info.json')
    
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"数据文件不存在: {data_path}\n请先运行 extract_vowels.py")
    
    # 加载音频数据
    data = np.load(data_path)
    
    # 加载说话者信息
    with open(speaker_path, 'r') as f:
        speaker_info = json.load(f)
    
    return data, speaker_info


def prepare_dataset():
    """
    准备训练数据集
    - 按说话者划分，确保同一说话者不同时出现在训练和测试集
    """
    print("=" * 60)
    print("准备训练数据集")
    print("=" * 60)
    
    # 加载数据
    print("\n加载提取的数据...")
    data, speaker_info = load_extracted_data()
    
    # 收集所有说话者
    all_speakers = set()
    for vowel in VOWEL_CLASSES:
        if vowel in speaker_info:
            all_speakers.update(speaker_info[vowel])
    
    all_speakers = list(all_speakers)
    print(f"共 {len(all_speakers)} 个说话者")
    
    # 按说话者划分 (80% 训练, 10% 验证, 10% 测试)
    train_speakers, temp_speakers = train_test_split(
        all_speakers, test_size=0.2, random_state=42
    )
    val_speakers, test_speakers = train_test_split(
        temp_speakers, test_size=0.5, random_state=42
    )
    
    print(f"训练集说话者: {len(train_speakers)}")
    print(f"验证集说话者: {len(val_speakers)}")
    print(f"测试集说话者: {len(test_speakers)}")
    
    train_speakers = set(train_speakers)
    val_speakers = set(val_speakers)
    test_speakers = set(test_speakers)
    
    # 按说话者分配数据
    train_audio, train_labels = [], []
    val_audio, val_labels = [], []
    test_audio, test_labels = [], []
    
    for vowel_idx, vowel in enumerate(VOWEL_CLASSES):
        key = f'{vowel}_data'
        if key not in data:
            print(f"警告: 没有 {vowel} 类的数据")
            continue
        
        audio_data = data[key]
        speakers = speaker_info.get(vowel, [])
        
        if len(audio_data) == 0:
            continue
        
        for i, (audio, speaker) in enumerate(zip(audio_data, speakers)):
            if speaker in train_speakers:
                train_audio.append(audio)
                train_labels.append(vowel_idx)
            elif speaker in val_speakers:
                val_audio.append(audio)
                val_labels.append(vowel_idx)
            elif speaker in test_speakers:
                test_audio.append(audio)
                test_labels.append(vowel_idx)
    
    # 转换为 numpy 数组
    train_audio = np.array(train_audio, dtype=np.float32)
    train_labels = np.array(train_labels, dtype=np.int32)
    val_audio = np.array(val_audio, dtype=np.float32)
    val_labels = np.array(val_labels, dtype=np.int32)
    test_audio = np.array(test_audio, dtype=np.float32)
    test_labels = np.array(test_labels, dtype=np.int32)
    
    print(f"\n数据集大小:")
    print(f"  训练集: {len(train_audio)} 样本")
    print(f"  验证集: {len(val_audio)} 样本")
    print(f"  测试集: {len(test_audio)} 样本")
    
    # 类别分布
    print(f"\n训练集类别分布:")
    for vowel_idx, vowel in enumerate(VOWEL_CLASSES):
        count = np.sum(train_labels == vowel_idx)
        print(f"  {vowel}: {count}")
    
    # 提取 Mel 特征
    print("\n提取 Mel 特征...")
    
    print("  处理训练集...")
    train_mel = extract_mel_features(train_audio)
    
    print("  处理验证集...")
    val_mel = extract_mel_features(val_audio)
    
    print("  处理测试集...")
    test_mel = extract_mel_features(test_audio)
    
    print(f"\nMel 特征形状:")
    print(f"  训练集: {train_mel.shape}")
    print(f"  验证集: {val_mel.shape}")
    print(f"  测试集: {test_mel.shape}")
    
    # 保存
    output_path = os.path.join(DATA_DIR, 'dataset.npz')
    np.savez_compressed(
        output_path,
        train_audio=train_audio,
        train_mel=train_mel,
        train_labels=train_labels,
        val_audio=val_audio,
        val_mel=val_mel,
        val_labels=val_labels,
        test_audio=test_audio,
        test_mel=test_mel,
        test_labels=test_labels,
    )
    
    print(f"\n数据集已保存到: {output_path}")
    
    return {
        'train': (train_audio, train_mel, train_labels),
        'val': (val_audio, val_mel, val_labels),
        'test': (test_audio, test_mel, test_labels),
    }


if __name__ == '__main__':
    prepare_dataset()
