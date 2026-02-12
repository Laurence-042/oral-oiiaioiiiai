/**
 * AudioWorklet Processor — 音频采集 + 16kHz 重采样
 *
 * 运行在独立的音频渲染线程，不阻塞主线程。
 * 将浏览器原生采样率（44.1k/48k）的音频重采样到 16kHz，
 * 维护循环缓冲区，缓冲区满后通过 port.postMessage 发送给主线程。
 */

const TARGET_SAMPLE_RATE = 16000;
const INPUT_SAMPLES = 3360; // 210ms @ 16kHz — 模型输入长度

class VowelAudioProcessor extends AudioWorkletProcessor {
  private _buffer: Float32Array;
  private _bufferIndex: number;
  private _resampleRatio: number;
  private _frameCount: number;
  private _sendInterval: number;

  constructor() {
    super();
    this._buffer = new Float32Array(INPUT_SAMPLES);
    this._bufferIndex = 0;
    this._resampleRatio = TARGET_SAMPLE_RATE / sampleRate;
    this._frameCount = 0;
    // 每 N 个 render quantum 发送一次缓冲区快照
    // render quantum = 128 samples → ~2.9ms @ 44.1k
    // ~40ms 间隔 → 每秒 ~25 次推理
    this._sendInterval = Math.max(1, Math.round(0.04 * sampleRate / 128));
  }

  process(inputs: Float32Array[][]): boolean {
    const input = inputs[0];
    if (!input || !input[0] || input[0].length === 0) return true;

    const inputData = input[0]; // mono channel

    // 线性插值重采样：从 sampleRate → 16kHz
    const ratio = this._resampleRatio;
    const resampledLength = Math.ceil(inputData.length * ratio);

    for (let i = 0; i < resampledLength; i++) {
      const sourcePos = i / ratio;
      const intPart = Math.floor(sourcePos);
      const fracPart = sourcePos - intPart;

      let sample: number;
      if (intPart >= inputData.length - 1) {
        sample = inputData[inputData.length - 1];
      } else {
        sample = inputData[intPart] * (1 - fracPart) + inputData[intPart + 1] * fracPart;
      }

      this._buffer[this._bufferIndex] = sample;
      this._bufferIndex = (this._bufferIndex + 1) % INPUT_SAMPLES;
    }

    this._frameCount++;

    // 按间隔发送缓冲区快照
    if (this._frameCount >= this._sendInterval) {
      this._frameCount = 0;

      // 从循环缓冲区按正确顺序读出
      const snapshot = new Float32Array(INPUT_SAMPLES);
      for (let i = 0; i < INPUT_SAMPLES; i++) {
        snapshot[i] = this._buffer[(this._bufferIndex + i) % INPUT_SAMPLES];
      }
      this.port.postMessage({ type: 'audio', buffer: snapshot }, [snapshot.buffer]);
    }

    return true;
  }
}

registerProcessor('vowel-audio-processor', VowelAudioProcessor);
