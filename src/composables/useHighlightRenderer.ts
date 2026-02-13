/**
 * 高光卡片渲染器
 *
 * 根据 HighlightMoment 的记录数据 + stage 视觉配置 + 随机精灵帧，
 * 在 Canvas 上合成一张高光卡片图片。
 *
 * 与主精灵系统共享 StageVisualConfig 的背景色/渐变/粒子颜色，
 * 避免视觉参数分散导致霰弹修改。
 */

import type { Stage } from '@/types/game';
import type { HighlightMoment } from './useHighlights';
import { getStageVisualConfig } from '@/config/stages';

// ==================== 共享绘图工具 ====================

/** 绘制圆角矩形路径（与 useShareCapture 保持一致） */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/** 简单确定性随机 (基于 seed) */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

// ==================== 卡片尺寸常量 ====================

/** 与分享卡同尺寸 */
export const CARD_WIDTH = 720;
export const CARD_HEIGHT = 960;

// ==================== 渲染函数 ====================

export interface RenderHighlightCardOptions {
  /** 高光时刻数据 */
  moment: HighlightMoment;
  /** 精灵帧图片列表（从已加载的资源包获取） */
  spriteFrames: HTMLImageElement[];
  /** 阶段名称列表 (5 个) */
  stageNames: string[];
}

/**
 * 生成高光卡片图片 Blob
 */
export async function renderHighlightCard(opts: RenderHighlightCardOptions): Promise<Blob | null> {
  const { moment, spriteFrames, stageNames } = opts;
  const W = CARD_WIDTH;
  const H = CARD_HEIGHT;

  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;

  const stageConfig = getStageVisualConfig(moment.stage);
  const rand = seededRandom(moment.id * 7 + moment.timestamp);

  // ── 背景 ──
  const shouldShowParticles = moment.reason !== 'final' || moment.combo > 0;
  drawStageBackground(ctx, W, H, stageConfig.background, rand, shouldShowParticles, moment.combo);

  // ── 精灵（居中主猫 + 淡化背景猫） ──
  if (spriteFrames.length > 0) {
    drawCenteredSprite(ctx, W, H, spriteFrames, rand, moment.stage, stageConfig.cat.scale);
  }

  // ── 暗角蒙版 (让文字更清晰) ──
  const vGrad = ctx.createRadialGradient(W / 2, H / 2, W * 0.2, W / 2, H / 2, W * 0.8);
  vGrad.addColorStop(0, 'rgba(0,0,0,0)');
  vGrad.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vGrad;
  ctx.fillRect(0, 0, W, H);

  // ── 高光标签 ──
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px "SF Pro Display", system-ui, sans-serif';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur = 12;
  ctx.fillText(moment.label, W / 2, H * 0.18);
  ctx.shadowBlur = 0;

  // ── 数据卡片 ──
  const cardW = W * 0.8;
  const cardH = 180;
  const cardX = (W - cardW) / 2;
  const cardY = H * 0.72;

  ctx.fillStyle = 'rgba(13,17,23,0.85)';
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.1)';
  ctx.lineWidth = 1;
  roundRect(ctx, cardX, cardY, cardW, cardH, 16);
  ctx.stroke();

  // 分数
  ctx.textAlign = 'center';
  ctx.fillStyle = '#58a6ff';
  ctx.font = 'bold 52px "SF Pro Display", system-ui, sans-serif';
  ctx.fillText(String(moment.score), W / 2, cardY + 60);
  ctx.fillStyle = '#8b949e';
  ctx.font = '14px "SF Pro Display", system-ui, sans-serif';
  ctx.fillText('分', W / 2, cardY + 80);

  // 连击 + 阶段
  const infoY = cardY + 130;
  ctx.fillStyle = '#e6edf3';
  ctx.font = 'bold 24px "SF Pro Display", system-ui, sans-serif';
  ctx.fillText(`×${moment.combo}`, W / 2 - 80, infoY);
  const stageName = stageNames[moment.stage - 1] ?? `Stage ${moment.stage}`;
  ctx.fillText(stageName, W / 2 + 80, infoY);

  ctx.fillStyle = '#6e7681';
  ctx.font = '12px "SF Pro Display", system-ui, sans-serif';
  ctx.fillText('连击', W / 2 - 80, infoY + 20);
  ctx.fillText('阶段', W / 2 + 80, infoY + 20);

  // ── 时间戳 ──
  ctx.fillStyle = '#484f58';
  ctx.font = '11px "SF Pro Display", system-ui, sans-serif';
  const dateStr = new Date(moment.timestamp).toLocaleTimeString('zh-CN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  ctx.fillText(dateStr, W / 2, H - 24);

  return new Promise<Blob | null>((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
  });
}

// ==================== 内部绘图 ====================

/** 根据 stage 配置绘制背景 */
function drawStageBackground(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  bg: ReturnType<typeof getStageVisualConfig>['background'],
  rand: () => number,
  showParticles: boolean,
  combo: number,
) {
  // 纯色底
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, w, h);

  // 渐变覆盖（如果有）
  if (bg.gradient && !bg.gradient.includes('conic')) {
    const colors = extractGradientColors(bg.gradient);
    if (colors.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  } else if (bg.gradient?.includes('conic')) {
    const colors = ['#ff6b6b', '#feca57', '#48dbfb', '#ff9ff3', '#54a0ff'];
    for (let i = 0; i < 5; i++) {
      const glow = ctx.createRadialGradient(
        w * (0.3 + rand() * 0.4), h * (0.3 + rand() * 0.4), 0,
        w / 2, h / 2, w * 0.7
      );
      glow.addColorStop(0, colors[i] + '44');
      glow.addColorStop(1, 'transparent');
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // 粒子效果：模拟多次爆发叠加
  // 仅在非静音结束 && 阶段粒子已开启时显示
  if (showParticles && bg.particles.enabled && bg.particles.colors.length > 0) {
    // 爆发波数：高连击时看到更多叠加层
    const waveCount = Math.min(5, 1 + Math.floor(combo / 8));
    const cx = w / 2;
    const cy = h * 0.45; // 以猫的中心为粒子源

    for (let wave = 0; wave < waveCount; wave++) {
      // 每波的粒子数量和扩散半径不同（越早的波扩散越远、越淡）
      const age = (wave + 1) / (waveCount + 1); // 0→1，越大=越旧
      const spread = 0.15 + age * 0.6; // 扩散范围占画布比例
      const alpha = 0.9 - age * 0.5;   // 越旧越透明
      const count = Math.min(bg.particles.count, 40);

      for (let i = 0; i < count; i++) {
        const angle = rand() * Math.PI * 2;
        const dist = rand() * spread * w * 0.5;
        const x = cx + Math.cos(angle) * dist;
        const y = cy + Math.sin(angle) * dist;
        const size = bg.particles.size[0] + rand() * (bg.particles.size[1] - bg.particles.size[0]);
        const color = bg.particles.colors[Math.floor(rand() * bg.particles.colors.length)];

        ctx.globalAlpha = alpha * (0.5 + rand() * 0.5);
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * 绘制居中主猫 + 光影效果，模拟真实游戏中的猫位置。
 * 主猫居中于卡片上半部分（与游戏中 sprite-area 对应），
 * 随机旋转角度表现动态感。
 */
function drawCenteredSprite(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  frames: HTMLImageElement[],
  rand: () => number,
  stage: Stage,
  catScale: number,
) {
  // 主猫大小：宽度的 50%，与实际游戏中 max-width: 360/720 ≈ 50% 一致
  const baseSize = w * 0.50;
  const spriteSize = baseSize * catScale;
  // 猫中心：水平居中，垂直偏上（游戏中 sprite-area 在顶部 flex:1 区域）
  const cx = w / 2;
  const cy = h * 0.45;
  // 随机旋转（模拟动画中的某一帧角度）
  const rotation = (rand() - 0.5) * Math.PI * 0.4; // ±36°
  const frame = frames[Math.floor(rand() * frames.length)];

  // ── 投影（模拟 sprite-img 的 drop-shadow） ──
  ctx.save();
  ctx.globalAlpha = 0.25;
  ctx.translate(cx, cy + spriteSize * 0.08); // 影子略微下移
  ctx.rotate(rotation);
  ctx.filter = 'blur(16px)';
  ctx.drawImage(frame, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
  ctx.filter = 'none';
  ctx.restore();

  // ── 主猫 ──
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rotation);
  ctx.drawImage(frame, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
  ctx.restore();

  // ── 高阶段：残影 / 拖尾猫（模拟 trail effect）──
  if (stage >= 3) {
    const trailCount = Math.min(stage - 1, 4);
    for (let i = 0; i < trailCount; i++) {
      const trailFrame = frames[Math.floor(rand() * frames.length)];
      const offset = (i + 1) * 12; // 像拖尾一样偏移
      const trailAlpha = 0.12 - i * 0.02;
      const trailAngle = rotation - (i + 1) * 0.15;
      ctx.save();
      ctx.globalAlpha = Math.max(0.03, trailAlpha);
      ctx.translate(cx - offset * Math.sin(rotation), cy + offset * Math.cos(rotation));
      ctx.rotate(trailAngle);
      ctx.drawImage(trailFrame, -spriteSize / 2, -spriteSize / 2, spriteSize, spriteSize);
      ctx.restore();
    }
  }
}

/** 从 CSS linear-gradient 字符串提取颜色值 */
function extractGradientColors(gradient: string): string[] {
  const matches = gradient.match(/#[0-9a-fA-F]{3,8}/g);
  return matches ?? [];
}
