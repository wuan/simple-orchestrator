/**
 * Verbose diagnostics and secret redaction.
 *
 * The logger seam is a plain `(message: string) => void` injected into the
 * poller and engine. When verbose logging is off, no logger is injected and the
 * consumer's no-op default drops diagnostics; when it is on, this module builds
 * a sink that redacts every resolved credential value before writing, so a
 * future diagnostic that happens to include a secret cannot leak it.
 */

/** Text substituted for any secret value found in a diagnostic. */
export const REDACTION_MARKER = '[redacted]';

/** Replace every occurrence of each non-empty secret with the marker. */
export function redact(message: string, secrets: Iterable<string>): string {
  let result = message;
  for (const secret of secrets) {
    if (secret === '') continue;
    result = result.split(secret).join(REDACTION_MARKER);
  }
  return result;
}

/**
 * Build a logger that writes newline-terminated, redacted messages to `sink`.
 * The credential values are captured up front so a caller cannot accidentally
 * log an unredacted value.
 */
export function createLogger(
  sink: (text: string) => void,
  secrets: Iterable<string>,
): (message: string) => void {
  const values = [...secrets].filter((secret) => secret !== '');
  return (message: string) => sink(`${redact(message, values)}\n`);
}

/** A logger that discards everything, used when verbose logging is off. */
export function noopLogger(_message: string): void {}
