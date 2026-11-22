'use client';

export const SUGGESTED_PROMPTS = [
  'Hôm nay nên làm gì?',
  'Đánh giá tuần này',
  'Môn nào cần chú ý?',
  'Dự án nào đang bị giãn?',
  'Cập nhật nhanh',
] as const;

/** Shown on a new conversation; a click sends the prompt right away. */
export function SuggestedPrompts({ onPick, disabled }: { onPick: (prompt: string) => void; disabled?: boolean }) {
  return (
    <div data-testid="suggested-prompts" className="flex flex-wrap justify-center gap-2">
      {SUGGESTED_PROMPTS.map((p) => (
        <button
          key={p}
          type="button"
          disabled={disabled}
          onClick={() => onPick(p)}
          className="min-h-11 rounded-full border bg-background px-4 text-sm outline-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"
        >
          {p}
        </button>
      ))}
    </div>
  );
}
