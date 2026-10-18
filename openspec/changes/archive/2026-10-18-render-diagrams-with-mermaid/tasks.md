# Tasks

## 1. Workflow lifecycle diagram

- [x] 1.1 Replace the character-based diagram under "How it works" in `README.md` with a fenced `mermaid` `stateDiagram-v2` block that keeps the four phases (`PROPOSING`, `READY`, `IMPLEMENTING`, `DONE`) and the five transitions (objective predicate, changes requested, approved, new feedback, merged); verify the fence language is `mermaid` and the block renders in a Mermaid preview without a syntax error
- [x] 1.2 Keep the "How it works" heading, prose, and bullet list around the diagram unchanged; verify `git diff README.md` shows only the diagram block replaced

## 2. Architecture diagram

- [x] 2.1 Replace the character-based diagram under "Architecture" in `README.md` with a fenced `mermaid` `flowchart TD` block that keeps `Poller -> WorkflowEngine`, the `WorkflowEngine -> decision` edge, `WorkflowEngine -> Sandbox -> AgentRuntime -> RepoProvider`, and the `(plugin)` adapter labels; verify the fence language is `mermaid` and the block renders in a Mermaid preview without a syntax error
- [x] 2.2 Confirm the "Project layout" listing is the only character block left in `README.md` and that no character diagram exists in `docs/configuration.md`, `AGENTS.md`, or `openspec/specs/`; verify `grep -nE '(\+---|│|┌|└|┐|┘)' README.md docs/configuration.md AGENTS.md openspec/specs` matches nothing

## 3. Verification

- [x] 3.1 Verify `npm run verify` passes (format check, lint, typecheck, unit and integration tests, and strict OpenSpec validation)
- [x] 3.2 Read both Mermaid blocks against the surrounding prose and confirm they name the same phases, components, edges, and adapter plugins as the diagrams they replaced; verify no node or edge from the original diagrams was dropped
- [x] 3.3 Verify the README carries exactly two `mermaid` fenced blocks, e.g. `grep -c '^```mermaid$' README.md` prints `2`

## 4. Capability and readiness

- [x] 4.1 Verify `openspec validate --strict render-diagrams-with-mermaid` passes and `openspec status --change render-diagrams-with-mermaid` reports every artifact `done` (including `specs`), so the objective readiness predicate marks the change READY
- [x] 4.2 Verify each `project-documentation` scenario against the finished `README.md`: the lifecycle renders as a state diagram, the architecture as a flowchart, the source stays legible as text, and the project layout stays a text listing

## Workflow follow-up

- Archive the change after the project's review requirements are satisfied.
- Verify the archived result: `README.md` has two `mermaid` blocks and no character-based diagram other than the "Project layout" listing, and archiving folds the `project-documentation` requirements into `openspec/specs/project-documentation/spec.md`.
