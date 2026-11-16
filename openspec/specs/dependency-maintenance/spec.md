# dependency-maintenance Specification

## Purpose
Keeps the orchestrator, its tests, and its environment images on a current
toolchain by tracking the latest releases of the dependencies and pinned tools
the project relies on, and by screening dependency changes for known
vulnerabilities.

## Requirements

### Requirement: Declared dependencies track their latest releases

The project SHALL keep the npm dependencies it declares, the tools its workflows
install, and the GitHub Actions it references at their latest releases, so the
orchestrator, its tests, and its environment images run a current toolchain
instead of drifting behind over time.

#### Scenario: A declared dependency falls behind

- **WHEN** a direct npm dependency is behind its latest release
- **THEN** it is updated in `package.json` and the lockfile, and `npm ci`
  followed by the verification gate passes

#### Scenario: A tool the workflows install falls behind

- **WHEN** the OpenSpec CLI version the CI verify job installs has a newer
  release
- **THEN** the workflow pins the newer release and the strict OpenSpec
  validation still passes

#### Scenario: A referenced action falls behind

- **WHEN** a GitHub Action referenced by a workflow is behind its latest release
- **THEN** the workflow references the newer release in the repository's pin
  style

#### Scenario: The environment images follow the SDK

- **WHEN** `@opencode/sdk` advances to a newer release
- **THEN** the environment-image build resolves the new version from
  `package-lock.json` and a turn starts without a version mismatch

### Requirement: Dependency changes are screened for known vulnerabilities

A change to a dependency manifest or lockfile SHALL be screened for
known-vulnerable versions before it merges, so refreshing the dependency tree
cannot introduce an advisory the tree did not already carry.

#### Scenario: A pull request updates a dependency

- **WHEN** a pull request changes `package.json` or `package-lock.json`
- **THEN** the repository's dependency-review job checks the introduced versions
  and fails the pull request when it introduces a known-vulnerable version

#### Scenario: An update clears an advisory

- **WHEN** a dependency update resolves an advisory the previous tree carried
- **THEN** the audit no longer reports that advisory

### Requirement: The OpenSpec CLI runs on a supported major release

The project SHALL install an OpenSpec CLI release from a supported major in its
workflows and SHALL keep the OpenSpec instruction files in the shared layout
that release produces, refreshing them with `openspec update`, so the CLI, the
validation gate, and the agent's skills agree on one OpenSpec version and the
orchestrator's CLI integration stays compatible.

#### Scenario: CI installs the supported major

- **WHEN** the CI verify job installs the OpenSpec CLI
- **THEN** it installs a 2.x release and `openspec validate --strict --all` and
  `openspec validate --strict --archived` pass under it

#### Scenario: The project carries the shared skills

- **WHEN** the pinned CLI writes its instruction files
- **THEN** the OpenSpec skills live in `.agents/skills/`, with an
  `.agents/skills/.openspec-target` naming the configured tool, and no removed
  `/opsx:*` command files remain

#### Scenario: The orchestrator reads the pinned major

- **WHEN** the orchestrator lists active changes, reads a change's status, or
  validates a change
- **THEN** it parses `openspec list --json`, `openspec status --json`, and
  `openspec validate --strict` from the pinned major without a source change
