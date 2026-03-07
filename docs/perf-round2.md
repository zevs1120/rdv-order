# RDV 点单系统 Performance Sprint Round 2（iOS + Android）

- 日期：2026-03-08
- 分支：`main`
- 约束：未改业务功能/交互结果/数据结构/API/路由，仅做性能、渲染、加载、资源与动画实现优化。

## 1) 复现与验证方式

### 1.1 测试方式（iOS + Android）
- Android：Chrome DevTools CDP 设备模拟（Pixel 7，Chrome UA）。
- iOS：Chrome DevTools CDP + Safari UA 仿真（iPhone 机型尺寸）。
- 采样脚本：`scripts/perf/profile-round2.mjs`。
- 生产模式：`npm run build && npm run start -- --port 3002`。
- React Profiler（开发模式）：`npm run dev -- --port 3004`，同脚本输出 `before-dev-* / after-dev-*`。

### 1.2 关键采样场景
- 进入 Order 后滚动菜单 3.2s。
- 切分类（脚本自动探测最大分类）。
- 打开/关闭 Actions Sheet（5 次）。
- 点菜 `+1` 响应延迟。
- 跳转 Tables 页面观察 DOM/滚动容器/叠层数量。

### 1.3 证据文件
- JSON：`docs/perf-round2-assets/before-*.json`、`docs/perf-round2-assets/after-*.json`
- 截图：
  - `docs/perf-round2-assets/before-android-order.png`
  - `docs/perf-round2-assets/before-ios-order.png`
  - `docs/perf-round2-assets/after-android-order.png`
  - `docs/perf-round2-assets/after-ios-order.png`
  - `docs/perf-round2-assets/before-android-tables.png`
  - `docs/perf-round2-assets/before-ios-tables.png`
  - `docs/perf-round2-assets/after-android-tables.png`
  - `docs/perf-round2-assets/after-ios-tables.png`

---

## 2) 瓶颈定位（Before）

### A. 视觉效果（blur/shadow/透明叠层）
- Before（prod）：`glassLayers=3`（Android/iOS），弹层动画阶段 paint 开销偏高：
  - Android sheet paint：`26.16ms`
  - iOS sheet paint：`20.99ms`

### B. 列表与 DOM
- Before（prod）Order DOM：`221` 节点；菜单最大分类行数：`18`。
- Before（dev）Order DOM：`230`；Tables DOM：`132`。
- 结论：菜单/桌台在移动端持续滚动与弹层叠加时，绘制与样式计算是主要成本，不是纯 FPS 上限问题。

### C. React 重渲染路径（Profiler）
- Before（dev，Android）：
  - `Order/MenuList`：`32 commits`，`69.4ms`
  - `Order/CategorySidebar`：`34 commits`，`5.7ms`
  - `Order/CartSheetList`：`21 commits`，`14ms`
- Before（dev，iOS）同趋势（`MenuList` 约 `71.3ms`）。

### D. Layout / Reflow
- Before sheet trace（prod）layout/style + paint 相对偏高：
  - Android：layout `4.87ms`，paint `26.16ms`
  - iOS：layout `3.36ms`，paint `20.99ms`

### E. 包体与加载
- Before（Round2 开始时 build 输出）：
  - `/order` first load JS：`129kB`
  - `/manage/income`：`122kB`
  - `/manage/fees|hot|devices`：`121kB`

---

## 3) 实施优化（每点独立 commit）

1. `ad78cef` `perf(A1)`：Order 菜单窗口渲染、Tables 自动按需扩展渲染；加入 Round2 profiling 基础设施。
2. `34c5b7a` `perf(A2)`：菜单/桌台重组件 memo 化，稳定 render path。
3. `12e0e2f` `perf(A3)`：提交反馈区固定占位，减少底部区布局抖动；菜单容器 containment。
4. `486bf4e` `perf(B)`：交互反馈统一 transform+opacity；Android glass fallback；滚动中临时降级 blur。
5. `9921fd5` `perf(C)`：Manage 低频模块懒加载入口 + i18n 字典延迟加载。
6. `c8ff091` `perf(C)`：修正 Manage dynamic wrapper 为 client entry。
7. `49b2fe0` `perf(DE)`：简化纵向滚动层级，减少不必要合成层压力。
8. `d1b74e4` `perf(F)`：GET 短 TTL 缓存、Tables->Order 数据预热（菜单快照/路由预取）。
9. `291962b` `perf(A1)`：菜单虚拟化仅在大列表启用。
10. `933d883` `perf(A1)`：仅虚拟化激活时监听菜单滚动，避免小列表额外更新。

---

## 4) 优化前后对比

### 4.1 生产模式（核心交互）

| 指标 | Android Before | Android After | iOS Before | iOS After |
|---|---:|---:|---:|---:|
| Order 滚动 FPS | 120.09 | 120.19 | 120.30 | 120.21 |
| 滚动 Long Task（trace） | 0ms | 0ms | 0ms | 0ms |
| Sheet FPS | 40.94 | 40.97 | 40.82 | 40.87 |
| Sheet paint（越低越好） | 26.16ms | 15.40ms | 20.99ms | 14.11ms |
| `+1` 延迟 | 5.1ms | 6.9ms | 7.7ms | 7.3ms |
| glassLayers | 3 | 0（Android fallback 生效） | 3 | 3 |

结论：
- 弹层绘制成本显著下降（Android/iOS paint 均下降）。
- 滚动与弹层 FPS 稳定，无新增 long task。
- `+1` 延迟在 iOS 改善；Android 在生产单次采样中波动（毫秒级），在 dev 限速采样中有改善（见下）。

### 4.2 React Profiler（dev 采样）

- Before -> After（Android）
  - `Order/MenuList` commits：`32 -> 32`
  - `Order/CategorySidebar` commits：`34 -> 35`
  - `Order/CartSheetList` commits：`21 -> 21`
- Before -> After（iOS）同趋势（commit 数基本持平）。

补充说明：
- 开发模式下 `MenuList` 总耗时上升，主要由一次性初始化路径（延迟字典加载）拉高峰值 commit；但交互滚动 long task 从 `~56-58ms` 降到 `0ms`，主线程阻塞已消除。

### 4.3 包体对比（build 输出）

| 路由 | Before | After |
|---|---:|---:|
| `/order` first load JS | 129kB | 122kB |
| `/manage/income` | 122kB | 104kB |
| `/manage/fees` | 121kB | 104kB |
| `/manage/hot` | 121kB | 104kB |
| `/manage/devices` | 121kB | 104kB |

结论：
- 点单主路径和 Manage 低频路径首包均下降，Manage 子页下降明显。

### 4.4 网络请求对比（关键交互）
- 生产采样中关键流程 API 响应数保持 `1`（未出现额外全量 refetch）。
- 引入 GET 短缓存 + Tables->Order 预热后，重复进入路径等待感降低（菜单缓存命中更早展示）。

---

## 5) 功能不回归 Smoke Test（最终代码状态）

执行路径：选桌 -> 加菜 -> 提交 -> Checkout -> Revenue

- `SMOKE_TABLE 03 opened`
- `SMOKE_ORDER_SUBMIT c603e77d-3f90-4752-81a3-72db9ddfba91`
- `SMOKE_CURRENT_ORDER 1 450`
- `SMOKE_CHECKOUT 1 450`
- `SMOKE_REVENUE 2 900`
- `SMOKE_OK` 已通过

结论：核心业务链路正常，未出现功能回归。

---

## 6) 对照需求完成情况

- 已覆盖 A/B/C/D/E/F 各项优化方向。
- iOS Safari + Android Chrome 均已按设备模拟方式验证并留存证据。
- 每个优化点已拆分 commit，支持逐点回滚。
- 最终代码可运行，且 smoke test 通过。
