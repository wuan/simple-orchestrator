# Design

## Context

See `proposal.md` - Why. The relevant current state:

- `.github/workflows/ci.yml` installs `@fission-ai/openspec@1.16.0`, then runs
  `npm run verify`, whose `validate` script runs
  `openspec validate --strict --all` and `openspec validate --strict --archived`.
- `NodeOpenspecCli` (`src/orchestrator/readiness.ts`) shells out to
  `openspec list --json`, `openspec status --change <name> --json`, and
  `openspec validate <name> --strict`.
- `.gitignore` ignores `.opencode/`, the directory OpenSpec 1.x used for
  OpenCode. `.prettierignore` ignores `openspec/` but nothing under `.agents/`.
- `AGENTS.md` already refers to the `openspec-*` skills.

## Goals / Non-Goals

**Goals:**

- Run one supported OpenSpec major across CI, the orchestrator, and the agent's
  skills, so a validation and the skill that wrote the change agree.
- Commit the shared skills 2.0 installs so an agent working in this repository
  (including a turn on this repository) finds the OpenSpec workflows.
- Keep the orchestrator's CLI integration and tests free of a migration change.

**Non-Goals:**

- Changing the readiness predicate, the workflow lifecycle, or the orchestrator
  prompts.
- Adding OpenSpec to the npm dependency tree; the CLI stays a tool the CI job
  and the host install.
- Committing a per-tool skill copy or a link for OpenCode, which reads
  `.agents/skills/` directly.

## Decisions

### Decision: Pin `@fission-ai/openspec@2.0.0` in CI

Keep the repository's exact-pin style and name the major explicitly. The
`validate` script already runs `--all` and `--archived` as two commands, which
2.0 supports, so only the version changes.

Alternative considered: pin the floating major (`@2`). Rejected to match the
existing exact pin and keep the CI toolchain reproducible.

### Decision: Commit the shared `.agents/skills/` tree

OpenSpec 2.0 writes every skill once to `.agents/skills/` and records the tools
set up in the project in `.agents/skills/.openspec-target`. OpenCode reads that
directory directly, so the migration runs `openspec update` (which is a no-op on
a 1.x tree that never committed tool files) and, to add the layout, `openspec
init --tools opencode`, then commits the result. This is what finally makes the
`openspec-*` skills that `AGENTS.md` names actually available in the checkout.

Alternative considered: leave the skills untracked and let each checkout run
`openspec init`. Rejected because the orchestrator's turns start from a clean
clone, so an uncommitted skill tree is never present.

### Decision: Keep `.agents/skills/` out of Prettier

The pre-commit hook rewrites every staged file Prettier understands, and the
`format:check` gate reads `.prettierignore`. The skills are OpenSpec's files and
`openspec update` rewrites them verbatim, so formatting them would fight the
tool. Add `.agents/skills/` to `.prettierignore`, the same way `openspec/` is
excluded.

### Decision: Change no orchestrator source

The readiness predicate parses `changes[].name` from `list --json`, `artifacts`
and `isComplete` from `status --json`, and the exit code of `validate --strict`.
The 2.0 CLI produces each of those unchanged from 1.16.0, so the adapter and its
tests stay as they are. This is verified by running the existing readiness and
end-to-end archive tests against the 2.0 binary.

## Risks / Trade-offs

- [OpenSpec 2.0 drops the `/opsx:*` commands some documentation might reference]
  -> the repository referenced no commands, only the `openspec-*` skills, so
  only AGENTS/README wording may need a clarifying line.
- [`openspec update` overwrites edits made inside an installed skill] ->
  the skills are committed and never hand-edited; lasting project instructions
  stay in `openspec/config.yaml`, which the update leaves alone.
- [A host still on the 1.x CLI runs an older `update` and cannot refresh the
  committed skills] -> the deploy documentation requires the 2.0 CLI, and an
  older CLI still validates and archives the change; only `update` differs.
- [OpenCode reads `.agents/skills/` from the project directory] -> true for the
  target repositories' turns as well, so their skills come from their own
  checkouts and this repository changes only its own.

## Migration Plan

1. Land the CI pin and the committed `.agents/skills/` tree.
2. On each host, install the 2.0 CLI and run `openspec update` in a checkout to
   clear any 1.x `.opencode/` skills and command files.
3. Rollback is configuration-only: pin the 1.x CLI again and restore the
   previous tree; no source or spec depends on the CLI major.

## Open Questions

None.
