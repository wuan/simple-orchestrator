# Tasks

## 1. Phase-label reference

- [x] 1.1 Add a phase-label table under "How it works" that maps each phase to its default lifecycle label and meaning, and state that the `openspec` trigger label is on the issue while the current phase's lifecycle label marks it on the pull request, replacing any other phase label; verify every default name against `src/config/types.ts` and the `labels` table in `docs/configuration.md`
- [x] 1.2 Document that the label names are configurable through `labels` and that cancelling a workflow clears the phase labels; verify against `setPhase`/`clearPhase` in `src/orchestrator/engine.ts` and the `labels` section in `docs/configuration.md`

## 2. Transition table

- [x] 2.1 Add a transition table keyed by current state with **State**, **Trigger**, **Next state**, and **Action** columns; verify every row against `decide()` in `src/orchestrator/decision.ts`, the actions in `src/orchestrator/engine.ts`, and the discovery/recovery paths in `src/orchestrator/poller.ts`
- [x] 2.2 Cover the entry/start transition, initial and revise propose turns, approval and the apply claim, merge, failure (turn error, no progress, revise limit, unintegrated base, publish failure, mark-ready failure), cancellation, recovery, and idle rows; verify every `WorkflowAction` kind and every recovery path appears
- [x] 2.3 Name the turn skill (`propose` or `apply`) and the observable host operations in each action row (create the draft pull request, push the branch, post a comment, mark the pull request ready for review, set or clear lifecycle labels), and state explicitly when no turn runs; verify the wording matches the existing lifecycle bullets

## 3. Lifecycle diagram correction

- [x] 3.1 Update the Mermaid lifecycle diagram so it removes the `IMPLEMENTING -> PROPOSING: new feedback` edge and shows only transitions the table lists, including failure and recovery; verify each diagram edge appears in the transition table
- [x] 3.2 Explain beside the diagram that it is an overview, that the table is the authoritative reference, and that cancellation ends a workflow by clearing the phase labels; verify the prose does not claim a transition the table omits
- [x] 3.3 Render-check the Mermaid block in a Mermaid-capable preview (or on GitHub) without a syntax error, and verify the README still carries exactly two `mermaid` blocks with `grep -c '^```mermaid$' README.md`

## 4. Consistency with the documentation contract

- [x] 4.1 Check each scenario in `specs/project-documentation/spec.md` against the finished README: every state has a transition reference, the phase labels are explained, actions name the turn and host operations, terminal/failure/cancellation/recovery are covered, and the diagram does not contradict the table
- [x] 4.2 Confirm the README's existing label and lifecycle statements still agree with the new tables, and that no unrelated section was rewritten; verify `git diff README.md` is limited to the "How it works" section

## 5. Verification

- [x] 5.1 Run `npm run verify` and verify the format check, lint, typecheck, tests, and strict OpenSpec validation all pass
- [x] 5.2 Run `openspec validate --strict document-workflow-state-transitions` and `openspec status --change document-workflow-state-transitions`; verify validation passes and every artifact reports `done`, so the readiness predicate marks the change READY

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result folds the new `project-documentation` requirement into `openspec/specs/project-documentation/spec.md`.
