/**
 * AudioWorkletGlobalScope 类型声明
 * 这些全局变量/函数只在 AudioWorklet 上下文中可用
 */

/* eslint-disable no-var */
declare const sampleRate: number;
declare const currentTime: number;
declare const currentFrame: number;

declare function registerProcessor(
  name: string,
  processorCtor: new (options?: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;

declare class AudioWorkletProcessor {
  readonly port: MessagePort;
  constructor(options?: AudioWorkletNodeOptions);
  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ): boolean;
}
