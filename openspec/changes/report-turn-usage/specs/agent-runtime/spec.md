# Spec Delta

## ADDED Requirements

### Requirement: Turn usage reporting
A turn's structured result SHALL report the model that ran the turn and the total
number of tokens the turn consumed, so orchestration can show the cost of each
turn. The OpenCode adapter SHALL read the model and token usage from the turn's
own session messages.

#### Scenario: OpenCode turn reports its usage
- **WHEN** a propose or apply turn completes through the OpenCode adapter
- **THEN** the turn result reports the model that ran it and the total tokens it
  consumed, read from the turn's assistant messages

#### Scenario: Token total counts every bucket
- **WHEN** the adapter totals the tokens a turn consumed
- **THEN** the total counts input, output, reasoning, and cache read and write
  tokens
