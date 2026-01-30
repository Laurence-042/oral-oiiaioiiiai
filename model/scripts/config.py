"""
配置参数
"""
import os

# 路径配置
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TIMIT_DIR = os.path.join(BASE_DIR, 'timit')
DATA_DIR = os.path.join(BASE_DIR, 'data')
CHECKPOINT_DIR = os.path.join(BASE_DIR, 'checkpoints')
OUTPUT_DIR = os.path.join(BASE_DIR, 'output')

# 音频参数
SAMPLE_RATE = 16000           # 16kHz 采样率
FRAME_LENGTH = 400            # 25ms 帧长 = 400 samples @ 16kHz
FRAME_STEP = 160              # 10ms 帧移 = 160 samples
FFT_LENGTH = 512              # FFT 点数
N_MELS = 40                   # 40 个 Mel 频带
CONTEXT_FRAMES = 21           # 上下文帧数
INPUT_SAMPLES = 3360          # 210ms @ 16kHz = 3360 samples

# 元音类别
VOWEL_CLASSES = ['A', 'E', 'I', 'O', 'U', 'silence']
NUM_CLASSES = len(VOWEL_CLASSES)

# 音素到元音的映射
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

# 训练配置
BATCH_SIZE = 64
EPOCHS = 50
LEARNING_RATE = 0.001
EARLY_STOPPING_PATIENCE = 10

# 数据增强配置
AUGMENTATION = {
    'gain_db': (-12, 12),           # 随机增益 ±12dB
    'noise_factor': 0.005,          # 白噪声因子
    'time_stretch': (0.9, 1.1),     # 时间拉伸范围
    'freq_mask_max': 5,             # 频率遮挡最大频带数
    'time_mask_max': 3,             # 时间遮挡最大帧数
}

# 增强概率
AUG_PROB = {
    'gain': 0.5,
    'noise': 0.3,
    'time_stretch': 0.2,
    'spec_augment': 0.3,
}
