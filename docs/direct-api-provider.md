# 直连 Anthropic API 方案（Direct API Provider）

状态：**方案草稿，暂不实现**
更新日期：2026-07-17

## 背景与动机

当前 QuizMe 的模型后端固定为本地 `claude`（Claude Code）CLI 的 print 模式（`providers/claudeAgent.ts`），出题与 `why` 模式都通过 `spawn` 调用 CLI 并解析其 NDJSON 事件流。这条路径有几项固定开销：

1. **Claude Code 自身的上下文占用**：即使加了 `--safe-mode --tools ""`，CLI 每次调用仍会带上它自己的身份/环境/harness 系统提示，是每次生成都在付的 input token，与出题任务无关。
2. **进程冷启动**：实测 `claude --version` 冷启动约 0.4s；真实 `-p` 调用还要叠加认证握手与完整 CLI 初始化，推理开始前固定要等几秒。
3. **transcript 写盘副作用**：CLI 会把每次 `-p` 调用写入 `~/.claude/projects/<project>/<session_id>.jsonl`，QuizMe 因此需要 `storage/sessionExclusions.ts` 一整套机制，避免把自己生成的 transcript 当「最近会话」读回去。

如果用户是通过 **API Key** 使用 Claude，理论上可以直接调用 Anthropic Messages API（`POST /v1/messages`），只发送我们自己的精简 system + 出题指令，从而消除上述 1、2、3 三项开销。

本方案描述「在设置中提供一个可选的直连 API 通道」的设计，**不替代 CLI**，只作为高级用户的提速选项。

## 与现有设计原则的关系（重要）

`AGENTS.md` 目前明确规定：

- 「It does **not** call the Anthropic API directly — it shells out to the local `claude` CLI」
- 「Don't add a direct Anthropic SDK dependency — the `claude` CLI is the only model path」

本方案在实现时会**局部推翻**这一原则，因此定位为：

- 直连 API 只是一个**默认关闭、用户手动开启**的可选通道；
- CLI 仍是默认路径，也是唯一对所有用户都可用的路径；
- 若采纳，需要同步更新 `AGENTS.md` 的措辞（从「唯一模型路径」改为「默认模型路径 + 可选直连通道」）。

## 认证方式的现实约束

Claude Code 用户的认证分两类，直连 API 的可行性完全不同：

| 认证方式 | 能否直连 API | 说明 |
|---|---|---|
| **API Key**（`ANTHROPIC_API_KEY` / Console 签发的 key）| ✅ 可以 | 直接可打 `/v1/messages`，本方案的目标场景 |
| **订阅登录**（Pro/Max，`/login` OAuth）| ❌ 不建议 | 存的是 OAuth token，不是标准 API key；直连公开 API 属于另一套计费，且违反预期用法。订阅用户往往根本没有可读的 API key |

关键结论：

- 直连 API **只覆盖配置了 API Key 的用户**；订阅用户必须继续走 CLI。
- 凭证存储位置因平台而异：
  - macOS：Claude Code 的登录凭证在 **Keychain**（条目 `Claude Code-credentials`），不是文件；
  - Linux：`~/.claude/.credentials.json`。
- 因此「自动从 config 读取」在实现上**并不等于**「读 Claude Code 的登录态」。订阅 OAuth token 不能挪用；能自动读取的只有**显式的 API Key**（见下）。

## 用户流程（本方案的核心）

在 **设置（Settings）** 中新增开关与来源选择：

```
Settings
└─ 模型后端 (Model backend)
   ○ Claude CLI（默认）
   ● 直连 API（Direct API）        ← 用户手动开启
      Key 来源 (API key source):
        ○ 自动从环境/配置读取 (Auto-detect)
        ○ 手动输入 (Enter manually)  → [ sk-ant-... ]
```

- **默认关闭**：不改变现有行为，未开启时一律走 CLI。
- **手动开启后**，用户二选一：
  1. **自动读取（Auto-detect）**：按固定顺序探测显式 API Key —
     - `QUIZME_ANTHROPIC_API_KEY`（QuizMe 专用，优先级最高）
     - `ANTHROPIC_API_KEY`（环境变量）
     - （可选，需谨慎）平台凭证文件中的 API key —— 见「未决问题」
     探测不到时给出清晰提示，并**回落到 CLI**，不静默失败。
  2. **手动输入（Enter manually）**：用户粘贴自己的 API Key。
- **计费提示**：开启直连并使用 API Key 意味着按量计费到该 key 对应的 API 账户，与订阅额度是两套体系。设置界面需明确提示，避免「计费惊吓」。

## 配置与存储

在 `UserConfig`（`types.ts`）与 `normalizeConfig`（`cli/config.ts`）新增字段（草案）：

```ts
interface UserConfig {
  // ...现有字段...
  /** 模型后端；默认 "cli" 保持现有行为 */
  modelBackend?: "cli" | "api";
  /** 直连 API 时的 key 来源 */
  apiKeySource?: "auto" | "manual";
  // 注意：手动输入的 key 不建议明文存进 quizme.json（见安全考量）
}
```

安全考量：

- **手动输入的 API Key 不应明文写入 `quizme.json`**（该文件无加密、易被其他工具读取）。
  - 首选：只存「来源=manual」这一偏好，key 本身要求每次通过环境变量提供，或存入平台 Keychain / secret store；
  - 次选：若确实要落盘，需在文档与 UI 中明确风险，并考虑单独文件 + 限制权限（`chmod 600`）。
- **自动读取的 key 只在内存中持有**，不回写 `quizme.json`。
- 环境变量优先级需与现有 `QUIZME_*` 约定一致，运行时生效、无需重启进程。

## Provider 抽象

复用现有的 `QUIZME_PROVIDER` 钩子（`AGENTS.md` 已提及 `local` 桩），并让设置项与之对齐：

- 在 `generateQuestions` / `generateWhy` 之上做后端选择：
  - `modelBackend === "api"` 且能取得 API Key → 走 **API provider**；
  - 否则 → 走现有 **CLI provider**（`claudeAgent.ts`）。
- 新增 `providers/apiProvider.ts`（草案）：
  - **用原生 `fetch` 调用 `POST /v1/messages`，不引入 `@anthropic-ai/sdk`**，以尽量减小对 AGENTS.md 依赖约束的冲击（也便于打包）。
  - 请求头：`x-api-key`、`anthropic-version`、`content-type`。
  - 结构化输出：用 `output_config.format`（json_schema）复用现有 `QUESTION_SCHEMA`，替代 CLI 的 `--json-schema`；可考虑流式以支持边生成边显示。
  - 模型别名映射（config 用别名，API 需全 ID）：
    - `haiku` → `claude-haiku-4-5`
    - `sonnet` → `claude-sonnet-5`
    - `opus` → `claude-opus-4-8`
    - （空/未知 → 交由默认；映射表集中维护，避免散落）
  - 保留 `why` 模式与出题的模型/effort 分离（对应现有 `QUIZME_CLAUDE_WHY_MODEL` / `QUIZME_CLAUDE_WHY_EFFORT`）。
- 关键约束：**API provider 与 CLI provider 对上层暴露同一接口**，因此与「后台预生成 / 本地缓存」（`generation/prefetch.ts`）互不影响，可叠加。

## 直连路径下可简化的部分

当且仅当走 API provider 时：

- **不写 transcript**，因此 `storage/sessionExclusions.ts` 的 `recordOwnSession` / `pruneStaleExclusions` / `getOwnSessionIds` 在该路径下失去意义。
- 注意：CLI provider 仍需要这套机制，所以不能直接删除，只能按 provider 条件绕过。

## 预期收益

- **input token 下降**：不再携带 Claude Code 自身的系统提示 → prefill 更快、更省。
- **无进程冷启动**：省去每次几秒的 CLI 启动 + 认证握手。
- **更强的输出控制**：`output_config.format` + 流式，改善「生成中」的体感。

## 非目标（Non-goals）

- 不抓取 / 不挪用订阅（Pro/Max）OAuth token 去打公开 API（计费与合规风险）。
- 不把直连设为默认，也不自动切换后端而不经用户同意。
- 不引入 `@anthropic-ai/sdk` 依赖（用 `fetch`）。
- 不改动 CLI provider 的既有行为与回落逻辑。

## 未决问题（Open Questions）

1. **「自动读取」到底读到哪一层？**
   - 只读环境变量里的显式 API Key，最安全、最可预期；
   - 是否还要尝试读平台凭证文件里的 API key？macOS 在 Keychain（需 `security` CLI，可能弹窗授权），跨版本易碎，倾向**不做**或作为最低优先级并明确标注风险。
2. **手动 key 的持久化策略**：只记偏好 + 每次要求环境变量，还是提供加密/受限权限的落盘选项？
3. **模型别名映射的维护**：别名 → 全 ID 表如何随模型迭代更新（是否运行时查询 `/v1/models`）。
4. **错误与回落 UX**：直连失败（401/429/网络）时，是提示并回落 CLI，还是仅报错？
5. **AGENTS.md 措辞更新**：采纳后如何改写「唯一模型路径」相关约束。

## 后续（若采纳实现）

1. 更新 `AGENTS.md` 的模型路径描述。
2. `types.ts` / `cli/config.ts`：新增 `modelBackend`、`apiKeySource` 及默认值。
3. `providers/apiProvider.ts`：`fetch` + Messages API + json_schema 结构化输出 + 别名映射。
4. `providers/index`（或调用点）：按 `modelBackend` 选择 provider，取不到 key 时回落 CLI。
5. `ui/screens/SettingsScreen.tsx`：新增后端开关、key 来源选择、手动输入框与计费提示。
6. 直连路径下绕过 `sessionExclusions` 逻辑。
7. 测试：provider 选择、别名映射、回落逻辑（纯单元测试，不依赖网络）。
