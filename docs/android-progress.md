# Android 实施记录

## 1.0.0 正式发布批次（2026-09-08）

网页/原生同步删除设置页“点击模块进入对应的详细管理子页面”中英文提示。累计界面与性能改进作为 1.0.0/code 8；原包名、正式后台、签名证书不变，历史 APK 保留。正式包 1,592,129 bytes，SHA-256 `bd9295dbfae3b631bbebd2dccd52be41eb005c0b87481132e62ab6c80b98c503`，路径 `distribution/site/public/releases/rdv-order-1.0.0.apk`，最低 Android 8/API 26。

仅新增文案缺失检查、网页类型检查、`:app:lintRelease :app:assembleRelease`、签名/版本/对齐/哈希及下载页清单一致性检查；均通过。复用本批 109 项网页测试、48 项 JVM、3 项隔离模拟器流程，不重复全套测试。未做本版现场打印或酒店设备验收，不宣称零 crash。部署证据与提交见 `release-1.0.0.md`。

## 速度与稳定性批次（2026-09-08，本地未发布）

管理页独立请求并行；菜单、桌台、账单和管理响应在后台解析；点餐复用菜单索引与数量映射；草稿命名空间使用按 token/origin 隔离的不可变缓存，原有先持久化、账号归属及幂等恢复不变。补齐此前界面批次 `RdvTextButton.enabled` 参数。

5 份资源目录、48 项 JVM 测试、lint（0 errors / 22 warnings）和 debug 构建通过。隔离 API-35 模拟器 `emulator-5554` 上仅运行 3 项相关用例：做法/数量/语言、管理模块、未知提交结果恢复，均通过，全部使用内存 fixture，不接真实打印机。内部 APK：`android/app/build/outputs/apk/debug/app-debug.apk`，`com.rdv.order.test`，0.1.6-internal/code 7，最低 API 26。不替代正式包；未发布、未 commit/push。酒店设备耗时、长期 crash/ANR、现场打印仍待验证。详见 `performance-2026-09-08.md`。

## 0.1.6 系统语言更新详情（2026-09-08）

- Android 桌面图标继续使用用户提供的点餐 APP 高清图稿，按 Android launcher 各密度尺寸缩小；下载页使用的原始 PNG 与该图稿 SHA-256 一致，现有 WebP 是同一图稿缩小版本。
- 正式包升级为 0.1.6 / versionCode 7：`distribution/site/public/releases/rdv-order-0.1.6.apk`，1,559,425 字节，SHA-256 `7c19ed43b358deefc1cde7b9440fc46c3733c976c1cee719ff9bbe22aaabb283`。强制更新页完全跟随设备系统语言，不提供语言切换；发布脚本强制每版填写对应的中英文更新内容。
- 按用户明确指示，本次仅构建和发布，不重复运行测试、设备安装或下载校验；复用 0.1.3 更新机制的已通过基线。下载站部署自身会检查 APK、清单和链接一致性。

## 已确定

- 用户进一步明确：迁移对象就是本目录已有、专为其自有酒店开发的点餐软件。仅服务这一家酒店；不存在多门店产品、选店/切店、租户接入或商业分发规划。“门店”是前述沟通中的泛化用词，后续以酒店现有软件、后台和设备为准。
- 2026-09-07：用户同意按原生 Kotlin / Compose 路线实施，最终交付可安装 APK；用户负责现场协调。授权编写测试/文档、复查并分 scope commit。
- 代码基线 `ee66a93`。14 个页面路由，41 个 API 路由文件。
- 页面补充核实：经理登录进入订单页；服务员进入桌台。历史 cashier/ops 页面实际重定向收入页，不能按旧文档额外发明两套界面。
- 实施遵循当前源码的布局和规则。旧截图只能辅助参考，不能盖过当前页面实现。
- 网页端 `npm run verify` 已通过：类型检查、57 项测试、生产构建。

## 待用户/现场核实

| ID | 决策/证据 | 推荐与影响 | 状态 |
| --- | --- | --- | --- |
| D1 | 创建当前 Vercel 项目及根网址 | 已明确过去使用过，但当前没有部署；先修复/提交，再推送与创建 GitHub 关联项目 | 代码和配置已准备，尚未 push/部署 |
| D2 | 目标设备型号与 Android 版本 | 暂以 Android 8.0/API 26 作为工程起点；确认设备后可调整 | 已询问 |
| D3 | 使用与交付范围 | 自有酒店使用，交付可安装 APK；无需另做门店分发或商店上架决策 | 已明确 |
| D4 | 打印 worker、provider、机型及实际份数 | 保留服务端链路；本地模拟测试不能证明纸单输出 | 待现场核实 |
| D5 | 线上自动费用与权限实际行为 | 用同一营业样例比对，不在迁移中更改规则 | 待线上基线 |

## 验证边界

- 新增只读 `/api/orders/request-status`，用于超时后确认本账号原请求；已添加 10 项服务端测试。现有写单、打印、费用接口未修改。更新后的网页 `npm run verify` 通过（67 项测试及构建）。

本地测试使用模拟服务/数据；生产数据库、营业账号和打印机尚未测试。发布前需用户完成或协助确认实际连接、桌台和金额、纸单及设备使用体验。

APK 的内部构建和完整生产替换分别记录；不能用部分页面已编译通过替代完整功能验收。

## 原生内部包（2026-09-07）

- 工程：`android/`，Kotlin / Compose；包括登录、桌台、点菜、备注/海鲜、购物车、提交/账单/打印/退菜/结账，以及订单、收入/CSV、费用、热销、设备、权限和菜单管理。管理写操作已实现，尚未逐项完成真实后端 CRUD 验收。
- APK：`artifacts/android/rdv-order-0.1.0-internal.apk`，`com.rdv.order.test`，versionCode 1 / `0.1.0-internal`，最低 API 26，target/compile API 36。调试签名，首次配置受控 HTTPS 测试地址。没有填写生产地址、生产账号、数据库/打印密钥或生产签名。
- 提交保护：先持久化原始请求和幂等键，未知结果保留草稿并用原键恢复；按门店、账号、桌台与开台时间隔离。服务端新增只读恢复查询，旧后端 404 回退原键 POST。
- 共享资源从网页生成，5 份目录的 `--check` 已通过。JDK 17、Gradle 8.13（校验和固定）、AGP 8.11.1、Kotlin 2.1.20、Compose BOM 2025.04.01；本机工具在 ignored `.tools/`，不依赖提交绝对 SDK 路径。
- 正式包构建必须提供根网址和本地签名配置；缺任一项的拒绝行为已分别验证。正式 R8/signing 构建和覆盖升级仍待正式配置及实机验收，未标为通过。

### 已执行检查

| 检查 | 结果/证据 |
| --- | --- |
| `npm run verify` | 类型、67 项测试（20 文件）、Next.js 生产构建通过；`.tools/downloads/web-final-verify.log` |
| `ANDROID_SERIAL=emulator-5556 scripts/android/verify.sh --device` | 29 项 JVM 测试 + 12 项设备测试通过，APK 构建和 lint 通过；`.tools/downloads/android-verified.log` |
| Android lint | 无错误；保留工具链/库的新版本提醒，未为了消除提醒盲目换版本 |
| 脚本与资源 | 3 份 shell 脚本语法检查、5 份共享资源一致性检查通过 |
| APK 包验证 | `apksigner verify`、16KB ZIP 对齐检查、包名/版本/最低系统核对；报告在 `artifacts/android/` |

设备测试在专用本地 Android 15 / API 35 ARM64 AVD 执行，使用测试包内的隔离数据。12 项包含登录/开台/提交/账单/打印请求/结账、丢失回执恢复、海鲜、中英切换、两角色管理入口、五个管理页加载、离开重入草稿、备注返回保存、设备自检/清队列确认、截图以及两项真实 Keystore 检查。

### Double check 修复

- Android 8.0 不支持的浅色导航栏属性移到 `values-v27`。
- HTTP 响应体读取放入 IO 线程并确保取消时关闭响应。
- 新一轮开台不能重用上一轮未知提交的幂等身份。
- 批量菜单保存中途失败时保留填写值供继续保存。
- 经理订单动作与当前状态/展开条件对齐；设备页保留主/备通道、worker/heartbeat 配置状态、吧台路由与告警；收起健康检查不隐藏自检/清队列。
- 顶部标题居中；低高度窗口允许点菜内容滚动，同时保留底部购物车/提交，修复横屏挤掉菜品的问题。测试由仅触发点击加强为先确认按钮真实可见。

### 后续决策与验收

D3 已明确为自有酒店安装 APK；D1 已改为核对原 Vercel 部署与本地版本差异；D2、D4、D5 的实际连接/设备/运行证据仍需补齐。完整工作顺序在 `android-acceptance.md`：部署同一后台的受控测试环境→逐项业务与界面对照→真实打印/并发/弱网/导出→目标设备及升级→正式签名 APK。保留原网页入口；本阶段没有生产部署、营业测试单或真实打印。

本机安装记录：一次 Gradle install 未指定 serial，将内部包也装到了另一台已有本地 AVD `RDV_API35_ARM64`；随后所有运行、截图、显示设置均明确指定专用 `emulator-5556`。没有清空另一台 AVD 的数据，也没有向其发送测试业务请求。

## 交付复核

- 实现 commit：`53c69fa`；恢复 API：`c1966d2`；初始计划/约束：`b8c2885`。后续文档提交不改变 APK 源码。
- APK 大小 18,857,275 字节；SHA-256：`a9f40b1d3678ed29b6f73ace115bca4a1769186fd0e0322ec534491f08e24e94`。此指纹只对应本次内部构建，后续重新构建不假定相同。
- 最终 APK 已在专用 API 35 模拟器安装并冷启动到真实连接设置页，启动 `Status: ok`。未填写门店地址，没有绕过真实启动页放入演示数据。
- 补充运行同一个截图流程三次：1080×2400 / 420dpi 默认字体；720×1280 / 320dpi / 1.3 字体；1280×720 / 320dpi 横屏。三次均通过并检查实际显示截图。每次包含登录、桌台、点菜、购物车及中文点菜，共 15 张截图；修改的模拟器尺寸/密度/字体已恢复。
- 截图覆盖本地典型窗口，不等于目标机型全覆盖。小屏大字体标题可省略，桌号/人数仍在页面完整显示；横屏内容可滚动，底部操作可见。
- 最终截图测试改为捕获完整 Android 显示，并等待系统弹窗动画结束，避免只截图 Compose 主窗口而漏掉弹层。该测试源码最后调整后重新编译、lint 通过，三种窗口专项均重新通过。

已归档的隔离测试截图（不是门店数据）：[桌台](android-assets/tables-phone.png)、[点菜](android-assets/order-phone.png)、[小屏大字体购物车](android-assets/cart-small-large-font.png)、[横屏滚动后的点菜](android-assets/order-landscape.png)。完整截图和安装/签名报告在本机 `artifacts/android/`；可按 `android/README.md` 在新环境重现。

## 0.1.1 内部包复查（2026-09-07）

- 修复延迟保存草稿在切换账号后可能写入新账号空间的问题：入队时固定原账号的保存位置，回归测试在 B 登录后执行 A 的待保存操作并确认隔离。
- 401 会先完成草稿保存、停止页面加载，再清除旧账号的草稿/账单/管理页面内存并返回登录。同账号重新登录仍可恢复本地草稿。登录同时重置短时重复提交提示状态。
- `ANDROID_SERIAL=emulator-5556 scripts/android/verify.sh --device` 通过：30 项 JVM、13 项 API 35 设备测试、lint 和构建；日志 `.tools/downloads/android-session-final.log`。网页基线 `npm run verify` 67 项及构建通过，日志 `.tools/downloads/web-session-verify.log`。
- 新 APK：`artifacts/android/rdv-order-0.1.1-internal.apk`，versionCode 2，包名仍为 `com.rdv.order.test`，最低 Android 8.0。打包脚本从构建元数据读取版本，避免更新后仍输出旧版本文件名。
- SHA-256：`3d56a691b9b4d5e4cc14dee14735c7e11f22ea5b10d86ecb76759e409f00328e`。签名、16KB ZIP 对齐检查通过；已明确指定专用模拟器安装，真实 MainActivity 冷启动 `Status: ok`。本轮没有验证正式签名覆盖升级。
- 上文 0.1.0 的指纹和测试数字保留为历史记录；当前交付采用 0.1.1。本轮修复不代表尚未部署的后台和实际纸单已经联通。

## 云端部署准备历史（2026-09-07，后续更正见下）

- 用户明确当前是本地 WebApp，认为尚未 push/部署；随后选择云端运行。未继续假设已有酒店网址。Git remote 与远程 DB/XPYUN 变量存在不等于上线或连通。
- 新增独立 `npm run worker:print` 调度现有 API，单次取 1 个任务、串行等待、错误退避、鉴权失败退出、停止时等待当前请求。服务端下单/计价/打印 provider 写逻辑未改。
- `npm run verify` 通过：76 项测试（21 文件）、类型检查与生产构建；其中新增 9 项调度测试。日志 `.tools/downloads/cloud-dispatch-verify.log`。`check:print-env` 使用显式假配置通过，未调用真实打印服务。
- 部署拓扑、配置归属、候选平台费用、隔离联调、真实打印启用与回退步骤见 `hotel-first-deployment.md`。本轮没有 push、开通服务、迁移数据库、真实打印或云端部署。

## Vercel 使用事实与迁移边界更正（2026-09-07）

- 用户明确已有 Vercel Hobby 账号，原软件曾部署并正常使用，下单后自动打印；失败队列有大家熟悉的清除按钮。此前“没有任何部署”“必须增加常驻打印服务”的推断撤回。当前线上版本是否与本地一致，仍需核对。
- 本地历史证据：`d89d3ec` 在订单提交后等待一次 `runPrintWorker(1)`；`0b704d8` 改为后台触发；`ee66a93` 移除了调用。这解释了当前源码与历史行为可能不同，不能据此否定用户的实际使用经验。
- 网页与安卓都保留 `DELETE /api/print/queue` 的确认操作。按现有接口，它清除 pending/printing/failed 任务。没有执行清队列或实际打印。
- 可选调度脚本未启用，不再列为迁移必需服务；本轮只修正文档和项目记忆，没有改写自动打印逻辑，也不把缺失的触发当作已修好。下一步先核对原可用版本，补齐自动打印的回归证据。
- 不替用户对项目性质下结论，不把未经请求的平台条款或法律判断作为要求升级、换平台的依据。项目用途及与平台的沟通由用户决定。

- 本次文档更正后 `npm run verify` 再次通过：76 项测试、类型检查与生产构建；日志 `.tools/downloads/vercel-baseline-correction-verify.log`。安卓源码与 APK 未变，沿用上轮验证。

## 自动打印恢复与 Vercel 发布准备（2026-09-07）

- 用户再次明确：当前没有部署，只有 Vercel 账号；过去的软件使用经验用于行为基线。先完成代码、检查和一个提交，再创建 GitHub 关联的 Vercel 项目。
- 新订单保存后通过 Next.js `after()` 调用只领取当前订单的 worker；旧失败队列不占用本次新单机会。同键重试不再次触发；显式关闭 PRINT_WAKE_ON_ORDER 仍只保存队列。失败、手动重试和清队列的现有流程保留。
- 新增 10 项下单路由回归、8 项 PostgreSQL WASM 集成测试，执行仓库 schema（仅省略测试不需要的 pgcrypto 扩展加载）及真实路由/worker SQL。打印 provider 与认证被替换为隔离测试实现，after 回调由测试控制执行。不是 Vercel 生命周期、真实网络纸单或多连接并发验收。
- 为部署更新 Next.js 15.5.25，保持主版本；Vitest 3.2.7、PostCSS 8.5.28 override、sharp/nanoid 锁文件补丁用于消除本次实际审计发现。PostCSS override 覆盖 Next.js 15 固定的旧依赖；删除此覆盖前需确认上游修复并回归构建。
- `vercel.json` 将类型/测试/生产构建设为每次部署的构建命令，Node 22.x；文档明确当前分支与 GitHub 推送/Production Branch 的关系。没有创建项目、push、营业数据库操作或真实打印；无需启动此前可选常驻脚本。
- 干净 `npm ci --include=dev` 后完整 `npm run verify` 通过：94 项测试（22 文件）、类型检查与 Next.js 15.5.25 生产构建；`npm audit` 全依赖 0 已知漏洞。日志为 `.tools/downloads/vercel-clean-install.log`、`vercel-final-verify.log`、`vercel-final-audit.json`。
- `npm run check:print-env` 显式假配置通过；不等于酒店配置验证。安卓源码及 APK 未变，沿用 30 项 JVM、13 项 API 35 设备验证；实际后台及纸单仍待部署后核验。


## Vercel 上线与长期签名 APK（2026-09-07，最新状态）

此前“没有当前部署/未推送/没有生产签名”的记录均为当时状态，现已完成：Vercel `rdv-order` 正式上线，GitHub `main` 自动部署，现有环境变量已配齐。正式根网址 https://rdv-order-renfei-zhaos-projects.vercel.app ，首个自动部署提交 `9919baf`，云端 94 项测试及构建通过。

已制作 `artifacts/android/release/rdv-order-0.1.1.apk`，长期签名 `com.rdv.order`，versionCode 2，预置正式根网址；R8、release lint、验签、ZIP 对齐和秘密值扫描通过。真实签名包在专用 API 35 模拟器完成服务员登录和正式后台 11 个桌台加载，同版本覆盖重装后冷启动保留登录态。后者不是递增版本或跨系统升级测试。

17 项线上只读 HTTP 检查覆盖两个角色登录、桌台、菜单、管理查询、权限拦截及打印健康。沿用的 Android 本地回归为 30 JVM + 13 设备测试。本机网络检查使用已有 HTTPS CONNECT 代理，未关闭 TLS 校验；不能代替酒店实际网络测试。原 108 条 pending 没有改动，没有发送真实打印或营业写操作。

签名私有备份在 `/Users/qiao/Documents/rdv-order-signing`。APK 指纹、验证日志、更新步骤和仍未通过的现场项目见 [交付记录](deployment-delivery.md)。D1 后台地址和长期签名已解决；实际设备/网络、纸单及完整 CRUD/并发/导出验收保持待核验。


## 0.1.2 登录超时修复（最新）

用户实际安装后报告登录超时。优先复现旧 .vercel.app 地址直连超时，后台绑定 `https://order.resortdejavu.cn` 后，7 项真实 API 直连检查通过。正式 APK 更新到 0.1.2 / versionCode 3，同签名覆盖安装；专用 API 35 模拟器无代理升级后保留旧登录态，加载全部 11 个实际桌台。JVM 33 项（新增 3 项域名升级存储隔离测试）、设备 13 项、Web 94 项及发布构建/lint 通过。下载页改为新版，详见 [修复记录](android-custom-domain-fix.md)。旧 0.1.1 的代理验证不再作为实际网络可用证据；用户手机需安装新版复验。
# 2026-09-08 — 0.1.3 应用内更新

本轮在冷启动入口加入独立更新模块，生产代码约 300 行，无新增运行依赖、后台服务或业务 API。每个正式新版强制更新；首次检查失败放行、已确认要求持久化；下载重试、系统安装权限/取消、包大小/哈希/包名/版本/证书验证均保留更新门槛。详见 `android-in-app-updates.md`。

- 正式签名 APK：`distribution/site/public/releases/rdv-order-0.1.3.apk`；`com.rdv.order`，0.1.3 / code 4，Android 8.0+（min 26 / target 36），R8 release，1,521,277 字节。SHA-256：`f798cebfbd5b96b8c57aaf634c16e0ad2676dc3bea0751ed266557d39b1ed264`。证书与公开 0.1.2 相同，16 KiB ZIP 对齐通过。
- `npm run verify`：94 项网页测试、类型检查和生产构建通过；未修改网页业务源码、DB、订单或打印逻辑。
- Android：44 项 JVM 测试（新增更新 11 项），debug/release lint、debug/release 构建通过。`ANDROID_SERIAL=emulator-5580 npm run android:verify -- --device`：15 项 API-35 设备测试通过；包括 2 项更新 UI 测试。
- `ANDROID_SERIAL=emulator-5580 bash scripts/android/test-release.sh`：另 2 项真实签名 APK 设备测试通过，验证 0.1.2 → 0.1.3 包身份/哈希，以及错误版本/包名/证书拒绝和 FileProvider 的可读范围。
- `npm run android:stage-release` 和下载站构建校验通过；重复发布被拒绝，清单不变，旧版本未覆盖。模拟器专用低版本更新测试包位于忽略的 `.tools/update-fixture-build/`，与原始 0.1.2 不同（包含当前更新器），不得发布或混称原始 0.1.2 已支持更新。
- 酒店实际设备网络、厂商安装器、物理打印和原有业务验收仍需现场确认；本轮未发送业务订单、未操作历史打印队列。

### 本轮公开交付与安装验证

- 实现提交 `9458b59`，公开包提交 `b664514`；均已推送 main。Vercel `rdv-downloads`、`rdv-order` 对 `b664514` 都返回 success。
- 无代理直接 HTTPS 获取公开 `release.json` 和版本 APK 成功，下载文件 SHA-256 与上述本地包一致；固定 `/rdv-order.apk` 返回 200、正确大小/MIME、`no-store`；后台首页返回 200。
- `UpdateLiveInstallTest` 在隔离 `emulator-5580`（API 35）最终通过 1 项完整系统操作测试：发现真实线上 0.1.3、首次下载及校验、拒绝安装来源授权后重试、允许授权、取消系统安装后重试、确认覆盖安装、重新打开进入原有桌台页面。APK 首次经网络下载，后续测试重试复用并重新校验完整缓存；不是每次重试都重新下载。设备包信息确认为 code 4 / 0.1.3，原登录态保留。模拟器系统代理设置为 null。
- 系统操作测试初轮失败原因是测试读取 Compose 无障碍节点/页面过渡时的失效节点及残留 Settings 任务；修改测试为遍历节点、等待稳定后重新定位、以干净 Activity 任务启动后通过，未改变或替换已经公开的 APK。
- 更新 UI 的 2 项测试另外在 640×360、160 dpi、1.3 倍字体下复测通过；按钮实际可见并可操作，完成后恢复模拟器尺寸/字体。整个本轮共 44 JVM、18 个不同设备用例，另有 2 项横屏复测；设备证据不扩大为 Android 8 实机或所有厂商安装器通过。
- 全显示屏截图：`docs/android-assets/updates/required.png`、`installer.png`、`installed.png`；`compact-landscape.png` 是 UI 测试中的虚拟 0.1.4 文案，不是线上新版本。重新打开的本地截图在 `artifacts/android/update-reopened.png`，没有将营业数据加入 Git。
