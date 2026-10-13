'use client';

import { useQuery } from '@tanstack/react-query';
import { FilesTable, hasActiveJob } from '@/components/files-table';
import { Card, ErrorNote, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import type { UploadedFile } from '@/lib/types';

export default function ImportsPage() {
  const q = useQuery({
    queryKey: ['files', 'all'],
    queryFn: () => api<UploadedFile[]>('/files'),
    refetchInterval: (query) => (hasActiveJob(query.state.data) ? 1500 : false),
  });
  return (
    <>
      <PageHeader title="Excel/CSV imports" description="Every file uploaded in this workspace, with processing status. Upload new files from inside a project." />
      <Card>{q.isLoading ? <Spinner /> : q.error ? <div className="p-5"><ErrorNote error={q.error} /></div> : <FilesTable files={q.data ?? []} showProject />}</Card>
    </>
  );
}
