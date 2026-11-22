'use client';

import { useRef, useState } from 'react';
import { Input } from '@/components/ui/input';

type Props = Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'onFocus' | 'onBlur'> & {
  /** The value stored on the server; shown whenever the input is not focused. */
  value: string;
  /** Called with the new text; `value` is skipped when it equals what was last sent. */
  onSave: (next: string) => void;
  /** Whether a `change` (not only blur) may save this text. */
  saveOnChange?: (next: string) => boolean;
};

/**
 * Controlled input that follows the server value only while it is not focused, so a save never
 * remounts it or overwrites what is being typed. Each focus session starts from the server value,
 * and change-then-blur sends a value once.
 */
export function SyncedInput({ value, onSave, saveOnChange, ...props }: Props) {
  const [text, setText] = useState(value);
  const [focused, setFocused] = useState(false);
  const [seen, setSeen] = useState(value);
  const lastSent = useRef(value);

  if (seen !== value) {
    setSeen(value);
    if (!focused) setText(value);
  }

  function send(next: string) {
    if (next === lastSent.current) return;
    lastSent.current = next;
    onSave(next);
  }

  return (
    <Input
      {...props}
      value={text}
      onFocus={() => {
        lastSent.current = value;
        setFocused(true);
      }}
      onChange={(e) => {
        setText(e.target.value);
        if (saveOnChange?.(e.target.value)) send(e.target.value);
      }}
      onBlur={(e) => {
        setFocused(false);
        send(e.target.value);
      }}
    />
  );
}
