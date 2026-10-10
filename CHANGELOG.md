# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- A handbook in `aiws/docs/`, `handbook.md` (English) and `handbook.vi.md`
  (Vietnamese): one requirement from writing it to the merged pull request,
  what to read at each human gate, what to do for each kind of stop, and the
  cost, time and model setup of six real requirements on the demo workspace.
  `aiws init` copies it into a new project with the rest of `aiws/docs/`.

### Changed

- The operations guide gives the cost range of the six demo requirements
  instead of one early run, and the current number of tests.

## [0.3.0] - 2026-10-07

Cost control and unattended runs, driven by the second real requirement run
on the demo workspace.

### Added

- `claude.phase_models` in `runtime.yaml` chooses the model of one phase for
  `aiws run`, ahead of `agent_models` and the `model_hint` mapping. An agent
  can then run on a cheaper model in one phase only, for example
  `knowledge_update: sonnet` while `aiws discover` keeps the model of the
  discovery agent.
- `aiws resume REQ --budget USD` also raises the budget ahead of time, while
  the requirement waits at a human gate before the pull request, so a run no
  longer has to stop in the middle of the implementation. From 80% of the
  budget, `aiws run` says so when it stops at a gate, and `aiws status` shows
  the percentage used.

### Changed

- A review that follows an earlier review of the same approved design (after
  fix tasks, or after changes requested on the pull request) is a follow-up:
  the reviewer is given the files and commits changed since the earlier
  review, checks that its critical findings are fixed, and reads in full only
  what changed. A first review, and a review after the design was approved
  again, still read everything.

### Fixed

- Reaching the AI usage limit (for example the session limit of a Claude
  subscription) no longer burns the retries of a step and blocks the
  requirement. The run pauses: no attempt is counted, the state stays
  `running`, `aiws run` and `aiws discover` exit with code 75, and
  `aiws status` shows the message of the AI with the reset time. The next
  `aiws run` starts the same step again and tells the agent about partial
  output; no human gate command is needed.
- The developer agent could not run the build and the tests itself when it
  spelled the command differently from `policies.yaml` (for example
  `./mvnw.cmd` in Git Bash on Windows), because only the configured prefixes
  are allowed. Its prompt now lists the exact commands it may run, in the form
  its shell accepts and only for the sides its task touches, and the
  forward-slash form of a Windows command is allowed too.

## [0.2.0] - 2026-10-04

Hardening release driven by the first real requirement run on the demo
workspace (a Java backend, a JavaScript frontend and a PHP legacy system).

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
- Cost budget per requirement: `limits.max_cost_usd_per_req` in `policies.yaml`
  blocks a requirement before its next step once its AI runs reach the budget.
  Only a human continues, with `aiws resume REQ [--budget USD]`; `aiws status`
  shows the budget. Off by default; runs that report no cost never count.
- `claude.agent_models` in `runtime.yaml` chooses the model of one agent, for
  example `developer: sonnet`, overriding the `model_hint` mapping.
- `aiws discover --branch[=NAME]` commits the knowledge base on a new branch
  (default `aiws/discover-YYYYMMDD`) to be merged through a pull request, for
  workspaces whose base branch is protected. Without the flag nothing changes.

### Fixed

- The guard no longer blocks Bash commands that only mention a denied command
  in literal text, such as a search pattern, a commit message or a
  here-document for `git commit`. Anything that could run that text (shells,
  `eval`, interpreters, `$(...)`, variables, aliases, unbalanced quotes) and
  every PowerShell command is still matched as a whole. Assignments (`X=...`)
  and git aliases (`!...`) are now recognised as command starts.
- Agents never start without a working guard hook. `aiws run` and
  `aiws discover` refuse to start when `.claude/settings.json` is missing, when
  the workspace's own CLI has no `node_modules` (a new git worktree), or when
  `aiws` is not on PATH. A crashing hook exits 1, which does not block, so
  agents used to run with diff-scope as their only check.
- `aiws new --worktree` installs the CLI dependencies of the new worktree.
- `aiws sync claude` writes `aiws guard` as the hook command in projects that do
  not carry the CLI (created with `aiws init`); before, the hook pointed to a
  file that does not exist there.
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

- The `requirement-analysis` and `unit-testing` skills, and the analyst and
  test-designer agents, now guide granularity: one acceptance criterion per
  behaviour with its data variants listed inside it, and one parameterised test
  case per behaviour. The demo requirement produced 22 criteria and 43 test
  cases; the effect of the new guidance has not been measured yet.
- A Claude Code session outside any requirement phase may now drive
  `aiws new` and `aiws run`, so an assistant can coordinate the workflow. Inside
  a phase they stay blocked, so an agent cannot start a nested run. The gate
  commands `approve`, `reject`, `answer`, `redesign`, `resume` and `unlock`
  remain human-only everywhere, enforced by the guard hook and by static deny
  rules.
- An interactive session on an `aiws/REQ-*` branch may also run `aiws new`,
  `aiws run` and `aiws stop`, and may write outside the workspace. Agents
  started by the orchestrator (`AIWS_PHASE` set) keep every restriction; write
  scopes, the git denylist and the gate commands are unchanged for both.
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

[Unreleased]: https://github.com/vannt-dev/aiws-factory/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/vannt-dev/aiws-factory/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/vannt-dev/aiws-factory/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/vannt-dev/aiws-factory/releases/tag/v0.1.0
