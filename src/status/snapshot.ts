import type { LabelConfig } from '../config/types.js';
import type { WorkflowPhase } from '../domain/types.js';
import { issueNumberFromBranch, lifecycleLabels, phaseFromLabels } from '../orchestrator/labels.js';
import type { ProviderIssue, ProviderPullRequest, RepoProvider } from '../provider/types.js';

/**
 * The read-only status overview: what the orchestrator is currently driving,
 * derived on demand from provider reads and never from stored state.
 */
export type StatusPhase = 'queued' | WorkflowPhase;

export interface StatusIssue {
  number: number;
  title: string;
  url?: string;
}

export interface StatusPullRequest {
  number: number;
  url?: string;
  draft: boolean;
  state: 'open' | 'closed' | 'merged';
}

/** One workflow: a trigger-labeled issue, its pull request, and the derived phase. */
export interface StatusWorkflow {
  phase: StatusPhase;
  /** Absent only for a pull request that carries no issue reference. */
  issue?: StatusIssue;
  /** Absent while the issue is queued and no pull request exists yet. */
  pullRequest?: StatusPullRequest;
}

export interface StatusRepositoryOverview {
  key: string;
  owner: string;
  name: string;
  workflows: StatusWorkflow[];
}

export interface StatusSnapshot {
  /** When the snapshot was built, as an ISO-8601 timestamp. */
  generatedAt: string;
  repositories: StatusRepositoryOverview[];
}

/** The minimum a repository must expose to appear in the overview. */
export interface StatusSource {
  key: string;
  labels: LabelConfig;
  provider: RepoProvider;
}

function issueRef(issue: ProviderIssue): StatusIssue {
  const ref: StatusIssue = { number: issue.ref.number, title: issue.title };
  if (issue.url !== undefined) ref.url = issue.url;
  return ref;
}

function pullRef(pullRequest: ProviderPullRequest): StatusPullRequest {
  const ref: StatusPullRequest = {
    number: pullRequest.ref.number,
    draft: pullRequest.draft,
    state: pullRequest.state,
  };
  if (pullRequest.url !== undefined) ref.url = pullRequest.url;
  return ref;
}

async function overviewFor(source: StatusSource): Promise<StatusRepositoryOverview> {
  const { provider, labels } = source;
  const workflows: StatusWorkflow[] = [];
  const seen = new Set<number>();

  const issues = await provider.listTriggerIssues(labels.trigger);
  for (const issue of issues) {
    const pullRequests = await provider.listPullRequestsForIssue(issue.ref);
    const active = pullRequests.find((pullRequest) => pullRequest.state === 'open');
    if (active === undefined) {
      // No pull request yet, so the work is queued; a pull request that is
      // already closed or merged is terminal and is left out of the view.
      if (pullRequests.length === 0) {
        workflows.push({ phase: 'queued', issue: issueRef(issue) });
      }
      continue;
    }
    const phase = phaseFromLabels(labels, active.labels);
    // An open pull request without a lifecycle label is not objectively
    // classified, and `done` is terminal, so neither is reported as active.
    if (phase === null || phase === 'done') continue;
    seen.add(active.ref.number);
    workflows.push({ phase, issue: issueRef(issue), pullRequest: pullRef(active) });
  }

  // A pull request can carry a lifecycle label before its issue's trigger label
  // has been reconciled, so union those in even when the issue was not found.
  for (const label of lifecycleLabels(labels)) {
    for (const pullRequest of await provider.listPullRequestsWithLabel(label)) {
      if (seen.has(pullRequest.ref.number) || pullRequest.state !== 'open') continue;
      const phase = phaseFromLabels(labels, pullRequest.labels);
      if (phase === null || phase === 'done') continue;
      seen.add(pullRequest.ref.number);
      workflows.push(workflowForPullRequest(pullRequest, phase));
    }
  }

  return {
    key: source.key,
    owner: provider.repo.owner,
    name: provider.repo.name,
    workflows,
  };
}

/** Describe a pull request discovered by label, recovering its issue when known. */
function workflowForPullRequest(
  pullRequest: ProviderPullRequest,
  phase: WorkflowPhase,
): StatusWorkflow {
  const workflow: StatusWorkflow = { phase, pullRequest: pullRef(pullRequest) };
  const number = pullRequest.linkedIssue?.number ?? issueNumberFromBranch(pullRequest.branch);
  if (number !== null) {
    const issue: StatusIssue = { number, title: pullRequest.title };
    if (pullRequest.url !== undefined) issue.url = pullRequest.url;
    workflow.issue = issue;
  }
  return workflow;
}

/** Build a read-only overview of the active work across the given repositories. */
export async function buildSnapshot(
  sources: StatusSource[],
  clock: () => Date = () => new Date(),
): Promise<StatusSnapshot> {
  const repositories: StatusRepositoryOverview[] = [];
  for (const source of sources) {
    // Repositories are read in configured order so the overview stays stable.
    repositories.push(await overviewFor(source)); // NOSONAR
  }
  return { generatedAt: clock().toISOString(), repositories };
}
