# API Reference

## Auth

### `POST /api/login`

请求：

```json
{
  "username": "Mercy",
  "pin": "admin"
}
```

## Menu

### `GET /api/menu?shift=breakfast|lunch|dinner|cocktail`

返回当前班次菜单。

### `POST /api/menu/custom`

请求头：`Authorization: Bearer <jwt>`

请求：

```json
{
  "name": "Seasonal Fish",
  "price": 420,
  "category": "Special",
  "description": "off menu",
  "shift": "dinner",
  "mode": "temporary"
}
```

说明：

- `mode=temporary`：创建临时菜（仅本次点单使用，不进入公开菜单）
- `mode=permanent`：创建永久菜（仅经理允许）

## Orders

### `POST /api/orders`

请求头：`Authorization: Bearer <jwt>`
可选请求头：`X-Idempotency-Key: <8-80位字母数字_-组合>`（弱网重试防重复下单）

请求：

```json
{
  "tableNo": "A1",
  "guestCount": 4,
  "shift": "lunch",
  "items": [{ "menuItemId": "uuid", "qty": 2 }]
}
```

说明：桌台必须是已开台状态。
说明：如同一服务员重复提交相同 `X-Idempotency-Key`，接口会返回已有订单，不重复创建。

### `DELETE /api/orders/{id}`

请求头：`Authorization: Bearer <jwt>`（必须 manager）

删除任意订单（用于经理纠错）。

## Tables

### `GET /api/tables`

请求头：`Authorization: Bearer <jwt>`

返回图形化桌台数据，含开台状态（红/绿）与拼桌显示。

### `POST /api/tables`

请求头：`Authorization: Bearer <jwt>`

普通开台：

```json
{
  "tableNo": "A1",
  "guestCount": 4
}
```

### `POST /api/tables/merge`

请求头：`Authorization: Bearer <jwt>`

拼桌开台：

```json
{
  "primaryTable": "A1",
  "secondaryTable": "A2",
  "guestCount": 8
}
```

成功后桌号会变成 `A1+A2`，`A2` 在选桌页消失。

### `POST /api/tables/unmerge`

请求头：`Authorization: Bearer <jwt>`

取消拼桌（仅当该拼桌还没有订单）：

```json
{
  "tableNo": "A1+A2"
}
```

### `GET /api/tables/bill?tableNo=A1%2BA2`

请求头：`Authorization: Bearer <jwt>`

返回该桌当前账单明细与总价。

### `POST /api/tables/checkout`

请求头：`Authorization: Bearer <jwt>`

请求：

```json
{
  "tableNo": "A1+A2"
}
```

执行结账确认：

- 订单状态更新为 `paid`
- 当前桌台自动关台（恢复绿色）

### `POST /api/tables/close`

请求头：`Authorization: Bearer <jwt>`

手动关台（不结账）：

```json
{
  "tableNo": "A1"
}
```

限制：如果该桌还有 `submitted` 未结订单，会返回冲突并提示先结账。

## Summary

### `GET /api/summary?from=ISO&to=ISO`

请求头：`Authorization: Bearer <jwt>`（必须 manager）

## Manage

### `GET /api/manage/orders?from=ISO&to=ISO`

请求头：`Authorization: Bearer <jwt>`（waiter / manager）

返回指定时间范围订单列表（每单金额、菜品数量、状态、时间、明细 items）。

### `GET /api/manage/income?from=ISO&to=ISO`

请求头：`Authorization: Bearer <jwt>`（必须 manager）

返回已结账（`paid`）收入汇总与按天统计，用于“当天/昨天/过去一周/过去一月/过去三月/过去一年/自定时间”筛选。

## Print

### `POST /api/print/dispatch`

触发打印任务消费（调度 `print_jobs` 队列）。

- 方式 1：经理身份调用（`Authorization: Bearer <jwt>`）
- 方式 2：Worker Key 调用（请求头 `X-Print-Worker-Key`）

请求体（可选）：

```json
{
  "limit": 6
}
```
