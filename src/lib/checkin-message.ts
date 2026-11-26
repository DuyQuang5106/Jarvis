/** One line of a check-in summary. */
export type CheckinLine = { area: string; text: string };

/** `Ghi lại`: the chat message that turns the summary into a proposal (the word `ghi` lets it carry one). */
export function recordMessage(phrase: string, lines: CheckinLine[]): string {
  return `Ghi lại buổi ${phrase}: ${lines.map((l) => (l.area ? `${l.area}: ${l.text}` : l.text)).join('; ')}`;
}

/** The answer to `Buổi … bạn đã làm gì?`, sent as a progress report (`đã làm`). */
export function answerMessage(phrase: string, answer: string): string {
  return `Buổi ${phrase} tôi đã làm: ${answer.replace(/\s+/g, ' ').trim()}`;
}

/** Messages the check-in card sends: what they report belongs to an earlier slot, not the one they are sent in. */
export const CHECKIN_MESSAGE = /^(Ghi lại buổi |Buổi .+ tôi đã làm: )/;
