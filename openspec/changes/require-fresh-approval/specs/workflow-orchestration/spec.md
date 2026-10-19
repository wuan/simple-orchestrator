# Spec Delta

## MODIFIED Requirements

### Requirement: Human approval gate
The orchestrator SHALL start implementation only for a READY change that has received a host-native approval from a human, and only when that approval is newer than the watermark, so an approval the orchestrator has already answered never starts implementation.

#### Scenario: Approved ready change proceeds
- **WHEN** a READY change receives an approving review from a human that is newer than the watermark
- **THEN** the orchestrator enqueues the apply turn

#### Scenario: Approval before ready
- **WHEN** an approval is present but the change is not READY
- **THEN** the orchestrator does not start implementation until the change is READY with a valid approval

#### Scenario: An approval given before the change was ready does not carry over
- **WHEN** a human approves while the change is PROPOSING, the orchestrator answers it with a propose turn, and that turn makes the change READY
- **THEN** the orchestrator does not start implementation until a human approves again
