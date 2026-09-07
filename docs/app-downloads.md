# APK 下载网站

员工入口：https://download.resortdejavu.cn 。下载页面不需要登录；安装 RDV Order 后，仍使用原员工账号/PIN。页面提供中英文安装步骤和版本/系统要求。

## 部署结构

- Vercel 项目：`rdv-downloads`，现有账号 `renfei-zhaos-projects`。
- GitHub：`zevs1120/rdv-order`，Production Branch `main`，Root Directory `distribution/site`。
- 静态输出：`public`；不安装依赖，构建执行 `node verify.mjs`。无数据库、JWT 或打印环境变量。
- 网页根路径 `/`；版本安装包 `/releases/rdv-order-0.1.2.apk`；固定最新包入口 `/rdv-order.apk`；机器可读版本 `/release.json`。
- Vercel 为该子域名提供 HTTPS。原点餐后台、酒店官网及邮件记录不变；APK 自 0.1.2 起使用后台子域名。

DNSPod 新增 `download` CNAME → `12f9a96e363566ac.vercel-dns-017.com`（TTL 600）；另新增 `_vercel` TXT 完成这个子域名的所有权验证。保留原有全部记录，不转移根域名、不替换官网。

## 当前安装包

`0.1.2` / versionCode 3，`com.rdv.order`，Android 8.0+，1,504,361 字节（1.44 MiB）。SHA-256：`1e014e6525f8294bf8708e3766fe4bce2ac35ed61189a3c46d1c6084c4affbb6`。0.1.2 使用后台自定义域名 `https://order.resortdejavu.cn`，修复旧 Vercel 地址在用户网络登录超时的问题。沿用原签名，直接覆盖安装；旧 0.1.1 文件仍保留但不再是默认下载。

版本文件使用不可变缓存；最新入口和 release.json 不缓存。APK 使用 Android 安装包 MIME 与 attachment 响应头。页面可在 JavaScript 禁用时直接下载英文版本；语言切换是渐进增强。没有第三方脚本、字体或统计。

## 更新 APK

1. 使用既有长期签名、增加 versionCode，完成 Android 构建/测试和验签。
2. 新增不同版本文件到 `distribution/site/public/releases/`，保留旧版本；不直接覆盖既有版本文件。
3. 更新 `release.json` 的版本、路径、大小、SHA-256；更新 HTML 的按钮路径/版本/大小/最低系统、vercel.json 中固定入口的目标。不得把签名密钥或密码放入该目录。
4. 执行 `node distribution/site/verify.mjs` 和 `npm run verify`。静态校验发现文件/哈希/链接不一致时会阻止构建。
5. commit 并通过 GitHub Desktop 推送 main，确认下载项目部署 Ready；下载线上文件，重新比较 SHA-256 与签名。改动原生代码仍须另外制作和安装新版 APK；仅 push 不会自动编译 Android。

## 检查与边界

- 本地桌面 1280、手机 390、小屏 320 像素，中英文 6 个组合：无横向溢出/脚本错误，下载按钮首屏可见；截图在 `artifacts/android/release/download-*`。
- 原服务端 `npm run verify` 94 项测试及构建通过；下载构建检查文件 SHA/大小/元信息/按钮与固定入口一致性。
- 原 APK 的实际登录/桌台、签名/R8 检查见 [交付记录](deployment-delivery.md)。网站发布不代替酒店网络、实际设备及出纸验收。
