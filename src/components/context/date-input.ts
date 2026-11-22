import { isValidDateStr } from '@/lib/dates';

/**
 * A date input fires `change` per keystroke while the year is typed (0002, 0020, 0202, 2026),
 * so only a valid date with a plausible year is saved on change; anything else waits for blur.
 */
export function shouldSaveDateOnChange(value: string): boolean {
  return isValidDateStr(value) && Number(value.slice(0, 4)) >= 2000;
}
