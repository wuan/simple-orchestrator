# Tasks

## 1. Integrate the base branch in the sandbox

- [x] 1.1 Add a `baseIntegrated(): Promise<boolean>` method to `SandboxHandle` and merge `origin/<baseBranch>` into the workspace inside `WorktreeSandbox.create`, leaving conflicts unresolved instead of failing; verify `src/runtime/sandbox.test.ts` covers a clean merge (base commits present in the workspace) and a conflicted merge (unmerged paths remain but provisioning still returns a handle)
- [x] 1.2 Make the integration idempotent: create no new commit when the base is already an ancestor of the branch; verify a second turn over the same base produces no additional merge commit
- [x] 1.3 Implement `baseIntegrated` in `src/orchestrator/testing/fake-sandbox.ts` and verify the engine test suite still compiles and passes
- [x] 1.4 Document base integration in the README "Repository store and worktrees" section and verify the description matches the sandbox tests

## 2. Fail a turn that leaves the base unintegrated

- [x] 2.1 Add a `pendingBaseIntegration` field to `TurnContext` and set it in `WorkflowEngine.buildContext` from the handle; verify `src/orchestrator/engine.test.ts` covers the flag being set and cleared
- [x] 2.2 Re-check the handle before pushing and throw a permanent error naming the base branch when it is not integrated, before `provider.push`; verify a new engine test asserts the workflow is marked failed and the provider recorded no push
- [x] 2.3 Instruct the agent in `buildSkillPrompt` to resolve a pending base merge and commit it; verify `src/runtime/opencode/opencode-runtime.test.ts` asserts the instruction appears only when the flag is set

## 3. Start a fresh workflow from the current base

- [x] 3.1 Force-update an existing branch to a fresh seed commit on the current base in `GitHubProvider.ensureWorkflowBranch`; verify `src/provider/github/provider.test.ts` covers an existing stale branch being reset to the current base
- [x] 3.2 Keep the empty-seed behavior for a brand-new branch; verify the provider contract tests still pass

## 4. Integration verification

- [x] 4.1 Add an end-to-end test where the base advances between turns and verify the later turn's workspace contains the base commits and the workflow advances (`src/orchestrator/e2e.test.ts`)
- [x] 4.2 Run `npm run verify` and confirm format, lint, typecheck, the unit and integration tests, and strict OpenSpec validation all pass

## Workflow follow-up

- Archive this change once the review requirements are satisfied.
