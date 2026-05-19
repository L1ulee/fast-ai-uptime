// Shared (non-client) constants used by both `'use client'` table components and
// server actions in app/admin/*/page.tsx. Server action files MUST import from
// this module directly — Next.js replaces module-level exports of any
// 'use client' file with serializable proxies, which breaks runtime use of
// `Array.includes(...)` etc.

// Configs (HTTP methods)
export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

// Announcements (level)
export const LEVEL_OPTIONS = ['info', 'warning', 'error'] as const;
export type AnnLevel = (typeof LEVEL_OPTIONS)[number];

// Maintenances (status)
export const MAINT_STATUS_OPTIONS = ['scheduled', 'in_progress', 'completed', 'cancelled'] as const;
export type MaintStatus = (typeof MAINT_STATUS_OPTIONS)[number];

// Providers (type)
export const PROVIDER_TYPES = ['openai', 'anthropic', 'gemini', 'custom'] as const;
export type ProviderType = (typeof PROVIDER_TYPES)[number];

// Webhook subscriptions (event types)
export const SUBSCRIPTION_EVENTS = [
  'incident.created',
  'incident.updated',
  'incident.resolved',
  'maintenance.scheduled',
  'maintenance.started',
  'maintenance.completed',
  'component.status_changed',
  'announcement.published',
] as const;
