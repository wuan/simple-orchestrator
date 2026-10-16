# Spec Delta

## Purpose

Provides a host-agnostic interface and normalized model for issues, comments, labels, pull requests, and review states, so the orchestrator can target GitHub now and GitLab or other hosts later.

## ADDED Requirements

### Requirement: Provider-agnostic interface
The orchestrator SHALL interact with source hosts only through a provider interface exposing issue, comment, label, pull request (or merge request), review-state, and clone operations, so hosts can be added or replaced without changes to core orchestration.

#### Scenario: Core has no host-specific branches
- **WHEN** the orchestrator performs host operations
- **THEN** it does so through the provider interface rather than calling a host API directly

#### Scenario: A second provider is added
- **WHEN** a new host provider is implemented against the interface
- **THEN** orchestration behavior is unchanged

### Requirement: Normalized event model
Providers SHALL translate host-specific activity into a common event set (workflow start, changes requested, approval, conversation comment, cancellation) so orchestration logic is host-independent.

#### Scenario: Equivalent reviews normalize identically
- **WHEN** GitHub reports `changes_requested` and GitLab reports `REQUESTED_CHANGES`
- **THEN** both are presented to the orchestrator as a changes-requested event

### Requirement: GitHub provider
The system SHALL include a GitHub provider supporting trigger-label discovery, draft pull request creation, lifecycle label management, and review state derived from pull request review events.

#### Scenario: Review state is derived
- **WHEN** a pull request review is submitted on GitHub
- **THEN** the provider reports the corresponding normalized event with its timestamp

#### Scenario: Draft pull request is created
- **WHEN** the orchestrator starts a workflow on GitHub
- **THEN** the provider opens a draft pull request for the workflow branch

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
Provider read operations SHALL use conditional requests and pagination and SHALL respect host rate limits, so polling at the configured interval stays within quota.

#### Scenario: Unchanged resource is skipped
- **WHEN** a polled resource has not changed since the previous read
- **THEN** the provider avoids re-fetching its full body

#### Scenario: Rate limit is approached
- **WHEN** the remaining request quota falls below the configured threshold
- **THEN** the provider backs off to avoid exhausting the quota
