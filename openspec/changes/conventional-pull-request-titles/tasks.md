# Tasks

## 1. Title deduction and composition

- [ ] 1.1 Add pure helpers in `src/orchestrator/title.ts` that deduce the Conventional Commit `type` from an already-conventional issue title or the issue's labels (documented mapping, default `feat`), take the optional `scope` from a conventional issue title, split that prefix off the summary, and compact the summary (trim, collapse whitespace, drop a trailing period, shorten at a word boundary so `type(scope): summary` fits 72 characters with an ellipsis); verify `src/orchestrator/title.test.ts` covers the label mapping, the default, a conventional-title passthrough with a scope, and the length/word-boundary case.
- [ ] 1.2 Compose the created draft pull request title with the helpers in `WorkflowEngine.start`, replacing the verbatim issue title in `src/orchestrator/engine.ts`; verify `src/orchestrator/engine.test.ts` covers a declarative title deduced to `feat`, a `bug` label deduced to `fix`, a conventional issue title preserved, a non-conventional title that carries no scope, and a long title compacted within the limit.
- [ ] 1.3 Update the `pullRequestTitle` doc comment in `src/orchestrator/engine.ts` to describe the deduced, compacted subject instead of the verbatim issue title; verify `npm run typecheck` passes.

## 2. Outcome reconciliation and provider update

- [ ] 2.1 Add `commitSubjects()` to `SandboxHandle` and implement it in `src/runtime/sandbox.ts` as the subjects of the workspace branch's commits ahead of `origin/<base>` (`git log --format=%s`), throwing on a git failure; verify `src/runtime/sandbox.test.ts` covers a branch with conventional and non-conventional subjects.
- [ ] 2.2 Add a scriptable `commitSubjects()` to `src/orchestrator/testing/fake-sandbox.ts` (a FIFO results queue like `headResults`, defaulting to no subjects).
- [ ] 2.3 Add `updatePullRequest(pullRequest, { title })` to the `RepoProvider` interface and `CreatePullRequestInput`-style input type in `src/provider/types.ts`; implement it in `src/provider/fake/fake-provider.ts`, in `src/provider/github/provider.ts` as a REST `PATCH /repos/{owner}/{repo}/pulls/{number}`, and in `src/provider/github/testing/in-memory-github.ts`; extend `src/provider/contract.ts` and the provider tests to cover updating a title and reading it back.
- [ ] 2.4 Reconcile the title at the end of a successful apply turn in `WorkflowEngine.runTurn` (`src/orchestrator/engine.ts`): read the applied commit subjects from the workspace handle, derive the agreed type and scope, recompose the title with the compacted issue-title summary, and call `updatePullRequest` when it differs; keep the deduced title when the subjects do not agree or reading fails, do not invent a scope when the outcome names none, and treat an update failure as reported and non-fatal; verify `src/orchestrator/engine.test.ts` covers a changed type, an added scope, an outcome with no scope left scope-less, an ambiguous outcome left unchanged, and a failed update not failing the workflow.

## 3. Documentation and integration check

- [ ] 3.1 Update `README.md` to describe the deduced, compacted Conventional Commit title, the per-issue conventional-title override, and the post-apply reconciliation; verify the documented behavior matches the engine tests.
- [ ] 3.2 Run `npm run verify` and confirm formatting, lint, typecheck, tests, and OpenSpec validation all pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result updates the `workflow-orchestration` and
  `repo-provider` specs as the deltas describe.
