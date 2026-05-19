'use client';

import { RefreshCw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export function RefreshButton({
  className = 'btn',
  label = '刷新',
  size = 13,
}: {
  className?: string;
  label?: string;
  size?: number;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleClick = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  return (
    <button
      type="button"
      className={className}
      onClick={handleClick}
      disabled={isPending}
      aria-busy={isPending}
    >
      <RefreshCw size={size} aria-hidden className={isPending ? 'spin' : undefined} />{' '}
      {isPending ? '刷新中…' : label}
    </button>
  );
}
