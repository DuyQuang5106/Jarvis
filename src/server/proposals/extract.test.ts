import { expect, test } from 'vitest';
import { ProposalBlockFilter, parseProposal } from './extract';

const T = '22222222-2222-4222-8222-222222222222';
const json = JSON.stringify({ summary: 's', actions: [{ type: 'resolve_blocker', id: T }] });

function run(chunks: string[]) {
  const f = new ProposalBlockFilter();
  let visible = '';
  for (const c of chunks) visible += f.push(c);
  const end = f.end();
  return { visible: visible + end.visibleTail, rawJson: end.rawJson };
}

test('không có khối: mọi thứ hiển thị nguyên vẹn', () => {
  expect(run(['Xin ', 'chào < 3 > 2'])).toEqual({ visible: 'Xin chào < 3 > 2', rawJson: null });
});

test('khối trọn trong một chunk', () => {
  expect(run([`Ghi nhận.\n<proposed_actions>${json}</proposed_actions>`])).toEqual({ visible: 'Ghi nhận.\n', rawJson: json });
});

test.each([1, 5, 10, 17])('thẻ mở bị cắt ở vị trí %i không lọt ký tự nào', (cut) => {
  const full = `Ghi nhận. <proposed_actions>${json}</proposed_actions>`;
  const at = 'Ghi nhận. '.length + cut;
  const out = run([full.slice(0, at), full.slice(at)]);
  expect(out).toEqual({ visible: 'Ghi nhận. ', rawJson: json });
});

test('từng ký tự một', () => {
  const full = `A<b>B <proposed_actions>${json}</proposed_actions>`;
  expect(run([...full])).toEqual({ visible: 'A<b>B ', rawJson: json });
});

test('thiếu thẻ đóng: lấy tới hết; văn bản sau thẻ đóng bị bỏ', () => {
  expect(run([`x<proposed_actions>${json}`]).rawJson).toBe(json);
  expect(run([`x<proposed_actions>${json}</proposed_actions> thừa`])).toEqual({ visible: 'x', rawJson: json });
});

test('đuôi giống tiền tố thẻ nhưng không phải thẻ thì được trả lại khi kết thúc', () => {
  expect(run(['giá trị <prop'])).toEqual({ visible: 'giá trị <prop', rawJson: null });
});

test('parseProposal: thuần, có khoảng trắng, có code fence, hỏng, sai schema', () => {
  expect(parseProposal(json)).toMatchObject({ ok: true });
  expect(parseProposal(`\n  ${json}\n`)).toMatchObject({ ok: true });
  expect(parseProposal('```json\n' + json + '\n```')).toMatchObject({ ok: true });
  expect(parseProposal('```\n' + json + '\n```')).toMatchObject({ ok: true });
  expect(parseProposal('{"summary":')).toEqual({ ok: false, reason: 'parse', issues: [] });
  expect(parseProposal('{"summary":"s","actions":[{"type":"delete_task"}]}')).toMatchObject({
    ok: false,
    reason: 'schema',
    issues: [expect.stringMatching(/^actions\.0/)],
  });
});
