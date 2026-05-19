'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { isoToLocalStrInTz, localStrInTzToIso, shortTzLabel } from '@/lib/timezone';

/**
 * `<input type="datetime-local">` 的时区感知封装。
 *
 *  - 显示侧:把 stored UTC ISO 按 `siteTimezone` 拆成 "YYYY-MM-DDTHH:MM" 填到 input
 *  - 提交侧:把 input 输入按 `siteTimezone` 解释为墙上时间,转 UTC ISO 通过 hidden
 *    input 提交。server 端拿到的就是 ISO,可直接 `new Date(iso)` 用。
 *  - 缺省 tz 为 'UTC' —— 与历史行为兼容(老调用方未传 tz)。
 */
export function DateTimeLocalInput({
  name,
  defaultValue,
  required,
  className,
  siteTimezone = 'UTC',
}: {
  name: string;
  defaultValue?: Date | string | null;
  required?: boolean;
  className?: string;
  siteTimezone?: string;
}) {
  const [localVal, setLocalVal] = useState<string>(() =>
    defaultValue ? isoToLocalStrInTz(defaultValue, siteTimezone) : '',
  );
  const isoVal = localVal ? localStrInTzToIso(localVal, siteTimezone) : '';

  return (
    <>
      <div className="row" style={{ gap: 8, alignItems: 'center' }}>
        <input
          type="datetime-local"
          value={localVal}
          onChange={(e) => setLocalVal(e.currentTarget.value)}
          className={cn('input', className)}
          required={required}
          style={{ flex: 1 }}
        />
        <span
          className="subtle tabular"
          style={{ fontSize: 11, whiteSpace: 'nowrap' }}
          title={`输入按站点时区 ${siteTimezone} 解释,存储为 UTC`}
        >
          {shortTzLabel(siteTimezone)}
        </span>
      </div>
      <input type="hidden" name={name} value={isoVal} />
    </>
  );
}
