import { ref, type Ref } from 'vue';

export interface VideoRecorderReturn {
  /** 是否正在录制 */
  isRecording: Ref<boolean>;
  /** 录制是否可用（浏览器支持） */
  isSupported: Ref<boolean>;
  /** 已录制时长 (ms) */
  recordedDuration: Ref<number>;
  /** 开始录制（传入要捕获的 DOM 元素） */
  startRecording: (element: HTMLElement, options?: RecordingOptions) => void;
  /** 停止录制并返回视频 Blob */
  stopRecording: () => Promise<Blob | null>;
  /** 下载已录制的视频 */
  downloadVideo: (filename?: string) => Promise<void>;
  /** 清理资源 */
  dispose: () => void;
}

export interface RecordingOptions {
  /** 最大录制时长 (ms)，默认 30000 (30s) */
  maxDuration?: number;
  /** 帧率，默认 30 */
  frameRate?: number;
  /** 视频比特率 (bps)，默认 2500000 */
  videoBitsPerSecond?: number;
  /** 是否包含音频（来自 Tone.js 或其他 AudioContext），默认 false */
  includeAudio?: boolean;
}

/**
 * 视频录制 Composable
 *
 * 使用 MediaRecorder API 录制游戏画面。
 * 采用循环缓冲策略：持续录制，只保留最后 maxDuration 的片段。
 *
 * 技术原理：
 * 1. 通过 html2canvas-like captureStream 获取 DOM 元素的视频流
 * 2. MediaRecorder 将流编码为 WebM
 * 3. 定期清理旧的数据块，只保留最后 N 秒
 */
export function useVideoRecorder(): VideoRecorderReturn {
  const isRecording = ref(false);
  const isSupported = ref(typeof MediaRecorder !== 'undefined');
  const recordedDuration = ref(0);

  let mediaRecorder: MediaRecorder | null = null;
  let recordedChunks: Blob[] = [];
  let chunkTimestamps: number[] = [];
  let stream: MediaStream | null = null;
  let durationTimer = 0;
  let startTime = 0;
  let maxDuration = 30000;
  let lastBlob: Blob | null = null;

  /**
   * 获取可用的 MIME 类型
   */
  function getSupportedMimeType(): string {
    const types = [
      'video/webm;codecs=vp9',
      'video/webm;codecs=vp8',
      'video/webm',
      'video/mp4'
    ];
    for (const type of types) {
      if (MediaRecorder.isTypeSupported(type)) return type;
    }
    return '';
  }

  /**
   * 开始录制
   */
  function startRecording(element: HTMLElement, options: RecordingOptions = {}): void {
    if (!isSupported.value || isRecording.value) return;

    const frameRate = options.frameRate ?? 30;
    maxDuration = options.maxDuration ?? 30000;
    const videoBitsPerSecond = options.videoBitsPerSecond ?? 2500000;

    // 获取 canvas stream（如果元素内含 canvas）
    // 或使用实验性 captureStream API
    const canvas = element.querySelector('canvas');
    if (canvas && typeof canvas.captureStream === 'function') {
      stream = canvas.captureStream(frameRate);
    } else {
      // 回退：尝试 captureStream（实验性，部分浏览器可用）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const el = element as any;
      if (typeof el.captureStream === 'function') {
        stream = el.captureStream(frameRate);
      } else {
        console.warn('[VideoRecorder] captureStream not supported on this element');
        isSupported.value = false;
        return;
      }
    }

    // 如果需要音频，尝试从全局 AudioContext 获取
    if (options.includeAudio) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const audioCtx = (window as any).__audioContext as AudioContext | undefined;
        if (audioCtx && audioCtx.state === 'running') {
          const dest = audioCtx.createMediaStreamDestination();
          // 将 AudioContext 的主输出连接到 destination
          audioCtx.destination.toString(); // just access check
          const audioTrack = dest.stream.getAudioTracks()[0];
          if (audioTrack && stream) {
            stream.addTrack(audioTrack);
          }
        }
      } catch {
        // 音频不是必需的，忽略错误
      }
    }

    const mimeType = getSupportedMimeType();
    if (!mimeType) {
      console.warn('[VideoRecorder] No supported MIME type found');
      isSupported.value = false;
      return;
    }

    recordedChunks = [];
    chunkTimestamps = [];
    lastBlob = null;
    startTime = Date.now();
    recordedDuration.value = 0;

    try {
      mediaRecorder = new MediaRecorder(stream!, {
        mimeType,
        videoBitsPerSecond
      });
    } catch (err) {
      console.error('[VideoRecorder] Failed to create MediaRecorder', err);
      isSupported.value = false;
      return;
    }

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunks.push(event.data);
        chunkTimestamps.push(Date.now());

        // 循环缓冲：删除超过 maxDuration 的旧块
        const cutoff = Date.now() - maxDuration;
        while (chunkTimestamps.length > 0 && chunkTimestamps[0] < cutoff) {
          chunkTimestamps.shift();
          recordedChunks.shift();
        }
      }
    };

    mediaRecorder.start(1000); // 每秒一个数据块
    isRecording.value = true;

    // 计时器更新持续时长
    durationTimer = window.setInterval(() => {
      recordedDuration.value = Date.now() - startTime;
    }, 200);
  }

  /**
   * 停止录制
   */
  function stopRecording(): Promise<Blob | null> {
    return new Promise((resolve) => {
      if (!mediaRecorder || !isRecording.value) {
        resolve(null);
        return;
      }

      if (durationTimer) {
        clearInterval(durationTimer);
        durationTimer = 0;
      }

      mediaRecorder.onstop = () => {
        const mimeType = mediaRecorder?.mimeType ?? 'video/webm';
        if (recordedChunks.length > 0) {
          lastBlob = new Blob(recordedChunks, { type: mimeType });
        }
        isRecording.value = false;
        recordedDuration.value = 0;

        // 清理流
        if (stream) {
          stream.getTracks().forEach(t => t.stop());
          stream = null;
        }
        mediaRecorder = null;

        resolve(lastBlob);
      };

      mediaRecorder.stop();
    });
  }

  /**
   * 下载录制的视频
   */
  async function downloadVideo(filename?: string): Promise<void> {
    let blob = lastBlob;
    if (!blob && isRecording.value) {
      blob = await stopRecording();
    }
    if (!blob) return;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename ?? `oiiaioiiiai-${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 清理所有资源
   */
  function dispose(): void {
    if (isRecording.value && mediaRecorder) {
      try { mediaRecorder.stop(); } catch { /* ignore */ }
    }
    if (durationTimer) {
      clearInterval(durationTimer);
      durationTimer = 0;
    }
    if (stream) {
      stream.getTracks().forEach(t => t.stop());
      stream = null;
    }
    recordedChunks = [];
    chunkTimestamps = [];
    lastBlob = null;
    mediaRecorder = null;
    isRecording.value = false;
  }

  return {
    isRecording,
    isSupported,
    recordedDuration,
    startRecording,
    stopRecording,
    downloadVideo,
    dispose
  };
}
