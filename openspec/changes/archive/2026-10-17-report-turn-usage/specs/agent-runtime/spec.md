# Spec Delta

## ADDED Requirements

### Requirement: Turn usage reporting
A turn's structured result SHALL report the model that ran the turn and the
tokens the turn consumed broken down by kind - input, output, reasoning, and
cache read and write - together with their total, so orchestration can show the
cost of each turn. The OpenCode adapter SHALL read the model and the token
counts from the turn's own session messages.

#### Scenario: OpenCode turn reports its usage
- **WHEN** a propose or apply turn completes through the OpenCode adapter
- **THEN** the turn result reports the model that ran it, read from the turn's
  assistant messages

#### Scenario: Tokens are reported by kind and in total
- **WHEN** the adapter reports the tokens a turn consumed
- **THEN** it reports the input, output, reasoning, and cache read and write
  counts and their total, read from the turn's assistant messages

#### Scenario: Usage is reported for a turn that then fails
- **WHEN** the adapter has read a turn's usage but the turn fails
- **THEN** the usage is reported before the failure, so the model and the tokens
  the turn consumed are not lost
