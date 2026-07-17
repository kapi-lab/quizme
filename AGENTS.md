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
  generation/ build prompts, schema, validator, dedupe — turns a SourceSummary
              into a prompt for the claude CLI and validates the JSON it returns
              prompts/quiz.ts (question generation), prompts/why.ts (deep explanation)
  providers/  claudeAgent.ts — spawns `claude` CLI in print mode, parses its NDJSON
              event stream, extracts questions
  storage/    JsonStore — single quizme.json, atomic writes (temp+rename)
              index.ts computes the app-data dir + ./.quizme fallback
  ui/         Ink + React TUI: renderApp, App, screens/, components/, theme, sound
  types.ts    shared types (Store, UserConfig, QuizQuestion, Stats, ...)
  version.ts  reads version from package.json at runtime
test/         node:test unit suites
docs/         product.md, technical.md (Chinese product/design docs)
```

## Key facts and constraints

- **Runtime**: Node ≥ 20, ESM (`"type": "module"`), TypeScript strict. Source runs via `tsx`; published package ships only `dist/`.
- **Claude CLI is the model backend**: generation + `why` mode spawn the local `claude` executable in print mode (`--safe-mode`, `--tools ""` — agent tools disabled, context is embedded in the prompt). Never assume API keys or `@anthropic-ai/sdk`.
- **`claude` binary resolution**: resolved from `PATH`; override with `QUIZME_CLAUDE_BIN` (absolute path). If you touch provider code, preserve this fallback.
- **Data layer is JSON, not SQLite**: all persisted state (config, aggregate stats, profile signals, the pending review queue, and one background-prefetched question batch) lives in a single `quizme.json` written atomically via temp-file + rename. The current round's question bank is in-memory only and never persisted. (`App-Data dir` from `getAppDataDir()`; `QUIZME_DATA_DIR` overrides; `./.quizme` is the last-resort fallback.)
- **Background prefetch caches the next batch**: `generation/prefetch.ts` generates a quiz batch ahead of time (on app start, on config change, and after each round) and persists it via `Store.saveQuestionCache`, keyed by a `cacheSignature(config, mode)` (mode + level + language + model + effort). `QuizScreen` consumes it with `takeQuestionCache` before falling back to live generation; an unplayed batch survives to the next launch so a prefetch is never wasted. A signature mismatch (config changed) discards the stale batch on read. This is distinct from the in-memory question bank — the bank stays ephemeral.
- **Config normalization**: `src/cli/config.ts` `normalizeConfig` fills defaults — `claudeModel` defaults to `"haiku"`, `claudeEffort` to `"low"`, `language` to `"en"`, `level` to `"mid"`, `dailyGoal` to `5`. When adding a config field, update both `normalizeConfig` and the `UserConfig` type in `types.ts`.
- **Question schema is enforced**: `generation/schema.ts` (`QUESTION_SCHEMA`) + `generation/validator.ts` validate model output; `generation/dedupe.ts` drops duplicates within a round. Bad model output is rejected, not silently kept.
- **`why` mode is configured separately** from generation (`QUIZME_CLAUDE_WHY_MODEL` / `QUIZME_CLAUDE_WHY_EFFORT`), defaulting to the account model. Preserve that separation.
- **Offline provider (`QUIZME_PROVIDER=local`) is a stub** — referenced but not implemented. Treat any code path depending on it as non-functional; don't wire features against it yet.
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
