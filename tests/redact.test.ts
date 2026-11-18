import { describe, expect, it } from 'vitest';
import { redactUrl } from '../src/utils/redact.js';

describe('redactUrl', () => {
  it('hides order request tracking tokens', () => {
    expect(redactUrl('/api/v1/order-requests/track/abcDEF123_-xyz?x=1')).toBe(
      '/api/v1/order-requests/track/[redacted]?x=1',
    );
  });

  it('leaves other URLs alone', () => {
    expect(redactUrl('/api/v1/plants/jade-plant')).toBe('/api/v1/plants/jade-plant');
    expect(redactUrl(undefined)).toBeUndefined();
  });
});
