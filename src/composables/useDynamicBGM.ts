import { ref, type Ref } from 'vue';
import type { BGMConfig, BGMTrackConfig, BGMSynthType, Stage } from '@/types/game';

// ==================== 类型 ====================
// import type 仅引入类型，零运行时开销，不会触发 Tone.js 模块初始化
import type * as ToneNS from 'tone';

/** 内部轨道实例 */
interface ActiveTrack {
  id: string;
  config: BGMTrackConfig;
  synth: ToneNS.MembraneSynth | ToneNS.MetalSynth | ToneNS.NoiseSynth | ToneNS.AMSynth | ToneNS.FMSynth | ToneNS.MonoSynth | ToneNS.DuoSynth;
  channel: ToneNS.Channel;
  sequence: ToneNS.Sequence;
  effects: ToneNS.ToneAudioNode[];
}

export interface UseDynamicBGMReturn {
  /** 是否正在播放 */
  isPlaying: Ref<boolean>;
  /** 当前 BPM */
  currentBPM: Ref<number>;
  /** 用 BGM 配置初始化（仅保存配置，不创建音频节点） */
  init: (config: BGMConfig) => void;
  /** 开始播放（首次调用时才加载 Tone.js 并构建音频图） */
  start: () => Promise<void>;
  /** 停止播放 */
  stop: () => void;
  /** 更新阶段（启用/禁用轨道） */
  setStage: (stage: Stage) => void;
  /** 更新 BPM（跟随玩家速度） */
  setBPM: (bpm: number) => void;
  /** 完全销毁 */
  dispose: () => void;
}

// ==================== Composable ====================

export function useDynamicBGM(): UseDynamicBGMReturn {
  const isPlaying = ref(false);
  const currentBPM = ref(120);

  /** 保存的 BGM 配置（init 时写入，start 时消费） */
  let pendingConfig: BGMConfig | null = null;
  /** 运行时 Tone 模块引用（动态加载后缓存） */
  let T: typeof ToneNS | null = null;

  let activeTracks: ActiveTrack[] = [];
  let masterChannel: ToneNS.Channel | null = null;
  let currentStage: Stage = 1;
  let built = false;

  // ── 合成器 / 效果器工厂 ──

  function createSynth(t: typeof ToneNS, type: BGMSynthType, options?: Record<string, unknown>): ActiveTrack['synth'] {
    switch (type) {
      case 'membrane': return new t.MembraneSynth(options as Partial<ToneNS.MembraneSynthOptions>);
      case 'metal':    return new t.MetalSynth(options as Partial<ToneNS.MetalSynthOptions>);
      case 'noise':    return new t.NoiseSynth(options as Partial<ToneNS.NoiseSynthOptions>);
      case 'am':       return new t.AMSynth(options as Partial<ToneNS.AMSynthOptions>);
      case 'fm':       return new t.FMSynth(options as Partial<ToneNS.FMSynthOptions>);
      case 'mono':     return new t.MonoSynth(options as Partial<ToneNS.MonoSynthOptions>);
      case 'duo':      return new t.DuoSynth(options as Partial<ToneNS.DuoSynthOptions>);
      default:         return new t.MonoSynth(options as Partial<ToneNS.MonoSynthOptions>);
    }
  }

  function createEffect(t: typeof ToneNS, type: string, options?: Record<string, unknown>): ToneNS.ToneAudioNode | null {
    switch (type) {
      case 'distortion': return new t.Distortion(options as Partial<ToneNS.DistortionOptions>);
      case 'reverb':     return new t.Reverb(options as Partial<ToneNS.ReverbOptions>);
      case 'delay':      return new t.FeedbackDelay(options as Partial<ToneNS.FeedbackDelayOptions>);
      case 'chorus':     return new t.Chorus(options as Partial<ToneNS.ChorusOptions>);
      case 'filter':     return new t.Filter(options as Partial<ToneNS.FilterOptions>);
      case 'phaser':     return new t.Phaser(options as Partial<ToneNS.PhaserOptions>);
      case 'autoFilter': return new t.AutoFilter(options as Partial<ToneNS.AutoFilterOptions>);
      case 'compressor': return new t.Compressor(options as Partial<ToneNS.CompressorOptions>);
      case 'eq3':        return new t.EQ3(options as ConstructorParameters<typeof t.EQ3>[0]);
      default:
        console.warn(`Unknown effect type: ${type}`);
        return null;
    }
  }

  // ── 初始化 ──

  function init(bgmConfig: BGMConfig) {
    // 如果已有旧音频图，先清理
    if (built) disposeGraph();

    // 仅保存配置，不创建任何 Tone.js 节点
    pendingConfig = bgmConfig;
    currentBPM.value = bgmConfig.baseBPM;
  }

  /** 构建完整音频图（必须在 Tone.start() 之后调用） */
  function buildAllTracks(t: typeof ToneNS, config: BGMConfig) {
    t.getTransport().bpm.value = config.baseBPM;

    masterChannel = new t.Channel(config.masterVolume).toDestination();

    for (const trackCfg of config.tracks) {
      activeTracks.push(buildTrack(t, trackCfg));
    }

    built = true;
  }

  function buildTrack(t: typeof ToneNS, trackCfg: BGMTrackConfig): ActiveTrack {
    const synth = createSynth(t, trackCfg.synth, trackCfg.options);
    const channel = new t.Channel(trackCfg.volume);

    // 效果器链
    const effects: ToneNS.ToneAudioNode[] = [];
    if (trackCfg.effects) {
      for (const eff of trackCfg.effects) {
        const node = createEffect(t, eff.type, eff.options);
        if (node) effects.push(node);
      }
    }

    // 连接: synth → effects → channel → master
    if (effects.length > 0) {
      synth.connect(effects[0]);
      for (let i = 0; i < effects.length - 1; i++) {
        effects[i].connect(effects[i + 1]);
      }
      effects[effects.length - 1].connect(channel);
    } else {
      synth.connect(channel);
    }
    channel.connect(masterChannel!);

    // 初始静音
    channel.mute = true;

    // 创建序列
    const sequence = new t.Sequence(
      (time, note) => {
        if (note === null) return;
        if (synth instanceof t.NoiseSynth) {
          synth.triggerAttackRelease(
            t.Time(trackCfg.subdivision).toSeconds() * 0.8,
            time
          );
        } else {
          (synth as ToneNS.MonoSynth).triggerAttackRelease(
            note,
            t.Time(trackCfg.subdivision).toSeconds() * 0.8,
            time
          );
        }
      },
      trackCfg.pattern,
      trackCfg.subdivision
    );

    return { id: trackCfg.id, config: trackCfg, synth, channel, sequence, effects };
  }

  // ── 控制 ──

  async function start() {
    if (!pendingConfig && !built) return;

    // 动态加载 Tone.js —— 只在用户交互后的 start() 里执行
    // 模块加载后 Tone 会初始化 AudioContext，此时用户手势有效
    if (!T) {
      T = await import('tone');
    }

    // 启动 AudioContext（保证 resumed）
    await T.start();

    // 首次 / 换配置后构建音频图
    if (!built && pendingConfig) {
      buildAllTracks(T, pendingConfig);
    }

    // 启动所有序列
    for (const track of activeTracks) {
      track.sequence.start(0);
    }

    // 根据当前阶段设置轨道可见性
    applyStage(currentStage);

    T.getTransport().start();
    isPlaying.value = true;
  }

  function stop() {
    if (!built || !T) {
      isPlaying.value = false;
      return;
    }

    T.getTransport().stop();
    T.getTransport().position = 0;

    for (const track of activeTracks) {
      track.sequence.stop();
    }

    isPlaying.value = false;
  }

  function setStage(stage: Stage) {
    currentStage = stage;
    if (isPlaying.value) {
      applyStage(stage);
    }
  }

  function applyStage(stage: Stage) {
    for (const track of activeTracks) {
      const enabled = track.config.stages.includes(stage);
      track.channel.mute = !enabled;

      if (enabled && track.config.stageVolumes && stage in track.config.stageVolumes) {
        track.channel.volume.rampTo(track.config.stageVolumes[stage], 0.5);
      } else if (enabled) {
        track.channel.volume.rampTo(track.config.volume, 0.5);
      }
    }
  }

  function setBPM(bpm: number) {
    if (!pendingConfig || !T) return;
    const [min, max] = pendingConfig.bpmRange;
    const clamped = Math.max(min, Math.min(max, bpm));
    currentBPM.value = clamped;
    T.getTransport().bpm.rampTo(clamped, 0.3);
  }

  // ── 清理 ──

  /** 销毁音频图但保留配置 & Tone 引用 */
  function disposeGraph() {
    if (!built) return;

    if (T) {
      T.getTransport().stop();
      T.getTransport().position = 0;
    }

    for (const track of activeTracks) {
      track.sequence.dispose();
      track.synth.dispose();
      track.channel.dispose();
      for (const eff of track.effects) eff.dispose();
    }
    activeTracks = [];

    if (masterChannel) {
      masterChannel.dispose();
      masterChannel = null;
    }

    built = false;
    isPlaying.value = false;
  }

  /** 完全销毁（清理音频图 + 清空配置） */
  function dispose() {
    disposeGraph();
    pendingConfig = null;
  }

  return {
    isPlaying,
    currentBPM,
    init,
    start,
    stop,
    setStage,
    setBPM,
    dispose
  };
}
