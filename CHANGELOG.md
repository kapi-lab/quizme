# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.2] - 2026-07-17

### Added

- **Export debug file** action in Settings: writes a self-contained HTML dump —
  every local JSON file (config, stats, profile, caches) plus the full
  prompt/output of every `claude` CLI call made in the session — into the
  directory QuizMe was launched from. Each session gets its own file name.
- Chinese-mode rendering for the stats and profile screens, laid out to the
  terminal column width with highlighted stat numbers.

### Changed

- Refactored JSONL context extraction from Claude Code transcripts, switching to
  prompt-based filtering.
- Dropped the `followUps` field and tightened the question-generation prompt.
- Removed unused components and dead code.

### Performance

- Questions are now pre-generated in the background and their cache is persisted,
  so an unplayed batch survives restarts and only a cold start hits the loading
  screen.

### Fixed

- `--bare` mode no longer reports OAuth-logged-in users as signed out.
- QuizMe's own generated Claude session transcripts are excluded from the
  transcript source, so it no longer quizzes you on itself.

## [0.1.1]

- Initial published release.

[0.1.2]: https://github.com/kapi-lab/quizme/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/kapi-lab/quizme/releases/tag/v0.1.1
