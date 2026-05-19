'use client';

import { useEffect, useState, useTransition } from 'react';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastState {
  kind: ToastKind;
  text: string;
}

/**
 * Shared drawer-action helper for admin tables.
 *
 *   const { toast, run } = useDrawerActions();
 *   const handleEdit = (fd: FormData) => run(() => editX(fd), close, { okText: '已保存' });
 *
 * Wraps the server action in a `useTransition` so React keeps the page interactive,
 * shows a 3.5s toast on success / error, and calls `onSuccess` (typically the Sheet
 * `close` callback) only when the action resolves without throwing.
 */
export function useDrawerActions() {
  const [toast, setToast] = useState<ToastState | null>(null);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const run = (
    fn: () => Promise<unknown>,
    onSuccess?: () => void,
    opts?: { okText?: string; errText?: string },
  ): void => {
    startTransition(async () => {
      try {
        await fn();
        onSuccess?.();
        if (opts?.okText) setToast({ kind: 'success', text: opts.okText });
      } catch (err) {
        setToast({
          kind: 'error',
          text: err instanceof Error ? err.message : (opts?.errText ?? '操作失败'),
        });
      }
    });
  };

  return { toast, setToast, run };
}

export function Toast({ toast }: { toast: ToastState | null }) {
  if (!toast) return null;
  return (
    <div className={`toast toast-${toast.kind}`} role="status" aria-live="polite">
      <span>{toast.text}</span>
    </div>
  );
}
