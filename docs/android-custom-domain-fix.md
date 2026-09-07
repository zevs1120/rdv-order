# Android 0.1.2：修复后台地址导致的登录超时

2026-09-07 用户已安装 0.1.1，但登录出现“请求超时，检查网络或重试”。优先按用户判断核对访问域名。

## 诊断和改动

- 旧 `https://rdv-order-renfei-zhaos-projects.vercel.app` 本机直接请求 8 秒超时，HTTP=000。之前通过代理完成的检查不能证明用户实际网络能用；不能据此声称旧版已解决大陆登录问题。
- 新后台入口为 https://order.resortdejavu.cn ，绑定同一个 Vercel `rdv-order` 生产项目。DNSPod 新增 `order` CNAME → `81e45b5d1d1b183d.vercel-dns-017.com`，TTL 600；新增针对 order 的 `_vercel` TXT 验证，保留原有记录。
- 新域名本机无代理直接 HTTPS 返回 200，约 2.46 秒；同一路径的实际经理/服务员登录分别约 0.54 / 1.45 秒，桌台、菜单及打印健康正常。结果支持旧域名的网络可达性是首要问题，不代表所有地区/运营商永久可达。
- 0.1.2 / versionCode 3 的 HTTP origin 改为 `https://order.resortdejavu.cn`；TLS 正常校验，不设代理、不关闭证书验证，不回退旧 Vercel 地址，不改变业务 API 或打印逻辑。
- 只绑定域名不会改变已安装 APK 的内置地址，因此必须安装这次新版。

## 升级与存储

同包名 `com.rdv.order`、同 RSA 签名，覆盖安装 0.1.1。只针对两个已核验的同一酒店后台域名，存储键继续使用原 namespace；登录态、菜单缓存、草稿、待确认请求幂等键可继续读取。不同账号/其他域名继续隔离；发送请求用新域名，不自动重放订单。

新增三项 JVM 回归验证：旧会话/草稿/缓存保留；未知下单回执跨升级保留原键/请求并通过新 transport 恢复；其他域名和账号不可读取这些数据。其他核心回归仍保留。

## 安装包

- 下载页：https://download.resortdejavu.cn ，默认下载更新为 0.1.2。
- 固定安装包入口：https://download.resortdejavu.cn/rdv-order.apk 。
- 版本文件：`distribution/site/public/releases/rdv-order-0.1.2.apk`，1,504,361 字节。
- SHA-256：`1e014e6525f8294bf8708e3766fe4bce2ac35ed61189a3c46d1c6084c4affbb6`。
- 签名证书 SHA-256：`d35fe1dfa1cc59bd107e2fadea722cda491337008367c53819bae4a1f407f8ad`（与 0.1.1 相同）。
- 旧版本文件保留且未覆盖；不要把它作为修复版本发给员工。

```bash
scripts/android/gradle.sh :app:testDebugUnitTest :app:lintRelease :app:assembleRelease \
  -PrdvApiBaseUrl=https://order.resortdejavu.cn
```

## 证据

- JVM 33 项（其中新增 3 项），release lint、R8 构建、签名和 ZIP 对齐检查通过。
- 新域名无代理真实 API 7 项检查通过，记录 `artifacts/android/release/custom-domain-api-checks.json`；打印配置 ready，108 条历史 pending 未改动。
- API 35 设备 13 项测试通过；在专用模拟器未配置代理的情况下，0.1.1 → 0.1.2 覆盖安装及冷启动成功，旧登录态保留并加载实际桌台。
- 本地 APK/设备验证、公开下载校验见 `artifacts/android/release/0.1.2/`；设备/网页测试日志在 `.tools/downloads/custom-domain-*`。

酒店实际手机需要重新下载并覆盖安装 0.1.2 后再登录验证。不要卸载旧版、清空本地草稿，也不要为验证登录而发送营业订单或清打印队列。
