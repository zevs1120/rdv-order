# 酒店点餐软件：Vercel 首次部署与 GitHub 自动部署

## 当前事实

用户已有 Vercel Hobby 账号，软件以前在 Vercel 上使用过且能够下单自动打印；**当前这份软件没有部署**。先完成代码和提交，再创建项目。不要继续要求用户提供当前不存在的网址，也不要将过去用过等同于现在已上线。

继续迁移本目录的同一个酒店点餐软件，保留主要界面、业务规则及清队列操作。平台使用关系由用户处理，不把未经请求的项目性质判断转化为升级或换平台要求。原生 APK 连接这套 Next.js 后台，数据库和打印密钥留在服务端。

## 本次打印修复

历史 `d89d3ec` 在下单后执行打印；`0b704d8` 改为后台唤醒；`ee66a93` 移除了调用。本次恢复新订单的自动打印，用 Next.js `after()` 将工作放在响应后，并保留 Vercel 函数的执行生命周期。员工收到保存成功响应后可以继续操作，不等待纸单完成。

- 下单与队列仍在同一 SQL 语句中保存；只有新建成功的订单注册打印任务，同一幂等键重试不会再注册或补建被清掉的队列。
- 自动触发只领取本次订单的任务，旧 pending/failed 队列不会抢占新单的打印机会。原手动重试仍按全队列与原重试间隔处理。
- `PRINT_WAKE_ON_ORDER` 默认开启；显式设为 `false` 时仍保存订单/队列，但不自动打印。
- 失败仍保留原队列记录和错误；设备页的重试及清队列按钮不变。清队列范围仍为 pending/printing/failed。
- 下单路由使用 Node runtime，`maxDuration=120`。`after()` 是平台生命周期内的执行安排，不是永久任务服务；极端中断或打印服务回执不确定时仍需原有队列处理与纸单核对。

[Next.js 15 after 文档](https://nextjs.org/docs/15/app/api-reference/functions/after)说明了响应后的执行与时长限制。没有增加常驻服务或 Cron 要求；此前可选的 `worker:print` 脚本不启用。

## 创建 Vercel 项目之前

1. 将已检查的提交推送到 GitHub。当前开发分支是 `codex/android-native`，仓库 remote 为 `zevs1120/rdv-order`；本轮只做本地提交，未 push、未合并到 `main`。
2. 推荐将确认过的版本合并并推送到 `main`，再将它设为 Production Branch。若首次要直接部署当前分支，必须明确将 Production Branch 设为 `codex/android-native`。不要让 Vercel 默认部署仍未包含修复的旧 `main`。
3. 核实数据库结构及现有数据。现有库不要重新执行 `db/seed.sql` 或清库；本次打印修复不新增表，也不要求数据库迁移。初次创建空库另按数据库初始化说明操作。
4. 在 Vercel 的环境变量页面配置下面的服务端变量，不在聊天、GitHub 或 APK 中填写真实密钥。

## Vercel 导入设置

从 Vercel 的新建项目入口导入该 GitHub 仓库，授权 Vercel 访问这个仓库。设置如下：

| 项目 | 设置 |
| --- | --- |
| Framework Preset | Next.js |
| Root Directory | 仓库根目录（`.`），不是 `android/` |
| Node.js | 22.x，由 `package.json` 固定主版本 |
| Install Command | `npm ci --include=dev` |
| Build Command | `npm run verify`，先类型检查和测试，再执行 Next 构建 |
| Output Directory | 保留 Next.js 默认值 |
| Production Branch | 与 GitHub 上已包含本次提交的目标分支一致 |

安装和构建命令已写入 `vercel.json`；默认不要在控制台改成跳过验证的命令。PGlite 只用于构建时的内存数据库测试，不替换正式 PostgreSQL。构建失败不会把该次失败构建发布成新版本；首次失败时没有旧生产版本可供回退。

### 环境变量

| 变量 | 用途 / 设置 |
| --- | --- |
| `DATABASE_URL` | 后台所用 PostgreSQL 连接 |
| `JWT_SECRET` | 现有账号认证所用服务端秘密 |
| `PRINT_PROVIDER` | 按原实际打印服务选择；现有本地配置包含 XPYUN 字段，配置存在不代表已联通 |
| `XPYUN_USER`, `XPYUN_USER_KEY`, `XPYUN_SN`, `XPYUN_API_URL` | 使用 XPYUN 时沿用对应账号、密钥、机号与接口地址 |
| `PRINT_CLOUD_URL`, `PRINT_CLOUD_API_KEY` | 仅 cloud provider 使用 |
| `PRINT_AGENT_URL`, `PRINT_AGENT_TOKEN` | 仅 agent provider 使用；云端须实际可访问该地址 |
| `PRINT_WAKE_ON_ORDER` | 正式下单自动打印设 `true`；如原来不存在，默认就是开启 |
| `PRINT_FORCE_SINGLE_COPY` 及原份数/路由配置 | 沿用原工作设置，不擅自变更纸单份数 |
| `PRINT_WORKER_KEY` | 只在服务端保存，供外部 dispatch 鉴权及现有配置检查；APP 无需这个密钥 |
| 其他已有重试、超时和心跳变量 | 按 `.env.example` 与 `printer-deploy.md` 核对实际使用的项 |

Production 和 Preview 分别配置。Preview 使用隔离数据库和假打印服务；如果尚未准备隔离环境，不向 Preview 复制营业数据库与打印凭据。仅关闭自动打印开关不会阻止手动打印或其他业务写操作，因此不能替代数据隔离。环境变量更新后需重新部署才用于新的运行实例。

## 以后 push 如何自动部署

Vercel 项目关联 GitHub 后：推送/合并到 Production Branch 会触发生产构建部署；其他分支通常产生 Preview。无需每次重新导入项目。部署页面应显示与 GitHub 对应的提交和成功状态。具体说明：[Vercel Git 集成](https://vercel.com/docs/git)、[GitHub 集成](https://vercel.com/docs/git/vercel-for-github)、[项目构建配置](https://vercel.com/docs/project-configuration/vercel-json)。

首次导入时若修复尚未 push 到 GitHub，本地 commit 不会自动出现在 Vercel。创建项目、关联仓库、配置变量、确认分支完成后，自动部署链路才建立。Vercel 构建检查只验证代码，数据库和纸单的实际可用性仍要按下面步骤验收。

## 首次部署后的验收与回退

1. 记录部署提交、HTTPS 根网址和环境。先检查登录、菜单、桌台和权限，再连接内部 APK；不把登录页能打开当作业务完成。
2. 用受控测试单验证普通菜、海鲜备注、金额、下单自动厨房打印、手动收据打印；核对实际纸单、队列状态和份数。
3. 验证重复点击/同键重试、断网恢复、失败后重试以及原清队列操作。不可确定纸单结果时先核对，不盲目重新下单。
4. 完成 `android-acceptance.md` 中管理 CRUD、CSV、目标设备和升级验收；之后固定正式根网址并制作长期签名 APK。
5. 首次上线前没有当前可回退的线上版本；上线后记录可用部署与数据库备份。回退代码必须与数据库版本兼容，数据库恢复另按备份执行。网页与 APK 共用后台，保留网页不是独立后台容灾。

下一步：将本次本地提交推送到选定的 GitHub 分支，然后按本文导入 Vercel 项目。
