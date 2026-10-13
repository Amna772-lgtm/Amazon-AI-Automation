'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FolderKanban, Plus, Search } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, EmptyState, ErrorNote, Field, Input, Modal, PageHeader, Spinner, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import type { Project } from '@/lib/types';

export default function ProjectsPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);

  const q = useQuery({
    queryKey: ['projects', { search, showArchived }],
    queryFn: () => api<Project[]>('/projects', { query: { q: search, archived: showArchived } }),
  });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Each project holds its uploaded files, contacts and campaigns."
        actions={
          can('project.write') && (
            <Button onClick={() => setCreating(true)}>
              <Plus className="size-4" /> New project
            </Button>
          )
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 px-5 py-3">
          <div className="relative w-full max-w-xs">
            <Search className="absolute top-2.5 left-2.5 size-4 text-slate-400" />
            <Input placeholder="Search projects" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-8" />
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} /> Show archived
          </label>
        </div>
        {q.isLoading ? (
          <Spinner />
        ) : q.error ? (
          <div className="p-5">
            <ErrorNote error={q.error} />
          </div>
        ) : q.data?.length === 0 ? (
          <EmptyState
            icon={<FolderKanban className="size-5" />}
            title={search ? 'No matching projects' : 'No projects yet'}
            description="Create a project, then upload an Excel or CSV file of Amazon product URLs."
            action={can('project.write') && !search && <Button onClick={() => setCreating(true)}>Create project</Button>}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-100 bg-slate-50/60">
                <tr>
                  <th className={th}>Project</th>
                  <th className={th}>Files</th>
                  <th className={th}>Valid URLs</th>
                  <th className={th}>Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {q.data?.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/60">
                    <td className={td}>
                      <Link href={`/projects/${p.id}`} className="font-medium text-slate-900 hover:text-brand-700">
                        {p.name}
                      </Link>
                      {p.description && <div className="max-w-md truncate text-xs text-slate-500">{p.description}</div>}
                    </td>
                    <td className={td}>{p.fileCount}</td>
                    <td className={td}>{p.validUrlCount}</td>
                    <td className={td}>{relativeTime(p.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <CreateProjectModal open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function CreateProjectModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const create = useMutation({
    mutationFn: () => api<Project>('/projects', { method: 'POST', body: { name, description: description || null } }),
    onSuccess: (p) => {
      toast.success('Project created');
      void qc.invalidateQueries({ queryKey: ['projects'] });
      onClose();
      router.push(`/projects/${p.id}`);
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="New project"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>
            Create project
          </Button>
        </>
      }
    >
      <ErrorNote error={create.error} />
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kitchen gadgets — US" />
      </Field>
      <Field label="Description" hint="Optional">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </Modal>
  );
}
