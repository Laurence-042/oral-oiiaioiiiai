import { ref, type Ref } from 'vue';
import * as Tone from 'tone';
import type { BGMConfig, BGMTrackConfig, BGMSynthType, Stage } from '@/types/game';

// ==================== 类型 ====================

interface ActiveTrack {
  id: string;
  config: BGMTrackConfig;
  synth: Tone.MembraneSynth | Tone.MetalSynth | Tone.NoiseSynth | Tone.AMSynth | Tone.FMSynth | Tone.MonoSynth | Tone.DuoSynth;
  channel: Tone.Channel;
  sequence: Tone.Sequence;
  effects: Tone.ToneAudioNode[];
}

export interface UseDynamicBGMReturn {
  /** 是否正在播放 */
  isPlaying: Ref<boolean>;
  /** 当前 BPM */
  currentBPM: Ref<number>;
  /** 用 BGM 配置初始化 */
  init: (config: BGMConfig) => void;
  /** 开始播放 */
  start: () => Promise<void>;
  /** 停止并清理 */
  stop: () => void;
  /** 更新阶段（启用/禁用轨道） */
  setStage: (stage: Stage) => void;
  /** 更新 BPM（跟随玩家速度） */
  setBPM: (bpm: number) => void;
  /** 完全销毁 */
  dispose: () => void;
}

// ==================== 合成器工厂 ====================

function createSynth(type: BGMSynthType, options?: Record<string, unknown>): ActiveTrack['synth'] {
  switch (type) {
    case 'membrane': return new Tone.MembraneSynth(options as Partial<Tone.MembraneSynthOptions>);
    case 'metal':    return new Tone.MetalSynth(options as Partial<Tone.MetalSynthOptions>);
    case 'noise':    return new Tone.NoiseSynth(options as Partial<Tone.NoiseSynthOptions>);
    case 'am':       return new Tone.AMSynth(options as Partial<Tone.AMSynthOptions>);
    case 'fm':       return new Tone.FMSynth(options as Partial<Tone.FMSynthOptions>);
    case 'mono':     return new Tone.MonoSynth(options as Partial<Tone.MonoSynthOptions>);
    case 'duo':      return new Tone.DuoSynth(options as Partial<Tone.DuoSynthOptions>);
    default:         return new Tone.MonoSynth(options as Partial<Tone.MonoSynthOptions>);
  }
}

function createEffect(type: string, options?: Record<string, unknown>): Tone.ToneAudioNode | null {
  switch (type) {
    case 'distortion': return new Tone.Distortion(options as Partial<Tone.DistortionOptions>);
    case 'reverb':     return new Tone.Reverb(options as Partial<Tone.ReverbOptions>);
    case 'delay':      return new Tone.FeedbackDelay(options as Partial<Tone.FeedbackDelayOptions>);
    case 'chorus':     return new Tone.Chorus(options as Partial<Tone.ChorusOptions>);
    case 'filter':     return new Tone.Filter(options as Partial<Tone.FilterOptions>);
    case 'phaser':     return new Tone.Phaser(options as Partial<Tone.PhaserOptions>);
    case 'autoFilter': return new Tone.AutoFilter(options as Partial<Tone.AutoFilterOptions>);
    case 'compressor': return new Tone.Compressor(options as Partial<Tone.CompressorOptions>);
    case 'eq3':        return new Tone.EQ3(options as ConstructorParameters<typeof Tone.EQ3>[0]);
    default:
      console.warn(`Unknown effect type: ${type}`);
      return null;
  }
}

// ==================== Composable ====================

export function useDynamicBGM(): UseDynamicBGMReturn {
  const isPlaying = ref(false);
  const currentBPM = ref(120);

  let config: BGMConfig | null = null;
  let activeTracks: ActiveTrack[] = [];
  let masterChannel: Tone.Channel | null = null;
  let currentStage: Stage = 1;
  let initialized = false;

  // ── 初始化 ──

  function init(bgmConfig: BGMConfig) {
    // 如果已有旧配置，先清理
    if (initialized) dispose();

    config = bgmConfig;
    currentBPM.value = bgmConfig.baseBPM;
    Tone.getTransport().bpm.value = bgmConfig.baseBPM;

    // 主音量通道
    masterChannel = new Tone.Channel(bgmConfig.masterVolume).toDestination();

    // 构建所有轨道（初始静音，根据阶段启用）
    for (const trackCfg of bgmConfig.tracks) {
      const track = buildTrack(trackCfg);
      activeTracks.push(track);
    }

    initialized = true;
  }

  function buildTrack(trackCfg: BGMTrackConfig): ActiveTrack {
    const synth = createSynth(trackCfg.synth, trackCfg.options);
    const channel = new Tone.Channel(trackCfg.volume);

    // 效果器链
    const effects: Tone.ToneAudioNode[] = [];
    if (trackCfg.effects) {
      for (const eff of trackCfg.effects) {
        const node = createEffect(eff.type, eff.options);
        if (node) effects.push(node);
      }
    }

    // 连接链: synth → effects → channel → master
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
    const sequence = new Tone.Sequence(
      (time, note) => {
        if (note === null) return;
        if (synth instanceof Tone.NoiseSynth) {
          synth.triggerAttackRelease(
            Tone.Time(trackCfg.subdivision).toSeconds() * 0.8,
            time
          );
        } else {
          (synth as Tone.MonoSynth).triggerAttackRelease(
            note,
            Tone.Time(trackCfg.subdivision).toSeconds() * 0.8,
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
    if (!initialized || !config) return;

    // Tone.js 需要用户交互后启动
    await Tone.start();

    // 启动所有序列
    for (const track of activeTracks) {
      track.sequence.start(0);
    }

    // 根据当前阶段设置轨道可见性
    applyStage(currentStage);

    Tone.getTransport().start();
    isPlaying.value = true;
  }

  function stop() {
    if (!initialized) return;

    Tone.getTransport().stop();
    Tone.getTransport().position = 0;

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

      // 阶段自定义音量
      if (enabled && track.config.stageVolumes && stage in track.config.stageVolumes) {
        track.channel.volume.rampTo(track.config.stageVolumes[stage], 0.5);
      } else if (enabled) {
        track.channel.volume.rampTo(track.config.volume, 0.5);
      }
    }
  }

  function setBPM(bpm: number) {
    if (!config) return;
    const [min, max] = config.bpmRange;
    const clamped = Math.max(min, Math.min(max, bpm));
    currentBPM.value = clamped;
    // 平滑过渡 BPM
    Tone.getTransport().bpm.rampTo(clamped, 0.3);
  }

  // ── 清理 ──

  function dispose() {
    stop();

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

    config = null;
    initialized = false;
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
