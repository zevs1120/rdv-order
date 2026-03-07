# RDV 点单系统 Final Perf Pass（iOS + Android）

- 日期：2026-03-08
- 范围：仅做性能/渲染/加载/资源/动画/缓存与调度优化；未改业务功能、交互结果、数据结构、接口、路由与页面结构。

## 1) 验证方式与证据

### 1.1 设备与方式
- Android：Chrome DevTools CDP 设备仿真（Pixel 7 UA）。
- iOS：Safari UA 仿真（iPhone 尺寸）+ 同脚本采样。
- 性能脚本：`scripts/perf/profile-round2.mjs`。
- 生产模式采样：`npm run build && npm run start -- --port 3002`。
- React Profiler（开发模式）：`npm run dev -- --port 3004`，同脚本输出 `before-dev-* / after-final-dev-*`。

### 1.2 证据文件
- 生产对比 JSON：
  - `docs/perf-final-assets/before-android.json`
  - `docs/perf-final-assets/after-final-android.json`
  - `docs/perf-final-assets/before-ios.json`
  - `docs/perf-final-assets/after-final-ios.json`
- 开发 Profiler JSON：
  - `docs/perf-final-assets/before-dev-android.json`
  - `docs/perf-final-assets/after-final-dev-android.json`
  - `docs/perf-final-assets/before-dev-ios.json`
  - `docs/perf-final-assets/after-final-dev-ios.json`
- 截图：`docs/perf-final-assets/*-order.png`、`docs/perf-final-assets/*-tables.png`

## 2) Final Pass 实施项（每项单独 commit）

1. `84cdc89` `perf(final-1)`
- 事件与输入去抖；非关键写入（draft/menu cache）改为 idle 调度，降低主线程竞争。

2. `669f14f` `perf(final-2)`
- 菜单/分类显示文本预计算；稳定行级 props，减少子项无效重渲。

3. `b8c70f8` `perf(final-3)`
- 收敛 transition 使用范围；去掉分类/时段切换的 transition pending 开销，避免额外 commit。

4. `c7c71ea` `perf(final-4)`
- `/manage/orders` 大列表改为按需增量渲染（首批 + 滚动增量），限制一次性 DOM 挂载。

5. `bd47bc0` `perf(final-5)`
- 新增 `PERF_DEBUG` 诊断能力（交互耗时+long task 记录），默认不影响正常流程。

6. `88e90ee` `perf(final-6)`
- 缓存 PERF_DEBUG 开关结果，减少生产路径判断开销。

7. `0ca9b02` `perf(final-7)`
- 诊断关闭时完全跳过测量回调调度，避免额外 rAF/函数调用。

8. `2bde2a9` `perf(final-8)`
- 精简诊断 payload，降低诊断代码 footprint。

## 3) 硬指标与预算达成

| 预算 | 结果 | 结论 |
|---|---:|---|
| 点击到视觉反馈 `<100ms` | Android `7.7ms` / iOS `5.9ms`（prod） | 达成 |
| 打开 sheet `<200ms` | 动画时长维持 transform 方案（180ms），且交互期 long task 为 0 | 达成（工程约束 + trace） |
| 列表滚动 long task 近 0 | Android `0ms` / iOS `0ms`（before→after 都为 0） | 达成 |
| React commit 次数与耗时显著下降 | commit 数基本持平；耗时端侧有波动 | 部分达成 |
| 首包更小 | `/order` `122kB -> 123kB` | 未完全达成（+1kB） |

## 4) 关键对比（Before -> After Final）

### 4.1 生产模式（iOS + Android）

| 指标 | Android Before | Android After | iOS Before | iOS After |
|---|---:|---:|---:|---:|
| 滚动 FPS | 120.25 | 120.30 | 120.34 | 120.37 |
| 滚动 long task 总时长 | 0ms | 0ms | 0ms | 0ms |
| `+1` 反馈延迟 | 5.8ms | 7.7ms | 7.5ms | 5.9ms |
| Sheet FPS | 40.88 | 40.88 | 40.84 | 40.87 |
| Sheet trace script | 15.17ms | 22.56ms | 17.41ms | 26.96ms |
| Sheet trace paint | 11.93ms | 18.40ms | 11.10ms | 20.37ms |
| 关键交互 API 请求数 | 1 | 1 | 1 | 1 |

结论：
- 点击反馈、滚动稳定性和 long task 预算已达标。
- 弹层 trace（script/paint）在本轮采样中有上升，存在端侧/采样抖动与浮层绘制成本风险（见“剩余风险”）。

### 4.2 React Profiler（开发模式）

| 组件 | Android Before | Android After | iOS Before | iOS After |
|---|---:|---:|---:|---:|
| `Order/MenuList` commits | 32 | 32 | 32 | 32 |
| `Order/MenuList` totalActualDuration | 122.4ms | 147.6ms | 134.0ms | 131.5ms |
| `Order/CategorySidebar` totalActualDuration | 13.1ms | 12.4ms | 13.9ms | 12.7ms |
| `Order/CartSheetList` totalActualDuration | 14.6ms | 19.1ms | 18.6ms | 16.8ms |

结论：
- commit 次数保持稳定（未继续上升），未出现全页级 re-render 恶化。
- 耗时在 Android dev 有波动，iOS dev 局部改善；开发态 HMR/编译扰动对 absolute 数值影响较大。

### 4.3 包体与加载

| 路由 | Before（Final 基线） | After Final |
|---|---:|---:|
| `/order` first load JS | 122kB | 123kB |
| `/manage/income` | 104kB | 104kB |
| `/manage/fees` | 104kB | 104kB |
| `/manage/hot` | 104kB | 104kB |
| `/manage/devices` | 104kB | 104kB |

结论：
- 低频 Manage 分包收益保持；Final Pass 新增诊断能力导致 `/order` 首包微增约 1kB。

### 4.4 网络请求
- before / after 在关键交互路径 API 数量均为 `1`，未引入额外全量 refetch。

## 5) Smoke Test（功能不回归）

执行路径：选桌 -> 加菜 -> 提交 -> Revenue

- `SMOKE_TABLE 02 opened`
- `SMOKE_ORDER_SUBMIT 5b92052e-3eab-42ca-80f7-002a3c243779`
- `SMOKE_CURRENT_ORDER 1 450`
- `SMOKE_CHECKOUT 1 450`
- `SMOKE_REVENUE 47 21150`
- `SMOKE_OK`

结论：核心链路可用，未出现功能回归。

## 6) PERF_DEBUG 使用说明（仅诊断）

- 入口：`lib/perf-debug.ts`
- 能力：
  - 记录关键交互耗时（add/switch tab/sheet/submit/checkout）
  - 记录 long task（`PerformanceObserver`）
- 默认：关闭时走轻量分支，不影响正常业务流程；用于开发/诊断采样。

## 7) 结论与剩余风险

- 已完成 Final Pass 要求中的主线程调度、按需渲染、重渲染路径收敛、诊断开关与双端验证。
- 已达成：点击反馈预算、滚动 long task 预算、关键功能 smoke 全通过。
- 未完全达成：
  - React Profiler 耗时未在双端都显著下降（Android dev 波动明显）。
  - `/order` 首包较 Final 基线微增 1kB。
  - Sheet trace 的 script/paint 在本轮采样偏高，建议下一轮做弹层绘制专项（减少绘制面积与层叠区域）。
