// Plain (non-client) constants for incidents. Imported by server actions; the client
// component re-exports them so existing imports keep working.

export const STATUS_OPTIONS = ['investigating', 'identified', 'monitoring', 'resolved'] as const;
export type IncidentStatus = (typeof STATUS_OPTIONS)[number];

export const IMPACT_OPTIONS = ['none', 'minor', 'major', 'critical'] as const;
export type IncidentImpact = (typeof IMPACT_OPTIONS)[number];
