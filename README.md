# QuizMe

QuizMe 是一个本地 CLI MVP，用于将 Claude Code 会话上下文、仓库上下文或用户输入主题转化为短小的面试风格选择题。

## 文档

- [产品文档](docs/product.md)
- [技术文档](docs/technical.md)

## 安装

```bash
npm install -g @jiy/quizme
```

无需全局安装也可直接用 `npx`：

```bash
npx @jiy/quizme
```

## 前置条件

题目生成和 `why` 模式会调用本机的 **Claude Code CLI**（`claude` 命令）。请确保已安装并位于 `PATH`：

```bash
claude --version   # 能输出版本号即可
```

未安装可运行 `npm install -g @anthropic-ai/claude-code`，或参考 [Claude Code 文档](https://docs.anthropic.com/claude-code)。

> 无 `claude` 时仍可离线体验：`QUIZME_PROVIDER=local`。

## 使用方式

```bash
quizme
quizme --repo .
quizme "React rendering and caching"
```

## 说明

- 默认模式会从 `~/.claude/projects` 读取当前仓库最近的 Claude Code transcript。统计、档案、设置、复习等功能通过交互式主界面进入。
- 本地数据存储在平台 app data 目录中，并使用 `sqlite3`。
- 在受限环境中，存储会 fallback 到 `./.quizme`。也可以通过 `QUIZME_DATA_DIR=/path/to/data` 覆盖数据目录。
- 题目生成和 `why` 模式会调用本地 `claude` CLI 的 print mode（`--bare` + `--tools ""`，禁用 agent tool；上下文已写入 prompt）。
- 离线 demo 可使用 `QUIZME_PROVIDER=local`。如果希望优先使用 Claude、失败后 fallback 到本地 provider，可使用 `QUIZME_PROVIDER_FALLBACK=local`。
