# QuizMe

[English](./README.md) | [简体中文](./README.zh-CN.md)

[![npm version](https://img.shields.io/npm/v/@jiy/quizme?logo=npm&label=npm)](https://www.npmjs.com/package/@jiy/quizme)
[![npm downloads](https://img.shields.io/npm/dm/@jiy/quizme?label=downloads)](https://www.npmjs.com/package/@jiy/quizme)
[![node](https://img.shields.io/node/v/@jiy/quizme?logo=node.js&label=node)](https://www.npmjs.com/package/@jiy/quizme)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![GitHub](https://img.shields.io/badge/source-github-black?logo=github)](https://github.com/kapi-lab/quizme)

QuizMe is a local-first CLI MVP that turns Claude Code session context, repository context, or a topic you type in into short interview-style multiple-choice questions.

## How it works

```
 Claude Code transcript   repository context   a topic you type
 (~/.claude/projects)        (--repo .)            ("React ...")
            │                     │                     │
            └──────────┬──────────┴──────────┬──────────┘
                       ▼                     ▼
                 Sources ──────────► SourceSummary
                       │
                       ▼
          Generation · prompts + schema + validator + dedupe
                       │  builds a prompt carrying the context
                       ▼
            ClaudeAgent ─► `claude` CLI  (print mode: --bare --tools "")
                       │  returns structured JSON questions
                       ▼
            Storage (quizme.json, atomic temp+rename)
                       │  stats · profile · pending review queue
                       ▼
            Ink TUI  ──►  answer  ──►  `why` mode (deep explanation
                                          on a wrong answer, via claude)
```

QuizMe does **not** call the Anthropic API directly. It shells out to your local `claude` CLI in print mode, so it uses whatever model and account your Claude Code is signed in with.

## Documentation

- [Product Document](docs/product.md) *(Chinese)*
- [Technical Document](docs/technical.md) *(Chinese)*

## Installation

```bash
npm install -g @jiy/quizme
```

You can also run it directly with `npx` without a global install:

```bash
npx @jiy/quizme
```

## Prerequisites

Question generation and `why` mode invoke the local **Claude Code CLI** (the `claude` command). Make sure it is installed and on your `PATH`:

```bash
claude --version   # should print a version number
```

If not installed, run `npm install -g @anthropic-ai/claude-code`, or see the [Claude Code docs](https://docs.anthropic.com/claude-code).

> No `claude` available? You can still try it offline: `QUIZME_PROVIDER=local`.

## Usage

```bash
quizme
quizme --repo .
quizme "React rendering and caching"
```

## Configuration

### Interactive settings (persisted)

On first run you'll be guided to choose a language and level; from the in-app **Settings** page you can adjust the following, all written to local config:

| Option | Description | Values |
| --- | --- | --- |
| Language | Language of questions and explanations | 中文 / English |
| Level | Target difficulty | Junior / Mid / Senior / Staff+ |
| Daily goal | Number of questions per day | 1–9 |
| Sound | Answer sound effects | On / Off |
| Question model | Alias passed to `claude --model` for generation | Haiku (default, fast) / Sonnet / Opus / account default |
| Question Effort | Level passed to `claude --effort` for generation | Low (default) / Medium / High / xHigh / Max |

> Default `Haiku` + `Low`: question generation is essentially structured JSON output, so Haiku/low is sufficient and noticeably faster and cheaper. Bump it up in Settings when you need higher quality.

### Environment variables

| Variable | Purpose |
| --- | --- |
| `QUIZME_CLAUDE_BIN` | Absolute path to the `claude` executable (use when PATH lookup fails) |
| `QUIZME_DATA_DIR` | Override the local data directory; defaults to the platform app-data dir, falling back to `./.quizme` in restricted environments |
| `QUIZME_CLAUDE_WHY_MODEL` | Model alias used by `why` mode (deep explanation after a wrong answer); falls back to the account default |
| `QUIZME_CLAUDE_WHY_EFFORT` | Effort level for `why` mode (`low`/`medium`/`high`/`xhigh`/`max`); falls back to the default |
| `QUIZME_PROVIDER` | Set to `local` for the offline demo mode: canned sample cards, no `claude` calls — a full tour of the card flow and review scheduling |

> `why` mode is deliberately configured separately from question generation: explanations are more sensitive to model quality, so it keeps the account model by default; set these variables only when you want to globally downgrade or speed it up.

## Notes

- Default mode reads the most recent Claude Code transcript for the current repo from `~/.claude/projects`. Stats, archive, settings, and review features are accessible from the interactive main menu.
- Local data is a single `quizme.json` file in the platform app-data directory, written atomically (temp file + rename). It holds config, stats, profile, and the knowledge-point ledger (with spaced-repetition state); the current round's cards live in memory only and are never persisted.
- Question generation and `why` mode invoke the local `claude` CLI in print mode (`--bare` + `--tools ""`, agent tools disabled; context is written into the prompt).
- The offline demo mode (`QUIZME_PROVIDER=local`) serves canned sample cards without touching `claude` — good for a quick tour; card content is static, and review variation plus `why` deep-dives still need the real model.

## License

[MIT](./LICENSE)
