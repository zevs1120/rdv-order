# Team 2.1.13 下载与覆盖安装修复

用户明确要求 App 内更新与独立下载页均以实际安装成功验收。本次把Team下载清单、版本化完整APK和稳定入口统一至2.1.13/code26，3,374,420字节，SHA-256 061a9c31f432735c32ca266bef344128ae668da2c79abf394e01b1f590cfc8a2，与Team原签名APK逐字节一致。

此前正式下载页仍是code23，低于已发布Team的code25。新增不依赖JS和版本请求的HTML下载入口，稳定链接提供明确版本文件名；保持原设计、Order下载和业务服务。verify.mjs已通过，原签名与实际App内覆盖安装由Team工作树验证。

已正式发布：下载站源码7ce8224，部署dpl_3QLtKeXYqy5xhQkEAVgF5Psjyodc为READY且已切production，指向读回通过。Team更新API配套部署dpl_EYFftGnd7MJv85hAWGpiZqaAAH7C。两个公网完整APK均为3,374,420字节，与本地原签名包逐字节一致；公开staff-release.json为26，稳定链接提供APK MIME、no-store和rdv-team-2.1.13.apk文件名。公网390px禁用JavaScript浏览器实际确认Team下载链接可见。

Android15隔离只读AVD使用Chrome从正式下载页点击下载，完成下载后打开APK→Chrome来源授权→Android系统Update确认→系统显示App installed。读取实际安装版本为2.1.13/code26，原2.1.12/code25的fallback-marker仍为fallback-data-preserved；新App可正常启动至登录页。浏览器下载文件完整SHA-256与正式包一致。被测升级未使用adb install；adb只用于隔离起始包准备和结果读取。没有真实员工登录或经营数据操作，也未把模拟器通过说成未知机型真机验收。

未push，Order APK、清单和业务后端未变。
