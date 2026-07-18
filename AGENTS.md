# AGENTS.md

> **For AI coding agents (and humans who want the same context).**
> `CLAUDE.md` is a thin pointer to this file — keep this as the single source.

## What this project is

QuizMe is a local-first Node/TypeScript CLI that turns Claude Code session context, a git repo, or a free-text topic into short interview-style multiple-choice questions, then renders an interactive quiz TUI in the terminal. It does **not** call the Anthropic API directly — it shells out to the local `claude` (Claude Code) CLI in print mode and parses structured JSON it emits.

## Quick commands

```bash
pnpm install              # install deps (pnpm is the declared packageManager)
pnpm typecheck            # tsc --noEmit
pnpm test                 # node --test on three suites
pnpm build                # tsc -p tsconfig.build.json -> dist/
pnpm start                # run from source via tsx (no build needed)
node ./dist/cli/index.js  # run the built CLI after `build`
```

Tests: `test/paths.test.ts`, `test/validator.test.ts`, `test/store.test.ts` — pure unit tests, no network, no `claude` needed.

Pre-publish gate (`prepublishOnly`) runs `typecheck && test && build`, so all three must pass before a release.

## Project structure

```
src/
  cli/        argv parsing, first-run config bootstrap, quiz session orchestration
  sources/    produce a SourceSummary from: claude_session | repo | topic
  generation/ two-stage learning-card pipeline:
              prompts/extract.ts (Stage A: knowledge-point extraction),
              prompts/cards.ts (Stage B: card rendering), compose.ts (round
              composition: due reviews + new picks, local policy), round.ts
              (orchestrator), schema/validator/dedupe; prompts/quiz.ts is the
              legacy single-stage path, prompts/why.ts the deep explanation
  providers/  claudeAgent.ts — spawns `claude` CLI in print mode, parses its NDJSON
              event stream; localDemo.ts — offline demo provider (QUIZME_PROVIDER=local)
  storage/    JsonStore — single quizme.json, atomic writes (temp+rename)
              index.ts computes the app-data dir + ./.quizme fallback
  srs.ts      SM-2 variant scheduler (pure functions): rateSrs, nextDepth
  ui/         Ink + React TUI: renderApp, App, screens/, components/, theme, sound
  types.ts    shared types (Store, UserConfig, QuizQuestion, KnowledgePoint, ...)
  version.ts  reads version from package.json at runtime
test/         node:test unit suites
docs/         product.md, technical.md (Chinese product/design docs)
```

## Key facts and constraints

- **Runtime**: Node ≥ 20, ESM (`"type": "module"`), TypeScript strict. Source runs via `tsx`; published package ships only `dist/`.
- **Claude CLI is the model backend**: generation + `why` mode spawn the local `claude` executable in print mode (`--bare`, `--tools ""` — agent tools disabled, context is embedded in the prompt). Never assume API keys or `@anthropic-ai/sdk`.
- **`claude` binary resolution**: resolved from `PATH`; override with `QUIZME_CLAUDE_BIN` (absolute path). If you touch provider code, preserve this fallback.
- **Data layer is JSON, not SQLite**: all persisted state (config, aggregate stats, profile signals, the pending review queue, and the knowledge-point ledger with its SRS scheduling state) lives in a single `quizme.json` written atomically via temp-file + rename. The current round's card bank is in-memory only and never persisted. (`App-Data dir` from `getAppDataDir()`; `QUIZME_DATA_DIR` overrides; `./.quizme` is the last-resort fallback.)
- **Knowledge points are the learning unit**: cards are ephemeral renderings of a persistent `KnowledgePoint` (see `docs/design-learning-cards.md`). Reviews re-render a due KP as a fresh question (past stems in `recentAsks` are passed to the model to force a new angle) — never replay a stored question verbatim.
- **Config normalization**: `src/cli/config.ts` `normalizeConfig` fills defaults — `claudeModel` defaults to `"haiku"`, `claudeEffort` to `"low"`, `language` to `"en"`, `level` to `"mid"`, `dailyGoal` to `5`. When adding a config field, update both `normalizeConfig` and the `UserConfig` type in `types.ts`.
- **Question schema is enforced**: `generation/schema.ts` (`QUESTION_SCHEMA`) + `generation/validator.ts` validate model output; `generation/dedupe.ts` drops duplicates within a round. Bad model output is rejected, not silently kept.
- **`why` mode is configured separately** from generation (`QUIZME_CLAUDE_WHY_MODEL` / `QUIZME_CLAUDE_WHY_EFFORT`), defaulting to the account model. Preserve that separation.
- **Offline provider (`QUIZME_PROVIDER=local`) is a demo mode** — implemented in `providers/localDemo.ts` with canned knowledge points and cards so the full card/review flow runs without `claude`. It is for demos and UI development, not a real generation backend; card content is static.
- **Env vars** (`QUIZME_DATA_DIR`, `QUIZME_CLAUDE_BIN`, `QUIZME_CLAUDE_WHY_MODEL`, `QUIZME_CLAUDE_WHY_EFFORT`, `QUIZME_PROVIDER`) all take effect at call time — no restart needed beyond the running process.
- **No `Date.now()` / `Math.random()` assumption in workflow scripts**: not relevant to the app itself, but if you author a Workflow orchestration script for this repo, those are unavailable in the script sandbox.

## Code style

- Match surrounding code: tabs for indentation, double quotes for strings, trailing semicolons, `import` type-only imports (`import type { ... }`) for types.
- Prefer named exports; the CLI entry (`src/cli/index.ts`) is the only place with a `main()`.
- Comments are sparse but load-bearing where present (see `json.ts` header, `version.ts`, `config.ts` defaults). When you change behavior a comment describes, update the comment too.
- Commit messages follow **Conventional Commits** in Chinese subject style (see `git log`: `feat(ui): ...`, `refactor(generation): ...`, `style(ui): ...`). Scope = subsystem.

## Things to avoid

- Don't add a direct Anthropic SDK dependency — the `claude` CLI is the only model path.
- Don't persist the in-memory question bank — it's intentionally ephemeral per round.
- Don't change `getAppDataDir()`'s platform logic or the `./.quizme` fallback without a reason; restricted environments depend on it.
- Don't enable agent tools in the `claude` print-mode invocation — context is pre-written into the prompt by design.

## Repo

GitHub: <https://github.com/kapi-lab/quizme> · npm: `@jiy/quizme` · License: MIT
