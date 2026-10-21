# Spec Delta

## MODIFIED Requirements

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
  that is not opened by Dependabot
- **THEN** it still runs the SonarCloud scan step

## ADDED Requirements

### Requirement: The scan step is skipped where no token is available

The CI `verify` job SHALL skip the SonarCloud scan step on a run that cannot read
the `SONAR_TOKEN` secret, so the run does not fail on a missing token.

#### Scenario: A Dependabot pull request skips the scan

- **WHEN** the CI `verify` job runs for a pull request opened by Dependabot
- **THEN** the scan step is skipped and the job's other steps still run to a
  successful conclusion

#### Scenario: A trusted run still scans

- **WHEN** the CI `verify` job runs on a push or for a pull request opened by a
  person in this repository
- **THEN** the SonarCloud scan step runs and a real analysis failure still fails
  the job
