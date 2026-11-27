/** Fired on `window` after the chat changed workspace data (a proposal applied or undone). */
export const DATA_CHANGED_EVENT = 'jarvis:data-changed';

export function notifyDataChanged() {
  window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
}
