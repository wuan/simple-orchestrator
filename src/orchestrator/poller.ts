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
    const report: PollReport = { started: [], recovered: [], actions: [] };

    const issues = await provider.listTriggerIssues(labels.trigger);
    for (const issue of issues) {
      const existing = await provider.listPullRequestsForIssue(issue.ref);
      const active = existing.find((pullRequest) => pullRequest.state === 'open');
      if (active === undefined) {
        const result = await this.engine.start(issue);
        if (result.started) report.started.push(issue.ref.number);
        continue;
      }
      // An open pull request is the issue's active change, so never start a
      // second one. If it has no in-flight phase it was left behind by an
      // interrupted or failed turn; recover it once rather than block forever.
      const phase = phaseFromLabels(labels, active.labels);
      if (phase === null || phase === 'failed') {
        if (await this.engine.recover(active)) report.recovered.push(issue.ref.number);
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
      }
    }

    return report;
  }
}
