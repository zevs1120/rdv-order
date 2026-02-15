# Printer Deploy Checklist

## 1) 选择打印模式

- 云打印机：设置 `PRINT_PROVIDER=cloud`
- 店内打印代理：设置 `PRINT_PROVIDER=agent`
- 如需自动兜底：设置 `PRINT_FALLBACK_PROVIDER`

## 2) 必填环境变量

- 云打印：`PRINT_CLOUD_URL`、`PRINT_CLOUD_API_KEY`
- 代理打印：`PRINT_AGENT_URL`、`PRINT_AGENT_TOKEN`
- 调度密钥：`PRINT_WORKER_KEY`
- 设备心跳密钥（建议）：`DEVICE_HEARTBEAT_KEY`

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

## 5) 最简上线流程（Vercel）

1. 在 Vercel 项目环境变量填好上述键值。
2. 部署后下 1 笔测试单。
3. 手动触发重试接口（可选）：
   - `POST /api/print/dispatch` with `{ "limit": 10 }`
4. 在管理端设备页确认：
   - `pending` 下降
   - 设备状态非连续 `offline`

