# QuizMe

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@jiy/quizme?logo=npm&label=npm)](https://www.npmjs.com/package/@jiy/quizme)
[![npm downloads](https://img.shields.io/npm/dm/@jiy/quizme?label=downloads)](https://www.npmjs.com/package/@jiy/quizme)
[![node](https://img.shields.io/node/v/@jiy/quizme?logo=node.js&label=node)](https://www.npmjs.com/package/@jiy/quizme)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![GitHub](https://img.shields.io/badge/source-github-black?logo=github)](https://github.com/kapi-lab/quizme)

QuizMe 是一个本地优先的 CLI MVP，将 Claude Code 会话上下文、仓库上下文或用户输入的主题转化为短小的面试风格选择题。

## 工作原理

```
 Claude Code 会话记录     仓库上下文           用户输入主题
 (~/.claude/projects)      (--repo .)           ("React ...")
            │                     │                     │
            └──────────┬──────────┴──────────┬──────────┘
                       ▼                     ▼
                 Sources ──────────► SourceSummary
                       │
                       ▼
          Generation · prompts + schema + validator + dedupe
                       │  将上下文写入 prompt
                       ▼
            ClaudeAgent ─► `claude` CLI  (print 模式: --bare --tools "")
                       │  返回结构化 JSON 题目
                       ▼
            Storage (quizme.json，原子写: temp+rename)
                       │  统计 · 画像 · 待复习队列
                       ▼
            Ink TUI  ──►  答题  ──►  `why` 模式（答错后深度讲解，
                                      通过 claude 生成）
```

QuizMe **不直接**调用 Anthropic API，而是以 print 模式调用本机的 `claude` CLI，因此使用你 Claude Code 登录账号对应的模型与额度。

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

## 配置

### 交互式设置（持久化）

首次运行会引导选择语言与等级；运行中进入「设置」页可调整以下项，改动写入本地配置：

| 项 | 说明 | 可选值 |
| --- | --- | --- |
| 语言 | 题目与解释语言 | 中文 / English |
| 等级 | 题目难度定位 | Junior / Mid / Senior / Staff+ |
| 每日目标 | 每日题目数 | 1–9 |
| 音效 | 答题音效开关 | 开 / 关 |
| 题目模型 | 生成题目时传给 `claude --model` 的别名 | Haiku（默认，快）/ Sonnet / Opus / 账号默认 |
| 题目 Effort | 生成题目时传给 `claude --effort` 的等级 | Low（默认）/ Medium / High / xHigh / Max |

> 默认 `Haiku` + `Low`：题目生成本质是结构化 JSON 输出，Haiku/low 足够且明显更快、更省。需要更高质量时可在设置页临时调高。

### 环境变量

| 变量 | 作用 |
| --- | --- |
| `QUIZME_CLAUDE_BIN` | 指定 `claude` 可执行文件的绝对路径（PATH 找不到时使用） |
| `QUIZME_DATA_DIR` | 覆盖本地数据存储目录；不设时使用平台 app data 目录，受限环境 fallback 到 `./.quizme` |
| `QUIZME_CLAUDE_WHY_MODEL` | `why` 模式（答错后深度讲解）使用的模型别名；不设则走账号默认模型 |
| `QUIZME_CLAUDE_WHY_EFFORT` | `why` 模式的 effort 等级（`low`/`medium`/`high`/`xhigh`/`max`）；不设则走默认 |

> `why` 模式刻意与题目生成分开配置：讲解对模型质量更敏感，默认保持账号模型；仅当想全局降级/提速时才设这两个变量。

## 说明

- 默认模式会从 `~/.claude/projects` 读取当前仓库最近的 Claude Code transcript。统计、档案、设置、复习等功能通过交互式主界面进入。
- 本地数据为平台 app data 目录下的单个 `quizme.json` 文件，采用原子写入（temp 文件 + rename），当前轮次的题库仅存于内存、不落盘。
- 题目生成和 `why` 模式会调用本地 `claude` CLI 的 print mode（`--bare` + `--tools ""`，禁用 agent tool；上下文已写入 prompt）。
- 离线 provider（`QUIZME_PROVIDER=local`、`QUIZME_PROVIDER_FALLBACK=local`）为**暂未实现**的能力，当前不可用。

## 许可证

[MIT](./LICENSE)
