# Spec Delta

## MODIFIED Requirements

### Requirement: GitHub provider
The system SHALL include a GitHub provider supporting trigger-label discovery, draft pull request creation, lifecycle label management, and review state derived from pull request review events. The provider SHALL authenticate with the configured credential or the operator's authenticated GitHub CLI session. Review-state normalization SHALL accept the casing the host returns, including the REST API's upper-case states. When the host refuses a write to a repository as not found or forbidden, the provider SHALL report what the credential is permitted to do on that repository alongside the original error.

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

#### Scenario: A refused write reports the credential's permissions
- **WHEN** a write to a repository fails with 404 or 403 because the credential may only read it
- **THEN** the error keeps the host's response and adds the credential's permissions on that repository and the likely missing grant

#### Scenario: Reads are not checked
- **WHEN** a read fails with 404
- **THEN** the provider reports the error without an additional permission request
