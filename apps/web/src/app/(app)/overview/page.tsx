'use client';

import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, FileUp, FolderKanban, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { JobProgress } from '@/components/job-progress';
import { Card, CardHeader, EmptyState, ErrorNote, PageHeader, Spinner, StatCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import { ALL_NAV_ITEMS } from '@/lib/nav';
import type { Job } from '@/lib/types';

interface Overview {
  projects: number;
  files: number;
  urls: { valid: number; duplicate: number; invalid: number };
  jobs: { queued: number; running: number; paused: number; completed: number; failed: number };
  recentJobs: Job[];
}

const PIPELINE = [
  { step: '1', title: 'Import product URLs', text: 'Upload Excel/CSV files. URLs are validated and de-duplicated per marketplace.', href: '/projects', ready: true },
  { step: '2', title: 'Seller contacts', text: 'Agent 2 finds official websites and verifies public business contacts.', href: '/contacts', ready: false },
  { step: '3', title: 'Email outreach', text: 'Agent 3 drafts personalised emails. Nothing is sent without your approval.', href: '/outreach', ready: false },
];

export default function OverviewPage() {
  const { workspace } = useAuth();
  const q = useQuery({
    queryKey: ['overview'],
    queryFn: () => api<Overview>('/overview'),
    staleTime: 0, // always refetch on visit — counts change as background jobs finish
    refetchInterval: (query) => ((query.state.data?.jobs.running ?? 0) + (query.state.data?.jobs.queued ?? 0) > 0 ? 2000 : 15000),
  });

  return (
    <>
      <PageHeader title="Overview" description={`Everything happening in ${workspace?.name ?? 'your workspace'}.`} />
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        q.data && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Active projects" value={q.data.projects} icon={<FolderKanban className="size-4" />} />
              <StatCard label="Files imported" value={q.data.files} icon={<FileUp className="size-4" />} />
              <StatCard
                label="Valid product URLs"
                value={q.data.urls.valid}
                hint={`${q.data.urls.duplicate} duplicates · ${q.data.urls.invalid} invalid`}
                icon={<CheckCircle2 className="size-4" />}
              />
              <StatCard
                label="Jobs in progress"
                value={q.data.jobs.running + q.data.jobs.queued}
                hint={`${q.data.jobs.paused} paused · ${q.data.jobs.failed} failed`}
                icon={q.data.jobs.running ? <Loader2 className="size-4 animate-spin" /> : <AlertTriangle className="size-4" />}
              />
            </div>

            <Card>
              <CardHeader title="Workflow" description="Each agent hands its approved output to the next one." />
              <ol className="grid gap-px bg-slate-100 sm:grid-cols-2 lg:grid-cols-4">
                {PIPELINE.map((p) => (
                  <li key={p.step} className="bg-white p-5">
                    <div className="flex items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">{p.step}</span>
                      <Link href={p.href} className="text-sm font-medium hover:text-brand-700">
                        {p.title}
                      </Link>
                    </div>
                    <p className="mt-2 text-sm text-slate-500">{p.text}</p>
                    {!p.ready && (
                      <p className="mt-2 text-xs text-slate-400">
                        Coming in phase {ALL_NAV_ITEMS.find((n) => n.href === p.href)?.phase}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </Card>

            <Card>
              <CardHeader title="Recent jobs" description="Background processing across all projects." />
              {q.data.recentJobs.length === 0 ? (
                <EmptyState icon={<FileUp className="size-5" />} title="No jobs yet" description="Upload a product file inside a project to start." />
              ) : (
                <ul className="divide-y divide-slate-100">
                  {q.data.recentJobs.map((j) => (
                    <li key={j.id} className="grid gap-3 px-5 py-3.5 sm:grid-cols-[1fr_280px] sm:items-center">
                      <div className="min-w-0">
                        <Link href={j.fileId ? `/imports/${j.fileId}` : '#'} className="truncate text-sm font-medium hover:text-brand-700">
                          {j.file?.originalName ?? j.type}
                        </Link>
                        <div className="text-xs text-slate-500">
                          {j.project?.name} · {relativeTime(j.createdAt)}
                        </div>
                      </div>
                      <JobProgress job={j} compact />
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        )
      )}
    </>
  );
}
