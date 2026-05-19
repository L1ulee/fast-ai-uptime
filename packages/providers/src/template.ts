/**
 * 简单模板替换：{{API_KEY}} / {{model}} / {{timestamp}}。
 *
 * 设计目标：管理员在 UI 上写请求头/请求体时可以引用 API_KEY 等敏感变量
 * 而不必明文存进数据库。空值替换为空串以避免发出 `Bearer undefined` 这类无效头。
 */
export interface TemplateContext {
  apiKey?: string;
  modelName?: string;
}

const VAR_RE = /\{\{\s*([A-Za-z_][A-Za-z0-9_]*)\s*\}\}/g;

export function applyTemplate(input: string, ctx: TemplateContext): string {
  return input.replace(VAR_RE, (_, name) => {
    switch (name) {
      case 'API_KEY':
        return ctx.apiKey ?? '';
      case 'model':
        return ctx.modelName ?? '';
      case 'timestamp':
        return new Date().toISOString();
      default:
        return '';
    }
  });
}
