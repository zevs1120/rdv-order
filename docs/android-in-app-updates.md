# Android 应用内更新

## 已确定的产品规则

- 可靠耐用优先，随后是速度、轻量；UI 延续现有原生组件。
- 正式 APP 每个进程冷启动检查一次；旋转屏幕、切到后台再回来、从安装设置返回均不重复检查。不在营业操作中轮询或弹出更新。
- 「设置 → 更新管理」每次主动进入时检查一次（旋转不重复）；最新版按钮显示“已是最新发布版本”并禁用，只有确认有新版本时可用。失败显示无法确认，不误报最新版；重新进入可重查。检查不卸载当前页面，发现新版后仍进入已有强制更新页。内部 debug 包仅显示内部版本，不请求公开更新。
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

### 待下一批发布：差量更新（2026-09-08，源码尚未运行验证）

- 下载站的版本链接和稳定 `/rdv-order.apk` 始终指向完整、原签名 APK。APP 可选用清单的 `deltas` 字段；旧客户端忽略该字段，继续完整下载。已安装 1.0.0 需要先完整升级到具备差量能力的版本。
- 暂存脚本从上一公开版本的精确 APK 生成 `rdv-copy-add-v1` 补丁：复制未变化的字节片段，附加变化内容，再 gzip 压缩。手机只下载补丁，在私有缓存内重建原始签名 APK，不修改已安装 APK，不执行补丁内容；没有新增 Android 依赖或 ABI 原生库。
- 基础包版本及 SHA-256 必须匹配；补丁大小、SHA-256、格式头、读写范围和最终完整包均校验，仍经过既有包名/版本/签名检查及系统安装确认。输出上限 50 MiB，最多 100 万条指令，支持协程取消。
- 连续升级且补丁至少节省 10% 时发布差量。跳过基础版本、基础包不匹配、差量失败或节省不足时回退完整包，不能保证每次仅下载新增源码的大小。清单只维护上一公开版本的直接补丁，不增加多段补丁链。
- 暂存和下载站构建会还原补丁并逐字节对比完整 APK；完整包、补丁、清单需同批发布，历史文件不覆盖。当前没有生成补丁、修改公开版本或执行这些检查。
- 下批发布前只补针对性证据：Node/Kotlin 补丁互通及损坏/越界拒绝、全包回退、安装保留登录与草稿、更新管理不循环检查；不重跑无关全站流程。实际补丁大小与节省比例届时记录，当前不声明通过或提速数字。

参考：Android 官方关于 [差量更新与 APK 压缩的说明](https://android-developers.googleblog.com/2016/12/saving-data-reducing-the-size-of-app-updates-by-65-percent.html)、[应用更新身份与签名要求](https://developer.android.com/google/play/app-updates)。这里采用轻量 COPY/ADD 格式，不宣称达到 Google Play 的压缩率。

1. 同时评估网页和原生的业务改动；服务端保持与营业中的旧客户端兼容。
2. 增加 `android/app/build.gradle.kts` 中的版本名和 `versionCode`，按 `CONTRIBUTING.md` 只运行本次改动相关的验证；网页未变化时复用已有通过结果，不重复跑网页全套。
3. 为用户写一条简洁中英文更新内容。小更新使用概括句，例如“修复已知问题，优化使用体验。”；只有大功能才列出具体内容。使用既有本机签名和固定正式后台构建：

   ```sh
   scripts/android/gradle.sh :app:lintRelease :app:assembleRelease -PrdvApiBaseUrl=https://order.resortdejavu.cn
   npm run android:stage-release -- --zh "修复已知问题，优化使用体验。" --en "Bug fixes and experience improvements."
   node distribution/site/verify.mjs
   ```

4. `android:stage-release` 要求每次填写中英文更新内容，并验证实际 APK 的包名、版本、API 基线、签名与上一公开版本一致、ZIP 对齐及大小；拒绝覆盖历史版本。同步生成版本清单、下载页版本/大小/文件名和稳定入口。APP 强制更新页完全跟随设备系统语言展示，不提供单独的语言切换。
5. APK、清单和页面在同一提交/同一次下载站部署发布，完成直接 HTTPS 清单与 APK 校验后再通知员工。每次提交代码不必发布 APK。

签名包身份测试和完整系统安装测试已经为更新机制建立基线；以后仅在更新器、签名、安装权限、存储迁移等相关机制变化或有明确故障时重跑。普通小功能更新不自动重复整套安装、网页和多尺寸设备测试；仅改文档不重新验证 APP。一次交付集中推送，相关检查通过后即交付。

第一次从 0.1.2 安装 0.1.3 仍需从下载站手动覆盖安装；0.1.3 起才具备应用内更新。已经确认的强制更新不能通过降低线上清单解除；若发布出现问题，应发布更高版本的修复包。

## 验证记录

本轮最终测试、签名包校验、完整安装操作和公开部署证据记录于 `android-progress.md`。本地测试不代表酒店设备或物理打印验收。

可选系统安装测试 `UpdateLiveInstallTest` 仅在明确传入 `-e liveUpdate true` 时运行，并会在隔离模拟器上重设此应用的安装来源授权、执行系统安装操作。先用当前代码构建低版本测试包（code 3，包含更新器，绝不是原始公开 0.1.2）：

```sh
scripts/android/gradle.sh :app:assembleRelease -PrdvApiBaseUrl=https://order.resortdejavu.cn -I ../scripts/android/update-fixture.init.gradle
adb -s <isolated-emulator> install -r .tools/update-fixture-build/outputs/apk/release/app-release.apk
scripts/android/gradle.sh :app:assembleDebug :app:assembleDebugAndroidTest
adb -s <isolated-emulator> install -r android/app/build/outputs/apk/debug/app-debug.apk
adb -s <isolated-emulator> install -r android/app/build/outputs/apk/androidTest/debug/app-debug-androidTest.apk
adb -s <isolated-emulator> shell am force-stop com.rdv.order
adb -s <isolated-emulator> shell am instrument -w -e liveUpdate true -e class com.rdv.order.UpdateLiveInstallTest com.rdv.order.test.test/androidx.test.runner.AndroidJUnitRunner
```

仅使用未安装更高版本的专用模拟器；不要卸载或降级营业设备来跑测试。测试包输出在忽略的 `.tools/`，正常正式构建及公开包路径不受影响。首次网络下载和后续完整包复用分别验证；测试截图通过 UiAutomation 捕获整个显示屏，包含系统安装弹窗。
