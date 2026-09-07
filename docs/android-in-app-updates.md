# Android 应用内更新

## 已确定的产品规则

- 可靠耐用优先，随后是速度、轻量；UI 延续现有原生组件。
- 正式 APP 每个进程冷启动检查一次；旋转屏幕、切到后台再回来、从安装设置返回均不重复检查。不在营业操作中轮询或弹出更新。
- 每个更高 `versionCode` 的正式版本均强制更新，无跳过入口。已开着的旧 APP 等下次冷启动检查。
- 版本检查最多等待 2.5 秒。无法确认新版时允许进入；已确认的新版保存在本机，下次断网或收到旧清单也不能绕过。升级到要求的版本后清除该记录。
- 下载需点击，显示进度；校验通过后唤起 Android 安装界面。首次需要允许该 APP 安装软件；拒绝权限、取消安装均停留在更新页，可重试。
- 检查和下载不带登录信息；不新增第三方 SDK、后台服务或常驻任务。更新期间不初始化点餐界面，不额外改动草稿机制。
- 菜价属于后台数据，不因价格调整而发布 APK。网页/原生业务改动必须同步评估、实现和验证；原生代码不会由网页代码自动生成。

## 实现边界

`android/app/src/main/java/com/rdv/order/update/` 独立管理清单、下载、状态、系统安装和页面。入口在 `MainActivity`，控制器归属 `RdvApplication`，跨 Activity 重建保持状态。内部 debug 包跳过生产更新；测试直接覆盖更新组件和状态机。

使用既有 `https://download.resortdejavu.cn/release.json`，仅接受固定格式 `/releases/rdv-order-x.y.z.apk`。清单最大 16 KiB、APK 最大 50 MiB，禁止下载重定向。下载在 IO 线程流式写入私有缓存，读超时 20 秒、整包超时 5 分钟；失败删除半包，重试可以复用重新校验通过的完整包，不实现断点续传。

安装前检查大小、SHA-256、包名、递增版本号、版本名、最低 Android 和已安装应用的签名。FileProvider 仅开放 `cache/updates/`。系统负责最终安装确认和安装签名验证。更新下载不包含数据库、打印或登录凭据。

## 发布

1. 同时评估网页和原生的业务改动；服务端保持与营业中的旧客户端兼容。
2. 增加 `android/app/build.gradle.kts` 中的版本名和 `versionCode`，运行网页/Android 验证。
3. 使用既有本机签名和固定正式后台构建：

   ```sh
   scripts/android/gradle.sh :app:lintRelease :app:assembleRelease -PrdvApiBaseUrl=https://order.resortdejavu.cn
   npm run android:stage-release
   node distribution/site/verify.mjs
   ANDROID_SERIAL=<isolated-emulator> bash scripts/android/test-release.sh
   ```

4. `android:stage-release` 验证实际 APK 的包名、版本、API 基线、签名与上一公开版本一致、ZIP 对齐及大小；拒绝覆盖历史版本。同步生成版本清单、下载页版本/大小/文件名和稳定入口。
5. APK、清单和页面在同一提交/同一次下载站部署发布，完成直接 HTTPS 清单与 APK 校验后再通知员工。每次提交代码不必发布 APK。

第一次从 0.1.2 安装 0.1.3 仍需从下载站手动覆盖安装；0.1.3 起才具备应用内更新。已经确认的强制更新不能通过降低线上清单解除；若发布出现问题，应发布更高版本的修复包。

## 验证记录

本轮最终测试、签名包校验、完整安装操作和公开部署证据将在交付时记录于 `android-progress.md`。本地测试不代表酒店设备或物理打印验收。
