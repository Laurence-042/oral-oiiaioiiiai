import { ref, computed, shallowRef } from 'vue';
import type { Vowel } from '@/types/game';

// ==================== 类型定义 ====================

/** 资源包清单 (manifest.json) */
export interface ResourcePackManifest {
  id: string;
  name: string;
  description: string;
  sequence: Vowel[];
  syllables: string[];      // 文件名列表，如 "001_U.wav"
  chromaFrames: string[];    // 文件名列表，如 "chroma_001.png"
}

/** 已加载的音节数据 */
export interface SyllableData {
  index: number;          // 在序列中的位置 (0-based)
  vowel: Vowel;           // 元音
  filename: string;       // 原始文件名
  buffer: AudioBuffer;    // 解码后的音频
  duration: number;       // 时长 (秒)
}

/** 已加载的资源包 */
export interface LoadedResourcePack {
  manifest: ResourcePackManifest;
  syllables: SyllableData[];
  idleFrame: HTMLImageElement;          // 第一帧 (静止帧)
  animationFrames: HTMLImageElement[];  // 其余帧 (循环帧)
  totalSyllableDuration: number;        // 所有音节时长之和 (秒)
}

/** 资源包摘要 (未加载，仅元信息) */
export interface ResourcePackInfo {
  id: string;
  name: string;
  description: string;
}

// ==================== 解析辅助 ====================

/** 从文件名 "001_U.wav" 解析 index 和 vowel */
function parseSyllableFilename(filename: string): { index: number; vowel: Vowel } {
  const match = filename.match(/^(\d+)_([A-Z]+)\.\w+$/);
  if (!match) throw new Error(`Invalid syllable filename: ${filename}`);
  return {
    index: parseInt(match[1], 10) - 1,  // 转为 0-based
    vowel: match[2] as Vowel
  };
}

// ==================== Composable ====================

export function useResourcePack() {
  const loading = ref(false);
  const loadProgress = ref(0);   // 0-100
  const error = ref<string | null>(null);

  const availablePacks = ref<ResourcePackInfo[]>([]);
  const currentPackId = ref<string>('oiia');
  const loadedPack = shallowRef<LoadedResourcePack | null>(null);

  const isLoaded = computed(() => !!loadedPack.value);
  const sequence = computed<Vowel[]>(() => loadedPack.value?.manifest.sequence ?? []);

  // 共享 AudioContext (懒创建)
  let audioCtx: AudioContext | null = null;
  function getAudioContext(): AudioContext {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new AudioContext();
    }
    return audioCtx;
  }

  /** 获取所有可用资源包列表 */
  async function fetchAvailablePacks(): Promise<ResourcePackInfo[]> {
    try {
      const res = await fetch('/resources/index.json');
      const data = await res.json() as { packs: string[] };

      const infos: ResourcePackInfo[] = [];
      for (const packId of data.packs) {
        try {
          const mRes = await fetch(`/resources/${packId}/manifest.json`);
          const manifest = await mRes.json() as ResourcePackManifest;
          infos.push({ id: manifest.id, name: manifest.name, description: manifest.description });
        } catch {
          console.warn(`Failed to load manifest for pack: ${packId}`);
        }
      }

      availablePacks.value = infos;
      return infos;
    } catch (e) {
      console.error('Failed to fetch resource packs', e);
      return [];
    }
  }

  /** 加载指定资源包 */
  async function loadPack(packId: string): Promise<LoadedResourcePack> {
    loading.value = true;
    loadProgress.value = 0;
    error.value = null;

    try {
      const basePath = `/resources/${packId}`;

      // 1. 加载清单
      const mRes = await fetch(`${basePath}/manifest.json`);
      if (!mRes.ok) throw new Error(`Manifest not found for pack: ${packId}`);
      const manifest = await mRes.json() as ResourcePackManifest;

      const totalAssets = manifest.syllables.length + manifest.chromaFrames.length;
      let loaded = 0;
      const tick = () => {
        loaded++;
        loadProgress.value = Math.round((loaded / totalAssets) * 100);
      };

      // 2. 加载音节
      const ctx = getAudioContext();
      const syllables: SyllableData[] = [];

      for (const filename of manifest.syllables) {
        const url = `${basePath}/syllables/${filename}`;
        const aRes = await fetch(url);
        const arrayBuf = await aRes.arrayBuffer();
        const buffer = await ctx.decodeAudioData(arrayBuf);
        const parsed = parseSyllableFilename(filename);
        syllables.push({
          index: parsed.index,
          vowel: parsed.vowel,
          filename,
          buffer,
          duration: buffer.duration
        });
        tick();
      }

      // 按 index 排序
      syllables.sort((a, b) => a.index - b.index);

      const totalSyllableDuration = syllables.reduce((sum, s) => sum + s.duration, 0);

      // 3. 加载帧图片
      const allFrames: HTMLImageElement[] = [];
      for (const filename of manifest.chromaFrames) {
        const url = `${basePath}/chroma_frames/${filename}`;
        const img = await loadImage(url);
        allFrames.push(img);
        tick();
      }

      const idleFrame = allFrames[0];
      const animationFrames = allFrames.slice(1);

      const pack: LoadedResourcePack = {
        manifest,
        syllables,
        idleFrame,
        animationFrames,
        totalSyllableDuration
      };

      loadedPack.value = pack;
      currentPackId.value = packId;
      loadProgress.value = 100;

      return pack;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      error.value = msg;
      throw e;
    } finally {
      loading.value = false;
    }
  }

  /** 播放指定音节 (可叠加，返回用于停止的函数) */
  function playSyllable(index: number): { stop: () => void; duration: number } | null {
    const pack = loadedPack.value;
    if (!pack) return null;

    const syl = pack.syllables[index];
    if (!syl) return null;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = syl.buffer;
    source.connect(ctx.destination);
    source.start(0);

    return {
      stop: () => {
        try { source.stop(); } catch { /* already stopped */ }
      },
      duration: syl.duration
    };
  }

  /** 清理资源 */
  function dispose() {
    loadedPack.value = null;
    if (audioCtx && audioCtx.state !== 'closed') {
      audioCtx.close();
      audioCtx = null;
    }
  }

  return {
    // 状态
    loading,
    loadProgress,
    error,
    availablePacks,
    currentPackId,
    loadedPack,
    isLoaded,
    sequence,

    // 方法
    fetchAvailablePacks,
    loadPack,
    playSyllable,
    getAudioContext,
    dispose
  };
}

// ==================== 工具函数 ====================

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load image: ${url}`));
    img.src = url;
  });
}
