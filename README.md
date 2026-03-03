# RDV Order MVP

面向酒店/餐厅服务员的手机点餐系统（MVP）。

## 当前能力

- 服务员登录（账号 + PIN）
- 全局中英文切换
- 图形化选桌（先开台再点餐）
- 三班次菜单：早餐 / 午餐 / 晚餐
- 鸡尾酒酒单（独立菜单）
- 套餐菜单（A/B）
- 左侧分类栏 + 右侧菜品列表
- 已点餐品与自动总价
- 结账确认并自动关台
- 手动关台（无未结订单时）
- 拼桌（选两张空桌合并，例如 `A1+A2`）
- 经理菜单后台（新增、编辑、上下架、套餐配置）
- 菜单闭环基础：时段可用性、过敏原字段、套餐分组
- 订单闭环：退菜、取消单、折扣、服务费、分单/并单、反结账
- 状态流：`submitted -> paid -> closed`（打印仅做出单，不回传厨房状态）
- 收银闭环：日结/交班对账（应收/实收/差异）
- 收银规则引擎：折扣/服务费/税费规则独立配置（管理端）
- 权限闭环：细粒度 RBAC（数据库可配置）+ 审计日志
- 运营闭环：营业额、实收、热销
- 设备闭环：打印机状态、失败告警基础、自动重试、备用打印策略
- 弱网稳定性重构：下单幂等、防重复、打印队列异步消费
- 经理菜单管理（列表式全量编辑）
- PWA 轻缓存（静态资源）+ 主屏幕安装支持
- 网络状态栏（在线 / 弱网 / 离线）
- 点单草稿自动恢复（按桌号）
- 菜品备注（账单/订单/打印链路）
- 打印自检（后厨 / 吧台 / 双通道）
- 分类/关键词路由到多打印通道（后厨/吧台）

## 关键页面

- 登录页：`/`
- 服务员选桌：`/tables`
- 服务员点单：`/order`
- 管理-订单：`/manage/orders`
- 管理-收银：`/manage/cashier`
- 管理-运营：`/manage/ops`
- 管理-设备：`/manage/devices`
- 管理-RBAC：`/manage/rbac`
- 经理菜单后台：`/admin/menu`

## 菜单分组规则

- 早餐：`menu_group=breakfast`
- 午餐与晚餐：`menu_group=lunch_dinner`
- 鸡尾酒：`menu_group=cocktail`
- 套餐：`menu_group=set_menu`

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
- 或 `XPYUN_USER` + `XPYUN_USER_KEY` + `XPYUN_SN`（芯烨云打印，`PRINT_PROVIDER=xpyun`）
- `XPYUN_API_URL`（可选，默认 `https://open.xpyun.net/api/openapi/xprinter/print`）
- `XPYUN_COPIES`（可选，默认 1）
- `XPYUN_VOICE`（可选，默认 2）
- `XPYUN_MODE`（可选）
- `PRINT_WORKER_KEY`（可选，给调度器调用 `/api/print/dispatch`）
- `PRINT_FALLBACK_PROVIDER`（可选：`cloud` / `agent` / `xpyun`）
- `PRINT_SPLIT_BY_TARGET`（可选，默认 `false`；`true` 时按后厨/吧台拆单）
- `PRINT_TIMEOUT_MS`（可选，默认 3000）
- `PRINT_MAX_RETRY`（可选，默认 8）
- `PRINT_ALERT_FAIL_COUNT`（可选，默认 3，设备失败告警阈值）
- `PRINT_ALERT_QUEUE_FAILED`（可选，默认 3，失败队列告警阈值）
- `PRINT_ROUTE_BAR_CATEGORIES`（可选，逗号分隔，命中分类走吧台通道）
- `PRINT_ROUTE_BAR_KEYWORDS`（可选，逗号分隔，命中菜名关键词走吧台通道）
- `DEVICE_HEARTBEAT_KEY`（可选，给店内设备心跳上报 `/api/devices/heartbeat`）
- `DB_POOL_MAX`（可选，默认 6）
- `DB_CONNECT_TIMEOUT_MS`（可选，默认 4000）
- `DB_IDLE_TIMEOUT_MS`（可选，默认 10000）
- `DB_STATEMENT_TIMEOUT_MS`（可选，默认 12000）

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
\i db/migrations/006_full_closure_foundation.sql
\i db/migrations/007_state_machine_and_rules.sql
\i db/migrations/008_shift_package_and_status_cleanup.sql
\i db/migrations/009_order_item_note_and_print_alerts.sql
\i db/migrations/010_breakfast_menu_additions.sql
\i db/migrations/011_disable_legacy_breakfast_sets.sql
\i db/migrations/012_move_beverages_to_beverage_shift.sql
\i db/migrations/013_move_coffee_to_beverage_shift.sql
\i db/migrations/014_performance_indexes_mobile_scale.sql
```

5. 启动

```bash
npm run dev
```

打印配置本地自检：

```bash
npm run check:print-env
```

## 生产部署（Vercel）

至少设置这些环境变量到 Production：

- `DATABASE_URL`
- `JWT_SECRET`
- `PRINT_PROVIDER`
- `PRINT_CLOUD_URL` + `PRINT_CLOUD_API_KEY`（或 `PRINT_AGENT_URL` + `PRINT_AGENT_TOKEN`，或 `XPYUN_USER` + `XPYUN_USER_KEY` + `XPYUN_SN`）
- `PRINT_WORKER_KEY`（建议）

设置后 Redeploy。

## 账号（seed）

- 经理：`Mercy / admin`
- 经理：`Leo / admin`
- 服务员：`Maria / 12345`
- 服务员：`Joy / 12345`
- 服务员：`Dani / 12345`

## 角色权限

- waiter：点餐、退菜、查看订单与详情
- manager：含 waiter 权限 + 取消单、改价、分并单、反结账、菜单管理、报表、设备与权限管理

权限可在 `/manage/rbac` 按角色逐项开关（写入 `role_permissions`）。

## 文档

- API：`/Users/qiao/Downloads/rdv-order/docs/api.md`
- 架构：`/Users/qiao/Downloads/rdv-order/docs/architecture.md`
- 打印部署：`/Users/qiao/Downloads/rdv-order/docs/printer-deploy.md`
