# APK 下载网站

员工入口：https://download.resortdejavu.cn 。页面保持一屏，用胶囊切换“点餐软件”和“员工应用”。点餐页只显示应用名称、图标、下载按钮和版本信息；员工应用尚未发布，仅显示“制作中”，没有安装包或虚构功能。保留中英文切换，不展示功能介绍、登录说明、设备免责声明或安装步骤。

## 部署结构

- Vercel 项目：`rdv-downloads`，现有账号 `renfei-zhaos-projects`。
- GitHub：`zevs1120/rdv-order`，Production Branch `main`，Root Directory `distribution/site`。
- 静态输出：`public`；不安装依赖，构建执行 `node verify.mjs`。无数据库、JWT 或打印环境变量。
- 网页根路径 `/`；版本安装包 `/releases/rdv-order-0.1.6.apk`；固定最新包入口 `/rdv-order.apk`；机器可读版本 `/release.json`。
- Vercel 为该子域名提供 HTTPS。原点餐后台、酒店官网及邮件记录不变；APK 自 0.1.2 起使用后台子域名。

DNSPod 新增 `download` CNAME → `12f9a96e363566ac.vercel-dns-017.com`（TTL 600）；另新增 `_vercel` TXT 完成这个子域名的所有权验证。保留原有全部记录，不转移根域名、不替换官网。

## 当前安装包

`0.1.6` / versionCode 7，`com.rdv.order`，Android 8.0+，1,559,425 字节（1.49 MiB）。SHA-256：`7c19ed43b358deefc1cde7b9440fc46c3733c976c1cee719ff9bbe22aaabb283`。沿用原签名，直接覆盖安装；旧版本保留但不再是默认下载。

版本文件使用不可变缓存；最新入口和 release.json 不缓存。APK 使用 Android 安装包 MIME 与 attachment 响应头。JavaScript 禁用时仍可直接下载英文点餐 APK，并有员工应用制作中提示；语言与应用切换是渐进增强。没有第三方脚本、字体或统计。品牌标识从酒店官网本地素材缩小为 WebP，页面资源总计约 22 KB（不含 APK）；未改变文件托管或跨境下载链路。

## 更新 APK

1. 使用既有长期签名、增加 versionCode，并按改动范围完成必要构建与验证。
2. 新增不同版本文件到 `distribution/site/public/releases/`，保留旧版本；不直接覆盖既有版本文件。
3. 更新 `release.json` 的版本、路径、大小、SHA-256；更新 HTML 的按钮路径/版本/大小/最低系统、vercel.json 中固定入口的目标。不得把签名密钥或密码放入该目录。
4. 下载站部署会执行静态文件、哈希和链接一致性检查；按 `CONTRIBUTING.md` 复用未变代码的通过结果，不重复运行无关检查。
5. commit 并通过 GitHub Desktop 推送 main，确认下载项目部署 Ready；下载线上文件，重新比较 SHA-256 与签名。改动原生代码仍须另外制作和安装新版 APK；仅 push 不会自动编译 Android。

## 检查与边界

- 最新单屏页面：1280×720、390×844、320×640，中英文 × 两个应用共 12 个组合，无横向/纵向溢出；点餐 APK 链接正确，员工占位不提供下载。真实浏览器检查方向键环绕、Home/End、焦点、语言切换保持应用选择，控制台无错误。截图和检查数据保存在 `artifacts/download-page/`（本机证据，不提交）。
- 原服务端 `npm run verify` 94 项测试及构建通过；下载构建检查文件 SHA/大小/元信息/按钮与固定入口一致性。
- 原 APK 的实际登录/桌台、签名/R8 检查见 [交付记录](deployment-delivery.md)。网站发布不代替酒店网络、实际设备及出纸验收。

## 0.1.6 系统语言更新详情（2026-09-08）

当前下载为 0.1.6 / versionCode 7，1,559,425 字节；SHA-256 `7c19ed43b358deefc1cde7b9440fc46c3733c976c1cee719ff9bbe22aaabb283`。更新页完全跟随 Android 系统语言，不再提供语言切换；本版显示“更新内容跟随系统语言 / Update details now follow the system language.”。以后每一版都必须填入中英文更新内容；小更新使用简洁概括，大功能再补充具体变更。详见 [应用内更新](android-in-app-updates.md)。
