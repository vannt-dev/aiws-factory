## Summary

<!-- What changes and why. Link the issue: Closes #123 -->

## Type of change

- [ ] feat: new capability
- [ ] fix: bug fix
- [ ] docs / chore / ci / refactor / test

## Checklist

- [ ] PR title follows [Conventional Commits](https://www.conventionalcommits.org/) (`feat(cli): ...`, `fix(guard): ...`)
- [ ] `npm run check` passes in `aiws/adapters/cli` (lint, format, tests)
- [ ] New behaviour is covered by a test (scripted adapter, no tokens needed)
- [ ] Docs updated: `aiws/README.md` and `aiws/README.vi.md`, `CHANGELOG.md` under *Unreleased*
- [ ] If agents, skills or policies changed: `aiws sync claude` was run and `.claude/` is committed
- [ ] No secrets, `.env` content or proprietary source code included

<!-- For aiws/REQ-* pull requests created by the orchestrator, the "AIWS gates" CI job
     re-checks commit trailers, approvals and the AC -> TC -> task -> commit trace. -->
