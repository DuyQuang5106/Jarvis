import { describe, expect, test } from 'vitest';
import { APP_TZ } from './dates';
import {
  DEFAULT_DAY_SLOTS,
  DaySlotsSchema,
  checkinLabel,
  endedSlots,
  localTimeToUtc,
  readCheckinPrefs,
  slotLabel,
  slotRange,
  slotsPhrase,
} from './day-slots';

// Vitest runs with the machine's zone; every expectation below is about Asia/Ho_Chi_Minh (UTC+7) and is
// written in UTC instants, so it holds whatever zone the server runs in.
const at = (iso: string) => new Date(iso);

describe('slotRange', () => {
  test('buổi sáng 26/11 giờ VN là 23:00Z 25/11 tới 04:00Z 26/11', () => {
    const r = slotRange('2026-11-26', 'morning', APP_TZ);
    expect(r.start.toISOString()).toBe('2026-11-25T23:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-26T04:00:00.000Z');
  });
  test('buổi tối 26/11 là 11:00Z tới 16:00Z', () => {
    const r = slotRange('2026-11-26', 'evening', APP_TZ);
    expect(r.start.toISOString()).toBe('2026-11-26T11:00:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-26T16:00:00.000Z');
  });
  test('cấu hình tùy chỉnh', () => {
    const slots = { ...DEFAULT_DAY_SLOTS, morning: { start: '07:30', end: '10:15' } };
    const r = slotRange('2026-11-26', 'morning', APP_TZ, slots);
    expect(r.start.toISOString()).toBe('2026-11-26T00:30:00.000Z');
    expect(r.end.toISOString()).toBe('2026-11-26T03:15:00.000Z');
  });
  test('múi giờ có DST vẫn đúng giờ địa phương', () => {
    // 01/07 New York is UTC-4, 01/12 is UTC-5.
    expect(localTimeToUtc('2026-07-01', '06:00', 'America/New_York').toISOString()).toBe('2026-07-01T10:00:00.000Z');
    expect(localTimeToUtc('2026-12-01', '06:00', 'America/New_York').toISOString()).toBe('2026-12-01T11:00:00.000Z');
  });
});

describe('endedSlots', () => {
  test('11:30 sáng: các buổi kết thúc trong 24 giờ qua (từ trưa hôm qua), cũ nhất trước', () => {
    expect(endedSlots(at('2026-11-26T04:30:00Z'), APP_TZ)).toEqual([
      { day: '2026-11-25', slot: 'noon' },
      { day: '2026-11-25', slot: 'afternoon' },
      { day: '2026-11-25', slot: 'evening' },
      { day: '2026-11-26', slot: 'morning' },
    ]);
  });
  test('qua nửa đêm (00:30 ngày 27/11): cả 4 buổi của 26/11', () => {
    expect(endedSlots(at('2026-11-26T17:30:00Z'), APP_TZ).map((s) => `${s.day}:${s.slot}`)).toEqual([
      '2026-11-26:morning',
      '2026-11-26:noon',
      '2026-11-26:afternoon',
      '2026-11-26:evening',
    ]);
  });
  test('mở app lúc 06:10 sáng: cả tối hôm qua; buổi kết thúc quá 24 giờ thì không', () => {
    // 06:10 on 27/11 = 23:10Z on 26/11: every slot of 26/11 ended less than 24 h ago.
    const out = endedSlots(at('2026-11-26T23:10:00Z'), APP_TZ).map((s) => `${s.day}:${s.slot}`);
    expect(out).toEqual(['2026-11-26:morning', '2026-11-26:noon', '2026-11-26:afternoon', '2026-11-26:evening']);
    // 12:00 on 27/11: the morning of 26/11 ended 25 h ago.
    const noon = endedSlots(at('2026-11-27T05:00:00Z'), APP_TZ).map((s) => `${s.day}:${s.slot}`);
    expect(noon).toEqual(['2026-11-26:noon', '2026-11-26:afternoon', '2026-11-26:evening', '2026-11-27:morning']);
  });
  test('đúng lúc buổi kết thúc thì buổi đó đã xong; 1 phút trước thì chưa', () => {
    expect(endedSlots(at('2026-11-26T04:00:00Z'), APP_TZ).at(-1)).toEqual({ day: '2026-11-26', slot: 'morning' });
    expect(endedSlots(at('2026-11-26T03:59:00Z'), APP_TZ).at(-1)).toEqual({ day: '2026-11-25', slot: 'evening' });
  });
  test('giờ server ở UTC không làm lệch ngày: 23:30Z 25/11 đã là 06:30 ngày 26/11', () => {
    const out = endedSlots(at('2026-11-25T23:30:00Z'), APP_TZ);
    expect(out.at(-1)).toEqual({ day: '2026-11-25', slot: 'evening' });
    expect(out.some((s) => s.day === '2026-11-26')).toBe(false);
  });
  test('cấu hình tùy chỉnh dời giờ kết thúc', () => {
    const slots = { ...DEFAULT_DAY_SLOTS, morning: { start: '06:00', end: '10:00' } };
    // 10:30 VN
    expect(endedSlots(at('2026-11-26T03:30:00Z'), APP_TZ, slots).at(-1)).toEqual({ day: '2026-11-26', slot: 'morning' });
    expect(endedSlots(at('2026-11-26T03:30:00Z'), APP_TZ).at(-1)).toEqual({ day: '2026-11-25', slot: 'evening' });
  });
});

describe('nhãn', () => {
  const today = '2026-11-26';
  test('slotLabel', () => {
    expect(slotLabel(today, ['morning'], today)).toBe('Sáng nay');
    expect(slotLabel(today, ['noon', 'morning'], today)).toBe('Sáng và trưa nay');
    expect(slotLabel(today, ['morning', 'noon', 'afternoon'], today)).toBe('Sáng, trưa và chiều nay');
    expect(slotLabel('2026-11-25', ['evening'], today)).toBe('Tối qua');
    expect(slotLabel('2026-11-24', ['evening'], today)).toBe('Tối 24/11');
  });
  test('checkinLabel gộp nhiều ngày', () => {
    expect(checkinLabel([{ day: '2026-11-25', slot: 'evening' }, { day: today, slot: 'morning' }], today)).toBe('Tối qua và sáng nay');
    expect(checkinLabel([{ day: today, slot: 'morning' }], today)).toBe('Sáng nay');
  });
  test('slotsPhrase có ngày', () => {
    expect(slotsPhrase([{ day: today, slot: 'morning' }])).toBe('sáng 26/11');
    expect(slotsPhrase([{ day: today, slot: 'morning' }, { day: today, slot: 'noon' }])).toBe('sáng và trưa 26/11');
    expect(slotsPhrase([{ day: '2026-11-25', slot: 'evening' }, { day: today, slot: 'morning' }])).toBe('tối 25/11 và sáng 26/11');
  });
});

describe('cấu hình', () => {
  test('mặc định hợp lệ', () => {
    expect(DaySlotsSchema.safeParse(DEFAULT_DAY_SLOTS).success).toBe(true);
  });
  test('buổi liền nhau được, chồng lấn thì bị từ chối', () => {
    const overlap = { ...DEFAULT_DAY_SLOTS, noon: { start: '10:30', end: '13:00' } };
    const r = DaySlotsSchema.safeParse(overlap);
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toContain('chồng lên buổi trước');
  });
  test('kết thúc trước khi bắt đầu, sai thứ tự, sai định dạng: bị từ chối', () => {
    expect(DaySlotsSchema.safeParse({ ...DEFAULT_DAY_SLOTS, morning: { start: '11:00', end: '06:00' } }).success).toBe(false);
    expect(DaySlotsSchema.safeParse({ ...DEFAULT_DAY_SLOTS, evening: { start: '05:00', end: '06:00' } }).success).toBe(false);
    expect(DaySlotsSchema.safeParse({ ...DEFAULT_DAY_SLOTS, morning: { start: '6:00', end: '11:00' } }).success).toBe(false);
    expect(DaySlotsSchema.safeParse({ ...DEFAULT_DAY_SLOTS, morning: { start: '06:00', end: '24:00' } }).success).toBe(false);
    expect(DaySlotsSchema.safeParse({ morning: DEFAULT_DAY_SLOTS.morning }).success).toBe(false);
  });
  test('readCheckinPrefs: thiếu hoặc sai thì về mặc định, bật check-in', () => {
    expect(readCheckinPrefs({})).toEqual({ checkinsEnabled: true, daySlots: DEFAULT_DAY_SLOTS });
    expect(readCheckinPrefs(null)).toEqual({ checkinsEnabled: true, daySlots: DEFAULT_DAY_SLOTS });
    expect(readCheckinPrefs({ checkinsEnabled: false, daySlots: { morning: 'x' } })).toEqual({ checkinsEnabled: false, daySlots: DEFAULT_DAY_SLOTS });
    const custom = { ...DEFAULT_DAY_SLOTS, evening: { start: '19:00', end: '22:30' } };
    expect(readCheckinPrefs({ daySlots: custom }).daySlots).toEqual(custom);
  });
});
