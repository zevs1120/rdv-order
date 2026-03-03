# Printer Deploy Checklist

## 1) 选择打印模式

- 云打印机：设置 `PRINT_PROVIDER=cloud`
- 店内打印代理：设置 `PRINT_PROVIDER=agent`
- 芯烨云打印：设置 `PRINT_PROVIDER=xpyun`
- 如需自动兜底：设置 `PRINT_FALLBACK_PROVIDER`

## 2) 必填环境变量

- 云打印：`PRINT_CLOUD_URL`、`PRINT_CLOUD_API_KEY`
- 代理打印：`PRINT_AGENT_URL`、`PRINT_AGENT_TOKEN`
- 芯烨云：`XPYUN_USER`、`XPYUN_USER_KEY`、`XPYUN_SN`
  - 兼容别名：`USER`、`USERKEY`、`SN`
- 芯烨接口（可选）：`XPYUN_API_URL`（默认 `https://open.xpyun.net/api/openapi/xprinter/print`）
- 芯烨份数/语音（可选）：`XPYUN_COPIES`、`XPYUN_VOICE`、`XPYUN_MODE`
- 字体放大（可选）：`XPYUN_FONT_TAG`（默认 `B`，太小可改 `B2`）
- 调度密钥：`PRINT_WORKER_KEY`
- 设备心跳密钥（建议）：`DEVICE_HEARTBEAT_KEY`
- 超时时间（可选）：`PRINT_TIMEOUT_MS`
- 卡死回收（可选）：`PRINT_STALE_PRINTING_SECONDS`（默认 45 秒）
- 分单开关（可选）：`PRINT_SPLIT_BY_TARGET`（默认关闭，单打印机建议保持关闭）
- 队列最大重试（可选）：`PRINT_MAX_RETRY`
- 失败告警阈值（可选）：`PRINT_ALERT_FAIL_COUNT`、`PRINT_ALERT_QUEUE_FAILED`
- 吧台路由（可选）：`PRINT_ROUTE_BAR_CATEGORIES`、`PRINT_ROUTE_BAR_KEYWORDS`
  - 单打印机建议留空并保持 `PRINT_SPLIT_BY_TARGET=false`（酒水和菜同单打印）

## 3) 上线前自检

```bash
npm run check:print-env
```

如果返回 `ok: false`，先修复 `problems` 列表再部署。

## 4) 线上健康检查

- 经理账号登录后可调用：`GET /api/print/health`
- 返回内容包含：
  - 主/备打印通道配置是否完整
  - 打印队列待处理/失败数量
  - Worker / Heartbeat 密钥是否已配置
  - 分类/关键词路由配置
  - `ready` 与 `warnings`（可直接判断是否适合开业）

## 5) 打印自检（推荐）

- 管理端设备页可直接点：
  - `自检后厨`
  - `自检吧台`
  - `双通道自检`
- 或调用接口：`POST /api/print/self-test`，请求体 `{ "target": "kitchen|bar|both" }`

## 6) 最简上线流程（Vercel）

1. 在 Vercel 项目环境变量填好上述键值。
2. 部署后下 1 笔测试单。
3. 手动触发重试接口（可选）：
   - `POST /api/print/dispatch` with `{ "limit": 10 }`
4. 在管理端设备页确认：
   - `pending` 下降
   - 设备状态非连续 `offline`
