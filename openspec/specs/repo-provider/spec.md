# repo-provider Specification

## Purpose
Provides a host-agnostic interface and normalized model for issues, comments, labels, pull requests, and review states, so the orchestrator can target GitHub now and GitLab or other hosts later.

## Requirements

### Requirement: Provider-agnostic interface
The orchestrator SHALL interact with source hosts only through a provider interface exposing issue, comment, label, pull request (or merge request), review-state, clone, fetch, and push operations, so hosts can be added or replaced without changes to core orchestration. The interface SHALL expose a fetch operation that refreshes an existing clone and a push operation that publishes a workflow branch.

#### Scenario: Core has no host-specific branches
- **WHEN** the orchestrator performs host operations
- **THEN** it does so through the provider interface rather than calling a host API directly

#### Scenario: A second provider is added
- **WHEN** a new host provider is implemented against the interface
- **THEN** orchestration behavior is unchanged

#### Scenario: An existing clone is refreshed
- **WHEN** the repository store needs the latest refs for a repository
- **THEN** the provider fetches them into the existing clone using the same credentials it uses to clone

#### Scenario: The workflow branch is published
- **WHEN** the orchestrator publishes a turn's commits
- **THEN** the provider pushes the workflow branch using the same credentials it uses to clone

### Requirement: Normalized event model
Providers SHALL translate host-specific activity into a common event set (workflow start, changes requested, approval, conversation comment, cancellation) so orchestration logic is host-independent.

#### Scenario: Equivalent reviews normalize identically
- **WHEN** GitHub reports `changes_requested` and GitLab reports `REQUESTED_CHANGES`
- **THEN** both are presented to the orchestrator as a changes-requested event

### Requirement: GitHub provider
The system SHALL include a GitHub provider supporting trigger-label discovery, draft pull request creation, lifecycle label management, and review state derived from pull request review events. The provider SHALL authenticate with the configured credential or the operator's authenticated GitHub CLI session. Review-state normalization SHALL accept the casing the host returns, including the REST API's upper-case states.

#### Scenario: Review state is derived
- **WHEN** a pull request review is submitted on GitHub
- **THEN** the provider reports the corresponding normalized event with its timestamp

#### Scenario: Native review-state casing is accepted
- **WHEN** GitHub reports a review state in upper case, such as `CHANGES_REQUESTED` or `APPROVED`
- **THEN** the provider normalizes it to the corresponding changes-requested or approval event

#### Scenario: Draft pull request is created
- **WHEN** the orchestrator starts a workflow on GitHub
- **THEN** the provider opens a draft pull request for the workflow branch

#### Scenario: Authentication is delegated
- **WHEN** the provider is given no usable credential
- **THEN** it relies on the operator's authenticated GitHub CLI session rather than failing

### Requirement: GitLab extension point
The provider interface SHALL accommodate a GitLab provider whose review state is read through GraphQL, without requiring changes to core orchestration.

#### Scenario: GitLab review state is retrieved
- **WHEN** a GitLab provider is implemented
- **THEN** it can report `REQUESTED_CHANGES` and `APPROVED` review states through the same normalized events

### Requirement: Bot activity identification
The provider SHALL identify activity authored by the orchestrator's own bot identity so that self-generated comments, reviews, and labels never trigger turns.

#### Scenario: Bot comment is ignored
- **WHEN** the orchestrator's own bot posts a comment or review
- **THEN** the provider reports it as non-human and the orchestrator takes no turn

### Requirement: Polling efficiency and rate-limit compliance
Provider read operations SHALL paginate results and SHALL avoid exhausting host rate limits, so polling at the configured interval stays within quota. Conditional-request and backoff behavior MAY be delegated to the underlying client when the provider reads through one.

#### Scenario: Paginated reads are complete
- **WHEN** a provider reads a list that spans multiple pages
- **THEN** it retrieves every page

#### Scenario: Unchanged resource is skipped
- **WHEN** the provider reads through a transport that supports conditional requests and a polled resource has not changed
- **THEN** the provider avoids re-fetching its full body

#### Scenario: Rate limit is approached
- **WHEN** the provider reads through a transport that tracks remaining quota and the quota falls below the configured threshold
- **THEN** the provider backs off to avoid exhausting the quota

### Requirement: Ready-for-review operation
The provider interface SHALL expose an operation that marks a pull request (or
merge request) ready for review, so the orchestrator can release an implemented
change for review and merge without host-specific code.

#### Scenario: A draft pull request is readied
- **WHEN** the orchestrator asks the provider to mark a pull request ready for
  review
- **THEN** the provider releases it from draft through the host's API

#### Scenario: The operation is idempotent
- **WHEN** the orchestrator marks a pull request that is already ready for review
- **THEN** the provider succeeds without changing it

### Requirement: GitHub ready-for-review
The GitHub provider SHALL release a draft pull request for review, using the
host's GraphQL `markPullRequestReadyForReview` mutation, because GitHub exposes
no REST endpoint for the transition.

#### Scenario: GitHub pull request is readied
- **WHEN** the orchestrator marks a GitHub pull request ready for review
- **THEN** the provider resolves the pull request's node id and calls the
  markPullRequestReadyForReview mutation
