# QuizMe 答题卡学习系统设计（System Design）

> 目标：把 QuizMe 从"一次性出题工具"演进为"围绕 AI coding 的碎片化学习系统"——用户在 AI 写代码的过程中理解 AI 在做什么，并借此系统性提升自己。类比：**代码多邻国 + 背单词词卡**。
>
> 本文是设计文档，不是实现记录。现状描述基于当前代码（commit `b29ddf1`）。

---

## 1. 产品定位与核心矛盾

### 1.1 定位

- **学习类工具**，不是面试刷题器。北极星指标是"用户真的学会并记住了可迁移的工程知识"，而非答题量。
- **碎片化**：一轮答题卡 3–5 分钟，天然嵌在"等 Claude Code 跑任务"的空档里。
- **AI coding 伴生**：素材来自用户真实的 AI coding 会话——AI 刚才做了什么、为什么这么做，就是最好的教材。

### 1.2 核心矛盾：主题跟项目绑定，还是跳开项目？

这是本设计要回答的第一个问题。两个极端都不成立：

| 方案 | 问题 |
| --- | --- |
| 完全绑定项目 | 退化成"本项目业务琐事问答"，知识不可迁移；项目素材几天就出干；换项目后学习履历归零 |
| 完全跳开项目 | 丢掉"理解 AI 刚才在干什么"的产品魂；沦为普通刷题库，动机和情境优势全无 |

**结论：锚定项目、抽象概念、变式复习（三层高度模型）。**

```
会话/项目（情境层 anchor）
   │  "Claude 刚才用了 git rebase --onto 而不是 merge"
   ▼
知识点（概念层 KnowledgePoint）★ 系统的一等公民
   │  "rebase 与 merge 的本质区别与适用边界"（可迁移）
   ▼
出题（渲染层 Card）
      同一知识点可在不同情境、不同题型、不同深度下反复渲染成新题
```

- **提取时**：从会话中识别"AI 做了什么动作/决策"，抽象成可迁移的知识点。项目是触发器和记忆锚点，不是知识本身。
- **复习时**：老知识点用**新情境**（可以是用户当前正在跑的新项目情境）重新出题。这正是"把以前的知识点拿出来，重新放进新题里"——检验的是概念，不是对旧题面的再认记忆。
- 教育学依据：情境锚定（编码特异性，提升相关性与动机）+ 检索练习与变式（desirable difficulty，防止背答案）+ 间隔重复（对抗遗忘曲线）。

---

## 2. 核心概念模型

### 2.1 知识点（KnowledgePoint，KP）——持久化的学习单元

当前系统没有稳定的学习单元：题目是一次性的，`ProfileSignal` 只是模型自由生成的 tag 加减分，复习队列存原题重放。**遗忘曲线必须挂在稳定实体上**，所以引入 KP：

```ts
interface KnowledgePoint {
  id: string;                    // kp_<hash>
  name: string;                  // 规范名，如 "git-rebase-vs-merge"
  essence: string;               // 一句话可迁移结论（词卡的"释义"）
  domain: string[];              // 领域标签，如 ["git", "version-control"]
  targetDepth: 1 | 2 | 3;        // 目标深度（见 2.3，由领域×用户方向决定）
  currentDepth: 1 | 2 | 3;       // 当前已验证到的深度
  srs: SrsState;                 // 间隔重复调度状态（见 §4）
  provenance: Anchor[];          // 来源锚点：哪些会话/项目/话题触发了它
  recentAsks: { question: string; type: CardType; at: string }[];
                                 // 最近 N 次针对它出过的题面摘要，出题时传给模型强制变式
}
```

- **题目（Card）依旧是短命的**：本轮内存中存在，答完只留摘要进 `recentAsks`。这保持了现有"当轮题库不落盘"的设计哲学，只是把持久化对象从"题目"换成"知识点"。
- KP 存进 `quizme.json` 新增的 `knowledgePoints` 段，沿用原子写。

### 2.2 用户画像升级：方向（Direction）

现有画像只有 level（Junior/Mid/Senior/Staff+）。新增：

```ts
interface UserProfile {
  direction: "frontend" | "backend" | "fullstack" | "data" | "algo" | "infra" | "mobile" | "other";
  stacks: string[];              // 自由标签："React", "Go", "K8s"...
  goal?: string;                 // 可选一句话学习目标
}
```

首次运行引导中增加方向选择（现有首次引导已有语言/等级两步，加一步）。

### 2.3 知识维度：深度分层（回答"哪些是常识、哪些要 detail"）

对每个 KP，按**领域与用户方向的距离**决定目标深度：

| 深度 | 名称 | 要求 | 典型题型 |
| --- | --- | --- | --- |
| D1 | 常识 awareness | 知道它存在、是干什么的、什么时候该想起它 | 选择题（辨析/用途） |
| D2 | 应用 working | 会用、能选型、知道常见坑 | 选择题（场景判断）、简答 |
| D3 | 原理 deep | 底层机制、边界条件、失效模式、权衡的第一性原理 | 简答为主、深挖追问 |

分配规则（在 KP 提取阶段由模型依据用户方向判定，用户可在复习界面手动调）：

- 用户方向的**核心领域** → 目标 D3（如后端同学的数据库事务隔离）
- **相邻领域** → 目标 D2（如后端同学的浏览器缓存策略）
- **远域但工程师应知** → 目标 D1（如后端同学的 CSS 层叠规则——知道概念即可）

**深度进阶**：同一 KP 在 D_k 连续答对且 k < targetDepth，下次复习升到 D_{k+1} 出题；答错则降回。掌握度因此是**留存 × 深度**的二维量，而不是单一分数。

---

## 3. 题型与词卡交互

### 3.1 题型

| 题型 | 说明 | 判定方式 |
| --- | --- | --- |
| 选择题 MCQ | 现有 4 选 1，保留 `whyWrong` | 本地精确判定 |
| 简答题 Open | 用户键入 1–3 句自由文本 | claude CLI 按 rubric 判分（见 §5.3） |

题型按深度加权：D1 几乎全选择题；D2 选择题为主、简答为辅；D3 简答为主（深层理解难以用再认式选择题检验）。

### 3.2 词卡（Card）交互流：正面 → 作答 → 背面

严格对齐"背单词词卡"心智模型：

```
┌─ 正面 ─────────────────────────┐
│ [复习标记 ↻ / 新知识 ✦]  D2 · git │
│ 题目（含情境锚点）                │
│ MCQ: 四个选项 / Open: 输入框      │
└──────────────────────────────┘
            ↓ 作答
┌─ 背面 ─────────────────────────┐
│ ✓/✗/◐ 判定 + （错时）纠正        │
│ 解读：为什么对、错项为什么弱       │
│ ★ 可迁移结论（= KP.essence）     │
│ [why 深挖追问] [标记太简单/太难]   │
└──────────────────────────────┘
```

- 背面必带**可迁移结论**——这一句就是用户带走的东西，也强化 KP 本身的记忆。
- `why` 深挖模式保留现有独立模型配置（`QUIZME_CLAUDE_WHY_MODEL/EFFORT`）。
- "太简单/太难"反馈直接作用于该 KP 的 targetDepth / ease（用户显式校准）。

### 3.3 卡片内容结构（Card payload）

```ts
interface CardBase {
  kpId: string;
  type: "mcq" | "open";
  depth: 1 | 2 | 3;
  origin: "new" | "review" | "reinforce"; // 新知 ✦ / 复习 ↻ / 弱项巩固 ⚑ → 正面角标
  anchor?: string;     // 情境锚点：1–2 句，把题目放进具体场景（优先当前会话）
  question: string;    // 题干
  takeaway: string;    // 背面的可迁移结论（KP.essence 的本题化表述，一句话）
  followUps: string[]; // why 模式的建议追问（2–3 条，背面快捷选择）
  tags: string[];
}

interface McqCard extends CardBase {
  type: "mcq";
  choices: { id: "A" | "B" | "C" | "D"; text: string }[];
  answer: "A" | "B" | "C" | "D";
  explanation: string;                 // 正确答案为什么对
  whyWrong: Record<string, string>;    // 每个错项为什么弱
}

interface OpenCard extends CardBase {
  type: "open";
  rubric: string[];    // 3–5 条判分要点，出题时一并生成
  modelAnswer: string; // 参考答案，2–4 句
}
```

字段的教学职责：`anchor` 负责情境代入（"AI 刚才就在你项目里干了这件事"）；`question` 只考一个概念；`explanation/whyWrong/feedback` 负责纠正；`takeaway` 是用户唯一必须带走的一句话；`followUps` 把好奇心引向 why 深挖。

### 3.4 交互状态机（每张卡）

```
FRONT（正面）──作答──▶ [GRADING（仅简答，claude 判分中）] ──▶ BACK（背面）──▶ 下一张
                                                            │
                                                            └─ w ▶ WHY 深挖（叠层，Esc 返回）
全部答完 ──▶ SUMMARY（本轮小结）
```

**FRONT — 选择题**（沿用现有 ↑↓/数字/Enter 习惯）：

```
┌ QuizMe ─ 卡 2/6 ────────────────────────────────────┐
│ ↻ 复习 · D2 · git                                    │
│                                                     │
│ 你刚才让 Claude 整理提交历史，它选了 `git rebase -i`     │
│ 而不是 `git merge --squash`。                         │
│                                                     │
│ 下列哪种场景中 rebase 会带来实际风险？                    │
│                                                     │
│ ▸ A. 在本地私有分支上整理提交                            │
│   B. 在已推送且被他人拉取的共享分支上改写历史               │
│   C. …                                              │
│   D. …                                              │
│                                                     │
│ ↑↓ 选择 · Enter 确认 · 1-4 快捷 · s 不确定，直接看答案    │
└─────────────────────────────────────────────────────┘
```

**FRONT — 简答题**：题干下方是多行输入框，Enter 提交；同样支持 `s` 跳过直接看参考答案。

**`s`（不确定）语义**：学习工具必须允许"我不会"——跳过不算作弊，直接翻到背面完整学习，SRS 记 `again`（明天再见）。这比逼用户瞎猜更符合学习目标，也让 SRS 信号更干净。

**BACK — 答错时（选择题）**：

```
│ ✗ 答错了 — 你选了 A                                   │
│                                                     │
│ A 为什么不对：私有分支改写历史不影响任何协作者……           │
│ ✓ 正确答案 B：一旦提交被共享，rebase 会让他人的历史失效…   │
│                                                     │
│ ★ 核心结论：改写已共享的提交历史 = 改写别人正在依赖的事实    │
│                                                     │
│ w 深挖追问 · e 太简单 / h 太难 · Enter 下一张            │
```

答对时背面收窄：判定条 + explanation 一段 + takeaway，两秒内可翻下一张，不打断节奏。

**BACK — 简答题**：rubric 要点逐条 ✓/✗ 展示（命中/遗漏）、针对用户原文的具体 feedback、参考答案、takeaway。判定三档 ✓ correct / ◐ partial / ✗ wrong。

**WHY 深挖（`w`）**：叠层进入，`followUps` 以 1–3 数字键快捷提问，也可自由输入；回答流式输出；Esc 返回背面。沿用现有独立模型配置。

**SUMMARY（本轮小结）**：

```
本轮 6 张 · ✓4 ◐1 ✗1                                   
✦ 新增知识点 2 个：git-rebase-vs-merge、http-cache-revalidation
↻ 复习结果：2 个间隔延长（3d→7d）、1 个回炉（明天再见）
明日到期 3 张 · 连续学习 5 天
```

小结页把 SRS 状态变化翻译成人话（"间隔延长/回炉"），让用户感知到"系统记得我"。

### 3.5 交互细节规则

- **计时**：每张卡从展示到作答的用时本地记录，用于 hard/easy 推断（超过本人 P75 的答对 → hard；快于 P25 且标"太简单" → easy），不在界面上显示倒计时——学习工具不制造焦虑。
- **`e`/`h` 校准**：背面一键反馈。`e`（太简单）→ ease +0.1，若已达标深度则提升 targetDepth；`h`（太难）→ ease −0.15，必要时降 targetDepth。
- **答错回炉**：P0 只标 `again`（明天到期）；P1 起在本轮末尾追加一张同 KP 的快速变式卡（趁用户答后面题目时后台预生成，不阻塞）。
- **声效**：沿用现有 SoundPlayer（答对/答错/完成），设置里可关。
- **中断安全**：答到一半退出（q/Ctrl-C），已作答卡片的 SRS 更新即时落盘（沿用逐次 persist），未答的卡直接丢弃——与"当轮题库不持久化"一致。

---

## 4. 遗忘曲线：间隔重复调度（SRS）

### 4.1 调度算法：SM-2 简化变体

MVP 不上 FSRS，用可解释、可手调的 SM-2 变体：

```ts
interface SrsState {
  reps: number;         // 成功复习次数
  lapses: number;       // 遗忘次数
  ease: number;         // 难度系数，初始 2.5，区间 [1.3, 3.0]
  intervalDays: number; // 当前间隔
  dueAt: string;        // 下次到期时间（ISO）
  lastRating: Rating;
}

type Rating = "again" | "hard" | "good" | "easy";
```

评级映射：

| 作答结果 | Rating |
| --- | --- |
| MCQ 答错 / 简答判 wrong | again → 本轮末尾重插一张变式卡，间隔重置 1 天，ease −0.2，lapses +1 |
| 简答判 partial / MCQ 犹豫后答对（用时 > P75） | hard → 间隔 ×1.2，ease −0.15 |
| 正常答对 | good → 间隔 ×ease |
| 快速答对（用时 < P25）且主动标"太简单" | easy → 间隔 ×ease×1.3，ease +0.1 |

初始间隔序列：1d → 3d → 7d → ×ease 递推。

### 4.2 与现有机制的关系

- `ProfileSignal`（tag 加减分）**保留**，降级为出题时的"强弱项摘要"信号；调度职责全部移交 SRS。
- 现有 `reviewQueue`（原题重放队列）**废弃**，被 KP 到期队列取代。原因：重放原题检验的是对题面的再认记忆，与学习目标相悖。
- **复习 = 对到期 KP 重新渲染新题**：换情境（优先用当前会话情境）、可换题型、按深度进阶规则可升深度。`recentAsks` 传入出题 prompt，明确要求不得复用旧题面角度。

---

## 5. 生成管线：从单阶段到三阶段

现状是单阶段（SourceSummary → 5 题）。新管线拆为三个独立的 claude CLI 调用点，全部沿用 `--bare --tools "" --json-schema` 结构化输出模式：

### 5.1 Stage A：知识点提取（每轮开始，或会话素材更新时）

```
输入:  SourceSummary（会话/repo/话题）
     + 用户画像（direction, stacks, level）
     + 现有 KP 规范名列表（用于去重合并）
输出:  candidateKPs: { name, essence, domain[], suggestedDepth,
                       relevance, anchor（会话中的触发片段） }[]
```

- 模型被要求：若概念与已有 KP 相同，**复用已有规范名**（无 embedding 的轻量去重方案）。
- 提取视角：不是"这段会话讲了什么"，而是"**AI 在这里做了什么动作/决策，背后是什么可迁移的知识**"。这是与现状最大的 prompt 视角差异。

### 5.2 Stage B：组卡 + 渲染（每轮一次）

**组卡策略（本地代码决定，不交给模型）**，一轮 N 张（N = dailyGoal，默认 5–6）：

| 优先级 | 来源 | 配额 | 说明 |
| --- | --- | --- | --- |
| 1 | 到期复习 KP（dueAt ≤ now，按逾期时长排序） | ≤ ⌈N/2⌉ | 遗忘曲线优先，但不淹没新鲜感 |
| 2 | 本次会话新 KP（Stage A 产出，按 relevance 排序） | 2–3 | 产品核心价值：理解 AI 刚才做了什么 |
| 3 | 弱项巩固 / 相邻拓展（低分 KP 或 domain 邻近新概念） | 剩余 | 对应现有 adjacent/interview_style 的价值 |

新旧交错排列（不把复习堆在一起）。到期积压过多时提示用户加开"纯复习轮"。

**渲染调用**：把选中的 KP（含各自的目标深度、`recentAsks` 禁用角度、当前会话情境锚点）一次性传给模型，产出 N 张卡（schema v2：新增 `kpId`、`type: "mcq"|"open"`、`depth`、`takeaway`、简答题的 `rubric` + `modelAnswer` 字段；MCQ 保留 `choices/answer/whyWrong`）。本地二次校验逻辑（validator）同步扩展。

### 5.3 Stage C：简答判分（仅简答题，每题一次）

```
输入:  题目 + rubric + modelAnswer + 用户作答 + 语言/等级
输出:  { verdict: "correct" | "partial" | "wrong",
         feedback: 针对用户答案的具体纠正,
         keyPointsHit: string[], keyPointsMissed: string[] }
```

- rubric 在 Stage B 出题时一并生成（要点清单），判分时模型只做比对，降低判分随机性。
- 判分模型默认与出题一致（haiku/low 足够做 rubric 比对）；不满意可单独配置 `QUIZME_CLAUDE_GRADE_MODEL`。

---

## 6. 数据模型变更（quizme.json）

```jsonc
{
  "config":  { /* 现有 + direction, stacks, goal */ },
  "stats":   { /* 现有，另加 kpTotal, kpMastered, reviewDebt */ },
  "profile": { "signals": { /* 保留，降级为出题辅助信号 */ } },
  "knowledgePoints": {           // ★ 新增，核心持久层
    "kp_ab12": { /* KnowledgePoint，含 srs 状态 */ }
  }
  // reviewQueue 废弃（迁移：把未解决项转为对应 KP 的 again 状态）
}
```

约束不变：单文件 JSON、temp+rename 原子写、当轮卡片不落盘、不引入 SQLite/SDK。KP 数量增长的兜底：超过阈值（如 500）时归档 `dueAt` 最远且已达 targetDepth 的条目。

---

## 7. 对现有代码的改动映射

| 模块 | 改动 |
| --- | --- |
| `src/types.ts` | 新增 `KnowledgePoint / SrsState / UserProfile / CardType`；`QuizQuestion` → `Card`（含 open 变体） |
| `src/generation/prompts/` | `quiz.ts` 拆为 `extract.ts`（Stage A）+ `cards.ts`（Stage B）；新增 `grade.ts`（Stage C）；`why.ts` 不动 |
| `src/generation/schema.ts` | 三套 schema：提取 / 卡片 / 判分 |
| `src/generation/validator.ts` | 扩展支持 open 题型与新字段 |
| `src/storage/json.ts` | 新增 KP CRUD + SRS 更新 + 到期查询；`upsertReviewItem` 走迁移后废弃 |
| `src/cli/config.ts` | 首次引导加方向选择；`normalizeConfig` 补默认值 |
| `src/ui/screens/QuizScreen.tsx` | 词卡正/背面流程、简答输入框、复习/新知标记、"太简单/太难"反馈 |
| `src/providers/claudeAgent.ts` | 抽出通用 `runStructured()`，三个 Stage 复用 |

## 8. 分阶段落地

| 阶段 | 内容 | 验收 |
| --- | --- | --- |
| **P0 核心闭环** | KP 实体与持久化；Stage A 提取；组卡混排（新+到期）；SM-2 调度；复习变式渲染（仅 MCQ） | 昨天答错的知识点，今天以新题面出现在卡组里 |
| **P1 简答题** | open 题型 + rubric 判分 + 背面纠正展示 | D3 知识点出简答且判分/纠正合理 |
| **P2 方向与深度** | direction 引导；D1–D3 分配与深度进阶/降级 | 前端用户收到的 K8s 题停留在 D1，React 题进阶到 D3 |
| **P3 增强** | 记忆统计视图（到期债、领域掌握地图）；KP 合并治理；纯复习轮；streak 与卡组完成动效 | — |

## 9. 风险与开放问题

1. **KP 碎片化**：靠模型复用规范名去重不完全可靠 → P3 定期跑合并 pass（把 KP 名单交给模型找同义项，人工确认合并）。
2. **简答判分成本/时延**：每题一次 claude 调用，在"等 AI 跑任务"的场景里可接受（异步判分 + 先看参考答案），但要注意与出题调用抢并发。
3. **冷启动**：无会话记录时走 topic/repo 模式，同样过 Stage A 抽 KP——学习履历从第一天就是统一模型。
4. **多机同步**：quizme.json 本地单文件，跨设备学习进度不同步。超出 MVP 范围，记录备查。
5. **`mode: review` 等现有半成品**：`QuizMode` 的 review 语义被新组卡策略覆盖，迁移时清理。
