# Configuration

The orchestrator is configured from a single declarative file (YAML or JSON).
It is single-tenant: one operator, one shared file, no per-user accounts.

Secrets are **never** stored in this file. A credential is a *reference* such as
`env:GITHUB_TOKEN`, resolved from the environment at runtime.

## Fields

### Top level

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `repositories` | yes | — | Non-empty list of repositories to serve. |
| `limits` | no | see below | Per-turn cost caps. |

### `repositories[]`

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `provider` | yes | — | Host provider id, e.g. `github`. |
| `owner` | yes | — | Repository owner or namespace. |
| `name` | yes | — | Repository name. |
| `credential` | yes | — | Credential reference, e.g. `env:GITHUB_TOKEN`. |
| `baseBranch` | no | `main` | Branch a workflow branches from and merges into. |
| `pollIntervalSeconds` | no | `30` | How often the repository is polled. |
| `maxReviseRounds` | no | `3` | Maximum propose/review/revise rounds before the workflow is marked failed. |
| `labels` | no | see below | Label name overrides. |

### `labels`

| Field | Default |
|-------|---------|
| `trigger` | `openspec` |
| `proposing` | `openspec:proposing` |
| `ready` | `openspec:ready` |
| `implementing` | `openspec:implementing` |
| `done` | `openspec:done` |
| `failed` | `openspec:failed` |

### `limits`

| Field | Default | Description |
|-------|---------|-------------|
| `maxSteps` | `200` | Agent steps allowed per turn. |
| `maxTokens` | `200000` | Tokens allowed per turn. |
| `maxDurationMs` | `1800000` | Wall-clock limit per turn (30 minutes). |

## Credential schemes

Only `env:NAME` is supported: the value of environment variable `NAME` is used
as the secret. Startup fails fast, naming the affected repository, when a
repository omits `credential`, or when the referenced variable is unset.

## Example

```yaml
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
    baseBranch: main
    pollIntervalSeconds: 60
    maxReviseRounds: 3
    labels:
      trigger: openspec
limits:
  maxSteps: 200
  maxTokens: 200000
  maxDurationMs: 1800000
```

A copy of this example lives at `examples/config.yaml`. With `GITHUB_TOKEN` set
in the environment, the service starts and begins polling `acme/widget`.
