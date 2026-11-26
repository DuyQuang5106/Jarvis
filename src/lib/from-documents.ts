import type { AreaKind } from '@/db/enums';

/**
 * The preset command behind `Tạo từ tài liệu` / `Cập nhật từ tài liệu`: the AI reads one area's documents
 * and proposes structured records. It goes through the normal chat path, so nothing is written before the
 * proposal card is approved.
 */
export function fromDocumentsMessage(area: { name: string; kind: AreaKind }): string {
  return area.kind === 'project'
    ? `Đọc tài liệu của ${area.name} và tạo đề xuất: các milestone kèm trạng thái, và việc tiếp theo.`
    : `Đọc tài liệu của ${area.name} và tạo đề xuất: các topic kèm trạng thái, mốc đánh giá, và việc tiếp theo.`;
}

const plain = (text: string) =>
  text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd').toLowerCase().replace(/\s+/g, ' ');

/** Whether a message asks to turn documents into records (the preset, or the same request typed by hand). */
export function isFromDocumentsRequest(message: string): boolean {
  const p = plain(message);
  const at = p.indexOf('doc tai lieu');
  return at >= 0 && p.indexOf('de xuat', at) > at;
}
