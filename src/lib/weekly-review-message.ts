/** Title of the conversation holding a weekly review: `Tổng kết tuần 23/11–29/11`. */
export const weeklyReviewTitle = (label: string) => `Tổng kết tuần ${label}`;

/** The user message of a weekly review (the word `ghi` lets it carry a proposal). */
export const weeklyReviewMessage = (label: string) =>
  `${weeklyReviewTitle(label)}: tổng kết việc đã làm và đề xuất ghi gọn tài liệu trạng thái.`;

/** Messages a weekly review sent: a command, not work done that week. */
export const WEEKLY_REVIEW_MESSAGE = /^Tổng kết tuần \d{2}\/\d{2}–\d{2}\/\d{2}: /;
