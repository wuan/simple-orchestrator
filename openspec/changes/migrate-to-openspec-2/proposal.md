# Proposal

## Why

The CI verify job pins `@fission-ai/openspec@1.16.0`, and the orchestrator
drives that same CLI for its readiness predicate (`openspec list`,
`openspec status`, and `openspec validate --strict`). OpenSpec 2.0 is the
current major: it installs every workflow as a skill in one shared
`.agents/skills/` tree instead of a per-tool copy, removes the `/opsx:*` command
files, and retires the `delivery` setting. An agent working in this repository
is told to follow the `openspec-*` skills, but the 1.x layout wrote them under
the git-ignored `.opencode/` directory, so the repository commits no OpenSpec
skills at all. Staying on 1.x leaves the project on an unsupported major whose
per-tool skill copies and command files 2.0 no longer maintains.

## What Changes

- CI installs `@fission-ai/openspec@2.0.0`, and the repository commits the
  shared layout 2.0 produces: the OpenSpec skills in `.agents/skills/` with an
  `.agents/skills/.openspec-target` naming OpenCode, and no `/opsx:*` command
  files (OpenCode reads `.agents/skills/` directly and needs no link).
- `.prettierignore` excludes `.agents/skills/`, because OpenSpec owns the
  formatting of the skills it installs and `openspec update` rewrites them
  verbatim.
- Documentation names the OpenSpec major the project runs and states that
  upgrades go through `openspec update`.
- The orchestrator's CLI integration is unchanged: 2.0 keeps the shapes the
  readiness predicate parses for `list --json` and `status --json`, and keeps
  `validate --strict --all` and `validate --strict --archived` as separate
  commands, so `NodeOpenspecCli` and the `validate` script need no source edit.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `dependency-maintenance`: the OpenSpec CLI the project installs tracks a
  supported major, the project carries the shared instruction files that CLI
  produces, and the CLI output the orchestrator relies on stays compatible.

## Impact

- `.github/workflows/ci.yml` - the pinned `@fission-ai/openspec` release.
- `.agents/skills/**` - new: the OpenSpec 2.0 shared skills and
  `.openspec-target`.
- `.prettierignore` - keep Prettier out of `.agents/skills/`.
- `AGENTS.md`, `README.md`, `deploy/README.md` - the required OpenSpec major and
  the skills location.
- `src/orchestrator/readiness.ts` - unchanged; the 2.0 JSON shapes were compared
  against 1.16.0 and match.
- Rollout: a host that runs the orchestrator needs the 2.0 CLI on `PATH`, and
  `openspec update` removes any 1.x skills and command files still present in a
  working tree.
