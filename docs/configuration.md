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
| `status`       | no       | see below | Opt-in, read-only web overview of the active work.        |

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

### `status`

The orchestrator can serve a read-only web overview of the issues and pull
requests it is currently driving. It is **off by default**, so the shipped
service stays an outbound-only poller that opens no inbound port. When enabled,
`GET /` renders an HTML page and `GET /status.json` returns the same snapshot as
JSON; every other method is refused. The view only reads through the existing
provider, so it never writes labels, comments, or pull requests, and it never
includes credential values.

| Field     | Required | Default     | Description                               |
| --------- | -------- | ----------- | ----------------------------------------- |
| `enabled` | no       | `false`     | Serve the read-only status overview.      |
| `host`    | no       | `127.0.0.1` | Interface the listener binds to.          |
| `port`    | no       | `8787`      | TCP port the listener binds to (1-65535). |

The listener binds to loopback by default because the view exposes private
repository titles. Set `host` to an explicit address (for example `0.0.0.0`) to
expose it on another interface. **No authentication is provided**: the
orchestrator is expected to run in a private subnet, so remote access belongs
behind a reverse proxy that terminates TLS and controls who can reach the port.

```yaml
status:
  enabled: true
  host: 127.0.0.1
  port: 8787
```

An invalid field — a non-boolean `enabled`, an empty `host`, or a port outside
`1`-`65535` — fails startup instead of opening a partially configured listener.

### `environment`

By default a turn runs in-process on the host, with whatever toolchains the host
carries. An optional `environment` block runs the repository's turns inside a
container instead, so an agent can use a pre-built toolchain - an Android
SDK/Gradle image, a JDK, a Rust toolchain, a PlatformIO toolchain, a uv Python
toolchain - without installing it on the host.
The whole turn (the OpenCode loop, the agent's `bash`, `read`, `write`, and
`edit`, `git`, and `openspec`) runs in the container. The GitHub push credential
never enters it: the orchestrator publishes the branch from the host after the
turn.

The repository store and the turn's worktree are mounted at their identical
absolute paths, the container runs as the orchestrator's user with a writable
home, and the compiled runner is mounted read-only. The image must provide
Node.js 24+, `git`, and the toolchain, and must have `@opencode/sdk` installed at
the orchestrator's version; the runner fails fast when the version differs. An
image reference without a tag selects the image published for the orchestrator's
own `@opencode/sdk` version (for example `:sdk-2.2.7`); an explicit tag or digest
is used verbatim. `latest` follows the default branch and can carry a different
SDK, so do not pair it with a checkout that may lag behind. See
[`environments`](../environments/README.md) for the image contract and the
ready-made flavours CI publishes to GHCR. Each flavour is published for the
platforms its toolchain supports - `node`, `rust`, `platformio`, and `uv` cover
`linux/amd64` and `linux/arm64`, `android` covers `linux/amd64` - and Docker
selects the image matching the host's architecture when it pulls the tag.

| Field         | Required | Default  | Description                                                                                                                                                                                                |
| ------------- | -------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `image`       | yes      | —        | Container image providing the environment; without a tag, the orchestrator's SDK tag is selected.                                                                                                          |
| `network`     | no       | `bridge` | Container network mode. The model loop runs inside the container, so provider egress is required.                                                                                                          |
| `pull`        | no       | `always` | When to refresh the image before a turn: `always` checks the registry, `missing` reuses the local image, `never` never contacts the registry.                                                              |
| `env`         | no       | —        | Names of the orchestrator's environment variables passed into the container (for provider auth).                                                                                                           |
| `devices`     | no       | —        | Devices exposed to the container at the same host path, for a turn that drives live hardware. Each entry is an absolute path or a `path`/`description` mapping. Validated at turn start; Linux hosts only. |
| `groups`      | no       | —        | Supplementary groups the container process joins so its non-root user can open a configured device. Names resolve to the host gid; numeric gids pass through.                                              |
| `gitIdentity` | no       | —        | `name` and `email` an in-container commit uses.                                                                                                                                                            |
| `caches`      | no       | —        | Named volumes reused across the repository's turns, each a `name` and a container `path`. The orchestrator makes each volume writable by the turn's user before the turn runs.                             |

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
the merge) fails startup naming the repository. `devices` and `groups` inherit
the same way, and an array is taken wholesale from the layer that sets it.

### Device access for live hardware

A turn that drives attached USB hardware names the host device paths in
`devices`; each is mapped into the container at the same path with Docker's
device mapping. `groups` names supplementary groups the container process joins,
so a turn running as the orchestrator's non-root uid/gid can open a device owned
by a group such as `dialout`. Group names are resolved to the host's gid, because
the image's `/etc/group` can differ from the host's; a numeric entry is passed
through as a gid.

Before the container starts, every configured path is checked: it must be
absolute, resolve through symlinks, and be a character device. A missing,
dangling, or non-character path fails the turn with an error naming the configured
path rather than starting a hardware turn without its hardware. Because the check
runs per turn, a stable udev symlink is re-resolved each time and follows a device
that was replugged between turns.

Device access is opt-in per repository and intentionally narrow: it adds no
`--privileged` flag and mounts no host `/dev`. An environment that names no
devices keeps Docker's default isolated device set. `--device` is a Linux
facility; Docker Desktop on macOS runs containers in a VM without the host's
device tree. The host-side prerequisites (udev rules for group ownership and
stable names, keeping ModemManager off firmware ports, and the macOS/USB/IP
limitation) are documented in
[`environments/README.md`](../environments/README.md#live-hardware-usb-devices).

```yaml
repositories:
  - name: klimacontrol
    provider: github
    owner: wuan
    credential: env:GITHUB_TOKEN
    environment:
      image: ghcr.io/wuan/simple-orchestrator/platformio
      devices:
        - path: /dev/qtpy2
          description: Adafruit QT Py ESP32-S2; e-ink display and sensors wired to it
        - /dev/jtum120
      groups:
        - dialout
      env:
        - LLM_API_KEY
      caches:
        - name: platformio
          path: /tmp/.platformio
```

The paths above are stable udev symlinks, so the repository config does not name
a transient `ttyACM`/`hidraw` node. The `dialout` group is resolved on the host
and added to the container process, and each device is mapped read-write because
flashing and the meter's protocol both need to send control messages.

A `devices` entry may be a bare absolute path or a mapping with a `path` and an
optional non-empty `description`; both forms merge through `defaults` like the
other environment fields. The description is a short operator hint that travels
with the exposure, such as the board model or what is wired to it.

When a containerized turn exposes at least one device, the orchestrator probes
each configured path on the host with `udevadm` for vendor/product ids, model,
serial, subsystem, and devlinks. The turn instruction then advertises each
exposed device with its configured description and any detected identity, and
names a read-only manifest at `/tmp/orchestrator-hardware.json` holding the full
inventory for the agent to read on demand. The manifest lives outside the
mounted worktree, so it cannot be committed. The probe is best-effort: a missing
`udevadm`, a failed lookup, or a partial record leaves the description in place
and never fails the turn; the path availability check remains the only hard
failure. An environment with no devices gets no advertisement, and a device the
environment does not list is never advertised.

The advertisement names only what the environment exposes. Physical context that
USB enumeration cannot observe - attached sensors, a display, the pin map, and
the device protocol - stays with the repository's own documentation; the turn
instruction points the agent there rather than the orchestrator inventing it.

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
      devices:
        - path: /dev/qtpy2
          description: Adafruit QT Py ESP32-S2; e-ink display and sensors wired to it
        - /dev/jtum120
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
