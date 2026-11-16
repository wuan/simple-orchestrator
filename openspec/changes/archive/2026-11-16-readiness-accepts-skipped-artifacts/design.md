# Design

## Context

See `proposal.md` - Why. The readiness predicate in
`src/orchestrator/readiness.ts` reads `openspec status --change <name> --json`
and currently rejects every artifact whose status is not `done`. OpenSpec
reports `specs` as `skipped`, not `done`, when the change's `.openspec.yaml`
sets `skip_specs: true`. Validation still passes for such a change, so the
predicate's artifact check is the only gate that blocks READY.

## Goals / Non-Goals

**Goals:**

- Let a change with no spec-level delta reach READY when its declared artifacts
  are satisfied and strict validation passes.
- Keep READY objective and CLI-driven: no agent self-report and no new
  configuration knob.
- Preserve the existing rejection of artifacts that still need work.

**Non-Goals:**

- Changing `skip_specs` handling in the OpenSpec CLI or the propose prompt.
- Making a change with zero active artifacts READY.
- Relaxing the human approval gate or the apply claim.
- Supporting arbitrary unknown artifact states.

## Decisions

### Decision: Accept `done` and `skipped` as satisfied artifact states

The unfinished filter becomes:

```ts
artifact.status !== 'done' && artifact.status !== 'skipped'
```

`done` means the artifact exists and is complete; `skipped` means the change
declared it out of scope, which is a satisfied state rather than pending work.
Every other state (`ready`, `missing`, or a future value) still blocks READY.

Alternative considered: accept every status except `ready`. Rejected because it
would treat unknown states as satisfied and hide CLI changes. Alternative
considered: require a spec artifact always and reject `skip_specs` in the
propose prompt. Rejected because `skip_specs` is a legitimate OpenSpec marker for
tooling and documentation-only changes, and because the orchestrator should
follow the CLI's judgement rather than maintain a second list of acceptable
change shapes.

### Decision: Keep the explicit artifact check rather than rely on `isComplete`

`openspec status --json` also returns `isComplete`, which is true for the
skipped case. Using it would shorten the predicate, but the orchestrator's
contract is stated in terms of artifacts and it reports unfinished artifacts in
the verbose log. Keeping the filter explicit makes the accepted states visible
and preserves the existing behaviour for an empty artifact list.

Alternative considered: use `isComplete` alone. Rejected because different
OpenSpec versions define completeness differently, and the orchestrator is
tested against a small fake CLI, not the real schema for every version.

### Decision: Update the spec scenarios without changing the approval gate

The readiness requirement keeps its requirement text and gains a scenario for
`skip_specs`; the approval gate is untouched. Once the skipped change reaches
READY, an existing approval that predates READY still does not carry over, so a
human must approve again when the workflow prompts. This matches the existing
"approval before ready" rule rather than weakening it.

## Risks / Trade-offs

- [A typo in `skip_specs` could make a change READY without a spec delta] ->
  `openspec validate --strict` still runs and must pass; `skip_specs` is parsed
  by the CLI, and the predicate only trusts its reported state.
- [A future OpenSpec version adds another satisfied status] -> the predicate
  keeps blocking it until this change is updated deliberately; the verbose log
  names the unfinished count.
- [A change declares `skip_specs` but still writes specs] -> the CLI reports
  `done` for the artifact when files exist, so the predicate accepts it through
  the normal path.
