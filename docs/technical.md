# QuizMe 技术文档

更新日期：2026-06-30

## 运行时与包形态

QuizMe 以 npm 包和 CLI 形式分发：

```bash
npm install -g quizme
npx quizme
```

包名和命令名固定为 `quizme`。

运行时要求：

- Node.js 20+
- ESM
- 架构上兼容 TypeScript，即使当前 MVP 实现仍是 JavaScript
- 本地优先存储

候选依赖：

- CLI 命令路由：`commander` 或类似库
- 交互式终端 UI：`ink`、`enquirer` 或更简单的 prompt 层
- 模型输出校验：`zod` 或等价 schema 校验工具
- 外部进程调用：`execa`
- 本地存储：SQLite

## 命令面

主要命令：

```bash
quizme
quizme --repo .
quizme --session /absolute/path/to/session.jsonl
quizme "React rendering and caching"
quizme stats
quizme profile
quizme settings
quizme review
quizme inspect-sources
```

默认 `quizme` 读取 `.claude`。如果不存在可读、可解析的 `.claude` 会话，命令应返回清晰错误。

`--repo` 和 topic mode 是显式模式，不是 `.claude` 失败后的自动 fallback。

## 高层架构

推荐模块结构：

```text
src/
  cli/
    index.ts
    commands/
      play.ts
      config.ts
      settings.ts
      stats.ts
      profile.ts
      dashboard.ts
  sources/
    claudeSession.ts
    repository.ts
    topic.ts
  generation/
    prompt.ts
    schema.ts
    validator.ts
    dedupe.ts
  providers/
    claudeAgent.ts
    customModel.ts
  platform/
    paths.ts
    terminal.ts
    executables.ts
  quiz/
    session.ts
    scoring.ts
    review.ts
  storage/
    db.ts
    migrations.ts
  ui/
    terminal.ts
    charts.ts
```

## 数据源

数据源优先级：

1. 最新 `.claude` Claude Code 会话
2. 当前仓库，仅在显式 `--repo` 模式中使用
3. 用户输入的主题
4. 未来可选的手动导入 text/markdown

### Claude 会话读取

规则：

- 优先当前项目 `.claude`。
- 其次检查用户级 `.claude`。
- 支持显式 `--session <path>`。
- 不假设 Claude Code 内部格式稳定。
- 提供 `quizme inspect-sources` 用于诊断。
- 如果 `.claude` 缺失、不可读或无法解析，返回清晰错误。
- 不静默 fallback 到 repo/topic mode。

所有 Claude Code 路径和解析假设必须隔离在 adapter 内。如果 Claude Code 变更存储格式，可以替换 adapter。

## 跨平台要求

QuizMe 目标支持 macOS、Linux、Windows。

开发可以先从 macOS 开始，但实现必须从一开始按三端完整兼容设计。

### 路径策略

只使用 Node 平台 API：

- `path`
- `os.homedir()`
- `path.join()`
- 不手写 `/`
- 不假设 shell 会展开 `~`

会话查找：

- 当前项目：`process.cwd()/.claude`
- macOS / Linux 用户会话根目录：`$HOME/.claude`
- Windows 用户会话根目录：`%USERPROFILE%\.claude`

App data 目录：

- macOS：`~/Library/Application Support/quizme`
- Linux：`$XDG_DATA_HOME/quizme` 或 `~/.local/share/quizme`
- Windows：`%APPDATA%\quizme`

实现层应提供统一的 `getAppDataDir()`。

### 终端策略

终端 UI 必须支持：

- macOS Terminal
- iTerm2
- 常见 Linux terminal
- Windows Terminal
- PowerShell
- 可行时支持 Git Bash

要求：

- 不依赖 POSIX-only shell 行为。
- 检测颜色和 Unicode 支持。
- 必要时降级为 ASCII 图表。
- 快捷键保持简单：`A-D`、`1-4`、`enter`、文本命令。
- 不依赖复杂组合键。

### 外部命令

Claude CLI / agent 调用应使用参数数组，而不是 shell 字符串。

要求：

- 兼容 Windows `.cmd` / `.exe`。
- 所有外部调用设置 timeout。
- 错误分类：可执行文件缺失、超时、非法输出、权限问题、会话解析失败。
- 给用户清晰修复建议。

Claude provider 协议细节后续再细化，不阻塞当前规划。

## 存储

如果 macOS、Linux、Windows 的安装和运行体验可接受，本地存储使用 SQLite。

Schema 草案：

```text
profiles(id, level, language, created_at, updated_at)
profile_preferences(id, key, value_json, created_at, updated_at)
profile_signals(id, tag, score, confidence, trend, last_seen_at, updated_at)
questions(id, hash, source_type, topic, difficulty, payload_json, created_at)
recent_questions(id, question_id, hash, topic, tags_json, asked_at)
attempts(id, question_id, selected, correct, duration_ms, created_at)
tags(id, name)
question_tags(question_id, tag_id)
review_items(question_id, status, last_result, updated_at)
sessions(id, source_type, started_at, ended_at, summary_json)
why_threads(id, question_id, turns_json, created_at, updated_at)
game_progress(id, xp, streak_days, daily_goal, updated_at)
```

重要行为：

- `recent_questions` 保留最近 20 题或一个小窗口。
- 长期历史保存在 `questions`、`attempts` 和 `review_items`。
- `profile_signals` 保存计算出的能力信号。
- `profile_preferences` 保存用户修正，例如“我熟悉这个主题”或“少展示这个主题”。
- 删除操作必须有明确范围和确认。

## 题目 Schema

生成题目展示前必须通过严格 schema 校验。

草案结构：

```json
{
  "id": "q_...",
  "source": "claude_session | repo | topic | manual",
  "sourceMode": "contextual | adjacent | interview_style",
  "topic": "React rendering",
  "difficulty": 2,
  "question": "...",
  "choices": [
    { "id": "A", "text": "..." },
    { "id": "B", "text": "..." },
    { "id": "C", "text": "..." },
    { "id": "D", "text": "..." }
  ],
  "answer": "B",
  "explanation": "...",
  "whyWrong": {
    "A": "...",
    "C": "...",
    "D": "..."
  },
  "tags": ["react", "performance", "memoization"],
  "skillSignals": [
    { "tag": "react", "signal": "rendering", "expectedLevel": 2 }
  ],
  "followUps": ["React reconciliation", "render profiling"]
}
```

校验规则：

- 必须正好四个选项。
- 必须只有一个正确答案。
- `answer` 必须匹配一个选项 id。
- 每题至少一个 tag。
- `sourceMode` 必须是三个支持值之一。
- 展示前拒绝或修复非法 JSON。

## Prompt 策略

生成约束：

- 只输出选择题。
- 每题四个选项。
- 只有一个最佳答案。
- 优先考察长期有效的工程知识，而不是 trivia。
- 避免泛百科题。
- 错误选项要合理但可辨别。
- 解释为什么错误选项错。
- 不编造仓库事实。
- 不暴露 secret、私人路径或敏感源码。
- 使用 profile signals 覆盖弱项。
- 保留少量强项题制造正反馈。
- 使用最近 20 题避免重复和近似重复。

Prompt 应包含：

- session summary
- source mode target mix
- user level
- language
- recent 20 question summaries
- profile signals
- profile preferences
- output schema

## 去重

MVP 去重保持简单：

- 存 question hash。
- 存规范化后的题干文本。
- 存 tags 和 topic。
- 把最近 20 题摘要传入生成 prompt。
- 拒绝完全重复 hash。
- 拒绝明显重复题干。
- 通过 prompt 让模型避免语义近似重复。

embedding-based dedupe 后置。

## 用户画像算法

每次答题和 `why` 后增量更新 profile。

信号：

- 正确性
- 答题耗时
- 重复错误
- 错误选项类型
- tag 维度连续表现
- `why` 使用情况
- 复习结果
- 手动 profile preference

Profile 输出：

- strong areas
- growing areas
- estimated level
- confidence
- interview risk
- recommended next practice

手动修正规则：

- 不改写 attempt history。
- 修正写入 `profile_preferences`。
- preference 用于调整后续题目权重和画像措辞。
- 计算信号和用户偏好必须可区分。

## 复习算法

MVP 复习是轻量错题复习，不是完整 spaced repetition。

规则：

- 答错创建或更新 review item。
- `review` 展示最近答错的 3 到 5 题。
- 复习答对一次后标记为 `resolved`。
- 同一 tag 多次出错时，生成 weak-area challenge 候选。
- 某 tag 连续答对时，降低普通出题频率。
- MVP 不做按天间隔调度。

FSRS 和完整 spaced repetition 后置。

## 设置与数据删除

`quizme settings` 应支持：

- 查看 data directory
- 修改语言
- 修改 daily goal
- 编辑 profile preferences
- 删除 profile
- 删除 answer history
- 删除 `why` threads
- 清空全部本地数据

删除规则：

- 必须二次确认。
- 明确展示将删除的范围。
- 删除 profile 不默认删除 answer history。
- 清空全部会删除 profile、attempts、questions、review queue、`why` threads 和 game progress。
- MVP 不支持删除前 export/backup。

## 隐私与脱敏

风险区域：

- 源码
- secret
- 内部业务上下文
- 文件路径
- 客户数据
- 私有 prompt

必要行为：

- 首次运行说明读取什么、发送什么、存储什么。
- 可行时先本地摘要和过滤，再调用模型。
- 不直接向用户展示最近 20 题内部上下文。
- 提供 `inspect-sources` 做来源诊断。
- 提供 settings 数据删除能力。

## 测试

最小测试矩阵：

```text
macOS latest · Node 20 / 22
Ubuntu latest · Node 20 / 22
Windows latest · Node 20 / 22 · PowerShell
```

最小自动化测试：

- 路径解析
- app data 目录解析
- `.claude` 会话探测
- 缺失 `.claude` 报错
- 非法 session 解析报错
- schema 校验
- 题目去重
- profile signal 更新
- settings 删除范围
- CLI smoke tests:
  - `quizme --help`
  - `quizme stats`
  - `quizme profile`
  - `quizme settings`

## MVP 里程碑

### M0 Prototype

- CLI scaffold
- topic input
- Claude agent generation
- schema validation
- question UI
- `why`、follow-up、`back`、`next`
- latest 20 dedupe
- cross-platform path abstraction

### M1 Claude Session Integration

- `.claude` detection
- session summary
- parse failure error
- source inspection
- sensitive content filtering

### M2 Repository Mode

- README/package metadata scan
- source tree summary
- git diff/log summary
- repo question generation

### M3 Learning Loop

- SQLite history
- profile signals
- profile command
- settings command
- data deletion
- lightweight review
- stats
- initial gamification

### M4 Distribution

- npm package
- README
- docs
- privacy notes
- examples

## 后置工作

- 完整 provider 生态
- 复杂 Web dashboard
- 账号和云同步
- 公开题库市场
- team features
- Anki / Markdown export
- deletion backup/export
- FSRS / full spaced repetition
- embedding-based dedupe
