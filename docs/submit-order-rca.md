# Submit Order RCA (Mobile)

## 1. 复现步骤

### 环境
- 本地：`http://localhost:3000`（Next.js dev）
- 线上：Vercel Production（同版本逻辑）
- 终端设备：iOS Safari、Android Chrome（移动端触控）

### 复现场景
1. 进入 `/order`，选择桌台并加菜。
2. 快速连续点击 `Submit Order`（或先点击一次 `Current Order` 后立刻点击 `Submit Order`）。
3. 观察现象：
   - 偶发“点了没反应”；
   - 偶发请求未发出；
   - 偶发提交失败但反馈不明显。

## 2. 采集与证据

### 前端采集项（本次已加入 dev-only 日志）
- 点击次数（click count）
- 提交尝试序号（attempt no）
- 当前桌号、人数、菜品数量
- payload 内容
- 请求耗时
- 返回结果/错误

### 关键证据
- 提交入口存在节流守卫：`useActionGuard(450ms)`。
- 在移动端连续触控下，`submitOrder` 会在 guard 阶段直接 `return`，之前没有任何反馈（用户感知为无反应）。
- `submitOrder` 在弱网下原配置是 `timeout=8000 + retries=1`，提交等待时长不透明，失败时反馈弱。

## 3. Root Cause

### RC-1（主因）
- `Submit Order` 使用了和全局其他动作共用的 450ms action guard。
- 当用户在短时间内触发相关点击（尤其移动端连续触控）时，guard 命中后直接返回，导致“无反应”。

### RC-2（体验级问题）
- 提交中状态反馈不够强：
  - 没有持续进度提示；
  - 重复点击提交中按钮没有明确反馈；
  - 弱网/超时错误没有聚焦提示“网络问题/请重试”。

## 4. 修复方案与改动点

## 4.1 提交链路（功能修复）
- 对 `submitOrder` 移除 silent-block 行为：
  - 提交中再次点击 -> 明确提示 `Submitting... please wait`。
- 增加明确 guard：
  - `submitInFlightRef` + `submitState === loading` 期间不再重复发请求。
- 请求参数：
  - `timeoutMs` 调整为 `12000`（弱网可感知）
  - `retries` 调整为 `0`（避免写操作重试导致不透明等待/并发歧义）
- 离线预判：
  - `navigator.onLine === false` 立即报错，不进入长等待。
- 错误归一：
  - 超时/离线/通用错误分别提示，并可立即重试。

## 4.2 交互反馈（UI修复）
- Submit 按钮状态完整化：
  - Default
  - Pressed（90ms轻微按压态）
  - Loading（spinner + `Submitting...`）
  - Success（toast）
  - Error（toast + Retry）
- 提交中显示轻量进度文案（sticky cart bar 下方）。
- 提交失败显示错误提示文案与重试引导。
- 提交中再次点击不再“无反应”，会提示“正在提交，请稍候”。

## 4.3 Dev-only 调试日志
- 新增 `debugSubmit()`：
  - 仅 `NODE_ENV !== production` 输出；
  - 线上生产默认关闭，不影响性能与隐私。

## 4.4 代码改动文件
- `/Users/qiao/Downloads/rdv-order/app/order/page.tsx`
- `/Users/qiao/Downloads/rdv-order/app/order/page.module.css`
- `/Users/qiao/Downloads/rdv-order/components/ui/button.tsx`
- `/Users/qiao/Downloads/rdv-order/styles/ui.css`
- `/Users/qiao/Downloads/rdv-order/lib/i18n.ts`

## 5. 回归测试方法

## 5.1 正常网络
1. 加菜 -> Submit。
2. 预期：立刻进入 loading；成功后 toast 显示并清空当前购物车；账单更新。

## 5.2 弱网（Slow 3G）
1. DevTools Network 设为 Slow 3G。
2. 点击 Submit。
3. 预期：按钮始终显示 loading + 进度文案，不出现“无反应”。
4. 成功/失败都必须有 toast。

## 5.3 离线
1. DevTools 切 Offline。
2. 点击 Submit。
3. 预期：立即提示离线错误，不进入长时间转圈。

## 5.4 后端 4xx/5xx
1. 构造无效 payload 或临时让接口返回错误。
2. 预期：显示 `Submit failed: ...`，并可点击 Retry。

## 5.5 快速连点 5 次
1. 连续快速点击 Submit。
2. 预期：只发出 1 次实际提交请求；其余点击提示“Submitting... please wait”。

## 5.6 提交后流程完整性
1. 提交成功后再打开账单。
2. 预期：金额、数量、订单状态一致；不存在提交中断导致的半状态。
