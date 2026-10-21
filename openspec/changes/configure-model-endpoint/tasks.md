# Tasks

## 1. Configuration fields

- [ ] 1.1 Add `apiEndpoint?: string` and `apiKeyEnv?: string` to `AgentConfig` in
      `src/config/types.ts` and a `DEFAULT_AGENT_API_KEY_ENV = 'LLM_API_KEY'`
      constant; verify `npm run typecheck` passes.
- [ ] 1.2 Parse both fields in `parseAgent` in `src/config/loader.ts`, defaulting
      `apiKeyEnv` to `DEFAULT_AGENT_API_KEY_ENV` and rejecting an empty or
      non-string value with a `ConfigError`; verify with new
      `src/config/loader.test.ts` cases for the default, each override, and each
      rejection.
- [ ] 1.3 Document the two fields and the generic default variable in the
      `agent` table of `docs/configuration.md`, replacing the
      `GREENPT_API_KEY` example with `LLM_API_KEY`; verify the documented
      keys match `parseAgent` and the example parses.

## 2. In-process provider overlay

- [ ] 2.1 Add an exported `providerConfig(provider)` helper in
      `src/runtime/opencode/sdk-host.ts` that builds the OpenCode provider
      overlay (`provider.<id>.options.baseURL` and `provider.<id>.env`) as JSON,
      omitting `baseURL` when no endpoint is set; verify with
      `src/runtime/opencode/sdk-host.test.ts` assertions for endpoint-only,
      variable-only, both, and neither.
- [ ] 2.2 Extend `EmbedOpenCodeOptions` with the provider id, `apiEndpoint`, and
      `apiKeyEnv`, and pass `config: { content }` to `OpenCode.create` only when
      the overlay applies; verify the `createOptions` assertion in
      `sdk-host.test.ts` covers the configured and unconfigured cases.

## 3. Container path

- [ ] 3.1 Carry the `apiEndpoint` and `apiKeyEnv` in `RunnerRequest` (validated
      optional non-empty strings in `parseRunnerRequest`),
      `RunnerClientOptions`, and the `defaultCreateClient` embedded host in
      `src/runner.ts`; verify with `src/runner.test.ts` cases for a request that
      carries them, one that omits them, and a rejected non-string value.
- [ ] 3.2 Include the `apiEndpoint` and `apiKeyEnv` in the container payload and
      append the configured variable to the docker `--env` names (deduplicated
      against `environment.env`) in `src/runtime/opencode/container-client.ts`;
      verify with `container-client.test.ts` assertions on the payload and the
      `buildDockerRunArgs` output, including the already-listed case.

## 4. Wiring and deployment surface

- [ ] 4.1 Pass `config.agent.apiEndpoint` and `config.agent.apiKeyEnv` into both
      `defaultEmbedded` and `defaultContainer` in `src/run.ts`; verify with
      `src/run.test.ts` that the runtime clients receive the configured values.
- [ ] 4.2 Update `examples/config.yaml`, `deploy/orchestrator.env.example`,
      `deploy/orchestrator.service`, `deploy/README.md`, `README.md`, and
      `environments/README.md` to the generic `LLM_API_KEY` name and to
      document `agent.apiEndpoint` and `agent.apiKeyEnv`; verify no
      `GREENPT_API_KEY` reference remains in the code or the documentation
      (`grep -rn GREENPT_API_KEY --exclude-dir=openspec src docs deploy examples
      README.md environments`), treating any test placeholder of that name as
      incidental to rename or not.

## 5. Verification

- [ ] 5.1 Run `npm run verify` and confirm format, lint, typecheck, tests, and
      `openspec validate --strict` all pass.
