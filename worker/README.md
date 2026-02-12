# 排行榜 Worker 部署指南

## 前置条件

- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费）
- Node.js 18+

## 初始化

```bash
cd worker
npm install
```

## 本地开发

```bash
# 登录 Cloudflare（首次）
npx wrangler login

# 创建 KV 命名空间
npx wrangler kv namespace create LEADERBOARD
# 输出: { binding = "LEADERBOARD", id = "xxxxxxx" }
# 复制 id 到 wrangler.toml

# 创建 preview 用命名空间（本地开发用）
npx wrangler kv namespace create LEADERBOARD --preview
# 复制 preview_id 到 wrangler.toml

# 启动本地开发服务器
npm run dev
# → http://localhost:8787
```

在前端项目根目录创建 `.env.local`：

```
VITE_LEADERBOARD_API=http://localhost:8787
```

## 部署

```bash
npm run deploy
# → https://oiia.<你的子域>.workers.dev
```

前端生产环境创建 `.env.production`：

```
VITE_LEADERBOARD_API=https://oiia.<你的子域>.workers.dev
```

## API 接口

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/scores` | 提交分数 |
| `GET` | `/api/leaderboard?limit=20` | 获取排行榜 |
| `GET` | `/api/stats` | 获取全局统计 |

### POST /api/scores

```json
{
  "name": "猫叫达人",
  "score": 1234,
  "maxCombo": 56,
  "stage": 3,
  "stageName": "狂热",
  "perfectCycles": 5,
  "duration": 45000,
  "totalVowels": 60,
  "correctVowels": 55
}
```

响应 `201`：

```json
{
  "ok": true,
  "id": "m1abc-XyZaBcDe",
  "rank": 7,
  "stats": {
    "totalPlays": 42,
    "totalOiiia": 2345,
    "highestScore": 9999,
    "updatedAt": 1707600000000
  }
}
```

## 防护措施

- **Rate limit**: 同一 IP 5 秒冷却
- **分数校验**: 分数 ≤ 游戏时长 × 最大理论得分率 × 1.5
- **时长校验**: 3 秒 ≤ duration ≤ 30 分钟
- **昵称限制**: 最多 20 字符

## 免费额度

| 资源 | 免费额度 | 说明 |
|------|---------|------|
| Worker 请求 | 10 万次/天 | 超出返回错误，不扣费 |
| KV 读取 | 10 万次/天 | |
| KV 写入 | 1,000 次/天 | |
| KV 存储 | 1 GB | |
