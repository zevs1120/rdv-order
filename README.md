# RDV Order MVP

面向酒店/餐厅服务员的手机点餐系统（MVP）。

## 当前能力

- 服务员登录（账号 + PIN）
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

设置后 Redeploy。

## 账号（seed）

- 服务员：`mercy / admin`
- 经理：`manager1 / admin`

## 文档

- API：`/Users/qiao/Downloads/rdv-order/docs/api.md`
- 架构：`/Users/qiao/Downloads/rdv-order/docs/architecture.md`
