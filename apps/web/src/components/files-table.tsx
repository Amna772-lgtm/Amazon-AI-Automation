'use client';

import { FileSpreadsheet } from 'lucide-react';
import Link from 'next/link';
import { formatBytes, relativeTime } from '@/lib/format';
import type { UploadedFile } from '@/lib/types';
import { JobProgress } from './job-progress';
import { EmptyState, td, th } from './ui';

export function FilesTable({ files, showProject }: { files: UploadedFile[]; showProject?: boolean }) {
  if (!files.length) {
    return <EmptyState icon={<FileSpreadsheet className="size-5" />} title="No files uploaded yet" description="Uploaded files and their processing progress appear here." />;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead className="border-b border-slate-100 bg-slate-50/60">
          <tr>
            <th className={th}>File</th>
            {showProject && <th className={th}>Project</th>}
            <th className={th}>Results</th>
            <th className={`${th} w-72`}>Progress</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {files.map((f) => (
            <tr key={f.id} className="align-top hover:bg-slate-50/60">
              <td className={td}>
                <Link href={`/imports/${f.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                  {f.originalName}
                </Link>
                <div className="text-xs text-slate-500">
                  {formatBytes(f.sizeBytes)} · {relativeTime(f.createdAt)}
                </div>
              </td>
              {showProject && (
                <td className={td}>
                  <Link href={`/projects/${f.project?.id}`} className="hover:text-brand-700">
                    {f.project?.name}
                  </Link>
                </td>
              )}
              <td className={td}>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <span className="text-emerald-700">{f.validCount} valid</span>
                  <span className="text-amber-700">{f.duplicateCount} duplicate</span>
                  <span className="text-red-700">{f.invalidCount} invalid</span>
                </div>
                {f.error && <div className="mt-1 text-xs text-red-600">{f.error}</div>}
              </td>
              <td className={td}>{f.job ? <JobProgress job={f.job} compact /> : '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const hasActiveJob = (files: UploadedFile[] | undefined) =>
  !!files?.some((f) => f.job && ['QUEUED', 'RUNNING'].includes(f.job.status));
