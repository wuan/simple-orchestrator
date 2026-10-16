import { describe, expect, it } from 'vitest';

import { createLogger, noopLogger, REDACTION_MARKER, redact } from './logging.js';

describe('logging', () => {
  it('redacts each seeded secret value', () => {
    const message = 'tokens: alpha-secret and beta-secret';
    expect(redact(message, ['alpha-secret', 'beta-secret'])).toBe(
      `tokens: ${REDACTION_MARKER} and ${REDACTION_MARKER}`,
    );
  });

  it('redacts every occurrence of a repeated secret', () => {
    expect(redact('s s s', ['s'])).toBe(
      `${REDACTION_MARKER} ${REDACTION_MARKER} ${REDACTION_MARKER}`,
    );
  });

  it('ignores empty secrets so it never blanks the message', () => {
    expect(redact('unchanged', [''])).toBe('unchanged');
  });

  it('leaves a message without secrets untouched', () => {
    expect(redact('nothing to hide', ['top-secret'])).toBe('nothing to hide');
  });

  it('writes newline-terminated, redacted messages to the sink', () => {
    const written: string[] = [];
    const logger = createLogger((text) => written.push(text), ['hunter2']);
    logger('connecting with hunter2');
    expect(written).toEqual([`connecting with ${REDACTION_MARKER}\n`]);
  });

  it('noopLogger drops everything', () => {
    expect(noopLogger('anything')).toBeUndefined();
  });
});
