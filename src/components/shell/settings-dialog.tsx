'use client';

import { Download, LogOut, Settings } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { getSettingsAction, updateSettingsAction } from '@/app/(app)/_actions/settings';
import { signOut } from '@/app/login/actions';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ThemeToggle } from './theme-toggle';

type Form = { termGoal: string; staleAfterDays: string; defaultFocusMinutes: string; timezone: string };

export function SettingsDialog() {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) return;
    setError(null);
    setSaved(false);
    setForm(null);
    startTransition(async () => {
      const res = await getSettingsAction();
      if (!res.ok) return setError(res.error);
      const s = res.data;
      setForm({
        termGoal: s.termGoal ?? '',
        staleAfterDays: String(s.staleAfterDays),
        defaultFocusMinutes: s.defaultFocusMinutes === null ? '' : String(s.defaultFocusMinutes),
        timezone: s.timezone,
      });
    });
  }

  function set<K extends keyof Form>(key: K, value: string) {
    setSaved(false);
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);
    setSaved(false);
    const stale = form.staleAfterDays.trim();
    const focus = form.defaultFocusMinutes.trim();
    startTransition(async () => {
      const res = await updateSettingsAction({
        termGoal: form.termGoal.trim() || null,
        staleAfterDays: stale === '' ? Number.NaN : Number(stale),
        defaultFocusMinutes: focus === '' ? null : Number(focus),
      });
      if (res.ok) setSaved(true);
      else setError(res.error);
    });
  }

  const ready = form !== null;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="ghost" className="min-h-11 flex-1 justify-start gap-2">
          <Settings className="size-4" aria-hidden />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Cài đặt cho không gian làm việc của bạn.</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} noValidate className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-goal`} className="text-sm font-medium">Mục tiêu học kỳ</label>
            <Input id={`${uid}-goal`} value={form?.termGoal ?? ''} onChange={(e) => set('termGoal', e.target.value)} disabled={!ready || pending} className="h-11 md:text-base" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-stale`} className="text-sm font-medium">Coi là cũ sau (ngày)</label>
            <Input id={`${uid}-stale`} type="number" inputMode="numeric" min={1} max={90} value={form?.staleAfterDays ?? ''} onChange={(e) => set('staleAfterDays', e.target.value)} disabled={!ready || pending} className="h-11 md:text-base" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-focus`} className="text-sm font-medium">Thời lượng tập trung mặc định (phút)</label>
            <Input id={`${uid}-focus`} type="number" inputMode="numeric" min={5} max={240} value={form?.defaultFocusMinutes ?? ''} onChange={(e) => set('defaultFocusMinutes', e.target.value)} disabled={!ready || pending} className="h-11 md:text-base" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-tz`} className="text-sm font-medium">Múi giờ</label>
            <Input id={`${uid}-tz`} value={form?.timezone ?? ''} readOnly className="h-11 md:text-base" />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium">Giao diện</span>
            <ThemeToggle />
          </div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {saved && <p role="status" className="text-sm text-muted-foreground">Đã lưu</p>}
          <Button type="submit" disabled={!ready || pending} className="min-h-11 w-full">
            {pending && ready ? 'Đang lưu…' : 'Lưu'}
          </Button>
        </form>
        <div className="flex flex-col gap-2 border-t pt-4">
          <Button asChild variant="outline" className="min-h-11 justify-start gap-2">
            <a href="/api/export" download>
              <Download className="size-4" aria-hidden />
              Xuất dữ liệu (JSON)
            </a>
          </Button>
          <form action={signOut}>
            <Button type="submit" variant="outline" className="min-h-11 w-full justify-start gap-2">
              <LogOut className="size-4" aria-hidden />
              Đăng xuất
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
