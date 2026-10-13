export * from './enums';
export * from './permissions';
export * from './amazon-url';
export * from './schemas';

export const QUEUES = {
  IMPORTS: 'imports',
  // Agent queues are registered from Phase 3 onwards.
  AGENT_SELLER_CONTACTS: 'agent-seller-contacts',
  AGENT_EMAIL_OUTREACH: 'agent-email-outreach',
} as const;
export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export const WORKSPACE_HEADER = 'x-workspace-id';
