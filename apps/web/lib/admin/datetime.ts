/**
 * 把 <input type="datetime-local"> 的字符串当作 UTC 解析。
 *
 * datetime-local 不带时区。`new Date(s)` 在 Node 中会按服务器本地时区解释，
 * 在容器部署中容易与管理员浏览器时区不一致，造成几小时的偏差。
 *
 * 因此我们规定：管理员输入的时间一律视为 UTC（表单标签也明确标注 UTC）。
 */
export function parseDateTimeLocalAsUtc(s: string): Date {
  if (!s) return new Date(NaN);
  return new Date(s.endsWith('Z') ? s : `${s}Z`);
}
