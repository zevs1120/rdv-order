# RDV 原生 Android

Kotlin / Jetpack Compose 客户端，沿用现有 HTTPS API、账号、数据库及服务端打印。没有 WebView，模拟菜单和测试账号只存在于测试代码。当前同时提供绑定正式后台的长期签名 `0.1.6` APK 和独立内部测试包；酒店全面替换仍需通过 [验收清单](../docs/android-acceptance.md)。

0.1.3 起支持冷启动强制更新，见 [更新机制与发布流程](../docs/android-in-app-updates.md)。

## 构建与安装

需要 JDK 17、Android SDK Platform 36、Build Tools 35.0.0、Platform Tools、Node.js 及 `npm ci` 安装的开发依赖。Gradle 8.13 wrapper 已固定下载校验和。首次构建需访问 Google Maven / Maven Central / Gradle 分发站点。

设置 `JAVA_HOME`、`ANDROID_HOME`；Android Studio 也可打开此目录并使用 JDK 17 / SDK。本地 `local.properties`、`.tools/` 和缓存不提交。脚本也可自动使用仓库下已有的 `.tools/zulu/Contents/Home` 与 `.tools/android-sdk`。

仓库根目录：

```bash
npm ci
npm run android:resources -- --check
npm run android:verify
npm run android:apk
```

输出 `artifacts/android/rdv-order-0.1.6-internal.apk`，附 SHA-256、签名、ZIP 对齐及包元数据报告。最低 Android 8.0 / API 26，target / compile API 36。最低版本通过静态检查，尚未覆盖所有系统实机。

内部包包名 `com.rdv.order.test`，使用开发调试签名。默认未绑定后台，首次填受控测试环境的 **HTTPS 根网址**，不附 `/order`、参数或账号密码。更换地址目前需清除此测试应用的数据，会同时删除本地草稿，必须先处理草稿。正式包预置地址，不展示连接设置。

## 测试

```bash
# serial 必须是实际专用测试设备；不要指向营业设备
ANDROID_SERIAL=emulator-5556 npm run android:verify -- --device
```

脚本检查共享资源是否落后于网页，运行 JVM 测试、lint、构建；`--device` 另运行 Compose 操作及真实 Android Keystore 测试。报告在 `app/build/reports/`。Android 操作测试采用 `androidTest/` 内的隔离 Transport，不发送营业订单/打印任务。HTTP MockWebServer 和 UI 模拟测试分别验证，不等于真实部署端到端联调。

截图测试 `NativeFlowTest#captureNativeScreensForReview` 将 PNG 写到测试应用 `files/android-evidence/`。Gradle 测试后会卸载包；需要取图时构建 debug / androidTest APK，再明确指定设备分别安装并执行：

```bash
adb -s <serial> install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s <serial> install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s <serial> shell am instrument -w -e class com.rdv.order.NativeFlowTest#captureNativeScreensForReview com.rdv.order.test.test/androidx.test.runner.AndroidJUnitRunner
adb -s <serial> exec-out run-as com.rdv.order.test cat files/android-evidence/order-en.png > order-en.png
```

## 正式发布

正式包名 `com.rdv.order`，与内部包可并存。覆盖升级递增 `versionCode`，使用原签名密钥。内部/正式包的登录态、草稿不会自动互迁。正式构建必须提供 HTTPS 根网址及本地 `android/keystore.properties`，否则拒绝 release 构建。

```properties
storeFile=/absolute/path/to/store-release.jks
storePassword=LOCAL_SECRET
keyAlias=rdv-order
keyPassword=LOCAL_SECRET
```

```bash
scripts/android/gradle.sh :app:lintRelease :app:assembleRelease -PrdvApiBaseUrl=https://order.resortdejavu.cn
npm run android:stage-release
node distribution/site/verify.mjs
```

正式 APK 已构建为 `distribution/site/public/releases/rdv-order-0.1.6.apk`，绑定 `https://order.resortdejavu.cn`，沿用长期签名。图标使用点餐 APP 的统一高清图标；下载页和桌面图标复用同一原始图稿。强制更新页会按手机系统语言显示每个版本的更新内容。长期签名及配置的私有本机备份位于 `/Users/qiao/Documents/rdv-order-signing`，不在 Git/Vercel/APK 中。后续升级必须沿用该密钥、增加 versionCode；换电脑前应安全备份。详见 [交付记录](../docs/deployment-delivery.md)。

## 结构与行为

- `data/`：API、认证、序列化、草稿/待确认请求、AES-GCM Android Keystore 存储。
- `domain/`：整数金额、海鲜计量/做法、备注、提交指纹、网页日期/导出时区规则。
- `ui/`：登录、桌台、点菜及七个管理模块；金额、角色/权限仍由服务端验证。
- `scripts/android/sync-resources.mjs`：从网页 TypeScript 字面量生成中英文案、菜单翻译、错误翻译、权限描述和菜单默认项；`--check` 防止漂移。
- 不统一重试写请求，不做离线自动下单。待确认提交持久化原载荷及幂等键；手动重试先查只读 `/api/orders/request-status`，旧后端 404 时使用原键 POST。未修改服务端写单/打印链。
- 草稿按服务端、账号、桌台及开台时间隔离，进程重建后重入同桌可恢复。浏览器草稿不会迁移。菜单缓存 14 天，缓存可见不代表可以离线完成业务。
- token 和草稿加密，PIN 不落盘；禁止明文 HTTP、自动跨站重定向和应用数据备份。无数据库/打印服务密钥。
- CSV 使用系统文件保存器；系统返回、软键盘、日期选择器属于安卓适配。逐项对照进度见 [实施记录](../docs/android-progress.md)。

## 0.1.2 后台域名升级

正式 API 使用 `https://order.resortdejavu.cn`，versionCode 3，沿用原签名覆盖安装。repository 仅为这两个已验证的同一后台域名复用原本地存储命名空间，保留 0.1.1 登录态、菜单缓存、草稿和待确认提交。HTTP 始终使用新地址，不回退到旧域名，不自动重新发送订单。其他网址与账号仍保持隔离。新增 3 项存储迁移回归；详见 [修复记录](../docs/android-custom-domain-fix.md)。
