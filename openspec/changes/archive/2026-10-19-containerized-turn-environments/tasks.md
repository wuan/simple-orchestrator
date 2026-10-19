# Tasks

## 1. Configuration surface

- [x] 1.1 Add an `EnvironmentSpec` type (image, network, env names, git identity, cache volumes) and an optional `environment` field on `RepositoryConfig`, `RepositoryDefaults`, and `OrchestratorConfig` as needed in `src/config/types.ts`; verify `npm run typecheck` passes.
- [x] 1.2 Parse and validate the `environment` block and merge it through `defaults` in `src/config/loader.ts`, failing fast naming the repository when the image is missing or a field is invalid; verify new unit tests cover missing image, an empty/invalid field, defaults inheritance, and entry override.
- [x] 1.3 Document the `environment` fields and an example in `docs/configuration.md`; verify the documented example loads by extending `src/config/examples.test.ts`.

## 2. Container execution

- [x] 2.1 Rewrite `buildDockerRunArgs` in `src/runtime/sandbox.ts` to mount the store and worktree at identical absolute paths, pass `--user`/`HOME`, apply the network mode, attach named cache volumes, and bind-mount the runner read-only; verify unit tests assert each mount and flag.
- [x] 2.2 Expose the repository store path from `SandboxHandle` so the runtime can mount it; verify `src/runtime/sandbox.test.ts` covers the new accessor.
- [x] 2.3 Add the container entry point in `src/runner.ts` that reads a JSON request, runs the existing `EmbeddedOpenCodeClient`, and writes newline-delimited JSON usage and result events to stdout, mapping errors to a terminal error event; verify unit tests cover success, usage before failure, agent error, and malformed input.
- [x] 2.4 Add `ContainerOpenCodeClient implements OpenCodeClient` in `src/runtime/opencode/container-client.ts` that shells `docker run --rm -i`, writes the request, parses events, forwards usage, kills the container on abort, maps provisioning/protocol failures to errors, and asserts the image's SDK version; verify unit tests drive it with a fake command runner.
- [x] 2.5 Document the image contract (Node 24+, git, toolchain, matching `@opencode/sdk`) and add the environment images under `environments/`, with the shared `base` published as the `node` flavour; verify the documented build command references the runner mount and the image installs the pinned SDK.

## 3. Wiring

- [x] 3.1 Add the resolved environment to `TurnRequest` in `src/runtime/types.ts` and populate it in `WorkflowEngine.runTurn`; verify `src/orchestrator/engine.test.ts` asserts the request carries the repository's environment.
- [x] 3.2 Thread the resolved environment from `src/service.ts` through `Poller` and `WorkflowEngine`; verify service and poller tests cover a repository with and without an environment.
- [x] 3.3 Select the container client in `src/run.ts` when an environment is configured and keep the embedded client otherwise; verify run entry-point tests cover both branches.
- [x] 3.4 Update the `README.md` run/deploy section for containerized turns and the new requirement on Docker; verify documented commands match the implemented flags.

## 4. Integration checks

- [x] 4.1 Add an end-to-end test that drives a full propose/approve/apply lifecycle through the container client with a fake command runner, verifying commits are published and readiness is evaluated on the host.
- [x] 4.2 Add a Docker smoke test that runs one turn against a real environment image, skipped when Docker is unavailable; verify it is skipped in CI without Docker and passes locally with it.
- [x] 4.3 Run `npm run verify` and confirm formatting, lint, typecheck, tests, and OpenSpec validation all pass.

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result updates `agent-runtime` and `orchestrator-configuration` as deltas describe.
