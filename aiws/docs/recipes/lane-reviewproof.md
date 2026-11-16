# Recipe: aiws with lane and reviewproof

One requirement, start to finish, with two other tools around aiws:

- [lane](https://github.com/vannt-dev/lane) gives the run its checkout: a reusable worktree slot, held while the
  requirement runs and given back afterwards, and a second slot from a separate pool for the review.
- [reviewproof](https://github.com/vannt-dev/reviewproof) runs the human review round on the pull request: tests
  run as gates at the pull request's head, every changed file read, findings with a source and a `file:line@sha`
  location, one note on the pull request.

aiws does the work in between: analysis, design, the design gate, tasks with unit tests, its own AI review and the
draft pull request. Nothing here changes aiws, lane or reviewproof; the steps below are the glue, by hand.

This recipe was run end to end on 16/11/2026 with aiws-factory 0.14.0, lane 0.13.0 and reviewproof 0.6.0, on a
workspace with one small Node.js `source-be` and a requirement of one task. Times and costs from that run are in
[What it cost](#what-it-cost). [Known gaps](#known-gaps) lists what did not fit and the workaround used.

```
lane slot (dev)  ->  aiws new / run  ->  design gate (you)  ->  aiws run  ->  draft pull request
lane slot (review, detached at the PR head)  ->  reviewproof round  ->  post (you)  ->  merge (you)
aiws approve pr (you)  ->  aiws run (knowledge)  ->  knowledge pull request (you merge)  ->  lane done x2
```

## Before the first requirement

Do these once, in the main clone of the workspace, on `main`. They are all yours: `aiws detect --write` changes
configuration that people own and refuses to run inside an AI session.

1. `aiws detect --write`, then `aiws sync claude`. Set `pull_request` in `aiws/config/runtime.yaml` so aiws opens
   the draft pull request itself.
2. `aiws discover`, committed on `main` (or `aiws discover --branch` and a pull request). Do it before any lane
   slot exists: a slot made earlier does not have `aiws/knowledge/`, and `aiws run` stops at analysis with
   `missing prerequisites ... run aiws discover first`. Getting out of that block needs `aiws resume`, which is
   yours.
3. Write the requirement in an editor and commit it on `main`. On Windows PowerShell 5.1, do not write it from a
   `.ps1` script saved as UTF-8 without a BOM: PowerShell reads such a script as ANSI and `—` or `…` in the text
   becomes `â€”` or `â€¦`.
4. Set `review_gate: reviewproof` in `aiws/config/workflow.yaml`, then run `aiws sync claude` again:
   - `aiws approve REQ-001 pr` refuses until the last reviewproof round of the pull request reviewed the head of
     `aiws/REQ-001` and ended with verdict `pass`;
   - `aiws sync` writes the run records aiws commits with every requirement (36 changed files on a one-task
     requirement, half of them prompts and run logs) into the `skip` list of `.reviewproof.json` at the workspace
     root (`aiws/work/*/evidence/**`, `aiws/work/_discover/**`), keeping reviewproof's own defaults and any key
     already there. Add `"requiredGates": ["tests"]` to it and commit it.

## 1. A lane slot for the requirement

```bash
lane new my-workspace REQ-001
cd <the slot lane prints>
aiws new REQ-001
```

`aiws new` makes `aiws/REQ-001` from the slot's head. lane's task branch (`REQ-001`) tracks no remote, so
`aiws new` does not take it as the base of the pull request: it says so and uses `base_branch` of
`aiws/config/workflow.yaml` (`main`). `aiws new REQ-001 --base <branch>` names another base.

## 2. The run and the design gate

```bash
aiws run REQ-001                   # analysis, design, test spec, design review; stops at the design gate
aiws approve REQ-001 design        # yours: read 01-analysis.md, 02-design.md, 02-design-review.md, 03-test-spec.md
aiws run REQ-001                   # planning, tasks, review; opens the draft pull request
```

Human-only commands ask you to type the requirement id (`Type REQ-001 to confirm 'approve design':`). Run them one
at a time in a terminal: called from a script, the prompt is easy to miss, and the command then does nothing.

## 3. A review slot and a reviewproof round

`lane new my-workspace --pr <n> --pool review` cannot take the pull request's branch while the dev slot holds it
(git checks a branch out in one worktree only). Take a review slot on a task name and detach it at the head:

```bash
lane new my-workspace review-pr1 --pool review
cd <the review slot>
git fetch origin aiws/REQ-001 && git switch --detach FETCH_HEAD

reviewproof start owner/my-workspace#1
reviewproof diff source-be/src/text.js source-be/test/text.test.js
reviewproof read aiws/work/REQ-001/02-design.md     # records a read: open the file yourself as well
reviewproof gate run tests -- npm test --prefix source-be
reviewproof add findings.json
reviewproof verdict pass --summary "..."
reviewproof draft
reviewproof post --approved-by "Your Name"          # yours: reviewproof refuses it inside Claude Code
```

The round adds what the aiws review does not do: the aiws reviewer reads code and documents and says so in
`05-review.md` ("chưa chạy `npm test --prefix source-be`": the tests were not run), while the reviewproof gate runs the tests at the pull request's head
and the note shows the result. Point the gate at the same command as `commands` in `aiws/config/policies.yaml`.

## 4. Merge, confirm, knowledge

1. Mark the pull request ready and merge it, with a merge commit.
2. `aiws approve REQ-001 pr` tries to update `main`. From a lane slot git refuses to fetch into a branch that the
   main clone has checked out, so aiws says so, checks the merge against `origin/main` and starts the knowledge
   branch from it. Update `main` in the main clone afterwards: `git -C <main clone> pull --ff-only`.
3. `aiws approve REQ-001 pr` in the dev slot (yours), then `aiws run REQ-001` for the knowledge update.
4. Push `aiws/REQ-001-knowledge`, open its pull request and merge it.
5. `lane done <dev slot>` and `lane done <review slot>`. lane keeps both slots, with their dependencies, for the
   next requirement.

## What it cost

The run of 16/11/2026, all agents on Sonnet:

| Step                                           | AI time           | Cost (list-price equivalent)                                             |
| ---------------------------------------------- | ----------------- | ------------------------------------------------------------------------ |
| `aiws discover`                                | 31 s              | 0.09 USD                                                                 |
| Analysis, design, test spec, design review     | 2 min             | 0.42 USD                                                                 |
| Planning, one task, review, draft pull request | 1.5 min           | 0.31 USD                                                                 |
| Knowledge update                               | 0.5 min           | 0.10 USD                                                                 |
| **Total**                                      | **about 4.5 min** | **0.92 USD**; the runs after discover: 618k tokens, 74 % read from cache |

The reviewproof round runs no AI of its own; its cost is the reviewer's session.

## Known gaps

Each gap was met in the run above. The workaround is in the steps; the last column is the glue that would remove it.

| #   | Gap                                                                                                      | Glue that would remove it                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | ~~`aiws new` takes lane's local task branch as the pull request base~~                                   | Done: a branch without an upstream is not taken as the base; `aiws new --base BRANCH`                     |
| 2   | ~~Two review records that do not know each other: `05-review.md` (no tests run) and the reviewproof ledger~~ | Done: `review_gate: reviewproof` in `workflow.yaml`; `approve pr` asks for verdict `pass` at the head |
| 3   | ~~`approve pr` cannot update `main` from a lane slot, and the failed fetch is silent~~                   | Done: it says so and checks the merge against `origin/<base>`                                             |
| 4   | `lane new --pr` fails while the dev slot holds the branch                                                | lane checks the pull request's head out detached when another lane holds its branch                       |
| 5   | ~~reviewproof coverage counts the aiws run records~~ | Done: `aiws sync` writes the `skip` list with `review_gate: reviewproof`; still open: reviewproof could group skipped files by pattern in its note |
| 6   | A missing `aiws discover` is found at `run`, and its block needs `aiws resume`                           | `aiws new` warns at once; `aiws run` clears a prerequisites block once the files exist                    |
| 7   | The knowledge update needs a second pull request after the requirement is `done`                         | aiws opens it through `pull_request`, as it does the first one                                            |
| 8   | lane leaves its unused task branches (`REQ-001`, `review-pr1`) in the main clone                         | `lane done` deletes a task branch that has no commits                                                     |
| 9   | `detect --write` refuses in an AI session but is not listed under "Human-only" in `aiws --help`          | list it there                                                                                             |
| 10  | The guard hook runs the `aiws` first on `PATH`, which can be another version than the one running        | pin the guard to the CLI that wrote it, or warn on a version mismatch                                     |
