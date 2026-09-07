# 酒店点餐软件部署与 APK 交付记录

日期：2026-09-07。迁移对象仍是本目录的同一个酒店点餐系统；网页与原生 Android 使用同一后台、账号、数据库和打印配置。

## 已完成

- 正式网页/API：[打开点餐软件](https://rdv-order-renfei-zhaos-projects.vercel.app)。登录页在根路径 `/`，不是 `/login`。
- Vercel 项目 `rdv-order`，位于用户现有 `renfei-zhaos-projects` 账号范围。关联 GitHub `zevs1120/rdv-order`，Production Branch 为 `main`；首次自动部署 `9919baf91fb097f19b37544bd993a140fe7c80b2` 已 Ready，部署 ID `dpl_6xXhPpFbV2nLv9oKoY2EL43kUVvi`。原来 10 个本地提交完整保留并推送，没有重建提交或强制覆盖远端。
- 运行配置：Next.js、Node 22.x、根目录、`sin1` 新加坡；`npm ci --include=dev` → `npm run verify`。首次 Vercel 构建实际通过 22 文件 / 94 项测试及生产构建。
- 正式稳定域名可直接访问，再由原账号/PIN 验证业务权限。Vercel 标准保护保留在部署专属/预览地址；Preview 暂停且没有营业凭据。
- 原 PostgreSQL 库已只读连接核对，保留现有表和数据；没有初始化、seed、迁移或清库。原 108 条 pending 打印记录仍在。
- 长期签名 APK：`artifacts/android/release/rdv-order-0.1.1.apk`。包名 `com.rdv.order`，版本 `0.1.1` / versionCode 2，最低 Android 8.0（API 26），target/compile 36。预置上面的正式根网址，安装后直接到原账号登录页，无需填后台地址。

## 环境变量

以下 15 项已配置在 Vercel **Production**，使用 sensitive secret 保存；只记录名字，不记录真实值：

`DATABASE_URL`、`JWT_SECRET`、`PRINT_PROVIDER`、`XPYUN_API_URL`、`XPYUN_USER`、`XPYUN_USER_KEY`、`XPYUN_SN`、`XPYUN_COPIES`、`XPYUN_VOICE`、`XPYUN_FONT_TAG`、`PRINT_FORCE_SINGLE_COPY`、`PRINT_WORKER_KEY`、`DEVICE_HEARTBEAT_KEY`、`ORDER_DEDUPE_WINDOW_SECONDS`、`PRINT_WAKE_ON_ORDER`。

沿用本地现有值，provider 为 xpyun，自动打印开关为 true。传输通过 CLI 标准输入，值不放在命令参数、日志、Git 或 APK。Vercel link 写入的本机 OIDC token 仍在忽略的本地文件，没有作为业务变量上传。后续修改服务端变量后需重新部署；无需为这些变量重做 APK。

## 验证证据

| 检查 | 结果及边界 |
| --- | --- |
| Web 本地与 Vercel 构建 | 类型检查、94 项测试、Next.js 生产构建通过；含 8 项实际 SQL/PGlite 隔离订单打印测试 |
| 真实线上只读检查 | 17 项通过：根登录页、菜单；经理/服务员实际登录及桌台；订单、收入、热销、菜单管理、费用规则、权限、设备、打印健康；未登录 401、服务员权限管理 403 |
| 打印健康 | `ready=true`、provider=xpyun、pending=108、failed=0；此接口验证配置/队列，不向打印商提交纸单 |
| Android 既有回归 | 30 JVM + 13 API 35 设备测试；这些使用隔离 Transport，证据沿用未变的原生源码基线 |
| 正式发布构建 | `assembleRelease` + `lintRelease` 通过，R8 与资源压缩生效 |
| APK 安全及格式 | RSA 4096 长期签名、v2 验签通过、16KB ZIP 对齐通过；解包后检查未包含现有数据库/JWT/打印/worker/heartbeat 秘密值 |
| 真正签名包联机 | 专用 API 35 模拟器 `emulator-5556` 安装、冷启动、实际服务员登录，并从正式后台加载 11 个桌台成功；没有注入演示数据；同版本重装保留会话，非跨版本升级测试 |

线上检查日志为 `.tools/downloads/production-smoke.json`，云端构建日志为 `.tools/downloads/vercel-first-build.log`；正式 APK 验签、对齐、包信息、只读桌台截图在 `artifacts/android/release/`。这些本机证据未提交到公开仓库。

本机直连该 Vercel 域名时 DNS 返回不相关地址并连接超时；使用电脑原有 HTTPS CONNECT 代理后，线上/API/模拟器联机验证通过。TLS 校验始终保留，APK 没有嵌入代理或绕过证书。此结果不证明酒店实际 Wi-Fi/移动网络一定可达，安装验收时需要在真实网络打开同一网址。

## APK 与签名保管

- APK 大小：1,504,361 字节。
- APK SHA-256：`352d4cd072009b1236cefd922c83b37ec8de9a667647f681879a6effbfca837f`。
- 签名证书 SHA-256：`d35fe1dfa1cc59bd107e2fadea722cda491337008367c53819bae4a1f407f8ad`。
- 本机私有备份目录：`/Users/qiao/Documents/rdv-order-signing`。其中 `.jks` 和 `keystore.properties` 一起用于后续升级；文件权限 600，目录 700。需要在换电脑或重装前由用户保存到安全备份位置；本机副本不是异地备份。
- `android/keystore.properties` 指向该密钥，均被 Git 忽略。不要删除/更换密钥，也不要把密码、密钥上传 GitHub/Vercel 或写入 APK。
- 内部包 `com.rdv.order.test` 可与正式包并存，登录态/草稿不互迁。后续正式版本递增 versionCode 并使用同一密钥覆盖安装。

重建命令（密钥从本机 properties 读取，不写在命令里）：

```bash
scripts/android/gradle.sh :app:assembleRelease :app:lintRelease \
  -PrdvApiBaseUrl=https://rdv-order-renfei-zhaos-projects.vercel.app
```

## 后续更新

修改 → `npm run verify`（原生源码修改还需 Android 验证）→ commit → 推送 `main` → 查看 Vercel 自动构建 Ready，并核对提交 SHA。数据库/网页/API 变更通过此链路发布；原生界面或逻辑修改仍需重新构建并安装升级 APK。

本机 Git CLI 当前无可用推送凭据，GitHub connector 的写树权限返回 403；已登录的 **GitHub Desktop** 可以正常推送。选择 `rdv-order` → `main` → Push origin 即可。CLI fetch/远端 SHA 核对可用；无需改变仓库可见性或权限来部署。

## 尚未标为通过

- 酒店实际安卓型号、系统版本及实际网络。
- 受控订单的真实厨房纸单/收据、备注、份数与金额；本次没有发送真实打印或营业写操作，也没有清除历史队列。
- 全部管理 CRUD、CSV 系统保存、并发/断网/杀进程及跨版本升级的现场对照。具体步骤保留在 [Android 验收清单](android-acceptance.md)。

后端上线和可安装 APK 已完成，不能据此将上面的实际纸单与全面业务验收记成通过。继续沿用原重试/清队列按钮，可选 dispatcher 未启动。
