"use client";

import { Bell } from "lucide-react";
import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

const NotificationsBell = dynamic(
  () => import("./notifications-bell").then((m) => m.NotificationsBell),
  { ssr: false, loading: () => <BellPlaceholder /> },
);

function BellPlaceholder({ onClick }: { onClick?: () => void }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Notificações"
      onClick={onClick}
      disabled={!onClick}
      className="opacity-70"
    >
      <Bell className="size-5" strokeWidth={1.75} />
    </Button>
  );
}

export function NotificationsBellLazy() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const win = window as Window & {
      requestIdleCallback?: (
        callback: IdleRequestCallback,
        options?: IdleRequestOptions,
      ) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (win.requestIdleCallback) {
      const id = win.requestIdleCallback(() => setEnabled(true), {
        timeout: 2500,
      });
      return () => win.cancelIdleCallback?.(id);
    }

    const id = window.setTimeout(() => setEnabled(true), 1200);
    return () => window.clearTimeout(id);
  }, []);

  return enabled ? (
    <NotificationsBell />
  ) : (
    <BellPlaceholder onClick={() => setEnabled(true)} />
  );
}
