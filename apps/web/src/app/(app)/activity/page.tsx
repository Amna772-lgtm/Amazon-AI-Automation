'use client';

import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, ConfirmDialog, ErrorNote, PageHeader, Pagination, Select, Spinner, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, humanizeAction } from '@/lib/format';
import type { ActivityItem, Paged } from '@/lib/types';

const FILTERS = [
  ['', 'All activity'],
  ['project', 'Projects'],
  ['import', 'Imports'],
  ['export', 'Exports'],
  ['job', 'Jobs'],
  ['member', 'Team'],
  ['integration', 'Integrations'],
  ['workspace', 'Workspace'],
] as const;

export default function ActivityPage() {
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [clearing, setClearing] = useState(false);
  const q = useQuery({
    queryKey: ['activity', { page, action }],
    queryFn: () => api<Paged<ActivityItem>>('/activity', { query: { page, pageSize: 50, action } }),
    placeholderData: keepPreviousData,
  });

  const clear = useMutation({
    // Deletes what the table is showing: everything, or only the selected filter's entries.
    mutationFn: () => api<{ deleted: number }>('/activity', { method: 'DELETE', query: { action } }),
    onSuccess: (r) => {
      toast.success(`${r.deleted} log entr${r.deleted === 1 ? 'y' : 'ies'} deleted`);
      setClearing(false);
      setPage(1);
      void qc.invalidateQueries({ queryKey: ['activity'] });
    },
    onError: toast.error,
  });

  const filterLabel = FILTERS.find(([v]) => v === action)?.[1] ?? '';
  const count = q.data?.total ?? 0;

  return (
    <>
      <PageHeader title="Activity logs" description="Audit trail of changes made in this workspace." />
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <Select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
            aria-label="Filter activity"
          >
            {FILTERS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
          {can('activity.delete') && (
            <Button variant="danger" onClick={() => setClearing(true)} disabled={!q.data?.total}>
              <Trash2 className="size-4" /> {action ? `Clear ${filterLabel} logs` : 'Clear logs'}
            </Button>
          )}
        </div>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <div className="p-5">
            <ErrorNote error={q.error} />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>Who</th>
                    <th className={th}>Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {q.data?.items.map((a) => (
                    <tr key={a.id}>
                      <td className={`${td} whitespace-nowrap`}>{formatDateTime(a.createdAt)}</td>
                      <td className={td}>{a.actorEmail ?? 'system'}</td>
                      <td className={td}>{humanizeAction(a.action)}</td>
                    </tr>
                  ))}
                  {!q.data?.items.length && (
                    <tr>
                      <td colSpan={3} className="py-10 text-center text-sm text-slate-500">
                        No activity yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={setPage} />}
          </>
        )}
      </Card>
      <ConfirmDialog
        open={clearing}
        danger
        title={action ? `Clear ${filterLabel} logs?` : 'Clear all activity logs?'}
        message={
          action
            ? `The ${count} "${filterLabel}" log entr${count === 1 ? 'y is' : 'ies are'} deleted; other activity is kept. This cannot be undone. An entry recording that you cleared them is added.`
            : `All ${count} entr${count === 1 ? 'y' : 'ies'} in this workspace's activity log ${count === 1 ? 'is' : 'are'} deleted. This cannot be undone. A single entry recording that you cleared the log is kept.`
        }
        confirmLabel={action ? `Clear ${filterLabel} logs` : 'Clear logs'}
        loading={clear.isPending}
        onConfirm={() => clear.mutate()}
        onClose={() => setClearing(false)}
      />
    </>
  );
}
