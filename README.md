# QuizMe

QuizMe 是一个本地 CLI MVP，用于将 Claude Code 会话上下文、仓库上下文或用户输入主题转化为短小的面试风格选择题。

## 文档

- [产品文档](docs/product.md)
- [技术文档](docs/technical.md)

## 使用方式

```bash
node ./src/cli/index.js
node ./src/cli/index.js --repo .
node ./src/cli/index.js --session ~/.claude/projects/.../abc.jsonl
node ./src/cli/index.js "React rendering and caching"
node ./src/cli/index.js stats
node ./src/cli/index.js profile
node ./src/cli/index.js settings --language zh-CN --level senior --daily-goal 8
node ./src/cli/index.js review
node ./src/cli/index.js inspect-sources
```

## 说明

- 默认模式会从 `~/.claude/projects` 读取当前仓库最近的 Claude Code transcript。
- 可以通过 `--session /absolute/path/to/file.jsonl` 固定读取某个 transcript。
- 本地数据存储在平台 app data 目录中，并使用 `sqlite3`。
- 在受限环境中，存储会 fallback 到 `./.quizme`。也可以通过 `QUIZME_DATA_DIR=/path/to/data` 覆盖数据目录。
- 题目生成和 `why` 模式会调用本地 `claude` CLI 的 print mode。
- 离线 demo 可使用 `QUIZME_PROVIDER=local`。如果希望优先使用 Claude、失败后 fallback 到本地 provider，可使用 `QUIZME_PROVIDER_FALLBACK=local`。
