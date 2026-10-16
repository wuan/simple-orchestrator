# AGENTS.md

Guidance for agents working in this repository.

## Commits and pull requests

Use [Conventional Commits](https://www.conventionalcommits.org/). Every commit
subject has the form `<type>(<scope>): <description>`, for example:

- `fix(github): unblock starting a workflow on GitHub`
- `docs: add AGENTS.md`
- `feat(config): allow per-repository poll intervals`

- Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`.
- Scope is optional; name the area you touched (for example `github`, `config`,
  `orchestrator`, `runtime`).
- Use an imperative, lower-case description with no trailing period, and keep
  the subject under 72 characters. Put the "why" in the body, wrapped at 72
  columns.
- The pull request title uses the same form as a commit subject.

## Workflow

- Do not commit to `main`; work on a branch and open a pull request.
- `npm run verify` is the gate: format check, lint, typecheck, the unit and
  integration tests, and OpenSpec validation. The tracked pre-commit hook runs
  it on every commit, and CI repeats it on pull requests and pushes to `main`.
  Bypass it with `git commit --no-verify` only when you know why.

## Commands

```bash
npm install        # also wires the pre-commit hook
npm run build      # compile to dist/
npm test           # unit + integration (fakes; no network)
npm run verify     # the full gate; run this before pushing
```

## OpenSpec

Behavior changes are specified with OpenSpec under `openspec/`. When a change
alters what the system must do, capture it as a change (`openspec new change`)
rather than editing the main specs directly; `openspec validate --strict` is
part of the gate. See the `openspec-*` skills for the propose, apply, sync, and
archive workflows.
