# Tasks

## 1. Normalized provider web URLs

- [ ] 1.1 Add an optional `url` field to `ProviderIssue` and `ProviderPullRequest` in `src/provider/types.ts`, set it in `src/provider/fake/fake-provider.ts`, and verify `npm run typecheck` passes and the fake provider's tests still pass
- [ ] 1.2 Add `html_url` to the GitHub payload types and populate `url` in `mapIssue`/`mapPullRequest` in `src/provider/github/map.ts`, and verify the mapping tests in `src/provider/github/map.test.ts` cover an issue and a pull request with and without a URL
- [ ] 1.3 Assert the URL contract in `src/provider/contract.ts` (present when the host exposes it, `undefined` otherwise) and verify `npm test -- src/provider` passes for both the GitHub and fake fixtures

## 2. Status snapshot model

- [ ] 2.1 Implement `src/status/snapshot.ts`: build one entry per configured repository from `listTriggerIssues`, `listPullRequestsForIssue`, and the lifecycle-label union, derive each phase with `phaseFromLabels`, and classify queued, in-flight, and terminal work; verify `src/status/snapshot.test.ts` covers a queued issue, each in-flight phase, a merged/terminal workflow, the lifecycle-label union, and that unconfigured repositories are never read
- [ ] 2.2 Expose each repository's `provider` on `ServiceRepository` in `src/service.ts` so the status module can read without running a turn, and verify the existing service tests in `src/service.test.ts` pass

## 3. Status configuration

- [ ] 3.1 Add `StatusConfig` and its defaults (`enabled: false`, `host: 127.0.0.1`, `port: 8787`) to `src/config/types.ts` and `OrchestratorConfig.status`, and verify `npm run typecheck` passes
- [ ] 3.2 Parse and validate the `status` block in `src/config/loader.ts`, applying defaults and failing fast on a non-boolean `enabled`, an empty `host`, or a port outside 1-65535, and verify `src/config/loader.test.ts` covers defaults, overrides, and each invalid field
- [ ] 3.3 Document the `status` block in `docs/configuration.md` and add a commented example to `examples/config.yaml`, and verify the documented defaults match the loader tests

## 4. Read-only HTTP server

- [ ] 4.1 Implement `src/status/server.ts` with `node:http`: serve a server-rendered HTML overview at `GET`/`HEAD /` and the same snapshot as JSON at `GET /status.json`, answer every other method with `405`, cache the snapshot for a short refresh interval with in-flight coalescing, and include no credential values; verify `src/status/server.test.ts` binds an ephemeral port and covers both routes, the method refusal, cache reuse across repeated and concurrent requests, and secret redaction
- [ ] 4.2 Start the status server from `src/index.ts` only for the long-running loop (never under `--once`) and stop it cleanly on `SIGINT`/`SIGTERM`, using an injectable factory so tests do not bind a fixed port; verify `src/index.test.ts` covers enabled, disabled, and one-shot runs
- [ ] 4.3 Document the status UI in `README.md` (how to enable it, the routes, and that remote access belongs behind a reverse proxy) and add an operational note to `deploy/README.md`, and verify the documented commands and paths match the server implementation

## 5. Integration verification

- [ ] 5.1 Run `npm run verify` (format check, lint, typecheck, tests, and `openspec validate --strict`) and resolve every finding

## Workflow follow-up

- Archive the change once the project's review requirements are satisfied.
- Verify the archived result.
