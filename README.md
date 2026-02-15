# RDV Order MVP

面向酒店/餐厅服务员的手机点餐系统（MVP）。

## 项目目标

- 服务员手机 H5 点餐
- 后厨自动出单（通过云打印或店内打印代理）
- 管理端查看班次/每日汇总
- 系统优先保证稳定、简单、低成本

## MVP 范围

- 登录：账号 + PIN
- 下单：桌号、菜品、数量
- 自动打印：先写库，再进入打印队列
- 汇总：订单数、总金额、菜品数量
- 菜单：固定配置（当前通过 SQL seed）

## 技术栈

- 前端：Next.js 14 (App Router)
- 后端：Next.js Route Handlers（可部署到 Vercel）
- 数据库：PostgreSQL（Supabase/Neon 均可）
- 鉴权：JWT (`jose`)

## 关键业务流程

1. 服务员登录，拿到 JWT。
2. 服务员选择桌号和菜品提交订单。
3. 服务端事务写入 `orders` + `order_items` + `print_jobs`。
4. 后续由打印集成消费 `print_jobs`。
5. 经理通过时间区间查看汇总。

## API 总览

- `POST /api/login`
- `GET /api/menu`
- `POST /api/orders`
- `GET /api/orders?mine=1`
- `GET /api/summary?from=ISO&to=ISO`

详细请求/响应见 `/Users/qiao/Downloads/rdv-order/docs/api.md`。

## 数据库

- Schema: `/Users/qiao/Downloads/rdv-order/db/schema.sql`
- Seed: `/Users/qiao/Downloads/rdv-order/db/seed.sql`

包含核心表：

- `users`
- `menu_items`
- `orders`
- `order_items`
- `print_jobs`
- `shifts`

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env.local
```

3. 初始化数据库

```sql
\i db/schema.sql
\i db/seed.sql
```

4. 生成 PIN hash（替换 seed 中占位值）

```bash
node scripts/gen-pin.js 1234
```

5. 启动开发服务

```bash
npm run dev
```

## Vercel 部署要点

- 前端与 API 同项目部署
- Postgres 为外部服务
- 必备环境变量：
  - `DATABASE_URL`
  - `JWT_SECRET`
  - `PRINT_PROVIDER`
- 如果使用云打印，还需设置厂商 API 密钥

## 进一步开发建议

- 增加打印任务消费器（重试 + 死信处理）
- 增加幂等键，避免重复提交/重复打印
- 增加经理端班次定义与自动归档

## 关联文档

- `/Users/qiao/Downloads/rdv-order/docs/architecture.md`
- `/Users/qiao/Downloads/rdv-order/docs/api.md`
- `/Users/qiao/Downloads/rdv-order/docs/commit-checklist.md`
