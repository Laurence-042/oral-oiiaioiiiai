import { ref } from 'vue';
import QRCode from 'qrcode';
import type { GameSnapshot, ResolvedPackTextConfig, CopywritingVariant } from '@/types/game';

/**
 * 每个阶段的多变种文案池（默认 fallback）
 */
const STAGE_COPYWRITING: Record<number, CopywritingVariant[]> = {
  1: [
    { title: '猫咪听到了你的召唤', subtitle: '这只是个开始，继续练习吧！' },
    { title: '初次见面，请多关照', subtitle: '猫咪已经注意到你了 🐱' },
    { title: '入门猫叫', subtitle: '每一位猫叫大师都是从这里起步的' },
    { title: '嗯？有人在叫我？', subtitle: '猫咪竖起了耳朵…' },
    { title: '猫咪微微侧目', subtitle: '你的声音引起了它的注意！' },
    { title: '喵…？', subtitle: '猫咪觉得你还需要一点练习' },
  ],
  2: [
    { title: '猫咪开始躁动了！', subtitle: '你的 OIIIA 有点东西！' },
    { title: '有内味儿了', subtitle: '猫咪已经坐不住了！' },
    { title: '猫咪在摇头晃脑', subtitle: '你的声音让它燥起来了' },
    { title: '初具猫相', subtitle: '继续下去，你能更强！' },
    { title: '猫咪蹬腿中', subtitle: '你的节奏已经上线了！' },
    { title: '不错不错', subtitle: '猫咪开始认可你的实力了' },
  ],
  3: [
    { title: '猫咪疯狂了！', subtitle: '你的 OIIIA 太上头了！' },
    { title: '狂热猫叫人', subtitle: '邻居可能要来敲门了 🚪' },
    { title: '已入魔', subtitle: '猫咪和你一起陷入了疯狂！' },
    { title: '猫界摇滚巨星', subtitle: '全场最佳嗓音就是你！' },
    { title: '刹不住了', subtitle: '你和猫咪都已经停不下来了！' },
    { title: '邻居表示震惊', subtitle: '你的声音穿透了三堵墙' },
  ],
  4: [
    { title: '超度级别！', subtitle: '猫咪已经突破了次元壁！' },
    { title: '猫叫之力，觉醒！', subtitle: '你已经不是普通人类了' },
    { title: '神经猫叫', subtitle: '连猫咪都对你肃然起敬！' },
    { title: '猫界大佬', subtitle: '你的实力已经被猫界认可！' },
    { title: '超凡入圣', subtitle: '猫咪拜你为师了' },
    { title: '非人哉', subtitle: '这种程度的猫叫，已经超越物种了' },
  ],
  5: [
    { title: '神猫降临！！', subtitle: '你已成为传说中的猫叫之王！' },
    { title: '猫叫之神', subtitle: '全宇宙的猫都听到了你的声音！' },
    { title: '万猫朝宗', subtitle: '所有猫咪向你俯首称臣！' },
    { title: '超 神 了', subtitle: '这已经不是人类能做到的事了' },
    { title: '不可名状的猫叫', subtitle: '你的声音让猫咪进入了超度状态' },
    { title: '猫界永恒之神', subtitle: '你的传说将在猫界流传千年' },
  ]
};

/**
 * 高连击/高循环的特殊文案（内置默认，已由 resolveTextConfig 提供）
 */

/**
 * 根据快照确定性地选一条文案（同一 snapshot 总是选到同一条，但不同 snapshot 选到不同的）
 */
function pickVariant(variants: CopywritingVariant[], snap: GameSnapshot): CopywritingVariant {
  // 用 score + combo + cycles 做简单 hash，保证同一局总选到同一条
  const hash = (snap.score * 7 + snap.maxCombo * 13 + snap.perfectCycles * 31 + snap.duration) >>> 0;
  return variants[hash % variants.length];
}

/**
 * 根据阶段生成文案（含多变种随机）
 * 优先使用资源包提供的文案，fallback 到内置默认文案
 */
export function generateCopywriting(snap: GameSnapshot, textConfig: ResolvedPackTextConfig): { title: string; subtitle: string } {
  // 特殊文案
  if (snap.perfectCycles >= 5 || snap.maxCombo >= 100) {
    const specials = textConfig.specialCopywriting;
    return pickVariant(specials, snap);
  }
  // 阶段文案：优先资源包 stages[].copywriting
  const packStage = textConfig.stages[snap.stage - 1]?.copywriting;
  const variants = packStage ?? STAGE_COPYWRITING[snap.stage] ?? STAGE_COPYWRITING[1];
  return pickVariant(variants, snap);
}

/**
 * 格式化持续时间
 */
function formatDuration(ms: number): string {
  const secs = Math.floor(ms / 1000);
  const mins = Math.floor(secs / 60);
  const remainSecs = secs % 60;
  return mins > 0 ? `${mins}分${remainSecs}秒` : `${remainSecs}秒`;
}

/**
 * 绘制圆角矩形路径
 */
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
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

/**
 * 使用 qrcode 库生成真实可扫描的 QR 码，绘制到 Canvas 上
 */
function drawQRCode(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  size: number,
  url: string
) {
  // 生成 QR 数据矩阵
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const cellCount = modules.size;
  const padding = 2; // quiet zone (单位: cell)
  const totalCells = cellCount + padding * 2;
  const cellSize = size / totalCells;

  // 白色背景 + 圆角
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, size, size, 8);
  ctx.fill();

  // 绘制 QR 模块
  ctx.fillStyle = '#000000';
  for (let row = 0; row < cellCount; row++) {
    for (let col = 0; col < cellCount; col++) {
      if (modules.get(row, col)) {
        ctx.fillRect(
          x + (col + padding) * cellSize,
          y + (row + padding) * cellSize,
          cellSize,
          cellSize
        );
      }
    }
  }
}

export interface ShareCaptureReturn {
  generating: ReturnType<typeof ref<boolean>>;
  generateShareImage: (snap: GameSnapshot, textConfig: ResolvedPackTextConfig) => Promise<Blob | null>;
}

/**
 * 分享截图生成 Composable
 *
 * 使用 Canvas 2D API 生成精美的分享卡片图片，包含：
 * - 分数、连击、阶段、循环次数
 * - 装饰性 QR 码 + 站点链接
 * - 趣味文案
 */
export function useShareCapture(): ShareCaptureReturn {
  const generating = ref(false);

  /**
   * 生成分享图片 Blob
   */
  async function generateShareImage(snap: GameSnapshot, textConfig: ResolvedPackTextConfig): Promise<Blob | null> {
    const siteUrl = new URL(import.meta.env.BASE_URL, window.location.origin).href.replace(/\/+$/, '');
    generating.value = true;
    try {
      const W = 720;
      const H = 960;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d')!;

      // === 背景 ===
      const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
      bgGrad.addColorStop(0, '#0d1117');
      bgGrad.addColorStop(0.5, '#161b22');
      bgGrad.addColorStop(1, '#0d1117');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 装饰光晕
      const glowGrad = ctx.createRadialGradient(W / 2, H * 0.35, 0, W / 2, H * 0.35, W * 0.6);
      glowGrad.addColorStop(0, 'rgba(88,166,255,0.12)');
      glowGrad.addColorStop(0.5, 'rgba(163,113,247,0.06)');
      glowGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = glowGrad;
      ctx.fillRect(0, 0, W, H);

      // === 标题 ===
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText('OIIAIOIIIAI', W / 2, 80);

      // 副标题
      ctx.fillStyle = '#8b949e';
      ctx.font = '18px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText('🐱 对着猫叫，成为传说', W / 2, 115);

      // === 文案区域 ===
      const copy = generateCopywriting(snap, textConfig);
      ctx.fillStyle = '#e6edf3';
      ctx.font = 'bold 36px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText(copy.title, W / 2, 200);
      ctx.fillStyle = '#8b949e';
      ctx.font = '20px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText(copy.subtitle, W / 2, 240);

      // === 核心数据卡片 ===
      const cardX = 40;
      const cardY = 280;
      const cardW = W - 80;
      const cardH = 340;
      const cardGrad = ctx.createLinearGradient(cardX, cardY, cardX + cardW, cardY + cardH);
      cardGrad.addColorStop(0, 'rgba(22,27,34,0.95)');
      cardGrad.addColorStop(1, 'rgba(13,17,23,0.95)');
      ctx.fillStyle = cardGrad;
      roundRect(ctx, cardX, cardY, cardW, cardH, 20);
      ctx.fill();

      // 卡片边框
      ctx.strokeStyle = 'rgba(255,255,255,0.08)';
      ctx.lineWidth = 1;
      roundRect(ctx, cardX, cardY, cardW, cardH, 20);
      ctx.stroke();

      // 主分数
      const scoreY = cardY + 80;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#58a6ff';
      ctx.font = 'bold 72px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText(String(snap.score), W / 2, scoreY);

      ctx.fillStyle = '#8b949e';
      ctx.font = '14px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText('最终得分', W / 2, scoreY + 24);

      // 子数据行
      const statY = scoreY + 80;
      const statItems = [
        { label: '最高连击', value: `${snap.maxCombo}x` },
        { label: '到达阶段', value: snap.stageName },
        { label: '完美循环', value: String(snap.perfectCycles) },
        { label: '持续时间', value: formatDuration(snap.duration) }
      ];
      const statGap = cardW / statItems.length;
      statItems.forEach((item, i) => {
        const sx = cardX + statGap * i + statGap / 2;
        ctx.fillStyle = '#e6edf3';
        ctx.font = 'bold 28px "SF Pro Display", system-ui, sans-serif';
        ctx.fillText(item.value, sx, statY);
        ctx.fillStyle = '#6e7681';
        ctx.font = '12px "SF Pro Display", system-ui, sans-serif';
        ctx.fillText(item.label, sx, statY + 22);
      });

      // 阶段指示器
      const stageBarY = statY + 60;
      const stageNames = textConfig.stages.map(s => s.name);
      const stageBarW = cardW - 60;
      const stageBarX = cardX + 30;
      const dotGap = stageBarW / (stageNames.length - 1);

      // 进度条背景
      ctx.strokeStyle = 'rgba(255,255,255,0.1)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(stageBarX, stageBarY);
      ctx.lineTo(stageBarX + stageBarW, stageBarY);
      ctx.stroke();

      // 已达成的进度
      const progressW = dotGap * (snap.stage - 1);
      if (progressW > 0) {
        const progGrad = ctx.createLinearGradient(stageBarX, 0, stageBarX + progressW, 0);
        progGrad.addColorStop(0, '#58a6ff');
        progGrad.addColorStop(1, '#a371f7');
        ctx.strokeStyle = progGrad;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(stageBarX, stageBarY);
        ctx.lineTo(stageBarX + progressW, stageBarY);
        ctx.stroke();
      }

      stageNames.forEach((name, i) => {
        const dx = stageBarX + dotGap * i;
        const reached = i < snap.stage;
        const isCurrent = i === snap.stage - 1;

        // 节点圆
        ctx.beginPath();
        ctx.arc(dx, stageBarY, isCurrent ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = reached ? (isCurrent ? '#a371f7' : '#58a6ff') : 'rgba(255,255,255,0.15)';
        ctx.fill();

        if (isCurrent) {
          ctx.strokeStyle = 'rgba(163,113,247,0.4)';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(dx, stageBarY, 12, 0, Math.PI * 2);
          ctx.stroke();
        }

        // 标签
        ctx.fillStyle = reached ? '#e6edf3' : '#484f58';
        ctx.font = `${isCurrent ? 'bold ' : ''}11px "SF Pro Display", system-ui, sans-serif`;
        ctx.fillText(name, dx, stageBarY + 24);
      });

      // === 底部区域 ===
      // QR 码
      const qrSize = 100;
      const qrX = W / 2 - qrSize / 2;
      const qrY = H - 220;
      drawQRCode(ctx, qrX, qrY, qrSize, siteUrl);

      // URL 文字
      ctx.fillStyle = '#8b949e';
      ctx.font = '14px "SF Pro Display", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(siteUrl, W / 2, qrY + qrSize + 24);

      // CTA
      ctx.fillStyle = '#6e7681';
      ctx.font = '13px "SF Pro Display", system-ui, sans-serif';
      ctx.fillText('扫码或访问链接，挑战我的分数！', W / 2, qrY + qrSize + 48);

      // 日期
      ctx.fillStyle = '#484f58';
      ctx.font = '11px "SF Pro Display", system-ui, sans-serif';
      const dateStr = new Date(snap.timestamp).toLocaleDateString('zh-CN', {
        year: 'numeric', month: 'long', day: 'numeric'
      });
      ctx.fillText(dateStr, W / 2, H - 20);

      // === 导出 ===
      return new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
      });
    } finally {
      generating.value = false;
    }
  }

  return {
    generating,
    generateShareImage,
  };
}
