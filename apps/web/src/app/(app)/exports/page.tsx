'use client';

import { useQuery } from '@tanstack/react-query';
import { Download, FileDown } from 'lucide-react';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, Spinner, td, th } from '@/components/ui';
import { api, download } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import type { ExportRecord } from '@/lib/types';

const TYPE_LABEL: Record<string, string> = {
  IMPORT_ROWS: 'Import results',
  SELLER_CONTACTS: 'Seller contacts',
  CAMPAIGN_REPORT: 'Campaign report',
};

export default function ExportsPage() {
  const toast = useToast();
  const q = useQuery({ queryKey: ['exports'], queryFn: () => api<ExportRecord[]>('/exports') });
  return (
    <>
      <PageHeader title="Exported reports" description="Every file exported from this workspace. Re-download any report." />
      <Card>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <div className="p-5">
            <ErrorNote error={q.error} />
          </div>
        ) : !q.data?.length ? (
          <EmptyState icon={<FileDown className="size-5" />} title="No exports yet" description="Export results from an import to see them here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className={th}>File</th>
                  <th className={th}>Type</th>
                  <th className={th}>Rows</th>
                  <th className={th}>Created</th>
                  <th className={th} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data.map((e) => (
                  <tr key={e.id}>
                    <td className={`${td} font-medium`}>{e.fileName}</td>
                    <td className={td}>
                      <Badge>{TYPE_LABEL[e.type] ?? e.type}</Badge>
                    </td>
                    <td className={td}>{e.rowCount}</td>
                    <td className={td}>{formatDateTime(e.createdAt)}</td>
                    <td className={`${td} text-right`}>
                      <Button size="sm" variant="secondary" onClick={() => download(`/exports/${e.id}/download`, undefined, e.fileName).catch(toast.error)}>
                        <Download className="size-3.5" /> Download
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
