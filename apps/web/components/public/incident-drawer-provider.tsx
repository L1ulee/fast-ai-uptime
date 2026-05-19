'use client';

/**
 * 把所有 IncidentCard 串到一个共享 IncidentDetailDrawer 上。
 *
 * 用法：在公开页（home / incidents / maintenance）把渲染 IncidentCard 的子树
 * 包进 <IncidentDrawerProvider>。IncidentCard 内部自动通过 context 拿到 open 函数；
 * 调用方无需显式传 onClick 也可点击展开 sheet。
 */

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { IncidentDetailDrawer } from './incident-detail-drawer';
import type { IncidentLike } from './incident-card';

type DetailKind = 'active' | 'maintenance';
type Detail = { incident: IncidentLike; type: DetailKind } | null;
type OpenFn = (incident: IncidentLike, type?: DetailKind) => void;

const Ctx = createContext<OpenFn | null>(null);
const TzCtx = createContext<string>('UTC');

/** Hook：在 IncidentCard 内部获取 open 函数（可能为 null，表示未包在 provider 内） */
export function useIncidentDrawer(): OpenFn | null {
  return useContext(Ctx);
}

/** Hook：读取站点时区(默认 UTC)。所有公开页时间格式化以此为准。 */
export function useSiteTimezone(): string {
  return useContext(TzCtx);
}

interface Props {
  children: ReactNode;
  referenceNow?: string;
  /** 站点时区(IANA tz);影响所有 IncidentCard / Drawer 内的时间显示。 */
  siteTimezone?: string;
}

export function IncidentDrawerProvider({ children, referenceNow, siteTimezone = 'UTC' }: Props) {
  const [detail, setDetail] = useState<Detail>(null);

  const open = useCallback<OpenFn>((incident, type) => {
    setDetail({ incident, type: type ?? 'active' });
  }, []);
  const close = useCallback(() => setDetail(null), []);

  const value = useMemo(() => open, [open]);

  return (
    <TzCtx.Provider value={siteTimezone}>
      <Ctx.Provider value={value}>
        {children}
        <IncidentDetailDrawer
          incident={detail?.incident ?? null}
          type={detail?.type}
          referenceNow={referenceNow}
          onClose={close}
        />
      </Ctx.Provider>
    </TzCtx.Provider>
  );
}
