# QuizMe 产品文档

更新日期：2026-06-30

## 产品定位

QuizMe 是一个面向 Claude Code 用户的交互式 CLI 学习工具。它读取最近的 Claude Code 会话上下文，把当前开发工作流转化为短小的、面试风格的选择题。

核心承诺：当开发者在等待 Claude Code、测试、安装依赖或 agent 执行任务时，QuizMe 把这段等待时间转化为轻量的技术学习。

## 目标用户

第一版只服务 Claude Code 用户，不面向 Codex、Cursor、Gemini CLI 或泛 AI coding 用户。

目标用户的核心心理是 FOMO：

- 担心 AI 写代码后，自己对实现细节变得不熟。
- 担心其他开发者在系统、框架、面试知识上进步更快。
- 希望在使用 AI 工具的同时保持编码能力和面试能力。
- 希望不离开终端就能完成短学习闭环。

## 核心场景

### Claude Code 等待间隙

默认入口：

```bash
npx quizme
```

QuizMe 读取最新的 `.claude` 会话。如果 `.claude` 不存在、不可读或无法解析，QuizMe 应清晰报错，不静默 fallback 到其他模式。

### 仓库模式

显式仓库模式：

```bash
npx quizme --repo .
```

该模式根据仓库结构、README、package metadata、测试、近期 diff 和项目上下文生成题目。

### 主题模式

显式主题模式：

```bash
npx quizme "React Server Components and caching"
npx quizme "Node.js streams interview questions"
npx quizme "PostgreSQL query planning"
```

主题模式适合用户主动进行某个方向的面试式练习。

## 题目策略

所有题目都是选择题。这样可以保证交互足够快，适合编码等待间隙。

题目不需要强绑定具体源码。QuizMe 使用 Claude Code 上下文触发学习，而不是对当前代码做事实考试。

题目来源分为三类：

- Contextual：和当前 Claude Code 会话或仓库直接相关。
- Adjacent：从当前上下文扩展到相邻工具、框架或概念。
- Interview-style：常见高价值计算机技术和工程面试主题。

初始比例：

```text
40% contextual
40% adjacent
20% interview-style
```

每道题应包含：

- 题干
- 四个选项
- 一个最佳答案
- 简短解释
- 可通过 `why` 延展的深度解释
- 标签
- 难度
- 来源上下文摘要
- 后续学习方向

## 交互模型

答题中的主要命令：

- `A-D` 或 `1-4`：选择答案
- `why`：进入追问解释模式
- `next`：下一题
- `back`：从 `why` 模式返回答题流程
- `review`：复习最近答错的题
- `stats`：查看学习统计
- `profile`：查看 AI 生成的用户画像
- `settings`：管理偏好和本地数据

### Why 模式

`why` 是围绕当前题目的聚焦追问线程。它会调用模型生成更深入解释，也允许用户继续追问。

界面应持续提示用户返回答题主线：

```text
Type back to return, next to skip to the next question, or ask another follow-up.
```

高价值的 `why` 解释可以存入本地，用于后续复习和画像更新。

## 首次使用流程

首次运行必须让用户选择：

- 能力水平：Junior、Mid-level、Senior、Staff+
- 学习焦点：当前 Claude Code 会话、当前仓库、主题、混合
- 语言：中文或 English

语言必须在首次使用时显式选择。QuizMe 不根据终端 locale 自动决定。

QuizMe 也需要说明：默认会读取 `.claude`，如果读取失败会报错。

## 记忆能力与用户画像

QuizMe 有本地记忆能力，会持续记录：

- 答题正确性
- 答题耗时
- 错误选项模式
- 知识标签
- `why` 使用情况
- 复习结果
- 用户主动调整难度的行为
- 手动 profile 偏好

用户可以通过以下命令看到这份记忆：

```bash
npx quizme profile
```

画像输出应该可见、有趣、具体、可行动：

```text
QuizMe Profile

Current read
You look like a mid-level frontend engineer with strong TypeScript instincts.

Strong areas
- TypeScript type modeling
- Git workflow
- AI-assisted code review

Growing areas
- React rendering behavior
- Browser performance
- SQL indexing

Recommended next
- 3-question React rendering challenge
- Review 2 missed SQL index questions
```

画像表达必须避免武断结论。早期数据不足时，应展示低置信度或提示 `still learning your profile`。

用户可以在 `settings` 中手动修正 profile 偏好，例如标记某个主题已经熟悉，或希望减少某类题目。手动修正不应改写历史记录，而是影响后续题目权重和画像表达。

## 复习模型

MVP 复习应保持轻量，不做完整 spaced repetition。

规则：

- 答错进入本地错题队列。
- `review` 展示最近答错的 3 到 5 题。
- 复习答对一次后标记为 `resolved`。
- 同一标签反复出错时，进入弱项挑战候选。
- 某标签连续答对时，降低该标签在普通出题中的出现频率。

Leitner、FSRS 和完整间隔重复后置，等用户形成稳定复习习惯后再考虑。

## 游戏化

游戏化可以存在，但目标是促进理解，而不是鼓励刷题量。

候选机制：

- Streak
- XP
- Level
- Daily goal
- Badge
- Weak-area challenge
- Weekly recap
- Boss challenge

开放问题：第一版具体上线哪些游戏化机制。

防刷原则：

- 重复答同一道题的奖励递减。
- `why` 奖励应基于有效追问，而不是只输入命令。
- 统计不仅展示题量，也展示正确率和复习完成率。

## 设置与数据管理

QuizMe 提供：

```bash
npx quizme settings
```

设置应支持：

- 查看本地数据目录
- 切换语言
- 调整每日目标
- 编辑 profile 偏好
- 删除用户画像
- 删除答题历史
- 删除 `why` 历史
- 清空全部 QuizMe 本地数据

删除操作必须二次确认，并明确展示删除范围。

MVP 不支持删除前备份或导出。

## MVP 范围

必须包含：

- `npx quizme`
- macOS、Linux、Windows CLI 兼容目标
- 首次配置
- 直接读取 `.claude`，失败时报错
- 显式 `--repo` 模式
- 主题模式
- Contextual / adjacent / interview-style 三类题目生成
- 选择题答题流程
- `why`、追问、`back`、`next`
- 本地历史和统计
- 动态用户画像
- `profile` 命令
- `settings` 命令
- 轻量复习
- 最近 20 题去重
- 基础隐私提示

MVP 不包含：

- 完整自定义模型 provider 生态
- 复杂 Web dashboard
- 账号和云同步
- 公开题库市场
- 团队排行榜
- 复杂插件生态
- Anki / Markdown 导出
- 企业/团队题库
- 团队 onboarding quiz
- 团队共享画像

## 竞品与相邻产品

QuizMe 最接近 AI coding CLI、代码练习和技术测评的交叉点。

| 产品 | 类型 | 相关强项 | QuizMe 差异 |
| --- | --- | --- | --- |
| Claude Code | AI coding CLI | 核心会话上下文和终端工作流 | QuizMe 从 Claude Code 会话学习，而不是替用户编码 |
| OpenAI Codex CLI / Codex | AI coding agent | 软件工程任务和仓库理解 | QuizMe 是学习与测评工具 |
| Gemini CLI | AI coding CLI | 终端 AI 交互 | QuizMe 固定围绕 quiz、`why` 和 profile |
| aider | AI pair programming CLI | 本地仓库上下文和终端 AI UX | QuizMe 生成题目和解释，不生成代码变更 |
| Exercism CLI | 编程练习 | 开发者 CLI 学习闭环 | QuizMe 是短选择题，不是完整代码练习 |
| CodeCrafters | 项目式学习 | 深度系统学习 | QuizMe 是等待间隙短练习 |
| LeetCode / NeetCode | 面试刷题 | FOMO、标签、每日练习 | QuizMe 是 AI 生成且由上下文触发 |
| CodeSignal / HackerRank | 技术测评 | 能力报告和标签化评估 | QuizMe 是个人自测，不是招聘测评 |

QuizMe 的核心差异：

- 从 coding-agent 会话触发学习。
- 在 CLI 中运行。
- 用选择题降低等待间隙的参与成本。
- 用 `why` 支持 AI 追问。
- 长期建立可见的用户画像。

## 已确认决策

- 第一版只服务 Claude Code 用户。
- 包名和命令名为 `quizme`。
- 支持中文和 English；首次运行必须让用户选择。
- 直接读取 `.claude`；读取或解析失败即报错。
- 不做初始 placement quiz。
- 用户画像可见，并可通过 settings 手动修正。
- MVP 不支持 Anki / Markdown 导出。
- MVP 不支持删除前备份或导出。
- MVP 不支持企业/团队场景。

## 开放问题

- 第一版应上线哪些游戏化机制：streak、XP、level、daily goal、badge、weekly recap、boss challenge？
