import { describe, expect, it } from 'vitest';
import { shouldSaveDateOnChange } from './date-input';

describe('shouldSaveDateOnChange', () => {
  it.each(['0002-12-01', '0202-12-01', '1999-12-31', '', '2026-02-30', '2026-1-1'])('rejects %j', (v) => {
    expect(shouldSaveDateOnChange(v)).toBe(false);
  });
  it.each(['2026-12-01', '2000-01-01'])('accepts %j', (v) => {
    expect(shouldSaveDateOnChange(v)).toBe(true);
  });
});
