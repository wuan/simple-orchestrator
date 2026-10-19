/**
 * Pure helpers for a workflow's pull request title.
 *
 * A title is a Conventional Commit subject of the form
 * `<type>(<scope>): <summary>`, so the message the host derives from it on a
 * squash merge follows the project's convention. The type and scope are deduced
 * from the issue context (its title or labels, never configured), the summary is
 * the author's words compacted to the project's commit-subject limit, and the
 * subject can be rebuilt with an applied type and scope while keeping its
 * summary. Keeping these pure lets the engine compose and reconcile titles
 * without a provider or a runtime.
 */

/** The project's Conventional Commit types (per `AGENTS.md`). */
export const CONVENTIONAL_TYPES = [
  'feat',
  'fix',
  'docs',
  'test',
  'refactor',
  'perf',
  'build',
  'ci',
  'chore',
] as const;

export type ConventionalType = (typeof CONVENTIONAL_TYPES)[number];

/** The project's commit-subject limit (per `AGENTS.md`): a subject stays under it. */
export const COMMIT_SUBJECT_LIMIT = 72;

const TYPE_SET: ReadonlySet<string> = new Set(CONVENTIONAL_TYPES);

/**
 * Issue labels that name a change type, keyed lower-case so matching is
 * case-insensitive. GitHub's default labels are covered; an unmatched label
 * falls back to `feat`.
 */
const LABEL_TYPES: Readonly<Record<string, ConventionalType>> = {
  bug: 'fix',
  documentation: 'docs',
  docs: 'docs',
  enhancement: 'feat',
  feature: 'feat',
  refactor: 'refactor',
  performance: 'perf',
  perf: 'perf',
  test: 'test',
  tests: 'test',
  ci: 'ci',
  build: 'build',
  dependencies: 'build',
  chore: 'chore',
  maintenance: 'chore',
};

export function isConventionalType(value: string): value is ConventionalType {
  return TYPE_SET.has(value);
}

export interface ParsedSubject {
  type: ConventionalType;
  scope?: string;
  summary: string;
}

/** `<type>(<scope>): <summary>`, where the type is a letter-led word. */
const SUBJECT_PATTERN = /^([A-Za-z][A-Za-z0-9-]*)(?:\(([^()]*)\))?:\s+(.*)$/;

/**
 * Parse a recognized Conventional Commit subject, or `null` when it is not one.
 * A prefix is recognized only when its type is one of the project's types, so a
 * `word:` prefix whose word is not a project type is not a subject.
 */
export function parseConventionalSubject(subject: string): ParsedSubject | null {
  const match = SUBJECT_PATTERN.exec(subject.trim());
  if (match === null) return null;
  const type = match[1] ?? '';
  if (!isConventionalType(type)) return null;
  const parsed: ParsedSubject = { type, summary: match[3] ?? '' };
  const scope = match[2];
  if (scope !== undefined && scope !== '') parsed.scope = scope;
  return parsed;
}

function collapse(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

/**
 * Normalize the structural noise out of a summary: collapse whitespace, drop a
 * trailing period, and drop a stale trailing ellipsis left by an earlier
 * compaction so re-compaction replaces it rather than stacking a second one.
 */
function normalizeSummary(summary: string): string {
  const collapsed = collapse(summary);
  const withoutEllipsis = collapsed.replace(/(?:…|\.\.\.)$/u, '').trim();
  return withoutEllipsis.replace(/\.$/, '').trim();
}

function subjectPrefix(type: string, scope?: string): string {
  return scope === undefined || scope === '' ? `${type}: ` : `${type}(${scope}): `;
}

/** The longest whole-word prefix of `summary` that fits in `budget` characters. */
function shortenAtWordBoundary(summary: string, budget: number): string {
  if (budget <= 0) return '';
  let kept = '';
  for (const word of summary.split(' ').filter((part) => part !== '')) {
    const candidate = kept === '' ? word : `${kept} ${word}`;
    if (candidate.length > budget) break;
    kept = candidate;
  }
  return kept;
}

/**
 * Compose `<type>(<scope>): <summary>`, shortening the summary at a word
 * boundary with a single ellipsis when the subject would otherwise reach the
 * project's commit-subject limit. The summary's words are never rewritten.
 */
function compose(type: string, scope: string | undefined, summary: string): string {
  const prefix = subjectPrefix(type, scope);
  const full = `${prefix}${summary}`;
  if (full.length < COMMIT_SUBJECT_LIMIT) return full;
  const budget = COMMIT_SUBJECT_LIMIT - prefix.length - 2;
  return `${prefix}${shortenAtWordBoundary(summary, budget)}…`;
}

function typeFromLabels(labels: string[]): ConventionalType {
  for (const label of labels) {
    const mapped = LABEL_TYPES[label.trim().toLowerCase()];
    if (mapped !== undefined) return mapped;
  }
  return 'feat';
}

export interface IssueTitleContext {
  title: string;
  labels: string[];
}

/**
 * The Conventional Commit subject for a workflow created from `issue`: the type
 * and optional scope from an already-conventional issue title, else the type
 * from the issue's labels (matched case-insensitively, defaulting to `feat`),
 * and the summary from the issue title compacted to the subject limit.
 */
export function conventionalTitle(issue: IssueTitleContext): string {
  const title = collapse(issue.title);
  const deduced = parseConventionalSubject(title);
  const type = deduced?.type ?? typeFromLabels(issue.labels);
  const scope = deduced?.scope;
  const summary = normalizeSummary(deduced?.summary ?? title);
  return compose(type, scope, summary);
}

/**
 * Rebuild a recognized Conventional Commit subject with a new type and optional
 * scope, keeping its summary. Returns the subject unchanged when it does not
 * parse as such a subject (including a prefix whose type is not a project
 * type). The kept summary is re-shortened at a word boundary - replacing any
 * ellipsis it already carried - when the rebuilt subject would reach the
 * commit-subject limit.
 */
export function rebuildConventionalSubject(
  current: string,
  type: ConventionalType,
  scope?: string,
): string {
  const parsed = parseConventionalSubject(current);
  if (parsed === null) return current;
  return compose(type, scope, normalizeSummary(parsed.summary));
}

/**
 * Reconcile a pull request title with the Conventional Commit subjects an apply
 * turn added. The title is left unchanged when the subjects carry no recognized
 * subject or do not agree on a type. When they agree on a type, a scope is
 * adopted only when the subjects that carry one agree on a single scope;
 * otherwise the scope the title already carries is kept, so a scope is never
 * invented. Subjects scoped `openspec` (OpenSpec bookkeeping, such as an archive
 * commit) are ignored.
 */
export function reconcileConventionalTitle(current: string, subjects: string[]): string {
  const applied = subjects
    .map((subject) => parseConventionalSubject(subject))
    .filter((parsed): parsed is ParsedSubject => parsed !== null && parsed.scope !== 'openspec');
  const type = applied[0]?.type;
  if (type === undefined) return current;
  if (applied.some((parsed) => parsed.type !== type)) return current;

  const scopes = new Set(
    applied.map((parsed) => parsed.scope).filter((scope): scope is string => scope !== undefined),
  );
  const appliedScope = scopes.size === 1 ? [...scopes][0] : undefined;
  const deducedScope = parseConventionalSubject(current)?.scope;
  return rebuildConventionalSubject(current, type, appliedScope ?? deducedScope);
}
