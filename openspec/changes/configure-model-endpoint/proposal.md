# Proposal

## Why

The embedded OpenCode host reaches the model through the `greenpt` provider,
whose definition in OpenCode's models registry hardcodes both the API endpoint
(`https://api.greenpt.ai/v1`) and the credential variable (`GREENPT_API_KEY`).
An operator who runs the same models behind a different or self-hosted
OpenAI-compatible endpoint - or who simply wants a provider-neutral credential
name - cannot point the orchestrator at it without editing OpenCode's registry
or committing a secret whose name names a vendor. The project should name the
endpoint and the token variable itself, so the runtime works against any
compatible endpoint and no part of the configuration is tied to GreenPT.

## What Changes

- Add two optional fields to the `agent` configuration block:
  - `endpoint` - the API base URL for the provider named by `agent.model`.
  - `apiKeyEnv` - the name of the environment variable the provider reads its
    API key from; defaults to the provider-neutral `OPENCODE_API_KEY`.
- The orchestrator composes an OpenCode provider override from those fields and
  applies it to the provider in `agent.model`, in the in-process host and in
  containerized turns, so the configured endpoint and token variable are used
  even when the provider's registry definition hardcodes different ones.
- **BREAKING**: the default provider API-key variable changes from
  `GREENPT_API_KEY` to `OPENCODE_API_KEY`. A deployment that keeps the old name
  sets `agent.apiKeyEnv: GREENPT_API_KEY`, or renames the variable.
- A containerized turn receives the configured API-key variable in addition to
  the names its `environment.env` declares, so a configured token reaches the
  turn without repeating the name per repository.
- Documentation, the example configuration, the systemd env example, and the
  systemd unit's comments use the generic variable name and describe the new
  fields.
- No change to the default model, to the GitHub credential scheme, or to the
  environment image contract.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `orchestrator-configuration`: the `agent` block gains the endpoint and
  API-key-variable fields, validated at startup, with the documented generic
  default token variable.
- `agent-runtime`: the embedded host (and the containerized runner) apply the
  configured endpoint and provider API-key variable to the configured model's
  provider, and the orchestrator passes the configured provider variable into a
  containerized turn.

## Impact

- **Configuration**: `src/config/types.ts` (the `agent` fields and the default
  token-variable name), `src/config/loader.ts` (parsing and validation),
  `src/config/loader.test.ts`.
- **Runtime**: `src/runtime/opencode/sdk-host.ts` (build and pass the OpenCode
  provider override), `src/runtime/opencode/sdk-client.ts` if the options
  surface changes, `src/runner.ts` (carry the override into the container
  request), `src/runtime/opencode/container-client.ts` (pass the provider
  variable and the override), `src/run.ts` (wire the config through), and their
  tests.
- **Docs and deployment**: `docs/configuration.md`, `README.md`,
  `examples/config.yaml`, `deploy/orchestrator.env.example`,
  `deploy/orchestrator.service`, `deploy/README.md`, `environments/README.md`.
- **Operational**: a deployment that set `GREENPT_API_KEY` must rename it to
  `OPENCODE_API_KEY` or pin `agent.apiKeyEnv`.
- **Dependencies**: none new.
