# AIWS handbook

**Language:** English · [Tiếng Việt](handbook.vi.md)

This handbook walks you through one requirement, from writing it to the merged pull request, and tells you what to do each time the workflow stops. It is for the person who runs AIWS on a project: a developer or a tech lead.

The [operations guide](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.md) is the reference for installation, configuration and enforcement. This handbook does not repeat it; it links to the section you need.

The examples and numbers come from six real requirements run on the demo workspace of the [aiws-factory](https://github.com/vannt-dev/aiws-factory) repository (a Java backend, a JavaScript frontend and a PHP legacy system). You can read all of their documents on its [`demo` branch](https://github.com/vannt-dev/aiws-factory/tree/demo/aiws/work).

## What you do and what the AI does

| You | The AI, driven by the `aiws` orchestrator |
| --- | --- |
| Write the requirement | Analyses it into acceptance criteria |
| Read the design and the test specification, then approve or send them back | Writes the design, the API contract and the test specification |
| | Plans small tasks, writes the code and the unit tests task by task, reviews the result |
| Review and merge the pull request | Updates the knowledge base after the merge |

You run two approval commands for each requirement. The AI cannot run them: they refuse to start inside an AI session.

**A note on language.** The agent prompts and the document templates of the kit are written in Vietnamese, so the analysis, design, test specification and review come out in Vietnamese, with headings such as `Quyết định cần duyệt` ("decisions to approve"). The orchestrator checks those headings. To work in another language, translate `aiws/agents/`, `aiws/templates/` and `aiws/skills/` together with the `required_headings` in `aiws/config/contracts/`. This has not been tried on the demo.

## 1. Before the first requirement

Set the workspace up once. The operations guide has the details in [sections 1 and 2](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.md#1-installation).

1. Install the CLI: `cd aiws/adapters/cli && npm install && npm link`.
2. Put your code into `source-fe/`, `source-be/` and `source-legacy/`.
3. Run `aiws detect --write` and check the build and test commands it wrote to `aiws/config/policies.yaml`.
4. Fill in `aiws/skills/fe-conventions` and `aiws/skills/be-conventions` with the real conventions of your code.
5. Run `aiws sync claude`, then `aiws discover`, and correct what discovery wrote in `aiws/knowledge/`.

Before you go on, run `aiws check build`. It runs every configured build and test command. If it fails now, every task will fail later for the same reason.

On Windows without `npm link`, type `node aiws\adapters\cli\bin\aiws.js` wherever this handbook says `aiws`.

## 2. Write the requirement

A requirement is a short Markdown file that a person writes and commits: `requirements/REQ-001-short-name.md`. The AI may read this folder but can never write to it.

There is no template. A requirement that worked well on the demo had three parts: the context, what must be true when the work is done, and what is out of scope. This is REQ-003, shortened and translated ([original](https://github.com/vannt-dev/aiws-factory/blob/demo/requirements/REQ-003-customer-status.md)):

```markdown
# REQ-003 — Deactivate and reactivate a customer

## Context

The new system shows the status of a customer (active / inactive) but has no way to change it.
The old system (`source-legacy`) keeps the status in the `status` column and has a rule:
a phone number only has to be unique among **active** customers.

## Requirements

- Staff can switch an active customer to inactive, and back.
- Deactivating does not delete the customer and does not change the name, email or phone number.
- A customer cannot be reactivated while another active customer uses the same phone number.
  The error must be clear and the status must not change.
- The list screen has a way to change the status of each customer, and refreshes after the change.

## Out of scope

- Deleting customers.
- Filtering or searching the list by status.
```

What helped:

- **Say what must be true, not how to build it.** The design is the architect's job, and you approve it.
- **Name the rules that must match the old system.** The analyst reads `source-legacy/` and quotes the lines it relied on.
- **Write the "out of scope" list.** It keeps the design from growing.
- **Keep a requirement small.** The six demo requirements produced 4 to 22 acceptance criteria and 3 to 7 tasks each. When the analyst finds a requirement too large, it says so in its open questions.
- **Point at earlier documents by path** when a requirement follows up on another one, for example `aiws/work/REQ-003/05-review.md`.

If something is unclear, the analyst does not guess silently. It writes an open question. A `[blocking]` question stops the run until you answer it with `aiws answer REQ-001 -m "..."`. A `[non-blocking]` question comes with the assumption the analyst made, and you check it at the design gate.

## 3. Start the run

```bash
aiws new REQ-001          # creates aiws/work/REQ-001 and the branch aiws/REQ-001
aiws run REQ-001          # runs until the next point that needs you
```

`aiws run` prints one line when an agent starts and one when it ends. This is the start of a real run:

```
[REQ-003] analysis / analyst (attempt 1/3)
  ok -> design
[REQ-003] design / architect (attempt 1/3)
  ok -> design
[REQ-003] design / test-designer (attempt 1/3)
  ok -> design_approval (waiting_human)
```

You do not have to watch it. On the demo, the run reached the design gate after about 30 to 60 minutes. At any time, `aiws status REQ-001` shows the phase, the tasks, the cost so far and the reason for the last stop. `aiws stop REQ-001` asks the run to stop after its current step, and `aiws run REQ-001` continues later.

To keep your own checkout free while a requirement runs, give it a worktree of its own: `aiws new REQ-001 --worktree ../ws-REQ-001`, then run the other commands from that folder.

## 4. The design gate

The run stops with `phase=design_approval status=waiting_human`. Nothing is coded yet. This is the cheapest moment to change direction, so take the time to read.

The documents are in `aiws/work/REQ-001/`. Read them in this order:

1. **`02-design.md`, the last section, "Quyết định cần duyệt" (decisions to approve).** The architect lists every choice that needs your judgement, with the alternatives it rejected. Statements it could not verify are marked `[CẦN XÁC NHẬN]` ("to be confirmed").
2. **`01-analysis.md`.** Check that each acceptance criterion (`AC-1`, `AC-2`, ...) says what you meant, and read the assumptions under "Câu hỏi mở" (open questions).
3. **`03-test-spec.md`, the last section, "Ma trận AC" (AC matrix).** Every acceptance criterion must have test cases. Read a few test cases in full: they should name concrete data and expected results.
4. **`api-contract.yaml`**, if the requirement changes an API.

Questions worth asking while you read:

- Does the design differ from the old system on purpose anywhere, and do you agree?
- Did the architect choose the simple option where you wanted the strict one, or the other way round?
- Did anything from your "out of scope" list come back in?
- Is something left to be checked by hand only? On the demo, page wiring without unit tests was listed as manual steps for the reviewer of the pull request.

Then decide:

```bash
aiws approve REQ-001 design
# or send it back with a reason; the design is written again, and you approve again
aiws reject REQ-001 design -m "Use option C for the double click, and return 409 for a duplicate"
```

You may also correct the documents by hand before you approve. The approval records a hash of the design, the test specification and the API contract. If one of them changes afterwards, the approval is no longer valid and the requirement returns to this gate.

Sometimes the design asks you to choose. In REQ-005 the design listed three ways to handle a double click while a filter is on, and was written for the first; approving it as it stood accepted that default, and a reject with a note would have selected another.

**If the cost is already high**, raise the budget now, before you approve. From 80% of the budget, `aiws run` says so when it stops at a gate. `aiws resume REQ-001 --budget 55` works at this gate; after the approval the requirement is running again, and the budget can only be raised once it has blocked the requirement.

## 5. While the AI implements

After the approval, run `aiws run REQ-001` again. You are not needed until the pull request.

- The planner splits the design into tasks. Each task names the files it may change and the test cases it must cover.
- For each task, the developer agent writes the code and the unit tests. The orchestrator then runs the build and the full test suites itself, and commits only when they pass. A failing task gets up to three attempts, each new one with the failure in its prompt.
- The reviewer compares the whole change with the design, the API contract and the test specification, and writes `05-review.md`.

Two things can happen on the way without you:

- **A critical review finding.** The workflow goes back to planning by itself, adds a fix task, and reviews again. The second review is a follow-up that reads in full only what changed. On the demo this happened once, when the developer built something the design had explicitly rejected.
- **A question from the developer.** If the design is wrong or incomplete, the developer does not improvise: it writes `questions.md` and the run stops. Answer with `aiws answer REQ-001 -m "..."` to keep the design, or `aiws redesign REQ-001 -m "..."` to go back to the design phase, which then needs a new approval.

## 6. The pull request gate

The run stops with `phase=pr_approval status=waiting_human`. From here the steps are yours.

1. **Push the branch and open a pull request**, as you would for any change: `git push -u origin aiws/REQ-001`.
2. **Read `05-review.md` and `trace.md`.** The review lists findings by severity. Minor ones are left for you to decide. The trace matrix links every acceptance criterion to its test cases, task and commit. Then review the diff itself.
3. **If you want something changed, say so before you merge:**

   ```bash
   aiws reject REQ-001 pr -m "TC-137 and TC-138: compare the values directly, not through a boolean"
   aiws run REQ-001
   ```

   The planner adds a fix task, the developer does it, and a follow-up review runs. Push again and the pull request updates. On the demo, such a cycle for a four-line change took 7 minutes of AI time and cost 3.39 USD.
4. **Merge the pull request.** Any merge method works; a merge commit keeps one commit per task, which is best for traceability.
5. **Confirm the merge.** Update your local base branch first, then run `aiws approve REQ-001 pr`. The command checks that the branch really is merged, records the approval and switches to a new branch, `aiws/REQ-001-knowledge`.
6. **Finish.** `aiws run REQ-001` updates `aiws/knowledge/` for what the requirement changed. Push `aiws/REQ-001-knowledge` and merge it through a small pull request of its own. The requirement is now `done`.

The budget cannot be raised ahead of time at this gate, because the requirement branch must stay exactly what the pull request merges.

Keep in mind what the review can and cannot tell you. The reviewer reads code and documents; it does not click through your application. Where code has no automated test, the design lists manual steps, and somebody has to run them.

## 7. When the run stops

`aiws status REQ-001` always gives the reason. These are the stops you are likely to meet. The operations guide has the complete table in [section 3](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.md#3-lifecycle-of-a-requirement).

| What `aiws status` says | What it means | What you do |
| --- | --- | --- |
| `design_approval` / `waiting_human` | The design is ready | Section 4 |
| `pr_approval` / `waiting_human` | The code is ready for a pull request | Section 6 |
| `analysis` / `waiting_human`, blocking questions | The analyst cannot go on without an answer | `aiws answer REQ-001 -m "..."`, then `aiws run` |
| `design_change_requested` | The developer asked a question in `questions.md` | `aiws answer` or `aiws redesign`, then `aiws run` |
| `blocked`, "failed 3 attempts" | A step failed on every attempt it is allowed: three, or two for the review and the knowledge update | Read the reason and the last file in `evidence/runs/`. Fix the cause or revert by hand, then `aiws resume REQ-001` and `aiws run` |
| `blocked`, "budget exceeded" | The AI runs reached the budget | `aiws resume REQ-001` grants one more budget; `--budget 80` sets a new limit |
| `running`, "paused by the AI usage limit" | The AI account reached its usage limit; `aiws run` exited with code 75 | Nothing to approve. Run `aiws run REQ-001` again after the reset time in the message |

Some errors appear before a run starts:

| Message | What you do |
| --- | --- |
| "Working tree has uncommitted changes outside REQ-001's scope" | Commit or stash those files. The orchestrator must be able to tell its own changes from yours |
| "Source lock is held by REQ-002" | Only one requirement may write source code at a time. Finish and merge the other one. If the lock is stale, `aiws unlock` |
| "The guard hook cannot start" | Run `aiws sync claude`; in a worktree, run `npm ci --omit=dev` in its `aiws/adapters/cli` |
| An approval command refuses to run | It was started inside an AI session. Run it in your own terminal |

`aiws resume`, like every approval command, asks you to retype the requirement id. Pass `--yes` to skip the question in a script.

## 8. Cost and time

`aiws status` shows the cost of a requirement by phase. The number is the **list-price equivalent** that Claude Code reports. With an API key it is real spend. With a Claude subscription it only counts against the usage limits of your plan.

These are the six demo requirements. They are small features on a small codebase, so treat them as an order of magnitude, not a forecast.

| Requirement | AC → TC | Tasks | AI time | Cost (USD) | Models |
| --- | --- | --- | --- | --- | --- |
| REQ-001 customer phone | 22 → 43 | 5 | 74 min | 32.15 | Opus everywhere |
| REQ-002 edit customer | 14 → 38 | 7 | 90 min | 40.65 | Sonnet for the developer; one fix cycle |
| REQ-003 status change | 10 → 26 | 6 | 69 min | 27.22 | also Sonnet for the knowledge update |
| REQ-004 harden a button | 4 → 10 | 3 | 60 min | 24.92 | also Sonnet for planning |
| REQ-005 filter by status | 5 → 20 | 5 | 86 min | 31.69 | also Fable for the review |
| REQ-006 finish the filter | 6 → 15 | 7 | 61 min | 27.91 | also Sonnet for the test designer; one change request |

From REQ-004 on, the analysis and the design are 55% to 67% of the cost, and the analyst and the architect still run on Opus. Writing the code is the cheap part: 0.3 to 1.4 USD for a task on Sonnet.

What each change of model did on the demo:

| Step | Before | After | Result |
| --- | --- | --- | --- |
| Developer, per task | Opus: 1.7 to 3.1 USD, 2 to 9 min | Sonnet: 0.3 to 1.4 USD, 4 min or less | Every task passed on the first attempt |
| Planning | Opus: 1.9 to 3.6 USD, 3 to 7 min | Sonnet: 0.8 to 1.2 USD, 2 to 4 min | Four plans, each accepted on the first attempt |
| Test designer | Opus: 3.6 to 6.9 USD, 11 to 22 min | Sonnet: 2.34 USD, 9 min | One run; accepted on the first attempt |
| Review | Opus: 4.1 to 5.1 USD, 9 to 15 min | Fable: 3.4 to 4.4 USD, 4 to 6 min | Two runs; no way to tell yet whether it finds more |
| Knowledge update | Opus: 4.5 to 5.1 USD, 10 to 11 min | Sonnet: 1.1 to 2.1 USD, 3 to 7 min | Matched the code in each spot check |

One caution from REQ-002: a cheaper developer once built an alternative the design had rejected. The review caught it, and the fix cycle cost about 7.5 USD, about twice the six developer runs before it together (3.55 USD). Since version 0.3.0 the developer is given the exact build and test commands and runs them itself before it hands a task in, and this has not happened again.

The two controls are in the operations guide, [section 8](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.md#8-cost):

- **A budget for each requirement**: `limits.max_cost_usd_per_req` in `aiws/config/policies.yaml`. The demo uses 40.
- **A model for each agent or phase** in `aiws/config/runtime.yaml`. This is the setup of the demo after six requirements:

  ```yaml
  claude:
    models:
      strong-reasoning: opus     # analyst, architect and everything not listed below
      strong-coding: opus
      fast: sonnet
    agent_models:
      developer: sonnet
      test-designer: sonnet
    phase_models:
      planning: sonnet
      review: claude-fable-5-1
      knowledge_update: sonnet
  ```

  Run `aiws sync claude` after you change `agent_models`.

## 9. Questions people ask

**Can the AI approve its own design or merge its own code?**
No. The approval commands refuse to run inside an AI session, a hook blocks the attempt before that, and the pull request is merged by a person on your git host. See [section 4](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.md#4-enforcement-four-layers-each-one-still-blocks-if-the-previous-one-is-bypassed) of the operations guide.

**What if an agent changes a file it should not touch?**
After every AI run the orchestrator compares the files with the write scope of the phase. Anything else is reverted and the run counts as failed. In the 79 AI runs of the demo this never had to happen.

**Do I have to watch the run?**
No. It stops by itself at the two gates and when it needs you. `aiws status` tells you where it is.

**Can two requirements run at the same time?**
Their analysis and design can, each in its own worktree. Only one requirement at a time may write source code, from its first task until its pull request is merged.

**Does it work with my language?**
The orchestrator only needs a build command and a test command for each source folder that exit with an error when they fail. See [section 2a](https://github.com/vannt-dev/aiws-factory/blob/main/aiws/README.md#2a-any-language-international-standards) of the operations guide.

**How do I see what an agent was told?**
`aiws prompt REQ-001 design` prints the prompt a phase would get. After a run, `aiws/work/REQ-001/evidence/runs/` holds the prompt, the cost and the changed files of every run.

**How do I know the tests really pass?**
The orchestrator runs the full test suites itself after each task and does not take the AI's word. In CI, `aiws check build` builds and tests the pull request again.

**Can I use another AI tool?**
Version 1 runs on Claude Code. The agents, skills and rules in `aiws/` are plain Markdown and YAML, so another adapter can reuse them; adapters for other tools are planned.
