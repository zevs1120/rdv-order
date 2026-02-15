# Architecture

## 组件

- H5 客户端：`/Users/qiao/Downloads/rdv-order/app/page.tsx`, `/Users/qiao/Downloads/rdv-order/app/order/page.tsx`, `/Users/qiao/Downloads/rdv-order/app/summary/page.tsx`
- API 层：`/Users/qiao/Downloads/rdv-order/app/api/*`
- 数据访问：`/Users/qiao/Downloads/rdv-order/lib/db.ts`
- 认证：`/Users/qiao/Downloads/rdv-order/lib/auth.ts`, `/Users/qiao/Downloads/rdv-order/lib/security.ts`
- 打印抽象：`/Users/qiao/Downloads/rdv-order/lib/print.ts`

## 设计原则

- 订单写库优先，打印异步化
- 使用数据库事务确保订单与打印任务一致性
- API 职责单一，后续易拆分
- 数据结构为后续后台管理预留扩展空间

## 下单时序

1. 客户端调用 `POST /api/orders`。
2. 服务端验证 JWT 与参数。
3. 事务写入 `orders`、`order_items`、`print_jobs`。
4. 提交事务后返回 `orderId`。
5. 打印系统消费 `print_jobs`，更新状态。

## 打印方案

### 方案 A: 云打印机

- Vercel API 直接调用厂商云 API。
- 优点：店内无需额外设备。
- 风险：依赖厂商 API 稳定性与费用。

### 方案 B: 店内打印代理

- 店内设备持续拉取或接收 `print_jobs`。
- 优点：本地打印可控，硬件选择更灵活。
- 风险：需要维护代理进程。

## 稳定性策略

- `print_jobs` 保留失败状态与重试计数。
- 汇总查询走时间区间，避免缓存不一致。
- 生产环境建议接入监控（Sentry/日志聚合）。
