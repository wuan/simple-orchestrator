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

  async pollOnce(): Promise<PollReport> {
    const { provider, labels } = this.options;
    const log = this.options.logger ?? (() => {});
    const repoId = `${provider.id}:${provider.repo.owner}/${provider.repo.name}`;
    const report: PollReport = { started: [], recovered: [], actions: [] };

    log(`polling ${repoId}`);
    const issues = await provider.listTriggerIssues(labels.trigger);
    log(
      issues.length === 0
        ? `${repoId}: no issues with the trigger label '${labels.trigger}'`
        : `${repoId}: discovered issue(s) ${issues.map((issue) => `#${issue.ref.number}`).join(', ')}`,
    );
    for (const issue of issues) {
      const existing = await provider.listPullRequestsForIssue(issue.ref);
      const active = existing.find((pullRequest) => pullRequest.state === 'open');
      if (active === undefined) {
        const result = await this.engine.start(issue);
        if (result.started) {
          report.started.push(issue.ref.number);
          log(
            `${repoId}: started workflow for issue #${issue.ref.number} (PR #${result.pullRequest?.ref.number ?? '?'})`,
          );
        } else if (result.cancelled !== undefined) {
          // The issue's pull request was closed without merge; the cancellation
          // removed the trigger label instead of starting a replacement.
          log(
            `${repoId}: issue #${issue.ref.number}: pull request #${result.cancelled.ref.number} was closed without merge; cancelled the workflow`,
          );
        } else if (result.resolvedBy !== undefined) {
          // The issue's change was already merged; the host has just not closed
          // the issue yet. Report it so verbose diagnostics explain the skip.
          log(
            `${repoId}: issue #${issue.ref.number} was resolved by merged pull request #${result.resolvedBy.ref.number}; not starting a workflow`,
          );
        }
        continue;
      }
      log(`${repoId}: issue #${issue.ref.number} already has an open pull request`);
      // An open pull request is the issue's active change, so never start a
      // second one. If it has no in-flight phase it was left behind by an
      // interrupted or failed turn; recover it once rather than block forever.
      const phase = phaseFromLabels(labels, active.labels);
      if (phase === null || phase === 'failed') {
        if (await this.engine.recover(active)) report.recovered.push(issue.ref.number);
      } else if (phase === 'proposing') {
        // A workflow left in `proposing` with a branch that carries no proposal
        // (an initial turn that committed nothing) has nothing for a human to
        // review and no review will ever drive it again, so re-run the propose
        // turn once per process; it either produces the change or fails and
        // reports. A branch that already carries a proposal is left alone.
        if (await this.engine.recoverStalled(active)) report.recovered.push(issue.ref.number);
      }
    }

    const seen = new Set<number>();
    for (const label of lifecycleLabels(labels)) {
      const pullRequests = await provider.listPullRequestsWithLabel(label);
      for (const pullRequest of pullRequests) {
        if (seen.has(pullRequest.ref.number)) continue;
        seen.add(pullRequest.ref.number);
        const action = await this.engine.drive(pullRequest);
        report.actions.push({ pullRequest: pullRequest.ref.number, kind: action.kind });
        const reason = 'reason' in action ? ` (${action.reason})` : '';
        log(`${repoId}: PR #${pullRequest.ref.number} -> ${action.kind}${reason}`);
      }
    }

    log(
      `${repoId}: polled, started ${report.started.length}, recovered ${report.recovered.length}, actions ${report.actions.length}`,
    );
    return report;
  }
}
