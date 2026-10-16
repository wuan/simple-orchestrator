# openspec-workflow-orchestrator

A workflow orchestrator that turns a repository issue into a reviewed,
executable **OpenSpec** change and then implements it — with a human approval
gate in between. It connects to source hosts (GitHub first), polls them, and
drives the OpenSpec lifecycle from the issue's problem description.

## How it works

```
  issue + label "openspec"
        |  orchestrator: create branch + draft PR, run PROPOSE turn
        v
   +-------------+     objective predicate     +----------+
   | PROPOSING   | ------------------------->  |  READY   |
   | (label)     |  <---------------------     | (label)  |
   +-------------+   review: changes requested +----------+
        ^                                          |
        |                                          | review: approved
        |                                          v
        |                                   +----------------+
        +-------- (new feedback) ---------- | IMPLEMENTING   |
                                            | (label: claim) |
                                            +----------------+
                                                   | merged
                                                   v
                                              +----------+
                                              |   DONE   |  (change archived in the PR)
                                              +----------+
```

- An issue carrying the trigger label starts a workflow: one branch and one
  draft pull request carrying an OpenSpec change.
- The agent runs **bounded turns**: a propose turn drafts/revises the change,
  reading the whole review transcript each time; a submitted review triggers a
  revise turn; an approval is the gate; plain comments do nothing.
- **READY** is computed objectively from `openspec status --json` and
  `openspec validate --strict`, never from agent prose.
- On approval the orchestrator claims the approval (label `openspec:implementing`)
  _before_ running the apply turn, so a later push cannot re-trigger apply.
- The apply turn implements the tasks and folds `openspec archive` into its
  final commit; merging the PR completes the workflow.

There is no database: phase lives in host labels, and the watermark is the
timestamp of the last human review versus the orchestrator's last turn comment.
The service polls (outbound-only) and can restart at any time without
duplicating work.

## Architecture

```
 +---------------------------------------------------------------+
 | Poller  ->  WorkflowEngine  ->  decision (labels + timestamps) |
 |                    |                                           |
 |                    v                                           |
 |             Sandbox (store clone + ephemeral worktree)                      |
 |                    |                                           |
 |                    v                                           |
 |             AgentRuntime  (plugin)  -- OpenCode adapter        |
 |                    |                                           |
 |                    v                                           |
 |             RepoProvider  (plugin)  -- GitHub adapter          |
 +---------------------------------------------------------------+
```

Two seams isolate everything external:

- **`RepoProvider`** — issues, comments, labels, pull requests, review state,
  clone and fetch. A GitHub adapter ships first; GitLab is an extension point.
- **`AgentRuntime`** — runs exactly one OpenSpec skill (`propose` or `apply`) per
  turn in a sandbox and returns a structured result.

### Repository store and worktrees

The orchestrator keeps a persistent clone of each repository at
`<workspace.root>/<owner>/<name>` (default `~/workspace`), created on the first
turn and refreshed with `git fetch` before each later turn. Every turn then runs
in a throwaway `git worktree` of that clone, checked out on the workflow branch
and created under `<workspace.worktrees>` (default the OS temp directory). The
worktree is removed when the turn ends, so turns stay isolated while the clone
is reused. See [docs/configuration.md](docs/configuration.md) for the
`workspace` fields.

## Requirements

- Node.js 24+ and git
- The `openspec` CLI on `PATH` (used for the readiness predicate)
- A container runtime (Docker) if you want container-level turn isolation
- An agent runtime (see [Agent runtime](#agent-runtime)); the shipped one embeds
  OpenCode, so no separate OpenCode server is needed

## Install and build

```bash
npm install
npm run build
```

## Configure

The service is single-tenant and config-driven. See
[docs/configuration.md](docs/configuration.md) for every field and default.

```yaml
repositories:
  - provider: github
    owner: acme
    name: widget
    credential: env:GITHUB_TOKEN
    baseBranch: main
limits:
  maxSteps: 200
  maxTokens: 200000
  maxDurationMs: 1800000
workspace:
  root: ~/workspace
  worktrees: /tmp
```

Credentials are references (`env:NAME` or `gh:token`); secrets are never stored
in the config. The GitHub provider calls the API and clones through the `gh`
CLI, so authentication can come from an environment variable or from `gh auth
login`. Startup fails fast, naming the repository, when a credential reference
is missing or cannot be resolved.

## Run

The GitHub provider requires the [`gh` CLI](https://cli.github.com/) on `PATH`:

```bash
gh auth login   # once; or provide GITHUB_TOKEN instead

# one poll cycle across every repository, then exit
node dist/run.js --config config.yaml --once

# long-running poller (polls each repository on its interval)
node dist/run.js --config config.yaml

# a token in the environment still takes precedence for env: references
GITHUB_TOKEN=... node dist/run.js --config config.yaml
```

`dist/run.js` supplies the embedded OpenCode runtime. `dist/index.js` is the
stock CLI without one: it uses an `UnconfiguredRuntime` that fails loudly on the
first turn, which is what the fake-provider smoke test below relies on.

Label an issue with `openspec` to start a workflow. Lifecycle labels
`openspec:proposing`, `openspec:ready`, `openspec:implementing`,
`openspec:done`, and `openspec:failed` are managed on the pull request.

### Local smoke test

The built-in `fake` provider keeps everything in memory so you can confirm the
service starts without any network access:

```yaml
repositories:
  - provider: fake
    owner: acme
    name: widget
    credential: env:ANY_VALUE
```

```bash
ANY_VALUE=1 node dist/index.js --config fake.yaml --once
```

## Agent runtime

Turns run through an `AgentRuntime`. The shipped **OpenCode adapter** runs the
OpenSpec `propose` and `apply` skills, and is written against a narrow
`OpenCodeClient` interface. `dist/run.js` wires in the embedded client, which
hosts OpenCode **inside the orchestrator process** through `@opencode/sdk` — no
separate OpenCode server, port, or `OPENCODE_URL` to run. The host is created on
the first turn, gives each turn its own session at the turn workspace, and is
closed when the service stops.

`@opencode/sdk` uses explicit resource management and therefore requires
**Node.js 24+** (Node 22 cannot load it).

When building the service yourself, supply a runtime when calling `createService`
in `src/service.ts`; the `OpenCodeRuntime` in `src/runtime/opencode/` is the
adapter, and `createEmbeddedHostFactory` in `src/runtime/opencode/sdk-host.ts`
provides the embedded host. Without a runtime the service uses an
`UnconfiguredRuntime` that **fails loudly** the first time a turn runs rather
than silently doing nothing.

## Deploy

The service is a stateless, outbound-only poller: it needs no inbound ports,
no webhooks, and no database, so it runs identically on a laptop, a VM, or in a
cluster.

- Provide credentials via the environment (a secret manager is fine).
- Run on **Node.js 24+**; OpenCode is embedded in the process, so there is no
  separate OpenCode server to deploy or port to open.
- Give it the `openspec` CLI and git on `PATH`.
- Give it a writable workspace root (default `~/workspace`) for the persistent
  per-repository clones, plus a writable temp directory for turn worktrees.
- For container-isolated turns, make a container runtime available and run the
  turn command via the provided container args (`buildDockerRunArgs`).
- Restart freely: on start it re-discovers in-flight workflows from their
  lifecycle labels and resumes without duplicating turns.

## Testing

```bash
npm test              # unit + integration (fakes; no network)
npm run lint
npm run typecheck
npm run format:check  # Prettier: is the tree formatted?
npm run format        # Prettier: rewrite the tree in place
```

The end-to-end tests cover the full lifecycle against fakes and verify that
`openspec archive` folds a change's requirements into the main specs.

Formatting is [Prettier](https://prettier.io), configured in `.prettierrc.json`
(100 columns, single quotes). `.prettierignore` keeps the formatter out of
`openspec/`, `dist/`, and `package-lock.json`; ESLint defers to Prettier for
layout via `eslint-config-prettier`.

`npm run verify` runs the whole gate — format check, lint, typecheck, tests, and
OpenSpec validation — and is what both the git hook and CI invoke.

### Git hooks

`npm install` wires a tracked pre-commit hook (it sets `core.hooksPath` to
`.githooks`). Every commit first rewrites the staged files with Prettier and
re-stages them, so a commit can never land unformatted code; only the paths in
that commit are touched. Then it runs `npm run verify`: the format check, lint,
typecheck, the unit and integration tests, and `openspec validate --strict`
across the specs, the in-progress change, and the archived changes. Bypass it
with `git commit --no-verify` only when you know why.

CI (`.github/workflows/ci.yml`) runs the same gate on every pull request and on
pushes to `main`.

## Project layout

```
src/
  config/         configuration model, loader, credential resolution
  domain/         core domain types (events, phases, turns)
  provider/       RepoProvider seam, GitHub adapter, fake, contract suite
  runtime/        AgentRuntime seam, repository store, sandbox, limits, policy, OpenCode adapter
  orchestrator/   poller, engine, decision, readiness, labels
  service.ts      composition root
  index.ts        CLI
docs/             operator documentation
examples/         example configuration
```
