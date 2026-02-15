# Commit Checklist

## 代码提交前必须完成

- 确认 `.env.local` 不在 Git 变更中。
- 确认 `db/seed.sql` 不包含生产真实账号与 PIN。
- 执行 `npm install`（首次）。
- 执行 `npm run build`，确保可构建。
- 如修改 DB schema，同时更新 `db/schema.sql` 与说明文档。
- 如修改菜单模型，同时提供对应 `db/migrations/*.sql` 升级脚本。
- 如新增 API，同时更新 `/Users/qiao/Downloads/rdv-order/docs/api.md`。
- 如改动下单/桌台流程，验证并发与弱网重试场景（避免重复下单/重复开台）。

## 提交建议

- 提交信息格式：`type(scope): summary`
- 本项目初始化建议：`chore(init): bootstrap rdv order mvp`

## 提交后建议检查

- 在 GitHub Desktop 确认改动文件清单无异常。
- 推送后在部署平台校验环境变量完整。
