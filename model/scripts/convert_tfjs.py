"""
将训练好的 Keras 模型转换为 TensorFlow.js 格式
"""
import os
import subprocess
import sys
import tensorflow as tf
import numpy as np

from config import OUTPUT_DIR, INPUT_SAMPLES, VOWEL_CLASSES


def convert_to_tfjs():
    """转换模型为 TensorFlow.js 格式"""
    print("=" * 60)
    print("转换模型为 TensorFlow.js 格式")
    print("=" * 60)
    
    saved_model_path = os.path.join(OUTPUT_DIR, 'saved_model')
    tfjs_output_path = os.path.join(OUTPUT_DIR, 'tfjs_model')
    
    if not os.path.exists(saved_model_path):
        print(f"错误: SavedModel 不存在: {saved_model_path}")
        print("请先运行 train.py 训练模型")
        return False
    
    # 创建输出目录
    os.makedirs(tfjs_output_path, exist_ok=True)
    
    # 使用 tensorflowjs_converter 转换
    print(f"\n输入: {saved_model_path}")
    print(f"输出: {tfjs_output_path}")
    
    cmd = [
        sys.executable, '-m', 'tensorflowjs_converter',
        '--input_format=tf_saved_model',
        '--output_format=tfjs_graph_model',
        '--quantize_uint8',  # 量化为 uint8 减小模型大小
        '--skip_op_check',   # 跳过某些操作检查
        saved_model_path,
        tfjs_output_path
    ]
    
    print(f"\n执行命令: {' '.join(cmd)}")
    
    try:
        result = subprocess.run(cmd, capture_output=True, text=True)
        
        if result.returncode == 0:
            print("\n转换成功!")
            
            # 列出输出文件
            print("\n输出文件:")
            total_size = 0
            for f in os.listdir(tfjs_output_path):
                fpath = os.path.join(tfjs_output_path, f)
                size = os.path.getsize(fpath)
                total_size += size
                print(f"  {f}: {size / 1024:.1f} KB")
            
            print(f"\n总大小: {total_size / 1024:.1f} KB")
            
            return True
        else:
            print(f"\n转换失败!")
            print(f"错误输出: {result.stderr}")
            return False
            
    except FileNotFoundError:
        print("\n错误: tensorflowjs 未安装")
        print("请运行: pip install tensorflowjs")
        return False


def verify_tfjs_model():
    """验证转换后的模型"""
    print("\n" + "=" * 60)
    print("验证 TensorFlow.js 模型")
    print("=" * 60)
    
    tfjs_path = os.path.join(OUTPUT_DIR, 'tfjs_model', 'model.json')
    
    if not os.path.exists(tfjs_path):
        print(f"错误: 模型文件不存在: {tfjs_path}")
        return False
    
    print(f"模型文件: {tfjs_path}")
    
    # 加载原始 Keras 模型进行对比
    keras_path = os.path.join(OUTPUT_DIR, 'vowel_model.keras')
    
    if os.path.exists(keras_path):
        print("\n加载 Keras 模型进行对比...")
        
        # 需要自定义对象来加载模型
        from model import MelSpectrogram
        
        model = tf.keras.models.load_model(
            keras_path,
            custom_objects={'MelSpectrogram': MelSpectrogram}
        )
        
        # 测试推理
        test_input = np.random.randn(1, INPUT_SAMPLES).astype(np.float32) * 0.1
        output = model.predict(test_input, verbose=0)
        
        print(f"测试输入形状: {test_input.shape}")
        print(f"输出形状: {output.shape}")
        print(f"输出类别: {VOWEL_CLASSES}")
        print(f"输出概率: {output[0]}")
        print(f"预测类别: {VOWEL_CLASSES[np.argmax(output[0])]}")
    
    print("\n验证完成!")
    return True


def create_js_example():
    """生成 JavaScript 使用示例"""
    js_example = '''// vowel-detector.js
// 元音识别器 - TensorFlow.js 版本

import * as tf from '@tensorflow/tfjs';

export class VowelDetector {
  constructor() {
    this.model = null;
    this.sampleRate = 16000;
    this.inputSamples = 3360;  // 210ms @ 16kHz
    this.vowelClasses = ['A', 'E', 'I', 'O', 'U', 'silence'];
  }
  
  async load(modelPath = '/models/vowel/model.json') {
    console.log('Loading vowel detection model...');
    this.model = await tf.loadGraphModel(modelPath);
    console.log('Model loaded successfully');
    
    // 预热模型
    const warmupInput = tf.zeros([1, this.inputSamples]);
    await this.model.predict(warmupInput).data();
    warmupInput.dispose();
    console.log('Model warmed up');
  }
  
  /**
   * 预测元音
   * @param {Float32Array} audioSamples - 3360 个采样点 (210ms @ 16kHz)
   * @returns {{vowel: string, confidence: number, probabilities: object}}
   */
  predict(audioSamples) {
    if (!this.model) {
      throw new Error('Model not loaded. Call load() first.');
    }
    
    if (audioSamples.length !== this.inputSamples) {
      throw new Error(`Expected ${this.inputSamples} samples, got ${audioSamples.length}`);
    }
    
    return tf.tidy(() => {
      const input = tf.tensor2d([audioSamples], [1, this.inputSamples]);
      const output = this.model.predict(input);
      const probs = output.dataSync();
      
      let maxIdx = 0;
      let maxProb = probs[0];
      for (let i = 1; i < probs.length; i++) {
        if (probs[i] > maxProb) {
          maxProb = probs[i];
          maxIdx = i;
        }
      }
      
      const probabilities = {};
      this.vowelClasses.forEach((v, i) => {
        probabilities[v] = probs[i];
      });
      
      return {
        vowel: this.vowelClasses[maxIdx],
        confidence: maxProb,
        probabilities
      };
    });
  }
  
  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}

/**
 * 实时元音流处理器
 */
export class RealtimeVowelStream {
  constructor(detector) {
    this.detector = detector;
    this.buffer = new Float32Array(3360);
    
    // 施密特触发器状态
    this.currentVowel = 'silence';
    this.highThreshold = 0.7;  // 进入阈值
    this.lowThreshold = 0.4;   // 退出阈值
    
    // 回调
    this.onVowelStart = null;
    this.onVowelEnd = null;
    this.onVowelChange = null;
  }
  
  /**
   * 推入新的音频采样点
   * @param {Float32Array} samples - 160 个新采样点 (10ms @ 16kHz)
   */
  pushSamples(samples) {
    if (samples.length !== 160) {
      console.warn(`Expected 160 samples, got ${samples.length}`);
    }
    
    // 移动缓冲区
    this.buffer.copyWithin(0, 160);
    this.buffer.set(samples, 3360 - 160);
    
    // 推理
    const result = this.detector.predict(this.buffer);
    
    // 施密特触发器逻辑
    const prevVowel = this.currentVowel;
    
    if (this.currentVowel === 'silence') {
      // 当前静音，检查是否开始发音
      if (result.vowel !== 'silence' && result.confidence > this.highThreshold) {
        this.currentVowel = result.vowel;
        if (this.onVowelStart) this.onVowelStart(result.vowel, result.confidence);
      }
    } else {
      // 当前发音中
      if (result.vowel === 'silence' && result.probabilities.silence > this.lowThreshold) {
        // 停止发音
        if (this.onVowelEnd) this.onVowelEnd(this.currentVowel);
        this.currentVowel = 'silence';
      } else if (result.vowel !== this.currentVowel && 
                 result.vowel !== 'silence' && 
                 result.confidence > this.highThreshold) {
        // 切换元音
        if (this.onVowelEnd) this.onVowelEnd(this.currentVowel);
        this.currentVowel = result.vowel;
        if (this.onVowelStart) this.onVowelStart(result.vowel, result.confidence);
      }
    }
    
    if (prevVowel !== this.currentVowel && this.onVowelChange) {
      this.onVowelChange(this.currentVowel, prevVowel);
    }
    
    return result;
  }
  
  reset() {
    this.buffer.fill(0);
    this.currentVowel = 'silence';
  }
}

// 使用示例
/*
const detector = new VowelDetector();
await detector.load('/models/vowel/model.json');

const stream = new RealtimeVowelStream(detector);
stream.onVowelStart = (vowel, confidence) => {
  console.log(`开始发音: ${vowel} (${(confidence * 100).toFixed(1)}%)`);
};
stream.onVowelEnd = (vowel) => {
  console.log(`结束发音: ${vowel}`);
};

// 在音频处理回调中
audioWorklet.onAudioProcess = (samples) => {
  stream.pushSamples(samples);
};
*/
'''
    
    js_path = os.path.join(OUTPUT_DIR, 'vowel-detector.js')
    with open(js_path, 'w', encoding='utf-8') as f:
        f.write(js_example)
    
    print(f"\nJavaScript 示例已生成: {js_path}")


if __name__ == '__main__':
    success = convert_to_tfjs()
    
    if success:
        verify_tfjs_model()
        create_js_example()
