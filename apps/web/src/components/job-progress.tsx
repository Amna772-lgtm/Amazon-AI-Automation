'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Pause, Play, RotateCcw, Square } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { percent } from '@/lib/format';
import type { Job } from '@/lib/types';
import { useToast } from './toast';
import { Button, ProgressBar, StatusBadge } from './ui';

export const ACTIVE_JOB_STATUSES = ['QUEUED', 'RUNNING'];

/** Progress summary (total / processed / pending / failed) with pause, resume, retry and cancel controls. */
export function JobProgress({ job, compact }: { job: Job; compact?: boolean }) {
  const pct = job.status === 'COMPLETED' ? 100 : percent(job.processed, job.total);
  const tone = job.status === 'FAILED' ? 'red' : job.status === 'COMPLETED' ? 'green' : 'blue';
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <StatusBadge status={job.status} />
          <span className="text-xs text-slate-500">{pct}%</span>
        </div>
        {!compact && <JobControls job={job} />}
      </div>
      <ProgressBar value={pct} tone={tone} />
      {!compact && (
        <dl className="grid grid-cols-4 gap-2 text-center text-xs">
          {[
            ['Total', job.total],
            ['Processed', job.processed],
            ['Pending', Math.max(0, job.total - job.processed)],
            ['Failed', job.failed],
          ].map(([label, v]) => (
            <div key={label} className="rounded-md bg-slate-50 py-1.5">
              <dt className="text-slate-500">{label}</dt>
              <dd className="font-semibold text-slate-900">{v}</dd>
            </div>
          ))}
        </dl>
      )}
      {job.error && <p className="text-xs text-red-600">{job.error}</p>}
    </div>
  );
}

export function JobControls({ job }: { job: Job }) {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const act = useMutation({
    mutationFn: (action: 'pause' | 'resume' | 'cancel' | 'retry') => api<Job>(`/jobs/${job.id}/${action}`, { method: 'POST' }),
    onSuccess: (_, action) => {
      toast.success(`Job ${action === 'retry' ? 'retried' : `${action}d`}`);
      void qc.invalidateQueries();
    },
    onError: toast.error,
  });
  if (!can('job.control')) return null;

  return (
    <div className="flex gap-1.5">
      {ACTIVE_JOB_STATUSES.includes(job.status) && (
        <Button size="sm" variant="secondary" onClick={() => act.mutate('pause')} loading={act.isPending && act.variables === 'pause'}>
          <Pause className="size-3.5" /> Pause
        </Button>
      )}
      {job.status === 'PAUSED' && (
        <Button size="sm" variant="secondary" onClick={() => act.mutate('resume')} loading={act.isPending && act.variables === 'resume'}>
          <Play className="size-3.5" /> Resume
        </Button>
      )}
      {job.status === 'FAILED' && (
        <Button size="sm" variant="secondary" onClick={() => act.mutate('retry')} loading={act.isPending && act.variables === 'retry'}>
          <RotateCcw className="size-3.5" /> Retry
        </Button>
      )}
      {[...ACTIVE_JOB_STATUSES, 'PAUSED'].includes(job.status) && (
        <Button size="sm" variant="ghost" onClick={() => act.mutate('cancel')} loading={act.isPending && act.variables === 'cancel'}>
          <Square className="size-3.5" /> Cancel
        </Button>
      )}
    </div>
  );
}
