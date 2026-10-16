# Configuration

The orchestrator is configured from a single declarative file (YAML or JSON).
It is single-tenant: one operator, one shared file, no per-user accounts.

Secrets are **never** stored in this file. A credential is a *reference* such as
`env:GITHUB_TOKEN` or `gh:token`, resolved at runtime from the environment or
the `gh` CLI.

## Fields

### Top level

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `repositories` | yes | — | Non-empty list of repositories to serve. |
| `limits` | no | see below | Per-turn cost caps. |
| `workspace` | no | see below | Where repository clones and per-turn worktrees live. |

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

### `workspace`

| Field | Required | Default | Description |
|-------|----------|---------|-------------|
| `root` | no | `~/workspace` | Root holding one persistent clone per repository, at `<root>/<owner>/<name>`. |
| `worktrees` | no | OS temp directory | Parent directory for ephemeral per-turn git worktrees. |

A leading `~` in either path is expanded to the operator's home directory. The
orchestrator clones each repository once into `root` and reuses it across turns,
while each turn runs in a throwaway git worktree of that clone, created under
`worktrees` and removed when the turn ends.

## Credential schemes

| Reference | Source |
|-----------|--------|
| `env:NAME` | The value of environment variable `NAME`. |
| `gh:token` | The token printed by `gh auth token`. |

The GitHub provider talks to the API through the `gh` CLI, so authentication is
delegated to `gh`. The resolved credential is exported to `gh` as `GH_TOKEN`;
when it is the `gh:` scheme (or an `env:` reference whose variable is unset and
resolved via `gh auth token`), `gh`'s own stored authentication is used.

Startup fails fast, naming the affected repository, when a repository omits
`credential`, or when the reference cannot be resolved from either the
environment or an authenticated `gh` (run `gh auth login`).

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
workspace:
  root: ~/workspace
  worktrees: /tmp
```

A copy of this example lives at `examples/config.yaml`. With `GITHUB_TOKEN` set
in the environment — or, without it, an authenticated `gh` (`gh auth login`) —
the service starts and begins polling `acme/widget`.
