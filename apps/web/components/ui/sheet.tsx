'use client';

import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  /** Small uppercase eyebrow above the title (e.g. "Editor"). */
  eyebrow?: string;
  title: ReactNode;
  children: ReactNode;
  /** Optional sticky footer (typically holds Cancel + primary actions). */
  footer?: ReactNode;
}

/**
 * Right-anchored slide-out drawer. CSS in app/globals.css under .sheet*.
 * Press Escape to close; clicking the overlay closes too.
 */
export function Sheet({ open, onClose, eyebrow = 'Editor', title, children, footer }: SheetProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  return (
    <>
      <div
        className={`sheet-overlay${open ? ' open' : ''}`}
        onClick={onClose}
        aria-hidden={!open}
      />
      <div
        className={`sheet${open ? ' open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-hidden={!open}
      >
        <div className="sheet-header">
          <div>
            <div
              className="subtle"
              style={{
                fontSize: 10.5,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              {eyebrow}
            </div>
            <div style={{ fontSize: 16, fontWeight: 600, marginTop: 2 }}>{title}</div>
          </div>
          <button
            type="button"
            className="btn btn-ghost btn-icon"
            onClick={onClose}
            aria-label="关闭"
          >
            <X size={16} aria-hidden />
          </button>
        </div>
        <div className="sheet-body">{open && <div className="fade-in">{children}</div>}</div>
        {footer && <div className="sheet-footer">{footer}</div>}
      </div>
    </>
  );
}
