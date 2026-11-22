'use client';

import { PlusIcon } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { createAreaAction } from '@/app/(app)/_actions/areas';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { AREA_STATUSES, PRIORITIES, type AreaStatus, type Priority } from '@/db/enums';
import { AREA_STATUS_LABEL, PRIORITY_LABEL } from '@/lib/labels';
import { NATIVE_SELECT } from './styles';
import { TAB_KIND, type TabId } from './use-context-params';

export function AddAreaDialog({ tab }: { tab: TabId }) {
  const uid = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [aliases, setAliases] = useState('');
  const [status, setStatus] = useState<AreaStatus>('unknown');
  const [priority, setPriority] = useState<Priority>('medium');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    setName('');
    setAliases('');
    setStatus('unknown');
    setPriority('medium');
    setError(null);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await createAreaAction({
        kind: TAB_KIND[tab],
        name,
        aliases: aliases.split(',').map((a) => a.trim()).filter(Boolean),
        status,
        priority,
      });
      if (res.ok) {
        setOpen(false);
        reset();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <>
    {/* Non-modal on purpose: a modal focus trap steals focus back from the search box while a slow
        create is in flight. The backdrop below keeps the page behind from being clicked. */}
    {open && <div aria-hidden className="fixed inset-0 z-40 bg-black/10" />}
    <Dialog
      modal={false}
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button className="min-h-11 gap-1.5 px-4">
          <PlusIcon aria-hidden className="size-4" />
          Thêm
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={submit} noValidate className="space-y-4">
          <DialogHeader>
            <DialogTitle>{tab === 'academic' ? 'Thêm môn học' : 'Thêm dự án'}</DialogTitle>
            <DialogDescription>Điền tên, phần còn lại có thể bổ sung sau.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-name`} className="text-sm font-medium">Tên</label>
            <Input id={`${uid}-name`} value={name} onChange={(e) => setName(e.target.value)} className="h-11" autoComplete="off" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor={`${uid}-aliases`} className="text-sm font-medium">Tên gọi tắt</label>
            <Input
              id={`${uid}-aliases`}
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              placeholder="Cách nhau bằng dấu phẩy"
              className="h-11"
              autoComplete="off"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-status`} className="text-sm font-medium">Trạng thái</label>
              <select id={`${uid}-status`} value={status} onChange={(e) => setStatus(e.target.value as AreaStatus)} className={NATIVE_SELECT}>
                {AREA_STATUSES.map((s) => (
                  <option key={s} value={s}>{AREA_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${uid}-priority`} className="text-sm font-medium">Ưu tiên</label>
              <select id={`${uid}-priority`} value={priority} onChange={(e) => setPriority(e.target.value as Priority)} className={NATIVE_SELECT}>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>
                ))}
              </select>
            </div>
          </div>
          {error && (
            <p role="alert" className="text-sm text-destructive">{error}</p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={pending} className="min-h-11 px-5">Tạo</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
    </>
  );
}
