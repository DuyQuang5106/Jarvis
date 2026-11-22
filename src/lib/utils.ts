import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** The first `max` characters of `s` (code points: an emoji is never split), with no ellipsis. */
export function firstChars(s: string, max: number): string {
  return Array.from(s).slice(0, max).join('');
}
