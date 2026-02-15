# API Reference

## `POST /api/login`

请求：

```json
{
  "username": "waiter1",
  "pin": "1234"
}
```

成功响应：

```json
{
  "token": "<jwt>",
  "role": "waiter"
}
```

失败状态：`400`, `401`

## `GET /api/menu`

成功响应：

```json
{
  "items": [
    {
      "id": "uuid",
      "name": "宫保鸡丁",
      "price": 38,
      "category": "热菜"
    }
  ]
}
```

## `POST /api/orders`

请求头：`Authorization: Bearer <jwt>`

请求：

```json
{
  "tableNo": "A12",
  "items": [
    { "menuItemId": "uuid", "qty": 2 }
  ]
}
```

成功响应：

```json
{
  "orderId": "uuid"
}
```

失败状态：`400`, `401`, `403`, `500`

## `GET /api/orders?mine=1`

请求头：`Authorization: Bearer <jwt>`

响应：

```json
{
  "orders": [
    {
      "id": "uuid",
      "table_no": "A12",
      "status": "submitted",
      "created_at": "2026-02-15T10:00:00.000Z"
    }
  ]
}
```

## `GET /api/summary?from=ISO&to=ISO`

请求头：`Authorization: Bearer <jwt>`（必须 manager）

成功响应：

```json
{
  "orderCount": 12,
  "totalAmount": 1268,
  "items": [
    {
      "menu_item_id": "uuid",
      "name": "宫保鸡丁",
      "qty": 14
    }
  ]
}
```

失败状态：`400`, `401`, `403`, `500`
