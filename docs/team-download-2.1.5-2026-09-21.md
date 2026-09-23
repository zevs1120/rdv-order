# RDV Team 2.1.5 下载页同步（2026-09-21）

用户明确要求将最新软件上传既有下载页。复用已在 Team 应用内发布的原签名 2.1.5（18）完整 APK，未重新打包。

- 下载站项目：rdv-downloads；正式域名：https://download.resortdejavu.cn
- 正式部署：dpl_369SMydudU4E7fybjFC2TnQiEr9U，READY，正式域名已绑定。
- 更新 public/staff-release.json、版本化 APK 及 /rdv-team.apk rewrite。
- APK：3,087,120 字节；SHA-256：26d1eb35d3cc72e9f32837d39d82b5f48c2479e210eefa1c78630bf2ad4cfba7。
- 版本发布日期保留 2026-09-20；下载站同步于 2026-09-21。
- 本地静态 verify.mjs 通过；线上 Team 原包完整下载哈希匹配；正式下载站元数据确认 2.1.5/code18。Order 线上元数据与原文件一致。
- 仅独立静态下载站快照部署；未部署 Team/API、Concierge 或 Order 业务服务，未做数据库修改、APK 构建、Git 提交或 push。
- 首次从站点子目录调用 CLI 因项目 rootDirectory 为 distribution/site 而失败；保留正确目录层级的隔离快照重发成功，未修改项目设置。

正式下载站 /rdv-team.apk 完整下载完成，字节数、SHA-256 及逐字节比较与 Team 应用内原包完全一致。

## 后续覆盖修复

首次仅 CLI 发布，未将三项 Team 下载文件提交到远端，导致 14:53 Git 发布 dpl_5JrouWcdf4FntVSzvMrFVDnGcbZm 恢复了旧版 Team 2.1.2。现将仅三项下载文件提交 e112626 并通过 GitHub Desktop 推送 main，远端与本地一致。Git 自动发布 rdv-downloads-pudblydar-renfei-zhaos-projects.vercel.app READY。Safari 正式页面实际核验：Team v2.1.5，下载按钮为 /releases/rdv-team-2.1.5.apk；Order v1.1.4，按钮为 /releases/rdv-order-1.1.4.apk。两个产品版本独立，未修改 Order 安装包或业务源码。
