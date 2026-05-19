'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { remarkAlert } from 'remark-github-blockquote-alert';

/**
 * 受控 Markdown 渲染器 —— 用于事件正文 / 更新流。
 *
 * 支持 GFM（表格、删除线、任务列表、自动链接等）+ GitHub blockquote alert
 * （`> [!NOTE]` / `> [!WARNING]` / `> [!TIP]` / `> [!IMPORTANT]` / `> [!CAUTION]`）。
 *
 * 视觉样式由 globals.css 的 `.md` 作用域类承载，与设计 token 对齐。
 */
export function Markdown({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className ? `md ${className}` : 'md'}>
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkAlert]}>{source}</ReactMarkdown>
    </div>
  );
}
