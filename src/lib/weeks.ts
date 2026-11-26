import { formatDateVi, todayIn, weekRange } from './dates';
import { addDays, localTimeToUtc } from './day-slots';

/** Local time on Sunday from which the current week can be reviewed. */
export const REVIEW_READY_AT = '18:00';

/** Monday (YYYY-MM-DD) of the Monday–Sunday week holding local `day`. */
export function weekStart(day: string): string {
  return weekRange(day).start;
}

/** Sunday (YYYY-MM-DD) of the week starting on `start`. */
export const weekEnd = (start: string) => addDays(start, 6);

/** `23/11–29/11`. */
export function weekLabel(start: string): string {
  return `${formatDateVi(start)}–${formatDateVi(weekEnd(start))}`;
}

/** `[start, end)` of the local week starting on `start`, as instants (Monday 00:00 to next Monday 00:00). */
export function weekInstants(start: string, tz: string): { start: Date; end: Date } {
  return { start: localTimeToUtc(start, '00:00', tz), end: localTimeToUtc(addDays(start, 7), '00:00', tz) };
}

/** Monday of the week holding `now` in `tz`. */
export function currentWeekStart(now: Date, tz: string): string {
  return weekStart(todayIn(tz, now));
}

/**
 * The week to invite a review of at `now`: the current week from Sunday {@link REVIEW_READY_AT} on, otherwise
 * the week before (so a week not reviewed on Sunday evening is still offered during the whole next week).
 */
export function dueReviewWeek(now: Date, tz: string): string {
  const current = currentWeekStart(now, tz);
  return now.getTime() >= localTimeToUtc(weekEnd(current), REVIEW_READY_AT, tz).getTime() ? current : addDays(current, -7);
}

/** Whether the weekly review card is offered (`settings.preferences_json.weeklyReviewsEnabled`, on by default). */
export function readWeeklyReviewsEnabled(preferences: unknown): boolean {
  return !(preferences && typeof preferences === 'object' && (preferences as Record<string, unknown>).weeklyReviewsEnabled === false);
}
