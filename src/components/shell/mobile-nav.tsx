'use client';

import { Menu } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { SidebarBody } from './sidebar';

export function MobileNav({ recentChats }: { recentChats: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="size-11" aria-label="Mở menu">
          <Menu />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="h-dvh w-72 bg-sidebar p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <SheetHeader className="p-0">
          <SheetTitle>Personal AI</SheetTitle>
          <SheetDescription className="sr-only">Điều hướng chính</SheetDescription>
        </SheetHeader>
        {/* The body takes what is left under the header (not the full height), so the footer with Settings stays
            on screen and only the chat list scrolls. */}
        <div className="flex min-h-0 flex-1 flex-col">
          <SidebarBody onNavigate={() => setOpen(false)} recentChats={recentChats} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
