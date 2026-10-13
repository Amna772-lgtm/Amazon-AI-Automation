import type { LogLevel, Prisma, PrismaClient } from '@app/db';

export interface JobLogger {
  debug(message: string, data?: Record<string, unknown>): Promise<void>;
  info(message: string, data?: Record<string, unknown>): Promise<void>;
  warn(message: string, data?: Record<string, unknown>): Promise<void>;
  error(message: string, data?: Record<string, unknown>): Promise<void>;
}

/** Persists processing logs per job so users can see what an agent/job did. */
export function createJobLogger(prisma: PrismaClient, job: { id: string; workspaceId: string }): JobLogger {
  const write = (level: LogLevel) => async (message: string, data?: Record<string, unknown>) => {
    await prisma.jobLog.create({
      data: {
        jobId: job.id,
        workspaceId: job.workspaceId,
        level,
        message: message.slice(0, 2000),
        data: data as Prisma.InputJsonValue | undefined,
      },
    });
  };
  return { debug: write('DEBUG'), info: write('INFO'), warn: write('WARN'), error: write('ERROR') };
}
