# Tasks

## 1. Surface turn failures

- [x] 1.1 Make the embedded host's `runPrompt` throw when the agent errored
      (`finish: "error"`) or the session ended failed, with the provider's
      message, and verify unit tests cover both cases
- [x] 1.2 Confirm the engine's existing failure path marks the workflow failed
      and posts the message, and verify an engine test covers it

## 2. Publish the workflow branch

- [x] 2.1 Add a `push` operation to `RepoProvider` and implement it for the token
      and `gh` transports without exposing the secret in argv, and verify
      command-recording tests cover both
- [x] 2.2 Add push to the provider contract suite and the fake provider, and
      verify the contract passes for GitHub and the fake
- [x] 2.3 Publish the branch in `WorkflowEngine.runTurn` after a successful turn
      (wiring `assertPushAllowed`), and verify tests cover a successful push and
      a push failure marking the workflow failed

## 3. Configure the embedded host

- [x] 3.1 Add an `agent` configuration block (`model` default
      `greenpt/deepseek-v4.1-flash`, optional `agent` and `database`) and verify
      loader tests cover the default and overrides
- [x] 3.2 Parse `provider/model#variant`, pass the model/agent to each session and
      the database to the host, and verify unit tests cover parsing and
      pass-through
- [x] 3.3 Wire a `runtimeFactory` through `createService` and build the embedded
      runtime from configuration in `run.ts`, and verify the CLI still starts and
      exits

## 4. Documentation and verification

- [x] 4.1 Document the `agent` block, the database requirement, and the publish
      behavior in the README and `docs/configuration.md`, and verify the example
      still loads
- [x] 4.2 Run `npm run verify` on Node 24 and verify format, lint, typecheck,
      tests, and OpenSpec validation all pass

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result and that the added and modified capability
  requirements appear in the main specs.
