# AIWS — AI Software Factory (V1, Claude Code first)

**Language:** English · [Tiếng Việt](README.vi.md)

AIWS turns a requirement into tested code through controlled phases with human gates:

```
discover (once) ─► analysis ─► design + test spec ─► [HUMAN approves design] ─► planning
   ─► implementation (per task: developer → build → unit test → commit) ─► review ─► [HUMAN merges PR] ─► knowledge update ─► done
```

- **Core** (`aiws/config`, `agents`, `skills`, `templates`) defines *what* to do. It is Markdown/YAML and neutral to any AI tool.
- **Orchestrator** (the `aiws` CLI in `aiws/adapters/cli`) decides *when* something may run: it owns `state.yaml`, runs phases, validates contracts, enforces diff-scope and commits.
- **Adapter** decides *which AI* does the work. V1 ships `claude` (headless Claude Code) and `scripted`, a deterministic adapter for tests and demos that costs no tokens.

Original specification: [docs/spec-v1.md](docs/spec-v1.md). Rules for AI agents: [../AGENTS.md](../AGENTS.md).

---

## 1. Installation

Requirements: Node.js ≥ 22, Git, and Claude Code (`claude`) signed in.

```bash
cd aiws/adapters/cli
npm install          # required: the guard hook runs from this folder
npm link             # optional: puts `aiws` on your PATH
```

Without `npm link`, run `node aiws/adapters/cli/bin/aiws.js <command>` from the workspace root.

## 2. Getting started with a real project

1. **Bring the code in** (any language, see section 2a).
   - `source-fe/`, `source-be/`: the new target repositories. Git submodules are recommended; remove the placeholder first:
     `git rm -q source-be/.gitkeep && git submodule add <url> source-be` (same for `source-fe`, `source-legacy`).
     You can add more sides, for example `source-mobile/` or `source-worker/`.
   - `source-legacy/`: the old system, read-only.
2. **Declare build/test commands**: run `aiws detect` to see the proposal, then `aiws detect --write` to merge it into `aiws/config/policies.yaml` (`sides`, `source_paths`, `commands`). Review the result. Commands run from the workspace root and may differ per OS: `{windows: ..., posix: ...}`.
3. **Pin down conventions**: open Claude Code at the root, on `main`, and ask: *"Read source-fe/ and fill aiws/skills/fe-conventions/SKILL.md with the REAL conventions in use, each with an example file; mark anything uncertain with [CẦN XÁC NHẬN]"*. Do the same for `be-conventions`, then review and correct them.
4. **Generate the Claude configuration**: `aiws sync claude` writes `CLAUDE.md`, `.claude/agents`, `.claude/skills` and `.claude/settings.json` (deny rules and the guard hook). Re-run it whenever `aiws/` changes.
5. **Discovery**: run `aiws discover`, then review and correct `aiws/knowledge/*` and commit.
6. **Write a requirement** in `requirements/REQ-001-<name>.md` and commit it.

## 2a. Any language, international standards

AIWS does **not** depend on the language of the frontend, backend or legacy code. The orchestrator only needs three things:

1. **Build/test commands** for each side in `policies.yaml` that exit non-zero on failure. `aiws detect` recognises Java (Maven/Gradle), .NET, Node.js (npm/pnpm/yarn), Python, Go, PHP, Ruby, Rust and Dart/Flutter; declare anything else by hand.
2. **The folder of each side** (`sides`). Any number of sides is supported. The `{side}_build` check and the headless Bash permissions are derived from them (a .NET project may run `dotnet test`, a Go project `go`, and so on).
3. **Test case ids in tests**: the orchestrator recognises `TC-3`, `TC_3` and `tc3` in display names, tags, traits, markers or comments, the way each framework attaches metadata.

Discovery receives the detected stacks (including a file-extension summary of legacy code such as `.cbl` or `.frm`) and describes every folder in terms of its own technology (skill `legacy-analysis`).

All AI output must follow **common international standards** and must **not break the existing structure** (skill `coding-standards`, loaded for the architect, test designer, developer and reviewer):

| Area | Standard |
| --- | --- |
| Acceptance criteria | Given/When/Then (Gherkin); requirement quality per ISO/IEC/IEEE 29148 |
| Test specification | ISO/IEC/IEEE 29119-3 (id, objective, priority, traceability, preconditions, test data, steps, expected result); ISTQB test design techniques |
| Unit tests | Arrange-Act-Assert; names follow the framework's convention; TC ids via standard metadata (`@DisplayName`/`@Tag`, `[Trait]`, `pytest.mark`, `t.Run`...) |
| Code | The project's own conventions first, then the language's official style guide (Google Java Style, .NET conventions, PEP 8, Effective Go, PSR-12, Effective Dart...) |
| API | OpenAPI 3.x, HTTP semantics per RFC 9110; RFC 9457 problem details when the project has no error format; ISO 8601 / RFC 3339 timestamps |
| Security | OWASP Top 10 / ASVS |
| Commits | Conventional Commits (`feat(REQ-001): T1 …`, `fix(REQ-001): …`, `chore(REQ-001): …`) plus git trailers |
| Structure | No renaming, moving, deleting or reformatting of files, folders or public APIs outside the approved design; tests live where the ecosystem expects them. The reviewer reports violations as `major` or `critical`. |

## 3. Lifecycle of a requirement

```bash
aiws new REQ-001                 # creates aiws/work/REQ-001 and branch aiws/REQ-001
aiws run REQ-001                 # analysis → design → test spec, stops at the design gate
#   read 01-analysis.md, 02-design.md, 03-test-spec.md, api-contract.yaml
aiws approve REQ-001 design      # or: aiws reject REQ-001 design -m "change X because Y"
aiws run REQ-001                 # planning → every task → review, stops at the PR gate
git push -u origin aiws/REQ-001  # a HUMAN pushes, opens the PR, reviews and merges
aiws approve REQ-001 pr          # after the merge: switches to aiws/REQ-001-knowledge
aiws run REQ-001                 # updates aiws/knowledge → done; push that branch and open a small PR
aiws trace REQ-001               # AC → TC → task → commit → test matrix
```

When the orchestrator stops, `aiws status REQ-001` tells you why and what to run next:

| Situation | State | What the human does |
| --- | --- | --- |
| Analysis has `[blocking]` questions | `analysis / waiting_human` | `aiws answer REQ-001 -m "..."`, then `aiws run` |
| Design is ready | `design_approval / waiting_human` | `aiws approve … design` or `aiws reject … design -m` |
| Developer wrote `questions.md` | `design_change_requested` | `aiws answer … -m` (keep the design) or `aiws redesign … -m` (back to design, needs a new approval) |
| A task failed 3 times | `implementation / blocked` | fix or revert by hand, `aiws resume REQ-001`, then `aiws run` |
| Review found a `[critical]` issue | back to `planning` automatically | nothing: the planner adds fix tasks |
| The design changed after approval | back to `design_approval` automatically | approve again |

Human-only commands (`approve`, `reject`, `answer`, `redesign`, `resume`, `unlock`) **refuse to run inside an AI session** and ask you to retype the requirement id. Pass `--yes` in CI scripts.

**Merging the PR:** any merge method works. `aiws approve REQ-001 pr` accepts the merge when the requirement branch is an ancestor of the base (merge commit or fast-forward), or when every file the requirement changed has the same content on the base (squash or rebase). Update your local base branch first. After a squash or rebase the commit ids recorded in `state.yaml` no longer exist on the base, so `aiws trace` finds the task commits by their `Task:` trailer. A merge commit keeps one commit per task and is the best choice for traceability.

**Pausing a run:** `aiws stop REQ-001`, from any terminal or worktree, asks the running `aiws run` to stop after its current step; `aiws run REQ-001` continues later, and no gate command is needed. If the process is killed instead (Ctrl+C, a closed terminal), the task it was working on stays `running` in `state.yaml`: the next `aiws run` keeps the partly written files of that task and tells the developer agent to review them first. Uncommitted files outside the task are still refused.

**Parallel work:** only one requirement may write source code at a time, from implementation until its PR is merged (the source lock). Other requirements can still run analysis and design, each in its own worktree:

```bash
aiws new REQ-002 --worktree ../ws-REQ-002
cd ../ws-REQ-002 && aiws run REQ-002
```

## 4. Enforcement: four layers, each one still blocks if the previous one is bypassed

| Layer | Implementation |
| --- | --- |
| 1. Orchestrator | Agents of a locked phase are never called. Approvals carry the hash of 02/03/api-contract; editing those files invalidates the approval. Retries are capped; beyond the cap the requirement is `blocked`. |
| 2. Tool permissions | Headless: `claude -p --permission-mode dontAsk --allowedTools …` per contract. The reviewer has no Bash; the developer may only run the build/test commands. |
| 3. Hook | `aiws guard` (PreToolUse for Edit/Write/Read/Bash/PowerShell) reads the `AIWS_*` environment or the `aiws/REQ-*` branch plus `state.yaml` and blocks writes outside the scope. Nested shells such as `bash -c`, `node …/aiws.js approve` or `git -C . push` are analysed too. |
| 4. Git + diff-scope | After EVERY AI run the orchestrator compares git state before and after: files outside the scope are reverted and the run fails, however they were written. Commits carry trailers; `aiws check …` is meant for CI. |

Diff-scope is the real guarantee; the hook only blocks earlier. Diff-scope **cannot see files ignored by `.gitignore`**, so never keep logic in build output.

## 5. Configuration

| File | Content |
| --- | --- |
| `config/workflow.yaml` | Phases, order, gates, retries, routing on failure or critical findings. There is no "skip phase" command: change this file through review instead. |
| `config/policies.yaml` | `protected_paths`, `maintainer_editable`, `read_deny`, `phase_write_scope`, `sides`, `commands`, `bash_allow_extra`, `bash_denylist`, `limits`, `approvals.require_signed`. |
| `config/runtime.yaml` | Adapter per phase, `model_hint` → model mapping (`opus`/`sonnet`), timeout, `guard_command`. |
| `config/contracts/*.yaml` | Per phase: agent, skills, tools, reads, outputs (required headings, template), rules, checks, `max_attempts`. |
| `agents/*.md` | Roles: front matter `id`, `description`, `tools`, `skills`, `model_hint`; the body is the prompt. `{req}` and `{task}` are substituted. |
| `skills/*/SKILL.md` | Shared knowledge, copied to `.claude/skills` and embedded in headless prompts. |
| `templates/` | Output templates: the headings and id formats that the validator checks. |

Built-in validator rules: `ac_numbered`, `no_blocking_questions`, `every_ac_has_tc`, `plan_valid`, `review_no_open_critical`, plus `format: openapi|yaml` for outputs.

## 6. Interactive use

Both modes share the same protection:

- **Automatic:** `aiws run`.
- **Interactive:** open `claude` on branch `aiws/REQ-001` and ask *"use the architect agent for REQ-001"*. The hook infers the phase from `state.yaml` and blocks writes that belong to another phase.

On `main`, outside any requirement, you may use Claude to maintain `aiws/` itself (agents, skills, config). Claude can also coordinate the workflow by running `aiws new`, `aiws run` or `aiws status`; each run still stops at the human gates. `source-legacy/`, `requirements/`, `state.yaml` and `approvals/` stay locked. An AI can never run the gate commands `approve`, `reject`, `answer`, `redesign`, `resume` or `unlock`, and inside a phase it cannot start a nested `aiws run` either.

To see the prompt an agent will receive: `aiws prompt REQ-001 design`.

## 7. Evidence, traceability, CI

- `aiws/work/REQ/evidence/runs/run-NNNN.json` and `.prompt.md` record the adapter, command, allowed tools, prompt hash, duration, turns, estimated cost, changed files, reverted violations and validation errors.
- `evidence/test-results/<task>-attempt-N.yaml` records the test command, exit code, a log excerpt and the task's test cases.
- Task commits carry the trailers `REQ-ID`, `Task`, `Tests` and `AIWS-Run`; `git log --grep "REQ-ID: REQ-001"` lists every change of a requirement.
- CI runs `aiws check commit-trailer --req REQ-001`, `aiws check approvals --req REQ-001` (enable `require_signed` to require GPG/SSH-signed approvals via `aiws approve --sign`), `aiws trace REQ-001` and `aiws check build`. The last one re-runs every `<side>_build` and `<side>_test` command of `policies.yaml`, so code about to be merged is rebuilt and retested outside the AI run.

## 8. Cost

`aiws status REQ-001` shows the number of AI runs, their total time and the cumulative cost of the requirement, broken down by phase. `cost_usd` in the evidence is the **API list-price equivalent** reported by Claude Code. With a Claude subscription (Pro/Max) it only counts against your plan's usage limits; with an API key or Console account it is real spend. Run `/status` in Claude Code to see which applies.

A real run on the sample project (sonnet, a small requirement with 2 tasks) cost about USD 1.30 equivalent over 8 runs. Change `runtime.yaml → claude.models` to reduce it. `npm test` uses the `scripted` adapter and costs nothing.

## 9. Intentional differences from spec V1

| Spec | Implementation | Reason |
| --- | --- | --- |
| Python CLI | Node.js CLI (ES modules, 2 dependencies) | No Python on the reference machine; fast hook start-up; the adapter interface is still `sync` / `runAgent`. |
| Developer commits | Orchestrator commits once build and tests pass | The AI needs no git rights, trailers are always correct and failing code is never committed. |
| `unit_test` phase run by a tester agent | Built-in step: the orchestrator runs the full suite of every touched side and checks each test case id appears in the tests | Test results are never taken on the AI's word. The `tester` agent remains for interactive use. |
| `aiws/work/.source-lock` | `<git-common-dir>/aiws-source-lock.yaml`, never committed | Shared by all worktrees, no git conflicts. |
| Lock released after knowledge_update | Released when the PR is merged (`approve pr`) | The knowledge update does not write source code. |
| Review criticals / PR change requests → implementation | → planning (the planner adds fix tasks, done tasks stay done) | Fix tasks need explicit `allowed_files`. |
| Parallel analysis/design | Through `aiws new --worktree` | A working tree can only check out one branch. |
| `permissions.deny` for every protected path | Static deny only for paths nobody edits through Claude; `maintainer_editable` is handled by the context-aware hook | Maintainers can still edit `aiws/` with Claude on `main`. |
| Hook matcher Edit/Write, Bash | Also Read and PowerShell | Claude Code on Windows has a PowerShell tool. |
| — | Approval hashes normalise CRLF → LF | Approvals do not break because of `core.autocrlf`. |
| — | Extra commands `answer`, `redesign`, `unlock`, `prompt`, `trace`, `check …`, `detect` | Needed to operate the gates and to support any language. |
| Example npm/Maven build commands | `commands` is empty; `aiws detect` proposes them per stack; any number of sides | Language-agnostic. |

## 10. Developing the CLI

```bash
cd aiws/adapters/cli
npm ci
npm run check                    # ESLint + Prettier check + all tests
npm test                         # 22 tests: e2e, guard, diff-scope, retry, gates, lock, init/sync, languages (~4 min)
AIWS_KEEP_TMP=1 npm test         # keep the temporary workspaces for inspection
```

CI (GitHub Actions) is a staged pipeline; each stage runs only if the previous one passed:

0. **Detect changes**: checks whether the CLI, the `aiws/` kit or `AGENTS.md` changed.
1. **Lint and format**: ESLint and Prettier, once.
2. **Test on Linux** with Node 22, the minimum supported version.
3. **Test on Windows and macOS** with Node 22, plus Linux with Node 24.
4. **CI result**: the single status required by branch protection on `main`.

Docs-only changes skip stages 1–3, and stage 4 still reports success so the pull request is not blocked. Branch protection on `main` requires `4. CI result` and `AIWS gates`, and blocks force pushes and branch deletion. A separate **AIWS gates** workflow re-checks commit trailers, approvals and the traceability matrix on pull requests from `aiws/REQ-*` branches, then runs the project's own build and tests with `aiws check build`. It sets up Java only when a Maven or Gradle project exists under `source-*`; add the toolchain steps your stack needs. See [.github/CONTRIBUTING.md](../.github/CONTRIBUTING.md).

The sample project used by the tests lives in `test/fixtures/sample`; the simulated agents live in `test/fixtures/scripted` (each agent is a Node script that writes its outputs like a well-behaved AI).

## 11. Open items

- [ ] Put real code into `source-fe/`, `source-be/`, `source-legacy/`; run `aiws detect --write` to fill `commands` in `policies.yaml` (currently empty).
- [ ] Finalise `fe-conventions` / `be-conventions` (currently skeletons marked `[CẦN XÁC NHẬN]`).
- [ ] API contract tooling (spec §13): add `commands.api_contract_be` / `api_contract_fe`; the review phase runs them and treats failures as critical findings.
- [ ] Trial DB migrations (spec §13, option A or B).
- [ ] V2: Codex/Gemini adapters (`src/adapters/`) and cross-model review via `runtime.yaml → phases.review.adapter`.
