import { z, type ZodType } from 'zod';

/**
 * Every data point an agent produces carries provenance. Missing data is recorded as
 * UNAVAILABLE — agents must never fill gaps with guessed values.
 */
export const ValueKind = { ACTUAL: 'ACTUAL', ESTIMATED: 'ESTIMATED', UNAVAILABLE: 'UNAVAILABLE' } as const;
export type ValueKind = (typeof ValueKind)[keyof typeof ValueKind];

export interface SourcedValue<T> {
  value: T | null;
  kind: ValueKind;
  /** Provider / URL the value came from, e.g. "keepa", "https://brand.com/contact". */
  source: string | null;
  /** 0..1 reliability for ESTIMATED values. */
  confidence?: number;
  observedAt: string;
  note?: string;
}

export const sourcedValueSchema = <T extends ZodType>(inner: T) =>
  z.object({
    value: inner.nullable(),
    kind: z.enum(['ACTUAL', 'ESTIMATED', 'UNAVAILABLE']),
    source: z.string().nullable(),
    confidence: z.number().min(0).max(1).optional(),
    observedAt: z.string(),
    note: z.string().optional(),
  });

export const actual = <T>(value: T, source: string): SourcedValue<T> => ({
  value,
  kind: 'ACTUAL',
  source,
  observedAt: new Date().toISOString(),
});

export const estimated = <T>(value: T, source: string, confidence: number, note?: string): SourcedValue<T> => ({
  value,
  kind: 'ESTIMATED',
  source,
  confidence: Math.min(1, Math.max(0, confidence)),
  observedAt: new Date().toISOString(),
  note,
});

export const unavailable = <T>(source: string | null = null, note?: string): SourcedValue<T> => ({
  value: null,
  kind: 'UNAVAILABLE',
  source,
  observedAt: new Date().toISOString(),
  note,
});

export interface AgentLogger {
  info(message: string, data?: Record<string, unknown>): Promise<void>;
  warn(message: string, data?: Record<string, unknown>): Promise<void>;
  error(message: string, data?: Record<string, unknown>): Promise<void>;
}

export type StopSignal = 'pause' | 'cancel' | null;

export interface AgentContext<I, S> {
  workspaceId: string;
  projectId: string;
  jobId: string;
  input: I;
  settings: S;
  log: AgentLogger;
  reportProgress(processed: number, total: number, failed?: number): Promise<void>;
  /** Agents must poll this between units of work to honour pause/cancel. */
  checkStop(): Promise<StopSignal>;
  /** Integration adapters resolved for the workspace (Keepa, Anthropic, email, ...). */
  providers: Record<string, unknown>;
}

export interface AgentRunResult<O> {
  status: 'completed' | 'paused' | 'cancelled';
  output: O;
}

export interface AgentDefinition<I = unknown, O = unknown, S = unknown> {
  /** Stable registry key, e.g. "seller-contacts". */
  key: string;
  name: string;
  version: string;
  description: string;
  queue: string;
  /** Upstream agent whose *approved* output feeds this agent. */
  consumes?: string;
  inputSchema: ZodType<I>;
  outputSchema: ZodType<O>;
  settingsSchema: ZodType<S>;
  defaultSettings: S;
  run(ctx: AgentContext<I, S>): Promise<AgentRunResult<O>>;
}
