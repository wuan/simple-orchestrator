import { DEFAULT_LIMITS, type LabelConfig, type Limits } from '../config/types.js';
import type {
  NormalizedEvent,
  TranscriptEntry,
  TurnContext,
  TurnResult,
  TurnSkill,
  WorkflowPhase,
} from '../domain/types.js';
import { reviewEvent } from '../provider/normalize.js';
import { latestHumanReview } from '../provider/reviews.js';
import type {
  ProviderComment,
  ProviderIssue,
  ProviderPullRequest,
  ProviderReview,
  RepoProvider,
  ThreadTarget,
} from '../provider/types.js';
import { LimitExceededError } from '../runtime/limits.js';
import { PermissionError } from '../runtime/policy.js';
import type { Sandbox } from '../runtime/sandbox.js';
import type { AgentRuntime } from '../runtime/types.js';
import { decide, type WorkflowAction } from './decision.js';
import { allPhaseLabels, issueNumberFromBranch, labelForPhase, phaseFromLabels } from './labels.js';
import { evaluateReadiness, type OpenspecCli } from './readiness.js';

export interface WorkflowEngineOptions {
  provider: RepoProvider;
  runtime: AgentRuntime;
  sandbox: Sandbox;
  openspec: OpenspecCli;
  labels: LabelConfig;
  baseBranch: string;
  limits?: Limits;
  maxReviseRounds?: number;
  logger?: (message: string) => void;
}

export interface StartResult {
  started: boolean;
  pullRequest?: ProviderPullRequest;
}

/** A limit or permission failure is permanent; anything else is retried once. */
function isRetryable(error: unknown): boolean {
  return !(error instanceof LimitExceededError) && !(error instanceof PermissionError);
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildTranscript(
  reviews: ProviderReview[],
  comments: ProviderComment[],
): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [
    ...reviews.map((review) => ({
      id: `review:${review.id}`,
      origin: 'review' as const,
      author: review.author,
      body: review.body,
      at: review.at,
      reviewState: review.state,
    })),
    ...comments.map((comment) => ({
      id: `comment:${comment.id}`,
      origin: 'comment' as const,
      author: comment.author,
      body: comment.body,
      at: comment.at,
    })),
  ];
  return entries.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
}

function lastBotCommentAt(comments: ProviderComment[]): string | null {
  const botComments = comments.filter((comment) => comment.author.isBot);
  if (botComments.length === 0) return null;
  return botComments.reduce((latest, comment) =>
    Date.parse(comment.at) > Date.parse(latest.at) ? comment : latest,
  ).at;
}

/**
 * Drives a single workflow: it starts work from an issue and, on each poll,
 * performs at most one turn (or a terminal transition) based on the watermark
 * decision. All state is read from the host; the engine holds none.
 */
export class WorkflowEngine {
  private readonly provider: RepoProvider;
  private readonly runtime: AgentRuntime;
  private readonly sandbox: Sandbox;
  private readonly openspec: OpenspecCli;
  private readonly labels: LabelConfig;
  private readonly baseBranch: string;
  private readonly limits: Limits;
  private readonly maxReviseRounds: number;
  private readonly logger: (message: string) => void;

  private botLogin: string | undefined;
  private botLoginLoaded = false;

  constructor(options: WorkflowEngineOptions) {
    this.provider = options.provider;
    this.runtime = options.runtime;
    this.sandbox = options.sandbox;
    this.openspec = options.openspec;
    this.labels = options.labels;
    this.baseBranch = options.baseBranch;
    this.limits = options.limits ?? DEFAULT_LIMITS;
    this.maxReviseRounds = options.maxReviseRounds ?? 3;
    this.logger = options.logger ?? (() => {});
  }

  private target(pullRequest: ProviderPullRequest): ThreadTarget {
    return { kind: 'pull_request', ref: pullRequest.ref };
  }

  private async getBotLogin(): Promise<string | undefined> {
    if (!this.botLoginLoaded) {
      this.botLoginLoaded = true;
      try {
        this.botLogin = (await this.provider.botIdentity()).login;
      } catch {
        this.botLogin = undefined;
      }
    }
    return this.botLogin;
  }

  private async resolveIssue(pullRequest: ProviderPullRequest): Promise<ProviderIssue | null> {
    const number = pullRequest.linkedIssue?.number ?? issueNumberFromBranch(pullRequest.branch);
    if (number === null || number === undefined) return null;
    return this.provider.getIssue({ repo: this.provider.repo, number });
  }

  /** Begin a workflow for a labeled issue: one draft pull request, one propose turn. */
  async start(issue: ProviderIssue): Promise<StartResult> {
    const existing = await this.provider.listPullRequestsForIssue(issue.ref);
    const active = existing.find((pullRequest) => pullRequest.state === 'open');
    if (active !== undefined) return { started: false, pullRequest: active };

    const pullRequest = await this.provider.createDraftPullRequest({
      issue: issue.ref,
      baseBranch: this.baseBranch,
      title: `OpenSpec change for issue #${issue.ref.number}`,
      body: `Workflow for issue #${issue.ref.number}.`,
      draft: true,
    });
    await this.runTurn('propose', pullRequest, [], [], null);
    this.logger(`started workflow for issue #${issue.ref.number} (PR #${pullRequest.ref.number})`);
    return { started: true, pullRequest };
  }

  /** Evaluate and perform the next action for an in-flight workflow. */
  async drive(pullRequest: ProviderPullRequest): Promise<WorkflowAction> {
    const botLogin = await this.getBotLogin();
    const issue = await this.resolveIssue(pullRequest);
    const reviews = await this.provider.listReviews(pullRequest.ref);
    const comments = await this.provider.listComments(this.target(pullRequest));

    const human = latestHumanReview(reviews, botLogin);
    const latestHumanReviewEvent =
      human === null
        ? null
        : reviewEvent({
            id: human.id,
            at: human.at,
            actor: human.author,
            state: human.state,
            body: human.body,
            pullRequest: pullRequest.ref,
          });

    const botTurns = comments.filter((comment) => comment.author.isBot).length;
    const action = decide({
      triggerLabelPresent: issue !== null && issue.labels.includes(this.labels.trigger),
      pullRequestState: pullRequest.state,
      phase: phaseFromLabels(this.labels, pullRequest.labels) ?? 'proposing',
      latestHumanReview: latestHumanReviewEvent,
      lastTurnAt: lastBotCommentAt(comments),
      reviseRounds: Math.max(0, botTurns - 1),
      maxReviseRounds: this.maxReviseRounds,
    });

    const reason = 'reason' in action ? ` (${action.reason})` : '';
    this.logger(`PR #${pullRequest.ref.number}: decision ${action.kind}${reason}`);

    await this.perform(action, pullRequest, reviews, comments);
    return action;
  }

  private async perform(
    action: WorkflowAction,
    pullRequest: ProviderPullRequest,
    reviews: ProviderReview[],
    comments: ProviderComment[],
  ): Promise<void> {
    switch (action.kind) {
      case 'idle':
        return;
      case 'revise':
        await this.runTurn('propose', pullRequest, reviews, comments, action.trigger);
        return;
      case 'apply':
        // The claim: mark implementing BEFORE running the turn, so a later push
        // that dismisses the approval cannot re-trigger apply.
        await this.setPhase(pullRequest, 'implementing');
        await this.runTurn('apply', pullRequest, reviews, comments, action.trigger);
        return;
      case 'finish':
        await this.setPhase(pullRequest, 'done');
        await this.provider.comment(this.target(pullRequest), 'Merged. Workflow complete.');
        return;
      case 'fail':
        await this.signalFailure(pullRequest, new Error(action.reason));
        return;
      case 'cancel':
        await this.clearPhase(pullRequest);
        await this.provider.comment(
          this.target(pullRequest),
          `Workflow cancelled: ${action.reason}.`,
        );
        return;
    }
  }

  private buildContext(
    skill: TurnSkill,
    pullRequest: ProviderPullRequest,
    reviews: ProviderReview[],
    comments: ProviderComment[],
    trigger: NormalizedEvent | null,
  ): TurnContext {
    const number =
      pullRequest.linkedIssue?.number ?? issueNumberFromBranch(pullRequest.branch) ?? 0;
    return {
      skill,
      repo: this.provider.repo,
      issue: { repo: this.provider.repo, number },
      pullRequest: pullRequest.ref,
      branch: pullRequest.branch,
      baseBranch: pullRequest.baseBranch === '' ? this.baseBranch : pullRequest.baseBranch,
      transcript: buildTranscript(reviews, comments),
      pendingFeedback: trigger === null ? [] : [trigger],
    };
  }

  private async runTurn(
    skill: TurnSkill,
    pullRequest: ProviderPullRequest,
    reviews: ProviderReview[],
    comments: ProviderComment[],
    trigger: NormalizedEvent | null,
  ): Promise<void> {
    const turn = `PR #${pullRequest.ref.number} ${skill} turn`;
    this.logger(
      `PR #${pullRequest.ref.number}: starting ${skill} turn (branch ${pullRequest.branch})`,
    );
    const handle = await this.sandbox.create({ branch: pullRequest.branch });
    try {
      const context = this.buildContext(skill, pullRequest, reviews, comments, trigger);
      const result = await this.withRetry(turn, () =>
        this.runtime.run({ context, workspace: handle.workspace, limits: this.limits }),
      );
      await this.postTurn(pullRequest, result);
      const commits =
        result.commits.length === 0 ? 'no commits' : `commits ${result.commits.join(', ')}`;
      this.logger(`${turn} succeeded with ${commits}`);

      if (skill === 'propose') {
        const readiness = await evaluateReadiness(this.openspec, handle.workspace);
        this.logger(
          `${turn}: readiness ${readiness.ready ? 'ready' : 'not ready'} (${readiness.reason})`,
        );
        await this.setPhase(pullRequest, readiness.ready ? 'ready' : 'proposing');
        if (readiness.ready) {
          await this.provider.comment(
            this.target(pullRequest),
            'The change is ready for development. Approve to implement.',
          );
        }
      } else {
        await this.setPhase(pullRequest, 'implementing');
      }
    } catch (error) {
      this.logger(`${turn} failed: ${describeError(error)}`);
      await this.signalFailure(pullRequest, error);
    } finally {
      await handle.dispose();
    }
  }

  private async withRetry<T>(context: string, operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (!isRetryable(error)) throw error;
      this.logger(`${context}: retrying after transient failure: ${describeError(error)}`);
      return operation();
    }
  }

  private async postTurn(pullRequest: ProviderPullRequest, result: TurnResult): Promise<void> {
    const lines = [
      `**OpenSpec ${result.skill} turn**`,
      '',
      result.summary === '' ? '(no summary)' : result.summary,
    ];
    if (result.commits.length > 0) lines.push('', `Commits: ${result.commits.join(', ')}`);
    if (result.questions.length > 0) {
      lines.push('', '**Questions for the reviewer:**', ...result.questions.map((q) => `- ${q}`));
    }
    await this.provider.comment(this.target(pullRequest), lines.join('\n'));
  }

  private async setPhase(pullRequest: ProviderPullRequest, phase: WorkflowPhase): Promise<void> {
    const target = this.target(pullRequest);
    const targetLabel = labelForPhase(this.labels, phase);
    for (const label of allPhaseLabels(this.labels)) {
      if (label !== targetLabel) await this.provider.removeLabel(target, label);
    }
    await this.provider.addLabels(target, [targetLabel]);
  }

  private async clearPhase(pullRequest: ProviderPullRequest): Promise<void> {
    const target = this.target(pullRequest);
    for (const label of allPhaseLabels(this.labels)) await this.provider.removeLabel(target, label);
  }

  private async signalFailure(pullRequest: ProviderPullRequest, error: unknown): Promise<void> {
    await this.setPhase(pullRequest, 'failed');
    await this.provider.comment(
      this.target(pullRequest),
      `Workflow failed: ${describeError(error)}`,
    );
    this.logger(`PR #${pullRequest.ref.number} failed: ${describeError(error)}`);
  }
}
