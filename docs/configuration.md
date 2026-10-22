# Configuration

The orchestrator is configured from a single declarative file (YAML or JSON).
It is single-tenant: one operator, one shared file, no per-user accounts.

Secrets are **never** stored in this file. A credential is a _reference_ such as
`env:GITHUB_TOKEN` or `gh:token`, resolved at runtime from the environment or
the `gh` CLI.

## Fields

### Top level

| Field          | Required | Default   | Description                                               |
| -------------- | -------- | --------- | --------------------------------------------------------- |
| `repositories` | yes      | —         | Non-empty list of repositories to serve.                  |
| `defaults`     | no       | —         | Shared repository-entry values merged beneath each entry. |
| `limits`       | no       | see below | Per-turn cost caps.                                       |
| `workspace`    | no       | see below | Where repository clones and per-turn worktrees live.      |
| `logging`      | no       | see below | Diagnostic verbosity.                                     |
| `agent`        | no       | see below | Embedded OpenCode host model, endpoint, and database.     |

### `repositories[]`

| Field                 | Required | Default   | Description                                                                |
| --------------------- | -------- | --------- | -------------------------------------------------------------------------- |
| `provider`            | yes      | —         | Host provider id, e.g. `github`.                                           |
| `owner`               | yes      | —         | Repository owner or namespace.                                             |
| `name`                | yes      | —         | Repository name.                                                           |
| `credential`          | yes      | —         | Credential reference, e.g. `env:GITHUB_TOKEN`.                             |
| `baseBranch`          | no       | `main`    | Branch a workflow branches from and merges into.                           |
| `pollIntervalSeconds` | no       | `30`      | How often the repository is polled.                                        |
| `maxReviseRounds`     | no       | `3`       | Maximum propose/review/revise rounds before the workflow is marked failed. |
| `labels`              | no       | see below | Label name overrides.                                                      |
| `environment`         | no       | —         | Container the repository's turns run in; in-process when omitted.          |

### `defaults`

An optional block whose fields supply values for every repository entry that
omits them. It accepts the same fields as a repository entry except `name`:

| Field                 | Built-in default |
| --------------------- | ---------------- |
| `provider`            | —                |
| `owner`               | —                |
| `credential`          | —                |
| `baseBranch`          | `main`           |
| `pollIntervalSeconds` | `30`             |
| `maxReviseRounds`     | `3`              |
| `labels`              | see below        |
| `environment`         | —                |

Each field resolves as the entry's value, else the `defaults` value, else the
built-in default above. Label names merge key by key, so an entry can override
one label and still inherit the rest from `defaults` and the built-ins. `name`
is never defaulted: it identifies the repository, so every entry must set it.
`provider`, `owner`, and `credential` remain required overall; supplying them
from `defaults` satisfies the requirement for every entry that omits them, and
an entry that still lacks one fails startup naming the repository.

```yaml
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
repositories:
  - name: widget
  - name: gadget
    baseBranch: develop
```

### `labels`

| Field          | Default                 |
| -------------- | ----------------------- |
| `trigger`      | `openspec`              |
| `proposing`    | `openspec:proposing`    |
| `ready`        | `openspec:ready`        |
| `implementing` | `openspec:implementing` |
| `done`         | `openspec:done`         |
| `failed`       | `openspec:failed`       |

### `limits`

| Field           | Default   | Description                                                                                                                             |
| --------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `maxSteps`      | `200`     | Agent steps allowed per turn.                                                                                                           |
| `maxTokens`     | `200000`  | Tokens of new work allowed per turn: input, output, reasoning, and cache write. Cache reads re-read unchanged context and are excluded. |
| `maxDurationMs` | `1800000` | Wall-clock limit per turn (30 minutes).                                                                                                 |

### `workspace`

| Field       | Required | Default           | Description                                                                   |
| ----------- | -------- | ----------------- | ----------------------------------------------------------------------------- |
| `root`      | no       | `~/workspace`     | Root holding one persistent clone per repository, at `<root>/<owner>/<name>`. |
| `worktrees` | no       | OS temp directory | Parent directory for ephemeral per-turn git worktrees.                        |

A leading `~` in either path is expanded to the operator's home directory. The
orchestrator clones each repository once into `root` and reuses it across turns,
while each turn runs in a throwaway git worktree of that clone, created under
`worktrees` and removed when the turn ends.

### `logging`

| Field     | Required | Default | Description                                                             |
| --------- | -------- | ------- | ----------------------------------------------------------------------- |
| `verbose` | no       | `false` | Emit verbose per-poll-cycle and per-turn diagnostics on standard error. |

With `verbose` enabled the orchestrator reports each poll cycle (the repository,
the issues discovered, the workflows started, and the action taken for each
in-flight workflow) and each turn (the skill, its branch, its outcome, and the
readiness result). Diagnostics are written to standard error, so the `--once`
report on standard output stays machine-readable. The `--verbose` (`-v`)
command-line option turns the same diagnostics on for a single run; effective
verbosity is the option OR this field. Credentials and tokens are never written
to output, at any verbosity.

### `agent`

| Field         | Required | Default                       | Description                                                                           |
| ------------- | -------- | ----------------------------- | ------------------------------------------------------------------------------------- |
| `model`       | no       | `greenpt/deepseek-v4.1-flash` | OpenCode model (`provider/model` or `provider/model#variant`) the host runs turns on. |
| `agent`       | no       | host default                  | OpenCode agent to run for a turn.                                                     |
| `database`    | no       | SDK default (in-memory)       | Path to the OpenCode database holding provider auth and model definitions.            |
| `apiEndpoint` | no       | provider's registry default   | API base URL for the model's provider, so an OpenAI-compatible endpoint can be used.  |
| `apiKeyEnv`   | no       | `LLM_API_KEY`                 | Environment variable the model's provider reads its API key from.                     |

The embedded OpenCode host runs in-process, so it needs provider authentication.
The simplest source is the provider's API-key environment variable, named by
`apiKeyEnv` and defaulting to the provider-neutral `LLM_API_KEY`
(`opencode auth export` prints stored credentials), which lets the host use its
own private database. Set `apiEndpoint` to point the model's provider at a
different or self-hosted OpenAI-compatible endpoint; both `apiEndpoint` and
`apiKeyEnv` are applied as an override to the provider named by `model`, so a
provider whose registry entry hardcodes a different endpoint or variable can
still be redirected without editing OpenCode. Alternatively, `database` (or
`OPENCODE_DB`) points the host at the `opencode` CLI's database to reuse stored
auth (find it with `opencode debug paths db`) - but do **not** point it at a
database a running OpenCode service is using: two hosts on one database disrupt
each other. When the configured variable is unset, stored auth remains the
fallback.

### `environment`

By default a turn runs in-process on the host, with whatever toolchains the host
carries. An optional `environment` block runs the repository's turns inside a
container instead, so an agent can use a pre-built toolchain - an Android
SDK/Gradle image, a JDK, a Rust toolchain, a PlatformIO toolchain - without
installing it on the host.
The whole turn (the OpenCode loop, the agent's `bash`, `read`, `write`, and
`edit`, `git`, and `openspec`) runs in the container. The GitHub push credential
never enters it: the orchestrator publishes the branch from the host after the
turn.

The repository store and the turn's worktree are mounted at their identical
absolute paths, the container runs as the orchestrator's user with a writable
home, and the compiled runner is mounted read-only. The image must provide
Node.js 24+, `git`, and the toolchain, and must have `@opencode/sdk` installed at
the orchestrator's version; the runner fails fast when the version differs. See
[`environments`](../environments/README.md) for the image contract and the
ready-made flavours CI publishes to GHCR. Each flavour is published for the
platforms its toolchain supports - `node`, `rust`, and `platformio` cover
`linux/amd64` and `linux/arm64`, `android` covers `linux/amd64` - and Docker
selects the image matching the host's architecture when it pulls the tag.

| Field         | Required | Default  | Description                                                                                                                                                                    |
| ------------- | -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `image`       | yes      | —        | Container image providing the environment.                                                                                                                                     |
| `network`     | no       | `bridge` | Container network mode. The model loop runs inside the container, so provider egress is required.                                                                              |
| `pull`        | no       | `always` | When to refresh the image before a turn: `always` checks the registry, `missing` reuses the local image, `never` never contacts the registry.                                  |
| `env`         | no       | —        | Names of the orchestrator's environment variables passed into the container (for provider auth).                                                                               |
| `gitIdentity` | no       | —        | `name` and `email` an in-container commit uses.                                                                                                                                |
| `caches`      | no       | —        | Named volumes reused across the repository's turns, each a `name` and a container `path`. The orchestrator makes each volume writable by the turn's user before the turn runs. |

```yaml
defaults:
  environment:
    image: ghcr.io/acme/agent-base:latest
    gitIdentity:
      name: OpenSpec Agent
      email: agent@example.com
repositories:
  - name: widget
  - name: gadget
    environment:
      image: ghcr.io/acme/agent-java:latest
      env:
        - LLM_API_KEY
      caches:
        - name: gradle
          path: /home/agent/.gradle
```

An entry inherits the shared environment field by field, so `gadget` above uses
its own image and caches while keeping the shared `gitIdentity`; `widget` uses
the shared image unchanged. An `environment` block that names no image (after
the merge) fails startup naming the repository.

Before each containerized turn the orchestrator refreshes the image according to
its `pull` policy, which defaults to `always`, so a mutable tag such as `latest`
runs the image the tag currently names rather than a stale local copy. An image
reference that encodes a digest (`...@sha256:...`) is immutable and is never
re-checked against the registry. Set `pull: missing` to keep Docker's previous
behaviour of reusing the local image, or `pull: never` to run fully offline; a
refresh that the policy requires and that fails (a registry that is unreachable
or rejects the credential) fails the turn rather than silently using the cached
image.

The configured `agent.apiKeyEnv` is passed into every containerized turn
automatically, so a repository does not have to repeat it in `environment.env`
(an `env` entry of the same name is deduplicated). `env` remains for any other
orchestrator variable a turn needs.

## Credential schemes

| Reference  | Source                                    |
| ---------- | ----------------------------------------- |
| `env:NAME` | The value of environment variable `NAME`. |
| `gh:token` | The token printed by `gh auth token`.     |

The GitHub provider talks to the API through the `gh` CLI, so authentication is
delegated to `gh`. The resolved credential is exported to `gh` as `GH_TOKEN`;
when it is the `gh:` scheme (or an `env:` reference whose variable is unset and
resolved via `gh auth token`), `gh`'s own stored authentication is used.

Startup fails fast, naming the affected repository, when a repository omits
`credential`, or when the reference cannot be resolved from either the
environment or an authenticated `gh` (run `gh auth login`).

## Example

```yaml
# Values shared by every repository; each entry states only what differs.
defaults:
  provider: github
  owner: acme
  credential: env:GITHUB_TOKEN
  baseBranch: main
  pollIntervalSeconds: 60
  maxReviseRounds: 3
  labels:
    trigger: openspec
  environment:
    image: ghcr.io/acme/agent-base:latest
repositories:
  - name: widget
  - name: gadget
    baseBranch: develop
    environment:
      image: ghcr.io/acme/agent-java:latest
limits:
  maxSteps: 200
  maxTokens: 200000
  maxDurationMs: 1800000
workspace:
  root: ~/workspace
  worktrees: /tmp
logging:
  verbose: false
agent:
  model: greenpt/deepseek-v4.1-flash
  database: ~/.local/share/opencode/opencode.db
```

The same example, with `agent.database` left to the SDK default, lives at
[`examples/config.yaml`](../examples/config.yaml). With `GITHUB_TOKEN` set in the
environment — or, without it, an authenticated `gh` (`gh auth login`) — the
service starts and begins polling both repositories.
