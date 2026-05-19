'use client';

import { Icon } from './icon';

/**
 * `.cb / .cb.checked` styled checkbox — visual span with SVG checkmark.
 *
 * Use as a controlled component:
 *   <StyledCheckbox checked={selected} onChange={(v) => setSelected(v)} />
 *
 * For form submission, render <input type="checkbox" hidden name=...> alongside if needed,
 * or use the `name`/`value` props which render a hidden checked input.
 */
export function StyledCheckbox({
  checked,
  onChange,
  name,
  value,
  ariaLabel,
}: {
  checked: boolean;
  onChange?: (next: boolean) => void;
  name?: string;
  value?: string | number;
  ariaLabel?: string;
}) {
  const interactive = typeof onChange === 'function';
  return (
    <span
      className={`cb ${checked ? 'checked' : ''}`}
      role={interactive ? 'checkbox' : undefined}
      aria-checked={interactive ? checked : undefined}
      aria-label={ariaLabel}
      tabIndex={interactive ? 0 : undefined}
      onClick={
        interactive
          ? (e) => {
              // 阻止 <label> 默认转发 —— 当本组件被包在 <label> 内，浏览器会把 click
              // 再转发到标签关联的表单控件。若该控件是真实 <input type="checkbox">，
              // 转发的 click 会在 React 重渲之前把 DOM checked 又翻一次，导致表单提交
              // 时读到的 DOM 状态与 React 状态不一致（"勾选完过快保存导致后面的勾选
              // 不生效"）。stopPropagation 阻止冒泡到 label，preventDefault 兜底。
              e.preventDefault();
              e.stopPropagation();
              onChange?.(!checked);
            }
          : undefined
      }
      onKeyDown={
        interactive
          ? (e) => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                onChange?.(!checked);
              }
            }
          : undefined
      }
      style={interactive ? { cursor: 'pointer' } : undefined}
    >
      <Icon d="check" size={10} stroke={3} />
      {/* 用 hidden input 而非 checkbox —— hidden input 不响应 label 转发的 click,
          也没有 DOM checked 属性参与表单序列化时的二次解释,FormData 始终读到 React
          intend 的最新值。仅在 checked 时才渲染,未勾选时该 name 不出现在 FormData。 */}
      {name && checked && <input type="hidden" name={name} value={value ?? ''} />}
    </span>
  );
}
