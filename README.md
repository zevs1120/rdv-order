# RDV Order MVP

面向酒店/餐厅服务员的手机点餐系统（MVP）。

## 当前能力

- 服务员登录（账号 + PIN）
- 全局中英文切换
- 图形化选桌（先开台再点餐）
- 三班次菜单：早餐 / 午餐 / 晚餐
- 鸡尾酒酒单（独立菜单）
- 左侧分类栏 + 右侧菜品列表
- 已点餐品与自动总价
- 结账确认并自动关台
- 手动关台（无未结订单时）
- 拼桌（选两张空桌合并，例如 `A1+A2`）
- 经理菜单后台（新增、编辑、上下架、套餐配置）
- 班次/每日汇总
- 弱网稳定性重构：下单幂等、防重复、打印队列异步消费
- 经理菜单管理（列表式全量编辑）

## 关键页面

- 登录页：`/`
- 服务员选桌：`/tables`
- 服务员点单：`/order`
- 经理汇总：`/summary`
- 经理菜单后台：`/admin/menu`

## 菜单分组规则

- 早餐：`menu_group=breakfast`
- 午餐与晚餐：`menu_group=lunch_dinner`
- 鸡尾酒：`menu_group=cocktail`

## 本地启动

1. 安装依赖

```bash
npm install
```

2. 配置环境变量

```bash
cp .env.example .env.local
```

填写：

- `DATABASE_URL`
- `JWT_SECRET`
- `PRINT_PROVIDER`
- `PRINT_CLOUD_URL` + `PRINT_CLOUD_API_KEY`（云打印）
- 或 `PRINT_AGENT_URL` + `PRINT_AGENT_TOKEN`（店内打印代理）
- `PRINT_WORKER_KEY`（可选，给调度器调用 `/api/print/dispatch`）

3. 新库初始化

```sql
\i db/schema.sql
\i db/seed.sql
```

4. 旧库迁移

```sql
\i db/migrations/001_menu_group_and_admin.sql
\i db/migrations/002_table_sessions.sql
\i db/migrations/003_table_session_tables.sql
\i db/migrations/004_stability_hardening.sql
\i db/migrations/005_menu_temporary_items.sql
```

5. 启动

```bash
npm run dev
```

## 生产部署（Vercel）

至少设置这些环境变量到 Production：

- `DATABASE_URL`
- `JWT_SECRET`
- `PRINT_PROVIDER`
- `PRINT_CLOUD_URL` + `PRINT_CLOUD_API_KEY`（或 `PRINT_AGENT_URL` + `PRINT_AGENT_TOKEN`）
- `PRINT_WORKER_KEY`（建议）

设置后 Redeploy。

## 账号（seed）

- 经理：`Mercy / admin`
- 经理：`Leo / admin`
- 服务员：`Maria / 12345`
- 服务员：`Joy / 12345`
- 服务员：`Dani / 12345`

## 角色权限

- waiter：点餐、查看当天订单与订单明细
- manager：含 waiter 权限 + 删除任意订单 + 菜单管理 + 收入统计

## 文档

- API：`/Users/qiao/Downloads/rdv-order/docs/api.md`
- 架构：`/Users/qiao/Downloads/rdv-order/docs/architecture.md`
