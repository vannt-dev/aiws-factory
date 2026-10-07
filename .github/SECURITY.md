# Security Policy

## Supported versions

| Version | Supported |
| --- | --- |
| 0.3.x | Yes |
| < 0.3 | No |

## Reporting a vulnerability

Please **do not** open a public issue. Report privately through
[GitHub private vulnerability reporting](https://github.com/vannt-dev/aiws-factory/security/advisories/new)
(**Security → Report a vulnerability**).

Include the affected version (`aiws --version`), the operating system, steps to reproduce and the impact.
You can expect an acknowledgement within 7 days and a status update within 30 days.

## Security model and scope

AIWS runs AI agents against your repositories, so the following are in scope:

- an agent writing outside the write scope of its phase or task without being reverted by `diff-scope`;
- an agent approving, rejecting or resuming its own gate (`aiws approve` and similar);
- reading paths listed in `read_deny` (`.env`, keys, `secrets/`) through the guard hook;
- approval records that stay valid after the approved artifacts changed.

Defense in depth: the `aiws guard` hook blocks early, but the guarantee is the orchestrator itself
(locked phases, hashed approvals) plus `diff-scope`, which compares git state before and after every run.
Files ignored by `.gitignore` are outside what `diff-scope` can see.

Out of scope: vulnerabilities in Claude Code, other AI tools or the code under `source-*`.
