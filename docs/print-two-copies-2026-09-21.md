# 下单两联与打印误报修正（2026-09-21）

## 明确问题和修复

用户现在确认重启后厨房单可以打印，但下单缺少前台联，同时出现失败/Request Timeout。此次以新现场事实为准，不继续以昨日“完全无纸”推断整台设备始终离线。

历史提交 77de5cf 曾先发厨房再发前台；92e378c 已删去前台发送，0271a10 又将下单价格剔除、固定厨房payload。当前用户明确要求下单两联，取代该历史单联规则。恢复前台生成函数调用，并保留单项实际价格。厨房仍不显示价格；手动账单仍为全桌聚合含费用账单，不将其混同于本次订单前台联。

两联拼接为同一云任务一次提交，copies=1，保留两联间原有进纸空白；重试沿用同一任务编号和完整两联内容。不能用copies=2打印两张厨房联，也不能让第二个独立HTTP失败导致前台联漏交。厂商单任务12K限制依旧存在，超长内容不删行、不自动拆分重打；本轮不承诺任意长度票据。

7779d05将1013去重回执直接计失败，可能造成纸已出却显示失败；此次撤回该处理。1013表示厂家识别了同一请求，不重复发送，不增加设备失败；无法取得原云订单号时不能伪造完成确认。保留其它明确鉴权/离线错误、同键重试边界和未知结果防重。

增加真实云订单完成查询：厨房在订单响应之后的worker执行，账单/自检在Next after执行。官方 queryOrderState 的true/false分别记录completed/pending，查询失败或无订单号记录unknown。最多三次、间隔5秒；绝不由确认失败触发打印重发。审计动作print.delivery、source=queryOrderState、physicalPaperVerified=false，不把厂家报告当作人工实物验收。后台打印调用仍只承诺接受，不等待这段确认，避免把确认耗时增加到手机请求。

## 手机超时边界

已定位原生RdvViewModel.submit：提交返回后清空篮子，再读取账单；账单读取失败进入通用fail，所以已下单/已打印也会出现通用Request Timeout。原生RdvRepository只在下一次人工重试复用key时查询request-status，首次POST超时不会立即只读确认。此处要彻底区分保存成功和刷新失败，需要APP修改。已向用户确认此前“不打包APP”的约束是否解除；未答复前不擅自发布APK。不能声称后台两联修复已经改变安装包里的异常处理。

## 验证与交付

52项针对测试通过：两联一次发送且前台价格正确、丢回执后的整任务同键重试、去重不报设备故障、完成查询只查原ID不重发、pending/unknown不假报completed、原订单/账单接口回归。完整验证与部署状态待交付补充。

不改布局/数据库结构、不回退菜单或其它业务、不清历史队列、不额外发送现场测试纸；保留并排除用户其他未提交文件（尤其Staff下载站更新）。

官方依据：https://www.xpyun.net/open/ 。云确认不能实现超出厂家协议的物理出纸证明；没有回执时保持未知。


## Final scope update

User authorized the APP release, superseding the pending question above. Native/web initial ambiguous submission now performs read-only recovery by the original key, without POST replay. Saved-order bill refresh failure is identified separately. 195 Web tests, TypeScript/build, 65 JVM tests, release lint/build, three API35 order flows and two signed-package checks passed. See release-1.1.4.md.
