# Contributing to AIWS

Thanks for helping improve AIWS. Issues and pull requests are welcome in English or Vietnamese.

## Ground rules

AIWS follows the design principles of [spec V1](../aiws/docs/spec-v1.md) §1. A change should:

1. keep the **core** (`aiws/config`, `agents`, `skills`, `templates`) neutral to any AI tool;
2. keep the **orchestrator** deterministic, so the LLM never changes `state.yaml`;
3. enforce rules with a **real mechanism** (hook, permission, git, diff-scope), not only with a prompt;
4. stay **language-agnostic**, with no assumptions about the stack in `source-*`;
5. not break the existing workspace structure.

## Development setup

Requirements: Node.js ≥ 22 and Git. Claude Code is only needed for real (non-scripted) runs.

```bash
cd aiws/adapters/cli
npm ci
npm run check        # ESLint + Prettier check + all tests
npm test             # tests only (scripted adapter, no tokens)
npm run format       # apply Prettier
```

Set `AIWS_KEEP_TMP=1` to keep the temporary test workspaces for inspection.

## Where things live

| Change | Location |
| --- | --- |
| Phases, gates, routing | `aiws/config/workflow.yaml` + `src/engine.js` |
| Write scopes, protected paths, commands | `aiws/config/policies.yaml` |
| Output checks | `aiws/config/contracts/*.yaml` + `src/validate.js` |
| Agent roles / shared knowledge | `aiws/agents/*.md` / `aiws/skills/*/SKILL.md` |
| Claude Code integration | `src/adapters/claude.js`, `src/guard.js` |
| A new AI tool (V2) | a new module in `src/adapters/` implementing `sync` and `runAgent` |

After changing agents, skills or policies, run `aiws sync claude` and commit the regenerated `.claude/` and `CLAUDE.md`.

## Tests

Every behaviour change needs a test. End-to-end scenarios use the scripted adapter (`test/fixtures/scripted`) so they are deterministic and free. See `test/helpers.js` for `makeWorkspace()` and `scenario()`.

## Commits and pull requests

- Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(cli): ...`, `fix(guard): ...`, `docs(readme): ...`, `ci: ...`.
- Keep the subject at 72 characters or fewer, in the imperative mood; explain the *why* in the body.
- Add a line under **Unreleased** in [CHANGELOG.md](../CHANGELOG.md) for user-visible changes.
- Update both [aiws/README.md](../aiws/README.md) and [aiws/README.vi.md](../aiws/README.vi.md) when behaviour changes.
- CI must be green on Windows, Linux and macOS.

## Reporting security issues

Please follow [SECURITY.md](SECURITY.md) and do not open a public issue.

## Code of conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md).
