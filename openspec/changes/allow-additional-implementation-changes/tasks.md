# Tasks

## 1. Decision logic

- [ ] 1.1 Extend the apply `WorkflowAction` in `src/orchestrator/decision.ts` with a follow-up marker, and teach `decide` to inspect the newest human review while the workflow is IMPLEMENTING: a fresh change request or submitted review comment returns an apply action marked as a follow-up; a fresh approval or stale review stays idle. Keep merged, closed, trigger-label, done, and failed precedence ahead of reviews. Verify `npm run typecheck` passes.
- [ ] 1.2 Extend `src/orchestrator/decision.test.ts` with cases for a fresh review in IMPLEMENTING running a follow-up apply, an approval in IMPLEMENTING staying idle, a stale review staying idle, a review at the revise limit still running apply, and merge/cancellation winning over a review.

## 2. Engine and turn dispatch

- [ ] 2.1 Carry the follow-up marker into the apply turn in `src/orchestrator/engine.ts` and `src/domain/types.ts`, including the runtime turn context. Keep setting IMPLEMENTING before an initial apply; for a follow-up, keep the existing implementing phase.
- [ ] 2.2 Change the no-progress rule in `runTurn`: an initial apply turn that commits nothing still fails, while a review-driven follow-up apply turn that commits nothing skips publishing, posts the turn's summary and questions, marks the pull request ready for review, and leaves the workflow IMPLEMENTING. Verify a failure in the post-turn steps still marks the workflow failed.
- [ ] 2.3 Extend `src/orchestrator/engine.test.ts` with cases for a follow-up review that commits and stays IMPLEMENTING, an approval in IMPLEMENTING that runs no turn, a follow-up that commits nothing without failing, an initial apply that commits nothing still failing, a review submitted during a follow-up turn driving the next apply turn, and a failed follow-up turning the workflow failed.
- [ ] 2.4 Extend `src/orchestrator/e2e.test.ts` with the review loop from issue #110: propose, approve and implement, request changes after implementation, run a follow-up apply turn, then merge to DONE. Verify pull-request comments record the watermarks and the workflow never leaves IMPLEMENTING for the follow-up.

## 3. Apply instruction

- [ ] 3.1 Add the follow-up flag to `TurnContext` and use it in `buildSkillPrompt` in `src/runtime/opencode/opencode-runtime.ts`: an initial apply instruction implements the tasks and archives the change; a follow-up instruction addresses the reviewer feedback and archives only when an active OpenSpec change remains, explicitly avoiding a second archive of an archived change.
- [ ] 3.2 Extend `src/runtime/opencode/opencode-runtime.test.ts` for an initial apply prompt containing `openspec archive`, a follow-up prompt naming the feedback and the archive condition, an archived-change prompt that tells the agent not to archive again, and an unchanged propose prompt.

## 4. Documentation

- [ ] 4.1 Update `README.md`: add the `IMPLEMENTING` self-transition for review feedback, revise the happy path to describe a follow-up apply turn after implementation, replace the "nothing is reacted to in implementing" trigger rule, and update the phase and transition tables. Keep the revise-limit wording clear that apply turns, including follow-ups, do not count.
- [ ] 4.2 Check `docs/configuration.md` for any wording that says implementation ignores reviews, and update it if present. Confirm no configuration field, label, or phase is added.

## 5. Verification

- [ ] 5.1 Run `npm run verify` and `openspec validate "allow-additional-implementation-changes" --type change --strict`; verify both pass with no lint, type, test, formatting, or spec errors.
- [ ] 5.2 Confirm the archived spec delta carries the follow-up requirement and the modified apply, ready-for-review, and no-progress requirements into `workflow-orchestration` and `agent-runtime`.
