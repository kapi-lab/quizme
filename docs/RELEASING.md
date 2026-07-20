# 发版指南

本项目发布为 npm 包 [`@kapi-lab/quizme`](https://www.npmjs.com/package/@kapi-lab/quizme)，通过 GitHub Actions（`.github/workflows/publish.yml`）自动发布，使用 npm Trusted Publishing（OIDC），无需配置任何 npm token。

## 发布通道

| 通道 | 触发方式 | dist-tag | 版本号示例 |
| --- | --- | --- | --- |
| Beta | push 到 `main`（改动 `src/**`、`package.json`、`tsconfig.build.json`） | `beta` | `0.2.1-beta.202607200326.abc1234` |
| 正式版 | 手动触发 workflow | `latest` | `0.2.1` |

## Beta 发布（自动）

合并/推送到 `main` 后自动执行，无需人工操作：

1. CI 运行 typecheck、测试、构建；
2. 基于当前版本号自动生成临时 beta 版本（patch +1 加 `-beta.<时间戳>.<短 SHA>` 后缀），**不写回 git**；
3. 以 `beta` dist-tag 发布，不影响 `latest`。

用户安装 beta 版：

```bash
npm install -g @kapi-lab/quizme@beta
```

## 正式版发布（手动）

1. 打开 GitHub 仓库 → **Actions** → **Publish** workflow；
2. 点击 **Run workflow**，选择版本递增类型：
   - `patch`：bug 修复（0.2.0 → 0.2.1）
   - `minor`：新功能（0.2.0 → 0.3.0）
   - `major`：破坏性变更（0.2.0 → 1.0.0）
3. CI 会自动完成：
   - typecheck、测试、构建；
   - `npm version <bump>` 生成版本提交 `chore(release): vX.Y.Z` 和 `vX.Y.Z` tag；
   - 发布到 npm（`latest`）；
   - 推送版本提交与 tag 回 `main`；
   - 自动创建 GitHub Release（自动生成 Release Notes）。
4. 发布后本地执行 `git pull` 同步 CI 产生的版本提交。

发布前建议更新 `CHANGELOG.md`，先合并到 `main` 再触发发布。

## 前置条件

- **npm Trusted Publisher**（一次性配置）：在 npm 包设置页
  <https://www.npmjs.com/package/@kapi-lab/quizme/access> 添加 GitHub Actions 发布者：
  - Organization/user：`kapi-lab`
  - Repository：`quizme`
  - Workflow filename：`publish.yml`
  - Environment：留空

  未配置时 CI 的 publish 步骤会报 403/404，配置后在 Actions 页面 re-run 即可。
- 每个包只能绑定**一个** workflow 文件，因此 beta 与正式版共用 `publish.yml`。
- 正式版发布需要 workflow 有权限推送 `main`：若开启了分支保护，需允许 GitHub Actions bypass，否则推送版本提交会失败。

## 故障排查

- **publish 步骤 403/404**：Trusted Publisher 未配置或 workflow 文件名不匹配（必须是 `publish.yml`）。
- **`npm version` 报错 dirty working tree**：CI 中不应出现；本地手动发版时请先提交所有改动。
- **推送 `main` 被拒**：检查分支保护规则。
- **beta 版本排序异常**：beta 版本号基于「下一个 patch 版本」生成（如 `0.2.1-beta.*` 高于已发布的 `0.2.0`），这是预期设计，勿改为当前版本号加后缀。

## 历史包

旧包 `@jiy/quizme` 已废弃（deprecated），提示信息引导用户迁移到 `@kapi-lab/quizme`，不再更新。
