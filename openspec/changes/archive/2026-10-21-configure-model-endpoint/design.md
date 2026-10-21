# Design

## Context

See `proposal.md` - Why. The current shape matters for the approach:

- The embedded host is created once per process by
  `createEmbeddedHostFactory` (`src/runtime/opencode/sdk-host.ts`), which today
  passes only `database` to `OpenCode.create`. `@opencode/sdk` also accepts an
  inline OpenCode config (`config.content`), the same document an
  `opencode.json` holds.
- The configured model (`agent.model`) is parsed into `provider/id` by
  `parseModelRef`. The provider id is therefore already available to the host
  and runner.
- The container client (`src/runtime/opencode/container-client.ts`) sends a JSON
  request to `src/runner.ts`, which builds the same embedded host in the image.
  The token is not in the request: it crosses only as an environment variable
  the environment names in `environment.env`.
- OpenCode resolves a provider's endpoint and credential variable from its
  models registry. For `greenpt` that entry is
  `env: ["GREENPT_API_KEY"]`, `api: "https://api.greenpt.ai/v1"`. A config
  `provider.<id>` overlay replaces those values without editing the registry:
  `options.baseURL` sets the endpoint and `env` names the credential variable.

## Goals / Non-Goals

**Goals:**

- A configured endpoint and credential-variable name are the only source the
  runtime uses for the model's provider; nothing in the orchestrator names
  GreenPT.
- The same override reaches the in-process host and the in-container host.
- A deployment can keep the old variable name or any other by configuration.

**Non-Goals:**

- Defining a brand-new provider (a different `npm` package and model catalog)
  from orchestrator config. Operators who need that keep using OpenCode's own
  provider configuration and `agent.model`.
- Per-repository model or endpoint overrides. `agent` stays a single top-level
  block, as today.
- Changing the default model or the environment image contract.

## Decisions

### Decision: flat `agent.apiEndpoint` and `agent.apiKeyEnv` fields

Add `apiEndpoint?: string` and `apiKeyEnv?: string` to `AgentConfig` and parse
them in `parseAgent`, rejecting empty or non-string values with a `ConfigError`
as the existing `agent`/`database` fields do. `apiKeyEnv` defaults to
`LLM_API_KEY`.

Alternative considered: a nested `agent.provider` mirroring OpenCode's provider
document. Rejected for now - there is exactly one model and one provider, so the
nested shape adds a level without adding capability. It can be introduced later
if per-provider options are needed.

Alternative considered: an opaque `agent.config` string passed through to
OpenCode. Rejected: it would let an operator break the model/session wiring the
orchestrator owns (agent, model, database) and would make validation
impossible.

### Decision: inject a provider overlay through the SDK's inline config

The host composes

```json
{
  "provider": {
    "<provider from agent.model>": {
      "options": { "baseURL": "<agent.apiEndpoint>" },
      "env": ["<agent.apiKeyEnv>"]
    }
  }
}
```

omitting `options` when no endpoint is configured, and passes it to
`OpenCode.create` as `config: { content }`. This is OpenCode's documented
provider-override shape and the same mechanism the models registry uses, so
overriding an existing provider keeps its model catalog and only swaps the
endpoint and credential variable.

Alternative considered: set the provider's built-in variable (for example
export `GREENPT_API_KEY` from `agent.apiKeyEnv`) before creating the host.
Rejected: it cannot change the endpoint, and it keeps a vendor-named variable in
the code, which is the coupling this change removes.

### Decision: `apiKeyEnv` defaults to `LLM_API_KEY` (**BREAKING**)

The variable name is provider-neutral and documented; the overlay is always
applied, so the default is the generic name rather than the registry's. A
deployment that still sets `GREENPT_API_KEY` either renames it or pins
`agent.apiKeyEnv: GREENPT_API_KEY`.

Alternative considered: make `apiKeyEnv` opt-in with no default. Rejected: the
issue asks for a generic name, and an unset default would leave new deployments
on the vendor-named variable.

Alternative considered: fall back to the provider's built-in variable when the
generic one is unset. Rejected: it reintroduces the vendor coupling the change
removes and makes which credential was used depend on the environment.

### Decision: carry the overlay to the container and pass the token variable

`RunnerRequest` and `RunnerClientOptions` gain the same provider overlay (or the
`apiEndpoint`/`apiKeyEnv` pair it is built from), and `defaultCreateClient` in
`src/runner.ts` passes it to the in-container host, so both hosts are configured
identically. The orchestrator appends the configured `apiKeyEnv` to the
container's `--env` names in addition to `environment.env`, so the token reaches
the container without repeating its name per repository.

Alternative considered: require every environment to list the variable in
`environment.env`. Rejected: the name is now configuration, and making the
operator repeat it per repository invites a silent auth failure when the two
diverge. Only the one configured provider variable is added; no other secret
crosses.

## Risks / Trade-offs

- [OpenCode's config shape moves from `provider`/`options` to
  `providers`/`settings`] → the pinned SDK still accepts and migrates the
  documented `provider`/`options` shape; a host test asserts the exact content
  handed to `OpenCode.create`, so a bump that drops it fails loudly.
- [Injecting `env` could shadow credentials stored in the OpenCode database] →
  only the environment-variable list is overridden, not `options.apiKey`; when
  the variable is unset, stored auth remains the fallback. Documented alongside
  `agent.database`.
- [The default variable rename breaks existing deployments] → called out as
  BREAKING in the proposal with a one-line migration; the old behavior is one
  config field away.
- [Passing the provider variable into containers widens what crosses the
  boundary] → it is exactly one variable, named by configuration, and it is the
  credential the turn needs; the image still bakes no secret and no database is
  shared.

## Migration Plan

1. Rename the host's `GREENPT_API_KEY` to `LLM_API_KEY` (or set
   `agent.apiKeyEnv: GREENPT_API_KEY` to keep the old name).
2. To target a non-default endpoint, set `agent.apiEndpoint` to its base URL.
3. Remove the now-redundant provider variable from `environment.env`; the
   configured variable crosses automatically.
4. Rollback is a revert; no persistent state or schema changes.

## Open Questions

None. The field names (`apiEndpoint`/`apiKeyEnv`), the generic default
(`LLM_API_KEY`), and the scope (an OpenAI-compatible endpoint override of the
model's existing provider, no custom provider definition) were settled in
review; see Decisions above.
