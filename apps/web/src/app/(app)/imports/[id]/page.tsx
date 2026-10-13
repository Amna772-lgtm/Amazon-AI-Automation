'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { ArrowDown, ArrowLeft, ArrowUp, Download, ExternalLink, Search, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { JobProgress } from '@/components/job-progress';
import { useToast } from '@/components/toast';
import {
  Button,
  Card,
  CardHeader,
  ConfirmDialog,
  EmptyState,
  ErrorNote,
  Input,
  PageHeader,
  Pagination,
  Select,
  Spinner,
  StatusBadge,
  td,
  th,
} from '@/components/ui';
import { api, download } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatBytes, formatDateTime } from '@/lib/format';
import type { ImportRow, JobLog, Paged, UploadedFile } from '@/lib/types';

type SortKey = 'rowNumber' | 'asin' | 'marketplace' | 'status';
const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'VALID', label: 'Valid' },
  { key: 'DUPLICATE', label: 'Duplicates' },
  { key: 'INVALID', label: 'Invalid' },
] as const;

export default function ImportDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [debounced, setDebounced] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'rowNumber', dir: 'asc' });
  const [page, setPage] = useState(1);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const file = useQuery({
    queryKey: ['file', id],
    queryFn: () => api<UploadedFile>(`/files/${id}`),
    refetchInterval: (q) => (q.state.data?.job && ['QUEUED', 'RUNNING'].includes(q.state.data.job.status) ? 1200 : false),
  });
  const running = !!file.data?.job && ['QUEUED', 'RUNNING'].includes(file.data.job.status);

  const rows = useQuery({
    queryKey: ['rows', id, { status, debounced, sort, page }],
    queryFn: () =>
      api<Paged<ImportRow>>(`/files/${id}/rows`, {
        query: { status, q: debounced, sort: sort.key, dir: sort.dir, page, pageSize: 50 },
      }),
    placeholderData: keepPreviousData,
    refetchInterval: running ? 2000 : false,
  });

  const logs = useQuery({
    queryKey: ['job-logs', file.data?.job?.id],
    queryFn: () => api<JobLog[]>(`/jobs/${file.data!.job!.id}/logs`),
    enabled: !!file.data?.job,
    refetchInterval: running ? 2000 : false,
  });

  const remove = useMutation({
    mutationFn: () => api(`/files/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('File and its results deleted');
      void qc.invalidateQueries();
      router.replace(file.data ? `/projects/${file.data.projectId}` : '/imports');
    },
    onError: toast.error,
  });

  if (file.isLoading) return <Spinner />;
  if (file.error) return <ErrorNote error={file.error} />;
  const f = file.data!;

  const toggleSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));

  const exportRows = async (onlyStatus?: string) => {
    try {
      await download(`/files/${id}/export`, { format, status: onlyStatus }, `export.${format}`);
      void qc.invalidateQueries({ queryKey: ['exports'] });
    } catch (e) {
      toast.error(e);
    }
  };

  const SortHeader = ({ k, children }: { k: SortKey; children: string }) => (
    <th className={th}>
      <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 uppercase hover:text-slate-800">
        {children}
        {sort.key === k && (sort.dir === 'asc' ? <ArrowUp className="size-3" /> : <ArrowDown className="size-3" />)}
      </button>
    </th>
  );

  return (
    <>
      <Link href={`/projects/${f.projectId}`} className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> {f.project?.name ?? 'Project'}
      </Link>
      <PageHeader
        title={f.originalName}
        description={`${formatBytes(f.sizeBytes)} · uploaded ${formatDateTime(f.createdAt)}${f.urlColumns.length ? ` · URL column: ${f.urlColumns.join(', ')}` : ''}`}
        actions={
          <>
            {can('export.create') && (
              <>
                <Select value={format} onChange={(e) => setFormat(e.target.value as 'xlsx' | 'csv')} aria-label="Export format">
                  <option value="xlsx">Excel (.xlsx)</option>
                  <option value="csv">CSV</option>
                </Select>
                <Button variant="secondary" onClick={() => exportRows('VALID')} disabled={running || !f.validCount}>
                  <Download className="size-4" /> Valid URLs
                </Button>
                <Button variant="secondary" onClick={() => exportRows()} disabled={running}>
                  <Download className="size-4" /> All rows
                </Button>
              </>
            )}
            {can('project.write') && (
              <Button variant="ghost" onClick={() => setDeleting(true)} aria-label="Delete file">
                <Trash2 className="size-4 text-red-600" />
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader title="Processing" description="Rows are processed in the background; you can leave this page." />
          <div className="p-5">
            {f.job ? <JobProgress job={f.job} /> : <p className="text-sm text-slate-500">No job.</p>}
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Summary label="Valid" value={f.validCount} className="text-emerald-700" />
              <Summary label="Duplicates" value={f.duplicateCount} className="text-amber-700" />
              <Summary label="Invalid" value={f.invalidCount} className="text-red-700" />
            </div>
          </div>
        </Card>
        <Card>
          <CardHeader title="Activity" description="Job log" />
          <ol className="max-h-64 space-y-3 overflow-y-auto p-5">
            {(logs.data ?? []).map((l) => (
              <li key={l.id} className="relative border-l-2 border-slate-200 pl-3">
                <span
                  className={clsx(
                    'absolute top-1.5 -left-[5px] size-2 rounded-full',
                    l.level === 'ERROR' ? 'bg-red-500' : l.level === 'WARN' ? 'bg-amber-500' : 'bg-brand-500',
                  )}
                />
                <p className="text-sm text-slate-700">{l.message}</p>
                <p className="text-xs text-slate-400">{formatDateTime(l.createdAt)}</p>
              </li>
            ))}
            {!logs.data?.length && <li className="text-sm text-slate-500">No log entries yet.</li>}
          </ol>
        </Card>
      </div>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex gap-1" role="tablist">
            {STATUS_TABS.map((t) => (
              <button
                key={t.key}
                role="tab"
                aria-selected={status === t.key}
                onClick={() => {
                  setStatus(t.key);
                  setPage(1);
                }}
                className={clsx(
                  'rounded-md px-3 py-1.5 text-sm',
                  status === t.key ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100',
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-2.5 left-2.5 size-4 text-slate-400" />
            <Input placeholder="Search URL, ASIN or issue" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
        </div>
        {rows.isLoading ? (
          <Spinner />
        ) : rows.error ? (
          <div className="p-5">
            <ErrorNote error={rows.error} />
          </div>
        ) : !rows.data?.items.length ? (
          <EmptyState title={running ? 'Processing…' : 'No rows match'} description={running ? 'Rows appear as they are processed.' : undefined} />
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <SortHeader k="rowNumber">Row</SortHeader>
                    <SortHeader k="status">Status</SortHeader>
                    <SortHeader k="marketplace">Market</SortHeader>
                    <SortHeader k="asin">ASIN</SortHeader>
                    <th className={th}>URL</th>
                    <th className={th}>Issue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rows.data.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50/60">
                      <td className={clsx(td, 'tabular-nums text-slate-500')}>{r.rowNumber}</td>
                      <td className={td}>
                        <StatusBadge status={r.status} />
                      </td>
                      <td className={td}>{r.marketplace ?? '—'}</td>
                      <td className={clsx(td, 'font-mono text-xs')}>{r.asin ?? '—'}</td>
                      <td className={clsx(td, 'max-w-md')}>
                        {r.canonicalUrl ? (
                          <a
                            href={r.canonicalUrl}
                            target="_blank"
                            rel="noopener noreferrer nofollow"
                            className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                          >
                            {r.canonicalUrl} <ExternalLink className="size-3" />
                          </a>
                        ) : (
                          <span className="block truncate text-slate-500" title={r.rawValue}>
                            {r.rawValue}
                          </span>
                        )}
                      </td>
                      <td className={clsx(td, 'text-xs text-slate-500')}>{r.errorMessage ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={rows.data.page} pageSize={rows.data.pageSize} total={rows.data.total} onPage={setPage} />
          </>
        )}
      </Card>

      <ConfirmDialog
        open={deleting}
        danger
        title="Delete file?"
        message="The uploaded file, its import results and job history are permanently deleted."
        confirmLabel="Delete"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleting(false)}
      />
    </>
  );
}

function Summary({ label, value, className }: { label: string; value: number; className: string }) {
  return (
    <div className="rounded-lg border border-slate-100 py-3">
      <div className={clsx('text-xl font-semibold', className)}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
