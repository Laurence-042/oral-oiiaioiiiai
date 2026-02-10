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
  /** start() 正在执行中，防止重入竞态 */
  let starting = false;

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
  // 不使用 Tone.js 的 rampTo / cancelScheduledValues —— 它们会向内部 Timeline
  // 追加自动化事件（memory: Infinity），高频调用导致 O(n²) 退化甚至死循环。
  // 改用自己的 fixedUpdate 循环 + lerp 平滑插值，只做 .value 直接赋值，零事件堆积。

  const UPDATE_INTERVAL = 50;   // 20 Hz，BPM / 音量平滑足够
  const LERP_FACTOR = 0.15;     // 每 tick 靠近目标 15%，~1s 达 95%
  const BPM_SNAP = 0.5;         // BPM 差值 < 0.5 时直接跳到目标
  const VOL_SNAP = 0.3;         // dB 差值 < 0.3 时直接跳到目标

  let targetBPM = 120;
  let updateTimer: ReturnType<typeof setInterval> | null = null;
  /** 每轨的目标音量；到达后自动移除条目 */
  const targetVolumes = new Map<string, number>();

  function startUpdateLoop() {
    if (updateTimer) return;
    updateTimer = setInterval(fixedUpdate, UPDATE_INTERVAL);
  }

  function stopUpdateLoop() {
    if (updateTimer) {
      clearInterval(updateTimer);
      updateTimer = null;
    }
  }

  function fixedUpdate() {
    if (!T || !isPlaying.value) return;

    // ─ BPM lerp ─
    const cur = T.getTransport().bpm.value;
    const diff = targetBPM - cur;
    if (Math.abs(diff) > BPM_SNAP) {
      T.getTransport().bpm.value = cur + diff * LERP_FACTOR;
    } else if (diff !== 0) {
      T.getTransport().bpm.value = targetBPM;
    }

    // ─ Volume lerp ─
    for (const track of activeTracks) {
      const target = targetVolumes.get(track.id);
      if (target === undefined) continue;
      const curVol = track.channel.volume.value;
      const volDiff = target - curVol;
      if (Math.abs(volDiff) > VOL_SNAP) {
        track.channel.volume.value = curVol + volDiff * LERP_FACTOR;
      } else {
        track.channel.volume.value = target;
        targetVolumes.delete(track.id);
      }
    }
  }

  async function start() {
    if (starting || isPlaying.value) return;
    if (!pendingConfig && !built) return;

    starting = true;
    try {
      if (!T) {
        T = await import('tone');
      }
      if (!starting) return;

      await T.start();
      if (!starting) return;

      if (!built && pendingConfig) {
        buildAllTracks(T, pendingConfig);
      }

      T.getTransport().cancel();

      for (const track of activeTracks) {
        track.sequence.start(0);
      }

      applyStage(currentStage);
      startUpdateLoop();

      T.getTransport().start();
      isPlaying.value = true;
    } finally {
      starting = false;
    }
  }

  function stop() {
    starting = false;
    stopUpdateLoop();
    targetVolumes.clear();

    if (!built || !T) {
      isPlaying.value = false;
      return;
    }

    for (const track of activeTracks) {
      try { track.sequence.stop(); } catch { /* already stopped */ }
    }

    try {
      T.getTransport().stop();
      T.getTransport().cancel();
      T.getTransport().position = 0;
    } catch (err) {
      console.warn('[BGM] Transport stop error:', err);
    }

    isPlaying.value = false;
  }

  function setStage(stage: Stage) {
    currentStage = stage;
    if (isPlaying.value && built) {
      applyStage(stage);
    }
  }

  function applyStage(stage: Stage) {
    for (const track of activeTracks) {
      const enabled = track.config.stages.includes(stage);
      track.channel.mute = !enabled;

      if (enabled) {
        const vol = (track.config.stageVolumes && stage in track.config.stageVolumes)
          ? track.config.stageVolumes[stage]
          : track.config.volume;
        targetVolumes.set(track.id, vol);
      }
    }
  }

  function setBPM(bpm: number) {
    if (!pendingConfig) return;
    const [min, max] = pendingConfig.bpmRange;
    targetBPM = Math.max(min, Math.min(max, bpm));
    currentBPM.value = targetBPM;
  }

  // ── 清理 ──

  /** 销毁音频图但保留配置 & Tone 引用 */
  function disposeGraph() {
    if (!built) return;

    stopUpdateLoop();
    targetVolumes.clear();

    for (const track of activeTracks) {
      try { track.sequence.stop(); } catch { /* ignore */ }
    }

    if (T) {
      try {
        T.getTransport().stop();
        T.getTransport().cancel();
        T.getTransport().position = 0;
      } catch { /* ignore */ }
    }

    for (const track of activeTracks) {
      try { track.sequence.dispose(); } catch { /* ignore */ }
      try { track.synth.dispose(); } catch { /* ignore */ }
      try { track.channel.dispose(); } catch { /* ignore */ }
      for (const eff of track.effects) { try { eff.dispose(); } catch { /* ignore */ } }
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
