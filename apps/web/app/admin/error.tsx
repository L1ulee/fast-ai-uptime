'use client';

import { useEffect } from 'react';

export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[admin] route error:', error);
  }, [error]);

  return (
    <div
      style={{
        margin: '24px auto',
        maxWidth: 720,
        padding: '20px 24px',
        background: 'var(--card)',
        border: '1px solid var(--border)',
        borderRadius: 12,
      }}
    >
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>表单提交失败</div>
      <div
        style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12, whiteSpace: 'pre-wrap' }}
      >
        {error.message || '未知错误，请稍后重试。'}
      </div>
      {error.digest ? (
        <div className="mono" style={{ fontSize: 11, color: 'var(--muted)', marginBottom: 12 }}>
          digest: {error.digest}
        </div>
      ) : null}
      <button
        type="button"
        onClick={reset}
        style={{
          padding: '6px 14px',
          background: 'var(--accent)',
          color: 'var(--accent-fg)',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          fontSize: 13,
        }}
      >
        重试
      </button>
    </div>
  );
}
