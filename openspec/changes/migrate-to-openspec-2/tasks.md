# Tasks

## 1. Pin the OpenSpec CLI to 2.0

- [ ] 1.1 In `.github/workflows/ci.yml`, change the install from
  `@fission-ai/openspec@1.16.0` to `@fission-ai/openspec@2.0.0`; verify the
  `verify` job still installs the CLI before `npm run verify`.
- [ ] 1.2 With the 2.0 CLI on `PATH`, run `openspec validate --strict --all` and
  `openspec validate --strict --archived` and record the item totals; verify the
  `validate` script passes unchanged.

## 2. Commit the shared OpenSpec 2.0 skills

- [ ] 2.1 Run `openspec update` with the 2.0 CLI, and `openspec init --tools
  opencode` to write the shared layout; commit `.agents/skills/` (the six
  `openspec-*` skills and `.agents/skills/.openspec-target` naming `opencode`).
  Verify `openspec update` then reports the tree up to date.
- [ ] 2.2 Add `.agents/skills/` to `.prettierignore` so Prettier leaves the
  OpenSpec-owned files unchanged; verify `npm run format:check` passes with the
  committed tree.
- [ ] 2.3 Confirm no `/opsx-*` command file or OpenSpec file under `.opencode/`
  is committed; verify a fresh `git ls-files .opencode .agents` lists only the
  `.agents/skills/` tree.

## 3. Verify the orchestrator's CLI integration

- [ ] 3.1 Run `npm test -- src/orchestrator/readiness.test.ts` and confirm the
  predicate still parses `list --json` and `status --json`; no source change is
  expected.
- [ ] 3.2 Run `npm test -- src/orchestrator/e2e.test.ts` with the 2.0 CLI on
  `PATH` and confirm the `openspec archive` end-to-end test still folds a
  change's requirements into the main specs.
- [ ] 3.3 Run `npm run verify` with the 2.0 CLI on `PATH` and confirm formatting,
  lint, typecheck, the tests, and strict OpenSpec validation all pass.

## 4. Document the OpenSpec major and the skills location

- [ ] 4.1 State in `AGENTS.md` and `README.md` that the project runs the
  OpenSpec 2.x CLI, that the skills live in `.agents/skills/`, and that upgrades
  run through `openspec update`; verify the OpenSpec section names the major and
  the skills directory.
- [ ] 4.2 Note the 2.0 CLI requirement in `deploy/README.md` beside the existing
  "give it the `openspec` CLI on `PATH`" instruction; verify no document still
  implies the 1.x per-tool layout.

## Workflow follow-up

- Archive the change after review and approval. The apply turn folds the
  committed skills, the CI pin, and the updated specs into the merge.
