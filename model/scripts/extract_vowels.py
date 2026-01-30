"""
从 TIMIT 数据集提取元音片段
"""
import os
import glob
import numpy as np
import soundfile as sf
from collections import defaultdict
import json

from config import (
    TIMIT_DIR, DATA_DIR, SAMPLE_RATE, INPUT_SAMPLES,
    PHONEME_TO_VOWEL, VOWEL_CLASSES
)


def parse_phn_file(phn_path):
    """解析 .phn 文件，返回音素列表"""
    phonemes = []
    with open(phn_path, 'r') as f:
        for line in f:
            parts = line.strip().split()
            if len(parts) >= 3:
                start_sample = int(parts[0])
                end_sample = int(parts[1])
                phoneme = parts[2].lower()
                phonemes.append({
                    'start': start_sample,
                    'end': end_sample,
                    'phoneme': phoneme
                })
    return phonemes


def extract_vowel_segments(wav_path, phn_path, target_samples=INPUT_SAMPLES):
    """
    从单个音频文件提取元音片段
    
    Args:
        wav_path: WAV 文件路径
        phn_path: PHN 标注文件路径
        target_samples: 目标采样点数
        
    Returns:
        segments: 列表，每项为 (audio_segment, vowel_label)
    """
    # 读取音频
    audio, sr = sf.read(wav_path)
    
    # TIMIT 原始采样率是 16kHz，确认一下
    if sr != SAMPLE_RATE:
        print(f"警告: {wav_path} 采样率为 {sr}，期望 {SAMPLE_RATE}")
        return []
    
    # 解析音素标注
    phonemes = parse_phn_file(phn_path)
    
    segments = []
    half_context = target_samples // 2  # 1680 samples = 105ms
    
    for ph in phonemes:
        phoneme = ph['phoneme']
        
        # 检查是否是元音
        if phoneme not in PHONEME_TO_VOWEL:
            continue
            
        vowel = PHONEME_TO_VOWEL[phoneme]
        
        # 计算音素中心点
        center = (ph['start'] + ph['end']) // 2
        
        # 提取以中心点为中心的片段
        start_idx = center - half_context
        end_idx = center + half_context
        
        # 边界检查
        if start_idx < 0 or end_idx > len(audio):
            continue
        
        segment = audio[start_idx:end_idx]
        
        # 确保长度正确
        if len(segment) != target_samples:
            continue
            
        segments.append((segment.astype(np.float32), vowel))
    
    return segments


def extract_silence_segments(wav_path, phn_path, target_samples=INPUT_SAMPLES, max_per_file=2):
    """
    从单个音频文件提取静音片段
    
    静音定义：非元音的音素（辅音、停顿等）
    """
    audio, sr = sf.read(wav_path)
    
    if sr != SAMPLE_RATE:
        return []
    
    phonemes = parse_phn_file(phn_path)
    
    segments = []
    half_context = target_samples // 2
    
    for ph in phonemes:
        phoneme = ph['phoneme']
        
        # 跳过元音
        if phoneme in PHONEME_TO_VOWEL:
            continue
        
        # 选择明确的静音/停顿音素
        if phoneme not in ['h#', 'pau', 'epi', 'bcl', 'dcl', 'gcl', 'pcl', 'tcl', 'kcl']:
            continue
        
        center = (ph['start'] + ph['end']) // 2
        start_idx = center - half_context
        end_idx = center + half_context
        
        if start_idx < 0 or end_idx > len(audio):
            continue
        
        segment = audio[start_idx:end_idx]
        
        if len(segment) != target_samples:
            continue
        
        segments.append((segment.astype(np.float32), 'silence'))
        
        # 限制每个文件的静音样本数
        if len(segments) >= max_per_file:
            break
    
    return segments


def find_timit_files(timit_dir):
    """查找所有 TIMIT 音频文件"""
    wav_files = []
    
    # TIMIT 目录结构: TIMIT/TRAIN/DR1/FCJF0/SA1.WAV
    for subset in ['TRAIN', 'TEST']:
        subset_dir = os.path.join(timit_dir, subset)
        if not os.path.exists(subset_dir):
            # 尝试小写
            subset_dir = os.path.join(timit_dir, subset.lower())
        
        if not os.path.exists(subset_dir):
            continue
            
        # 递归查找所有 .wav 文件
        pattern = os.path.join(subset_dir, '**', '*.WAV')
        wav_files.extend(glob.glob(pattern, recursive=True))
        
        # 也尝试小写扩展名
        pattern = os.path.join(subset_dir, '**', '*.wav')
        wav_files.extend(glob.glob(pattern, recursive=True))
    
    # 去重
    wav_files = list(set(wav_files))
    
    return wav_files


def get_speaker_id(wav_path):
    """从路径提取说话者 ID"""
    # 路径格式: .../DR1/FCJF0/SA1.WAV
    parts = wav_path.replace('\\', '/').split('/')
    for i, part in enumerate(parts):
        if part.startswith('DR') and i + 1 < len(parts):
            return parts[i + 1]  # 返回说话者目录名
    return os.path.basename(os.path.dirname(wav_path))


def main():
    print("=" * 60)
    print("TIMIT 元音提取")
    print("=" * 60)
    
    # 创建输出目录
    os.makedirs(DATA_DIR, exist_ok=True)
    
    # 查找所有音频文件
    print(f"\n查找 TIMIT 文件: {TIMIT_DIR}")
    wav_files = find_timit_files(TIMIT_DIR)
    print(f"找到 {len(wav_files)} 个音频文件")
    
    if len(wav_files) == 0:
        print("\n错误: 未找到任何音频文件!")
        print("请确保 TIMIT 数据集位于:", TIMIT_DIR)
        print("目录结构应为: timit/TRAIN/DR*/SPEAKER/*.WAV")
        return
    
    # 按说话者分组
    speaker_files = defaultdict(list)
    for wav_path in wav_files:
        speaker = get_speaker_id(wav_path)
        speaker_files[speaker].append(wav_path)
    
    print(f"共 {len(speaker_files)} 个说话者")
    
    # 提取所有片段
    all_segments = defaultdict(list)  # vowel -> [(segment, speaker), ...]
    
    for speaker, files in speaker_files.items():
        for wav_path in files:
            # 找到对应的 .phn 文件
            phn_path = wav_path.replace('.WAV', '.PHN').replace('.wav', '.phn')
            if not os.path.exists(phn_path):
                phn_path = wav_path.rsplit('.', 1)[0] + '.PHN'
            if not os.path.exists(phn_path):
                phn_path = wav_path.rsplit('.', 1)[0] + '.phn'
            
            if not os.path.exists(phn_path):
                continue
            
            # 提取元音片段
            vowel_segments = extract_vowel_segments(wav_path, phn_path)
            for segment, vowel in vowel_segments:
                all_segments[vowel].append((segment, speaker))
            
            # 提取静音片段
            silence_segments = extract_silence_segments(wav_path, phn_path)
            for segment, vowel in silence_segments:
                all_segments[vowel].append((segment, speaker))
    
    # 统计
    print("\n提取结果:")
    print("-" * 40)
    total = 0
    for vowel in VOWEL_CLASSES:
        count = len(all_segments[vowel])
        print(f"  {vowel}: {count} 个样本")
        total += count
    print("-" * 40)
    print(f"  总计: {total} 个样本")
    
    # 保存数据
    output_path = os.path.join(DATA_DIR, 'vowel_segments.npz')
    
    # 准备保存的数据
    save_data = {}
    save_labels = {}
    save_speakers = {}
    
    for vowel in VOWEL_CLASSES:
        segments = all_segments[vowel]
        if segments:
            save_data[vowel] = np.array([s[0] for s in segments])
            save_speakers[vowel] = [s[1] for s in segments]
    
    np.savez_compressed(
        output_path,
        **{f'{v}_data': save_data.get(v, np.array([])) for v in VOWEL_CLASSES}
    )
    
    # 保存说话者信息（用于数据划分）
    speaker_info_path = os.path.join(DATA_DIR, 'speaker_info.json')
    with open(speaker_info_path, 'w') as f:
        json.dump(save_speakers, f)
    
    print(f"\n数据已保存到: {output_path}")
    print(f"说话者信息已保存到: {speaker_info_path}")


if __name__ == '__main__':
    main()
