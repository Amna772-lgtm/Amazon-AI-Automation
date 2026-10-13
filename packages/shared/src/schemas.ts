import { z } from 'zod';
import { ROLES, ImportRowStatus, IntegrationProvider } from './enums';

// Request payload schemas shared by the API (validation) and web (forms).

export const passwordSchema = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(200)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/[0-9]/, 'Password must contain a number');

export const registerSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  password: passwordSchema,
  organizationName: z.string().trim().min(1).max(120).optional(),
  inviteToken: z.string().min(10).max(200).optional(),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1).max(200),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1).max(120),
});
export const updateWorkspaceSchema = createWorkspaceSchema.partial();

export const roleSchema = z.enum(ROLES as [string, ...string[]]);

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: roleSchema,
});
export const updateMemberSchema = z.object({ role: roleSchema });
export const acceptInviteSchema = z.object({ token: z.string().min(10).max(200) });

export const createProjectSchema = z.object({
  name: z.string().trim().min(1).max(160),
  description: z.string().trim().max(2000).optional().nullable(),
});
export const updateProjectSchema = createProjectSchema.partial().extend({
  archived: z.boolean().optional(),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
});

export const importRowsQuerySchema = paginationSchema.extend({
  status: z.enum([ImportRowStatus.VALID, ImportRowStatus.DUPLICATE, ImportRowStatus.INVALID]).optional(),
  q: z.string().trim().max(200).optional(),
  sort: z.enum(['rowNumber', 'asin', 'marketplace', 'status']).default('rowNumber'),
  dir: z.enum(['asc', 'desc']).default('asc'),
});
export type ImportRowsQuery = z.infer<typeof importRowsQuerySchema>;

export const exportFormatSchema = z.enum(['csv', 'xlsx']);
export type ExportFormat = z.infer<typeof exportFormatSchema>;

export const upsertIntegrationSchema = z.object({
  provider: z.enum(Object.values(IntegrationProvider) as [string, ...string[]]),
  label: z.string().trim().max(120).optional(),
  /** Secret values (API keys, passwords). Stored encrypted, never returned. */
  credentials: z.record(z.string().max(4000)),
  /** Non-secret configuration (e.g. SMTP host/port). */
  config: z.record(z.union([z.string(), z.number(), z.boolean()])).optional(),
  enabled: z.boolean().default(true),
});
export type UpsertIntegrationInput = z.infer<typeof upsertIntegrationSchema>;
