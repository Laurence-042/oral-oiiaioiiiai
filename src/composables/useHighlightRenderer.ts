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
  drawStageBackground(ctx, W, H, stageConfig.background, rand);

  // ── 精灵 (随机 2-4 个扩散) ──
  if (spriteFrames.length > 0) {
    drawScatteredSprites(ctx, W, H, spriteFrames, rand, moment.stage);
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
  rand: () => number
) {
  // 纯色底
  ctx.fillStyle = bg.color;
  ctx.fillRect(0, 0, w, h);

  // 渐变覆盖（如果有）
  if (bg.gradient && !bg.gradient.includes('conic')) {
    // 解析 linear-gradient：只用起止两色做简化渲染
    const colors = extractGradientColors(bg.gradient);
    if (colors.length >= 2) {
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      colors.forEach((c, i) => grad.addColorStop(i / (colors.length - 1), c));
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, w, h);
    }
  } else if (bg.gradient?.includes('conic')) {
    // 神猫彩虹：用径向多色近似
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

  // 粒子装饰点（静态散布）
  if (bg.particles.enabled && bg.particles.colors.length > 0) {
    const count = Math.min(bg.particles.count, 60); // 控制密度
    for (let i = 0; i < count; i++) {
      const x = rand() * w;
      const y = rand() * h;
      const size = bg.particles.size[0] + rand() * (bg.particles.size[1] - bg.particles.size[0]);
      const color = bg.particles.colors[Math.floor(rand() * bg.particles.colors.length)];
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = color + '88'; // 半透明
      ctx.fill();
    }
  }
}

/** 绘制随机扩散的精灵 */
function drawScatteredSprites(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  frames: HTMLImageElement[],
  rand: () => number,
  stage: Stage
) {
  const count = 2 + Math.min(stage, 3); // 2-5 个精灵
  const spriteSize = w * 0.35; // 精灵大小约为卡片宽度的 35%

  for (let i = 0; i < count; i++) {
    const frame = frames[Math.floor(rand() * frames.length)];
    const x = w * 0.1 + rand() * (w * 0.6);
    const y = h * 0.25 + rand() * (h * 0.35);
    const rotation = (rand() - 0.5) * Math.PI * 0.8; // ±72°
    const scale = 0.7 + rand() * 0.6; // 0.7x ~ 1.3x
    const alpha = 0.5 + rand() * 0.4; // 0.5 ~ 0.9 透明度

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x + spriteSize * scale / 2, y + spriteSize * scale / 2);
    ctx.rotate(rotation);
    ctx.drawImage(
      frame,
      -spriteSize * scale / 2,
      -spriteSize * scale / 2,
      spriteSize * scale,
      spriteSize * scale
    );
    ctx.restore();
  }
}

/** 从 CSS linear-gradient 字符串提取颜色值 */
function extractGradientColors(gradient: string): string[] {
  const matches = gradient.match(/#[0-9a-fA-F]{3,8}/g);
  return matches ?? [];
}
