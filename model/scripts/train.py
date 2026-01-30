"""
训练元音识别模型
"""
import os
import numpy as np
import tensorflow as tf
from sklearn.utils.class_weight import compute_class_weight
import matplotlib.pyplot as plt

from config import (
    DATA_DIR, CHECKPOINT_DIR, OUTPUT_DIR,
    VOWEL_CLASSES, NUM_CLASSES,
    BATCH_SIZE, EPOCHS, LEARNING_RATE, EARLY_STOPPING_PATIENCE
)
from model import create_vowel_model, create_full_model_from_weights, MelSpectrogram
from augmentation import augment_audio, augment_mel_spec


def load_dataset():
    """加载预处理的数据集"""
    data_path = os.path.join(DATA_DIR, 'dataset.npz')
    
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"数据集不存在: {data_path}\n请先运行 prepare_dataset.py")
    
    data = np.load(data_path)
    
    return {
        'train': {
            'audio': data['train_audio'],
            'mel': data['train_mel'],
            'labels': data['train_labels'],
        },
        'val': {
            'audio': data['val_audio'],
            'mel': data['val_mel'],
            'labels': data['val_labels'],
        },
        'test': {
            'audio': data['test_audio'],
            'mel': data['test_mel'],
            'labels': data['test_labels'],
        },
    }


class AugmentedDataGenerator(tf.keras.utils.Sequence):
    """
    带数据增强的数据生成器
    """
    
    def __init__(self, audio_data, mel_data, labels, batch_size, augment=True, shuffle=True):
        self.audio_data = audio_data
        self.mel_data = mel_data
        self.labels = labels
        self.batch_size = batch_size
        self.augment = augment
        self.shuffle = shuffle
        self.indices = np.arange(len(labels))
        
        if shuffle:
            np.random.shuffle(self.indices)
    
    def __len__(self):
        return int(np.ceil(len(self.labels) / self.batch_size))
    
    def __getitem__(self, idx):
        batch_indices = self.indices[idx * self.batch_size:(idx + 1) * self.batch_size]
        
        batch_mel = self.mel_data[batch_indices].copy()
        batch_labels = self.labels[batch_indices]
        
        # 数据增强（在 Mel 特征上）
        if self.augment:
            for i in range(len(batch_mel)):
                # 对音频增强后重新提取 Mel，或者直接在 Mel 上增强
                # 这里简化为只在 Mel 上做 SpecAugment
                batch_mel[i] = augment_mel_spec(batch_mel[i])
        
        return batch_mel, batch_labels
    
    def on_epoch_end(self):
        if self.shuffle:
            np.random.shuffle(self.indices)


def train():
    """训练模型"""
    print("=" * 60)
    print("训练元音识别模型")
    print("=" * 60)
    
    # 创建目录
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    
    # 加载数据
    print("\n加载数据集...")
    dataset = load_dataset()
    
    train_mel = dataset['train']['mel']
    train_labels = dataset['train']['labels']
    val_mel = dataset['val']['mel']
    val_labels = dataset['val']['labels']
    
    print(f"训练集: {len(train_labels)} 样本")
    print(f"验证集: {len(val_labels)} 样本")
    
    # 计算类别权重（处理不平衡）
    class_weights = compute_class_weight(
        'balanced',
        classes=np.arange(NUM_CLASSES),
        y=train_labels
    )
    class_weight_dict = {i: w for i, w in enumerate(class_weights)}
    print(f"\n类别权重: {class_weight_dict}")
    
    # 创建数据生成器
    train_gen = AugmentedDataGenerator(
        dataset['train']['audio'],
        train_mel,
        train_labels,
        batch_size=BATCH_SIZE,
        augment=True,
        shuffle=True
    )
    
    val_gen = AugmentedDataGenerator(
        dataset['val']['audio'],
        val_mel,
        val_labels,
        batch_size=BATCH_SIZE,
        augment=False,
        shuffle=False
    )
    
    # 创建模型（不含 Mel 层，输入预提取的 Mel 特征）
    print("\n创建模型...")
    model = create_vowel_model(include_mel_layer=False)
    model.summary()
    
    # 编译模型
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=LEARNING_RATE),
        loss='sparse_categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # 回调函数
    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor='val_accuracy',
            patience=EARLY_STOPPING_PATIENCE,
            restore_best_weights=True,
            verbose=1
        ),
        tf.keras.callbacks.ModelCheckpoint(
            os.path.join(CHECKPOINT_DIR, 'best_model.keras'),
            monitor='val_accuracy',
            save_best_only=True,
            verbose=1
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-6,
            verbose=1
        ),
        tf.keras.callbacks.TensorBoard(
            log_dir=os.path.join(CHECKPOINT_DIR, 'logs'),
            histogram_freq=1
        )
    ]
    
    # 训练
    print("\n开始训练...")
    history = model.fit(
        train_gen,
        validation_data=val_gen,
        epochs=EPOCHS,
        class_weight=class_weight_dict,
        callbacks=callbacks,
        verbose=1
    )
    
    # 保存训练历史
    print("\n保存训练历史...")
    plot_history(history)
    
    # 评估测试集
    print("\n评估测试集...")
    test_mel = dataset['test']['mel']
    test_labels = dataset['test']['labels']
    
    test_loss, test_acc = model.evaluate(test_mel, test_labels, verbose=0)
    print(f"测试集准确率: {test_acc:.4f}")
    print(f"测试集损失: {test_loss:.4f}")
    
    # 混淆矩阵
    print("\n生成混淆矩阵...")
    plot_confusion_matrix(model, test_mel, test_labels)
    
    # 创建完整模型（包含 Mel 层）并保存
    print("\n创建完整模型...")
    full_model = create_full_model_from_weights(model)
    
    # 保存 Keras 模型
    keras_path = os.path.join(OUTPUT_DIR, 'vowel_model.keras')
    full_model.save(keras_path)
    print(f"Keras 模型已保存: {keras_path}")
    
    # 保存 SavedModel 格式（用于转换）
    saved_model_path = os.path.join(OUTPUT_DIR, 'saved_model')
    full_model.save(saved_model_path)
    print(f"SavedModel 已保存: {saved_model_path}")
    
    print("\n训练完成！")
    print(f"最终测试准确率: {test_acc:.4f}")
    
    return model, history


def plot_history(history):
    """绘制训练历史"""
    fig, axes = plt.subplots(1, 2, figsize=(12, 4))
    
    # 准确率
    axes[0].plot(history.history['accuracy'], label='训练')
    axes[0].plot(history.history['val_accuracy'], label='验证')
    axes[0].set_title('准确率')
    axes[0].set_xlabel('Epoch')
    axes[0].set_ylabel('Accuracy')
    axes[0].legend()
    axes[0].grid(True)
    
    # 损失
    axes[1].plot(history.history['loss'], label='训练')
    axes[1].plot(history.history['val_loss'], label='验证')
    axes[1].set_title('损失')
    axes[1].set_xlabel('Epoch')
    axes[1].set_ylabel('Loss')
    axes[1].legend()
    axes[1].grid(True)
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'training_history.png'), dpi=150)
    plt.close()
    print(f"训练历史图已保存: {os.path.join(OUTPUT_DIR, 'training_history.png')}")


def plot_confusion_matrix(model, test_mel, test_labels):
    """绘制混淆矩阵"""
    from sklearn.metrics import confusion_matrix, classification_report
    
    # 预测
    predictions = model.predict(test_mel, verbose=0)
    pred_labels = np.argmax(predictions, axis=1)
    
    # 混淆矩阵
    cm = confusion_matrix(test_labels, pred_labels)
    
    # 绘制
    fig, ax = plt.subplots(figsize=(8, 8))
    im = ax.imshow(cm, interpolation='nearest', cmap=plt.cm.Blues)
    ax.figure.colorbar(im, ax=ax)
    
    ax.set(
        xticks=np.arange(NUM_CLASSES),
        yticks=np.arange(NUM_CLASSES),
        xticklabels=VOWEL_CLASSES,
        yticklabels=VOWEL_CLASSES,
        title='混淆矩阵',
        ylabel='真实标签',
        xlabel='预测标签'
    )
    
    # 在格子里显示数值
    thresh = cm.max() / 2.
    for i in range(NUM_CLASSES):
        for j in range(NUM_CLASSES):
            ax.text(j, i, format(cm[i, j], 'd'),
                   ha="center", va="center",
                   color="white" if cm[i, j] > thresh else "black")
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUTPUT_DIR, 'confusion_matrix.png'), dpi=150)
    plt.close()
    print(f"混淆矩阵已保存: {os.path.join(OUTPUT_DIR, 'confusion_matrix.png')}")
    
    # 分类报告
    report = classification_report(test_labels, pred_labels, target_names=VOWEL_CLASSES)
    print("\n分类报告:")
    print(report)
    
    # 保存报告
    with open(os.path.join(OUTPUT_DIR, 'classification_report.txt'), 'w') as f:
        f.write(report)


if __name__ == '__main__':
    train()
