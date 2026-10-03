# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `aiws status` shows the AI runs of a requirement: how many, their total time
  and the cumulative cost (list-price equivalent) per phase.
- `aiws check build` runs every configured `<side>_build` and `<side>_test`
  command. The AIWS gates workflow runs it on `aiws/REQ-*` pull requests and
  sets up Java only when a Maven or Gradle project exists.
- `aiws stop REQ` asks a running `aiws run` to stop after its current step,
  through a marker file, so it works the same on Windows, macOS and Linux.
  Agents inside a phase cannot run it.
- Interrupted runs are resumable: a task is saved as running before its agent
  starts, and the next `aiws run` continues it and tells the developer that
  the task's files may contain partial work.

### Fixed

- `aiws approve REQ pr` accepts squash and rebase merges: besides the ancestor
  check it passes when every file the requirement changed has the same content
  on the base. It no longer checks out the base branch, so it works when the
  base is checked out in another worktree. `aiws trace` falls back to the
  `Task:` trailer when a recorded commit id is not on the base.
- `aiws detect` proposes Maven test commands without `-q` (`-B -ntp` instead),
  so the test evidence keeps the "Tests run: N" summary. Existing policies keep
  their commands until `aiws detect --write --force`.
- `aiws detect` now proposes `.\mvnw.cmd` on Windows. A bare `mvnw.cmd` is not
  found by cmd.exe when `NoDefaultCurrentDirectoryInExePath` is set, which
  Claude Code does.
- Headless Bash permissions include the prefixes of both the `windows` and the
  `posix` form of each command, because Claude Code's Bash tool on Windows is
  Git Bash.
- `aiws detect --write` no longer reformats `policies.yaml`. It rewrites only
  the `source_paths`, `sides` and `commands` blocks that actually change,
  writes them in block style, merges with existing values instead of replacing
  them, and does nothing when the file is already up to date. Comments and
  alignment elsewhere stay byte-for-byte.

### Changed

- A Claude Code session outside any requirement phase may now drive
  `aiws new` and `aiws run`, so an assistant can coordinate the workflow. Inside
  a phase they stay blocked, so an agent cannot start a nested run. The gate
  commands `approve`, `reject`, `answer`, `redesign`, `resume` and `unlock`
  remain human-only everywhere, enforced by the guard hook and by static deny
  rules.
- CI runs as a staged pipeline: change detection → lint and format → Linux tests
  (Node 22) → Windows, macOS and Node 24 tests → a single `4. CI result` status.
  Each stage runs only if the previous one passed; lint runs once instead of in
  every job.
- Docs-only changes skip the lint and test stages while `4. CI result` still
  reports success, so it can be a required check.
- The AIWS gates check moved to its own workflow; Dependabot updates are grouped
  into one pull request per ecosystem.
- Branch protection on `main` requires `4. CI result` and `AIWS gates` and blocks
  force pushes and branch deletion.

## [0.1.0] - 2026-09-26

### Added

- AIWS workspace layout from spec V1: `requirements/`, `source-fe/`, `source-be/`,
  `source-legacy/` (read-only) and `aiws/` (config, agents, skills, templates,
  knowledge, work, adapters).
- `aiws` orchestrator CLI (Node.js ≥ 22): `init`, `detect`, `sync claude`, `discover`,
  `new`, `run`, `status`, `prompt`, `approve`, `reject`, `answer`, `redesign`,
  `resume`, `unlock`, `trace`, `check diff-scope | commit-trailer | approvals`,
  `guard`, `--version`.
- Deterministic state machine: analysis → design + test spec → design approval →
  planning → per-task implementation with unit tests → review → PR approval →
  knowledge update.
- Four enforcement layers: orchestrator gates with hashed approvals, per-run tool
  permissions, `PreToolUse` guard hook (Edit/Write/Read/Bash/PowerShell) and
  diff-scope with automatic revert.
- Claude Code adapter (headless `claude -p`) and a scripted adapter for token-free
  tests and demos.
- Language-agnostic stack detection (Java, Kotlin, .NET, Node.js, Python, Go, PHP,
  Ruby, Rust, Dart/Flutter) and any number of sides.
- Traceability AC → TC → task → commit with Conventional Commits and git trailers
  (`REQ-ID`, `Task`, `Tests`, `AIWS-Run`).
- Eight agent roles and eight skills, including `coding-standards` (ISO/IEC/IEEE
  29119-3 test specifications, Gherkin acceptance criteria, language style guides,
  OpenAPI 3, RFC 9457, OWASP).
- Landing page on GitHub Pages, MIT license, contribution guidelines, code of conduct,
  security policy, CI on Windows, Linux and macOS, Dependabot, issue and PR templates.

[Unreleased]: https://github.com/vannt-dev/aiws-factory/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/vannt-dev/aiws-factory/releases/tag/v0.1.0
