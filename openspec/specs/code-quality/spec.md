# code-quality Specification

## Purpose
Keeps the project's static analysis clean and its security- and
reliability-sensitive code paths safe, so the SonarCloud quality gate passes and
findings do not accumulate.

## Requirements

### Requirement: Static analysis reports no unresolved findings

The project's SonarCloud analysis SHALL report no unresolved findings across the
analysed sources and SHALL pass its quality gate, so bugs, vulnerabilities and
code smells do not accumulate in the codebase.

#### Scenario: The quality gate passes

- **WHEN** the code-analysis step analyses the merged sources
- **THEN** the project's quality gate status is passing

#### Scenario: No open findings remain

- **WHEN** the project's analysis issue list is queried
- **THEN** it reports zero unresolved issues

#### Scenario: CI keeps analysing

- **WHEN** the CI `verify` job runs on a push or a same-repository pull request
- **THEN** it still runs the SonarCloud scan step

### Requirement: Security-sensitive temporary workspaces are private

Code that creates temporary working directories - clone, fetch and push
destinations, and test-double workspaces - SHALL create a unique, owner-only
directory per invocation instead of reusing a fixed path under a world-writable
location.

#### Scenario: Concurrent runs do not collide

- **WHEN** two invocations create a temporary workspace at the same time
- **THEN** each receives a distinct directory

#### Scenario: A workspace is not predictable or externally writable

- **WHEN** a temporary workspace is created
- **THEN** it is a unique path with owner-only permissions, not a fixed path in a
  world-writable directory

### Requirement: Input-parsing patterns run in linear time

Regular expressions that parse or validate input - conventional-commit
subjects, usage markers and `Link` headers - SHALL avoid ambiguous or nested
quantifiers, so matching time grows linearly, not super-linearly, with input
length.

#### Scenario: Adversarial input completes

- **WHEN** a parsing pattern is matched against a long adversarial input
- **THEN** the match completes in linear time without catastrophic backtracking

### Requirement: Every test file declares a test

Every file matching the project's test pattern SHALL register at least one test
case, so the runner never collects a file that contributes no tests.

#### Scenario: Test discovery is complete

- **WHEN** the test runner runs with the project's test pattern
- **THEN** every matched file contributes at least one test

#### Scenario: A test file with no tests is reported

- **WHEN** a file matching the test pattern declares no test
- **THEN** static analysis reports it as a finding
