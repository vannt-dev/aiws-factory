# aiws-factory

The `aiws` command: the orchestrator of [AIWS — AI Software Factory](https://github.com/vannt-dev/aiws-factory): a requirement becomes tested code through gated phases (analysis → design + test specification → human approval → implementation task by task with unit tests → review → human pull-request merge → knowledge update). A deterministic CLI owns the state; AI agents only work inside the write scope of the current phase. Runs on Claude Code; a Codex adapter can take the review.

```bash
npx aiws-factory init my-project   # a new workspace with the reference kit (config, agents, skills, templates, docs)
npm install -g aiws-factory        # puts the `aiws` command on your PATH
cd my-project && git init && git add -A && git commit -m "aiws workspace"
aiws detect --write            # recognise the stack of each source-* folder
aiws sync claude               # generate CLAUDE.md and .claude/
aiws discover                  # build aiws/knowledge/
aiws new REQ-001 && aiws run REQ-001
```

Requirements: Node.js 22 or newer, Git, and Claude Code signed in. The package carries the kit it was released with; `aiws init` records that version in `aiws/config/kit-version`, and `aiws run` says so when the CLI and the kit of a workspace are not the same release.

Documentation, the handbook and the changelog live in the repository: <https://github.com/vannt-dev/aiws-factory>.

MIT © Van Nguyen
