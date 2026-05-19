/**
 * 主页用的紧凑型最近事件时间线。
 * Server Component，不依赖客户端状态；详细 Sheet 走 /incidents 页。
 */
import type { IncidentDto } from '@/lib/api/types';
import { IncidentCard, type IncidentLike } from './incident-card';

interface Props {
  incidents: IncidentDto[];
  now?: string;
}

export function RecentIncidentsTimeline({ incidents, now }: Props) {
  if (incidents.length === 0) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {incidents.map((i) => (
        <IncidentCard key={i.id} incident={i as IncidentLike} referenceNow={now} />
      ))}
    </div>
  );
}
