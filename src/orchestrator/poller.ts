import type { ProviderIssue } from '../provider/types.js';
import type { WorkflowAction } from './decision.js';
import { WorkflowEngine, type WorkflowEngineOptions } from './engine.js';
import { lifecycleLabels, phaseFromLabels } from './labels.js';

export type PollerOptions = WorkflowEngineOptions;

export interface PollReport {
  started: number[];
  /** Issues whose existing pull request was recovered after a failed turn. */
  recovered: number[];
  actions: { pullRequest: number; kind: WorkflowAction['kind'] }[];
}

/** The one-line discovery summary for a poll cycle's trigger-label scan. */
function describeDiscovery(repoId: string, trigger: string, issues: ProviderIssue[]): string {
  if (issues.length === 0) return `${repoId}: no issues with the trigger label '${trigger}'`;
  const numbers = issues.map((issue) => `#${issue.ref.number}`).join(', ');
  return `${repoId}: discovered issue(s) ${numbers}`;
}

/**
 * One poll cycle: discover labeled issues without an active pull request and
 * start them; recover a labeled issue whose open pull request was left without
 * an in-flight phase; then drive every in-flight workflow (found by lifecycle
 * label, so discovery works after a restart with no local state).
 */
export class Poller {
  private readonly engine: WorkflowEngine;
  private readonly options: PollerOptions;

  constructor(options: PollerOptions) {
    this.options = options;
    this.engine = new WorkflowEngine(options);
  }

  private log(message: string): void {
    this.options.logger?.(message);
  }

  async pollOnce(): Promise<PollReport> {
    const { provider, labels } = this.options;
    const repoId = `${provider.id}:${provider.repo.owner}/${provider.repo.name}`;
    const report: PollReport = { started: [], recovered: [], actions: [] };

    this.log(`polling ${repoId}`);
    const issues = await provider.listTriggerIssues(labels.trigger);
    this.log(describeDiscovery(repoId, labels.trigger, issues));
    // Issues are reconciled in discovery order, so the first labelled issue
    // starts first and a restart resumes in the same order.
    for (const issue of issues) {
      await this.reconcileIssue(issue, repoId, report); // NOSONAR: discovery order is significant
    }

    const seen = new Set<number>();
    // Lifecycle labels are scanned in their configured order, and each pull
    // request is driven once per cycle.
    for (const label of lifecycleLabels(labels)) {
      await this.driveByLabel(label, seen, repoId, report); // NOSONAR: label order is significant
    }

    this.log(
      `${repoId}: polled, started ${report.started.length}, recovered ${report.recovered.length}, actions ${report.actions.length}`,
    );
    return report;
  }

  /**
   * Reconcile one labeled issue: start a workflow when it has no active pull
   * request, otherwise log and recover an open pull request left without an
   * in-flight phase.
   */
  private async reconcileIssue(
    issue: ProviderIssue,
    repoId: string,
    report: PollReport,
  ): Promise<void> {
    const { provider, labels } = this.options;
    const existing = await provider.listPullRequestsForIssue(issue.ref);
    const active = existing.find((pullRequest) => pullRequest.state === 'open');
    if (active === undefined) {
      await this.startIssue(issue, repoId, report);
      return;
    }

    this.log(`${repoId}: issue #${issue.ref.number} already has an open pull request`);
    // An open pull request is the issue's active change, so never start a
    // second one. If it has no in-flight phase it was left behind by an
    // interrupted or failed turn; recover it once rather than block forever.
    const phase = phaseFromLabels(labels, active.labels);
    if (phase === null || phase === 'failed') {
      if (await this.engine.recover(active)) report.recovered.push(issue.ref.number);
      return;
    }
    if (phase === 'proposing') {
      // A workflow left in `proposing` with a branch that carries no proposal
      // (an initial turn that committed nothing) has nothing for a human to
      // review and no review will ever drive it again, so re-run the propose
      // turn once per process; it either produces the change or fails and
      // reports. A branch that already carries a proposal is left alone.
      if (await this.engine.recoverStalled(active)) report.recovered.push(issue.ref.number);
    }
  }

  /** Start a workflow for an issue with no active pull request and report it. */
  private async startIssue(
    issue: ProviderIssue,
    repoId: string,
    report: PollReport,
  ): Promise<void> {
    const result = await this.engine.start(issue);
    if (result.started) {
      report.started.push(issue.ref.number);
      this.log(
        `${repoId}: started workflow for issue #${issue.ref.number} (PR #${result.pullRequest?.ref.number ?? '?'})`,
      );
      return;
    }
    if (result.cancelled !== undefined) {
      // The issue's pull request was closed without merge; the cancellation
      // removed the trigger label instead of starting a replacement.
      this.log(
        `${repoId}: issue #${issue.ref.number}: pull request #${result.cancelled.ref.number} was closed without merge; cancelled the workflow`,
      );
      return;
    }
    if (result.resolvedBy !== undefined) {
      // The issue's change was already merged; the host has just not closed
      // the issue yet. Report it so verbose diagnostics explain the skip.
      this.log(
        `${repoId}: issue #${issue.ref.number} was resolved by merged pull request #${result.resolvedBy.ref.number}; not starting a workflow`,
      );
    }
  }

  /** Drive every pull request carrying one lifecycle label, once per cycle. */
  private async driveByLabel(
    label: string,
    seen: Set<number>,
    repoId: string,
    report: PollReport,
  ): Promise<void> {
    const pullRequests = await this.options.provider.listPullRequestsWithLabel(label);
    // Pull requests are driven in host order, and `seen` keeps a pull request
    // that carries several lifecycle labels from being driven twice.
    for (const pullRequest of pullRequests) {
      if (seen.has(pullRequest.ref.number)) continue;
      seen.add(pullRequest.ref.number);
      const action = await this.engine.drive(pullRequest); // NOSONAR: one turn per pull request
      report.actions.push({ pullRequest: pullRequest.ref.number, kind: action.kind });
      const reason = 'reason' in action ? ` (${action.reason})` : '';
      this.log(`${repoId}: PR #${pullRequest.ref.number} -> ${action.kind}${reason}`);
    }
  }
}
