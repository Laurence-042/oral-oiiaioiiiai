/**
 * OIIAIOIIIAI Leaderboard Worker
 *
 * KV 结构:
 *   scores:<packId>:<id>     → ScoreEntry JSON    (单条记录)
 *   top:<packId>             → ScoreEntry[] JSON  (前 100 名缓存)
 *   stats:<packId>           → GlobalStats JSON   (分包统计)
 *
 * API:
 *   POST /api/scores          提交分数 (body 含 packId)
 *   GET  /api/leaderboard     获取排行榜 (?packId=xxx)
 *   GET  /api/stats           获取全局统计 (?packId=xxx)
 */

export interface Env {
  LEADERBOARD: KVNamespace;
}

/* ---------- 数据类型 ---------- */

interface ScoreEntry {
  id: string;
  packId: string;
  name: string;
  score: number;
  maxCombo: number;
  stage: number;
  stageName: string;
  perfectCycles: number;
  duration: number;        // ms
  totalVowels: number;
  correctVowels: number;
  createdAt: number;       // timestamp ms
}

interface GlobalStats {
  totalPlays: number;
  totalOiiia: number;      // 全网累计正确元音数
  highestScore: number;
  updatedAt: number;
}

interface SubmitPayload {
  name: string;
  packId: string;
  score: number;
  maxCombo: number;
  stage: number;
  stageName: string;
  perfectCycles: number;
  duration: number;
  totalVowels: number;
  correctVowels: number;
}

/* ---------- 常量 ---------- */

const TOP_N = 100;
const MAX_NAME_LENGTH = 20;
const MAX_SCORE = 999_999;           // 理论单局极限
const MIN_DURATION = 3_000;          // 至少 3 秒
const MAX_DURATION = 30 * 60_000;    // 最多 30 分钟
const RATE_LIMIT_SECONDS = 60;       // 同 IP 提交冷却（KV expirationTtl 最小 60s）

/* ---------- 工具函数 ---------- */

function corsHeaders(origin: string | null): HeadersInit {
  return {
    'Access-Control-Allow-Origin': origin ?? '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  };
}

function json(data: unknown, status = 200, origin: string | null = null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function errorResponse(message: string, status: number, origin: string | null = null): Response {
  return json({ error: message }, status, origin);
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  const ts = Date.now().toString(36);
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return `${ts}-${result}`;
}

/* ---------- 校验 ---------- */

function validatePayload(body: unknown): { ok: true; data: SubmitPayload } | { ok: false; error: string } {
  if (!body || typeof body !== 'object') return { ok: false, error: '请求体无效' };

  const b = body as Record<string, unknown>;

  // packId: 默认 'oiia'，限制 a-z0-9-_ 1-32 字符
  const rawPackId = typeof b.packId === 'string' ? b.packId.trim() : 'oiia';
  if (!/^[a-z0-9_-]{1,32}$/.test(rawPackId)) {
    return { ok: false, error: '资源包 ID 无效' };
  }

  if (typeof b.name !== 'string' || b.name.trim().length === 0) {
    return { ok: false, error: '昵称不能为空' };
  }
  if (b.name.trim().length > MAX_NAME_LENGTH) {
    return { ok: false, error: `昵称最多 ${MAX_NAME_LENGTH} 个字符` };
  }
  if (typeof b.score !== 'number' || !Number.isFinite(b.score) || b.score < 0 || b.score > MAX_SCORE) {
    return { ok: false, error: '分数无效' };
  }
  if (typeof b.duration !== 'number' || b.duration < MIN_DURATION || b.duration > MAX_DURATION) {
    return { ok: false, error: '游戏时长无效' };
  }

  // 合理性：平均每秒最多得 ~80 分 (极速+连击倍率)
  const maxReasonableScore = (b.duration as number / 1000) * 80;
  if ((b.score as number) > maxReasonableScore * 1.5) {
    return { ok: false, error: '分数与游戏时长不匹配' };
  }

  return {
    ok: true,
    data: {
      name: b.name.trim(),
      packId: rawPackId,
      score: Math.floor(b.score as number),
      maxCombo: Math.max(0, Math.floor((b.maxCombo as number) || 0)),
      stage: Math.max(1, Math.floor((b.stage as number) || 1)),
      stageName: typeof b.stageName === 'string' ? b.stageName.slice(0, 20) : '',
      perfectCycles: Math.max(0, Math.floor((b.perfectCycles as number) || 0)),
      duration: Math.floor(b.duration as number),
      totalVowels: Math.max(0, Math.floor((b.totalVowels as number) || 0)),
      correctVowels: Math.max(0, Math.floor((b.correctVowels as number) || 0)),
    },
  };
}

/* ---------- Rate limit (简易 KV 实现) ---------- */

async function checkRateLimit(kv: KVNamespace, ip: string): Promise<boolean> {
  const key = `ratelimit:${ip}`;
  const last = await kv.get(key);
  if (last) return false; // 冷却中
  await kv.put(key, '1', { expirationTtl: RATE_LIMIT_SECONDS });
  return true;
}

/* ---------- 排行榜缓存 ---------- */

async function getTopScores(kv: KVNamespace, packId: string): Promise<ScoreEntry[]> {
  const cached = await kv.get(`top:${packId}`, 'json');
  if (cached) return cached as ScoreEntry[];
  return [];
}

async function rebuildTop(kv: KVNamespace, packId: string): Promise<ScoreEntry[]> {
  // 列出该 pack 的所有 scores 前缀的 key
  const entries: ScoreEntry[] = [];
  let cursor: string | undefined;

  do {
    const list = await kv.list({ prefix: `scores:${packId}:`, cursor, limit: 1000 });
    const promises = list.keys.map((k) => kv.get(k.name, 'json'));
    const results = await Promise.all(promises);
    for (const r of results) {
      if (r) entries.push(r as ScoreEntry);
    }
    cursor = list.list_complete ? undefined : list.cursor;
  } while (cursor);

  entries.sort((a, b) => b.score - a.score);
  const top = entries.slice(0, TOP_N);

  // 缓存 5 分钟
  await kv.put(`top:${packId}`, JSON.stringify(top), { expirationTtl: 300 });
  return top;
}

async function getStats(kv: KVNamespace, packId: string): Promise<GlobalStats> {
  const stats = await kv.get(`stats:${packId}`, 'json') as GlobalStats | null;
  return stats ?? { totalPlays: 0, totalOiiia: 0, highestScore: 0, updatedAt: Date.now() };
}

async function updateStats(kv: KVNamespace, packId: string, entry: ScoreEntry): Promise<GlobalStats> {
  const stats = await getStats(kv, packId);
  stats.totalPlays += 1;
  stats.totalOiiia += entry.correctVowels;
  if (entry.score > stats.highestScore) {
    stats.highestScore = entry.score;
  }
  stats.updatedAt = Date.now();
  await kv.put(`stats:${packId}`, JSON.stringify(stats));
  return stats;
}

/* ---------- 路由处理 ---------- */

async function handleSubmit(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';

  // Rate limit
  const allowed = await checkRateLimit(env.LEADERBOARD, ip);
  if (!allowed) {
    return errorResponse('提交太频繁，请稍后再试', 429, origin);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return errorResponse('JSON 解析失败', 400, origin);
  }

  const validation = validatePayload(body);
  if (!validation.ok) {
    return errorResponse(validation.error, 400, origin);
  }

  const entry: ScoreEntry = {
    id: generateId(),
    ...validation.data,
    createdAt: Date.now(),
  };

  const packId = entry.packId;

  // 写入 KV
  await env.LEADERBOARD.put(`scores:${packId}:${entry.id}`, JSON.stringify(entry));

  // 更新统计
  const stats = await updateStats(env.LEADERBOARD, packId, entry);

  // 清除排行榜缓存（下次读取时重建）
  await env.LEADERBOARD.delete(`top:${packId}`);

  // 查找排名
  const top = await rebuildTop(env.LEADERBOARD, packId);
  const rank = top.findIndex((e) => e.id === entry.id) + 1;

  return json(
    { ok: true, id: entry.id, rank: rank || null, stats },
    201,
    origin,
  );
}

async function handleLeaderboard(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const limit = Math.min(TOP_N, Math.max(1, parseInt(url.searchParams.get('limit') ?? '20', 10)));
  const packId = url.searchParams.get('packId') ?? 'oiia';

  const top = await getTopScores(env.LEADERBOARD, packId);

  // 缓存未命中则重建
  const scores = top.length > 0 ? top : await rebuildTop(env.LEADERBOARD, packId);

  return json({ scores: scores.slice(0, limit) }, 200, origin);
}

async function handleStats(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('Origin');
  const url = new URL(request.url);
  const packId = url.searchParams.get('packId') ?? 'oiia';
  const stats = await getStats(env.LEADERBOARD, packId);
  return json(stats, 200, origin);
}

/* ---------- 主入口 ---------- */

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    try {
      // 路由
      if (url.pathname === '/api/scores' && request.method === 'POST') {
        return await handleSubmit(request, env);
      }
      if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
        return await handleLeaderboard(request, env);
      }
      if (url.pathname === '/api/stats' && request.method === 'GET') {
        return await handleStats(request, env);
      }

      return errorResponse('Not Found', 404, origin);
    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('服务器内部错误', 500, origin);
    }
  },
};
