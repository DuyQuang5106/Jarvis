'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, useTransition } from 'react';
import { completeOnboardingAction, skipOnboardingAction } from '@/app/(app)/_actions/onboarding';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AREA_STATUS_LABEL } from '@/lib/labels';
import type { SeedItem } from '@/server/seed/seed-data';

type Props = { items: readonly SeedItem[]; termGoal: string };

const GROUPS = [
  { kind: 'academic', title: 'Academic' },
  { kind: 'project', title: 'Projects' },
] as const;

/** First-run review of the draft seed. Not dismissable: the owner must import or skip. */
export function OnboardingDialog({ items, termGoal: initialGoal }: Props) {
  const uid = useId();
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => Object.fromEntries(items.map((s) => [s.key, true])));
  const [names, setNames] = useState<Record<string, string>>(() => Object.fromEntries(items.map((s) => [s.key, s.name])));
  const [termGoal, setTermGoal] = useState(initialGoal);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function finish() {
    setOpen(false);
    router.refresh();
  }

  function importSelected(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await completeOnboardingAction({
        items: items.filter((s) => checked[s.key]).map((s) => ({ key: s.key, name: names[s.key] })),
        termGoal: termGoal.trim() || null,
      });
      if (res.ok) finish();
      else setError(res.error);
    });
  }

  function skip() {
    setError(null);
    startTransition(async () => {
      const res = await skipOnboardingAction();
      if (res.ok) finish();
      else setError(res.error);
    });
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        className="flex max-h-[90dvh] flex-col sm:max-w-xl"
      >
        <form onSubmit={importSelected} noValidate className="flex min-h-0 flex-1 flex-col gap-4">
          <DialogHeader>
            <DialogTitle>Review &amp; import</DialogTitle>
            <DialogDescription>
              Đây là bản nháp từ thông tin cũ. Các mục sẽ mang nhãn ‘chưa xác minh lại’ cho tới khi bạn sửa.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-goal`} className="text-sm font-medium">Mục tiêu học kỳ</label>
              <Input id={`${uid}-goal`} value={termGoal} onChange={(e) => setTermGoal(e.target.value)} disabled={pending} className="h-11 md:text-base" autoComplete="off" />
            </div>
            {GROUPS.map((g) => (
              <section key={g.kind} aria-labelledby={`${uid}-${g.kind}`} className="space-y-2">
                <h3 id={`${uid}-${g.kind}`} className="text-sm font-semibold">{g.title}</h3>
                <ul className="space-y-2">
                  {items.filter((s) => s.kind === g.kind).map((s) => (
                    <li key={s.key} className="flex items-start gap-2 rounded-lg border p-2.5">
                      <label className="-ml-1 flex size-11 shrink-0 items-center justify-center">
                        <Checkbox
                          aria-label={s.name}
                          checked={checked[s.key]}
                          onCheckedChange={(v) => setChecked((c) => ({ ...c, [s.key]: v === true }))}
                          disabled={pending}
                        />
                      </label>
                      <div className="min-w-0 flex-1 space-y-1">
                        <Input
                          aria-label={`Tên ${s.name}`}
                          value={names[s.key]}
                          onChange={(e) => setNames((n) => ({ ...n, [s.key]: e.target.value }))}
                          disabled={pending}
                          className="h-11 md:text-base"
                          autoComplete="off"
                        />
                        <p className="text-xs text-muted-foreground">
                          {s.summary ?? 'Chưa có mô tả'} · {AREA_STATUS_LABEL[s.status]}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>

          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="shrink-0">
            <Button type="button" variant="outline" onClick={skip} disabled={pending} className="min-h-11 px-5">
              Bỏ qua
            </Button>
            <Button type="submit" disabled={pending} className="min-h-11 px-5">
              {pending ? 'Đang nhập…' : 'Nhập mục đã chọn'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
