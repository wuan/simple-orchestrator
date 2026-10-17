# Tasks

## 1. Clarify the turn instruction

- [x] 1.1 Reword the constraints in `buildSkillPrompt`
      (`src/runtime/opencode/opencode-runtime.ts`) so the turn is told to commit
      its work to the workflow branch, that the orchestrator publishes that
      branch after the turn, and that it must not push or merge; and verify
      `src/runtime/opencode/opencode-runtime.test.ts` asserts the publishing
      statement and the no-push instruction
- [x] 1.2 Update the report directive so the agent is told not to comment on
      whether the branch has been pushed; and verify the prompt test asserts the
      directive no longer invites a push-status claim

## 2. Integration verification

- [x] 2.1 Run `npm run verify` (format, lint, typecheck, unit and integration
      tests, OpenSpec validation) and verify it passes

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the modified and added `agent-runtime`
  requirements appear in the main spec.
