# Tasks

## 1. Workflow lifecycle diagram

- [ ] 1.1 Replace the character-based diagram under "How it works" in `README.md` with a fenced `mermaid` `stateDiagram-v2` block that keeps the four phases (`PROPOSING`, `READY`, `IMPLEMENTING`, `DONE`) and the five transitions (objective predicate, changes requested, approved, new feedback, merged); verify the fence language is `mermaid` and the block renders in a Mermaid preview without a syntax error
- [ ] 1.2 Keep the "How it works" heading, prose, and bullet list around the diagram unchanged; verify `git diff README.md` shows only the diagram block replaced

## 2. Architecture diagram

- [ ] 2.1 Replace the character-based diagram under "Architecture" in `README.md` with a fenced `mermaid` `flowchart TD` block that keeps `Poller -> WorkflowEngine`, the `WorkflowEngine -> decision` edge, `WorkflowEngine -> Sandbox -> AgentRuntime -> RepoProvider`, and the `(plugin)` adapter labels; verify the fence language is `mermaid` and the block renders in a Mermaid preview without a syntax error
- [ ] 2.2 Confirm the "Project layout" listing is the only character block left in `README.md` and that no character diagram exists in `docs/configuration.md`, `AGENTS.md`, or `openspec/specs/`; verify `grep -nE '(\+---|│|┌|└|┐|┘)' README.md docs/configuration.md AGENTS.md openspec/specs` matches nothing

## 3. Verification

- [ ] 3.1 Verify `npm run verify` passes (format check, lint, typecheck, unit and integration tests, and strict OpenSpec validation)
- [ ] 3.2 Read both Mermaid blocks against the surrounding prose and confirm they name the same phases, components, edges, and adapter plugins as the diagrams they replaced; verify no node or edge from the original diagrams was dropped
- [ ] 3.3 Verify the README carries exactly two `mermaid` fenced blocks, e.g. `grep -c '^```mermaid$' README.md` prints `2`

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result: `README.md` has two `mermaid` blocks and no character-based diagram other than the "Project layout" listing.
