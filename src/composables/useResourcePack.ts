import { ref, computed, shallowRef } from 'vue';
import type {
  Vowel,
  BGMConfig,
  PackTextConfig,
  ResolvedPackTextConfig,
  HighlightLabelTemplates,
  CopywritingVariant,
  PackStageConfig,
  LeaderboardTextConfig,
} from '@/types/game';

// ==================== 文案配置默认值 ====================

/** 默认阶段配置 */
export const DEFAULT_STAGES: PackStageConfig[] = [
  { name: '初醒', scoreThreshold: 0 },
  { name: '躁动', scoreThreshold: 100 },
  { name: '狂热', scoreThreshold: 200 },
  { name: '超度', scoreThreshold: 300 },
  { name: '神猫', scoreThreshold: 400 },
];

/** 默认高光标签 */
export const DEFAULT_HIGHLIGHT_LABELS: HighlightLabelTemplates = {
  'stage-up': '⬆ {stageName}',
  'combo-milestone': '🔥 {combo} 连击',
  'perfect-cycle': '✨ 完美循环 ×{count}',
  'speed-burst': '⚡ 极速 {speed}/s',
  'accuracy-streak': '🎯 精准 ×{count}',
  'final': '🏁 最终时刻',
};

/** 默认特殊文案 */
export const DEFAULT_SPECIAL_COPYWRITING: CopywritingVariant[] = [
  { title: '停不下来的节奏！', subtitle: '你的猫叫已经成为一种旋律' },
  { title: '无限循环模式', subtitle: '对着猫叫，成为传说！' },
  { title: '完美执行', subtitle: '你的 OIIIA 精准得可怕' },
  { title: '人形猫叫机器', subtitle: '效率之王，精准之神' },
];

/** 默认排行榜文案 */
export const DEFAULT_LEADERBOARD_TEXT: LeaderboardTextConfig = {
  unit: 'OIIIA',
  participateVerb: '参与',
};

/**
 * 将可选的 PackTextConfig 解析为所有字段都有值的 ResolvedPackTextConfig
 */
export function resolveTextConfig(raw?: PackTextConfig): ResolvedPackTextConfig {
  return {
    stages: raw?.stages?.length ? raw.stages : DEFAULT_STAGES,
    highlightLabels: { ...DEFAULT_HIGHLIGHT_LABELS, ...raw?.highlightLabels },
    specialCopywriting: raw?.specialCopywriting?.length ? raw.specialCopywriting : DEFAULT_SPECIAL_COPYWRITING,
    leaderboardText: {
      ...DEFAULT_LEADERBOARD_TEXT,
      ...raw?.leaderboardText,
    },
  };
}

// ==================== 类型定义 ====================

/** 资源包清单 (manifest.json) */
export interface ResourcePackManifest {
  id: string;
  name: string;
  description: string;
  sequence: Vowel[];
  syllables: string[];      // 文件名列表，如 "001_U.wav"
  chromaFrames: string[];    // 文件名列表，如 "chroma_001.png"
  bgm?: string;              // BGM 配置文件名，如 "bgm.json"（可选）
  /** 文案 / 阶段名 / 高光标签配置（可选，有默认 fallback） */
  textConfig?: PackTextConfig;
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
  bgmConfig: BGMConfig | null;          // 动态 BGM 配置（可选）
  textConfig: ResolvedPackTextConfig;    // 文案配置（已解析，所有字段有值）
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
  /** 已解析的文案配置（始终有值，未加载资源包时使用默认值） */
  const textConfig = computed<ResolvedPackTextConfig>(() =>
    loadedPack.value?.textConfig ?? resolveTextConfig()
  );

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
      const res = await fetch(`${import.meta.env.BASE_URL}resources/index.json`);
      const data = await res.json() as { packs: string[] };

      const infos: ResourcePackInfo[] = [];
      for (const packId of data.packs) {
        try {
          const mRes = await fetch(`${import.meta.env.BASE_URL}resources/${packId}/manifest.json`);
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
      const basePath = `${import.meta.env.BASE_URL}resources/${packId}`;

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

      // 4. 加载 BGM 配置 (可选)
      let bgmConfig: BGMConfig | null = null;
      if (manifest.bgm) {
        try {
          const bgmRes = await fetch(`${basePath}/${manifest.bgm}`);
          if (bgmRes.ok) bgmConfig = await bgmRes.json() as BGMConfig;
        } catch (e) {
          console.warn('Failed to load BGM config:', e);
        }
      }

      const pack: LoadedResourcePack = {
        manifest,
        syllables,
        idleFrame,
        animationFrames,
        totalSyllableDuration,
        bgmConfig,
        textConfig: resolveTextConfig(manifest.textConfig)
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
  function playSyllable(index: number, playbackRate: number = 1): { stop: () => void; duration: number } | null {
    const pack = loadedPack.value;
    if (!pack) return null;

    const syl = pack.syllables[index];
    if (!syl) return null;

    const ctx = getAudioContext();
    if (ctx.state === 'suspended') ctx.resume();

    const source = ctx.createBufferSource();
    source.buffer = syl.buffer;
    source.playbackRate.value = playbackRate;
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
    textConfig,

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
