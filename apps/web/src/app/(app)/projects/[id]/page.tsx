'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { FileDropzone, validateUpload } from '@/components/file-dropzone';
import { FilesTable, hasActiveJob } from '@/components/files-table';
import { useToast } from '@/components/toast';
import { Button, Card, CardHeader, ConfirmDialog, ErrorNote, Field, Input, Modal, PageHeader, Spinner, StatCard } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Project, UploadedFile } from '@/lib/types';

export default function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const project = useQuery({ queryKey: ['project', id], queryFn: () => api<Project>(`/projects/${id}`) });
  const files = useQuery({
    queryKey: ['files', { projectId: id }],
    queryFn: () => api<UploadedFile[]>('/files', { query: { projectId: id } }),
    refetchInterval: (q) => (hasActiveJob(q.state.data) ? 1500 : false),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      return api<UploadedFile>(`/projects/${id}/files`, { method: 'POST', body: form });
    },
    onSuccess: (f) => {
      toast.success(`"${f.originalName}" uploaded — processing started`);
      void qc.invalidateQueries();
    },
    onError: toast.error,
  });

  const archive = useMutation({
    mutationFn: (archived: boolean) => api<Project>(`/projects/${id}`, { method: 'PATCH', body: { archived } }),
    onSuccess: (p) => {
      toast.success(p.archived ? 'Project archived' : 'Project restored');
      void qc.invalidateQueries();
    },
    onError: toast.error,
  });

  const remove = useMutation({
    mutationFn: () => api(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Project deleted');
      void qc.invalidateQueries({ queryKey: ['projects'] });
      router.replace('/projects');
    },
    onError: toast.error,
  });

  // Refresh project stats whenever processing finishes.
  const active = hasActiveJob(files.data);
  useEffect(() => {
    if (!active) void qc.invalidateQueries({ queryKey: ['project', id] });
  }, [active, id, qc]);

  if (project.isLoading) return <Spinner />;
  if (project.error) return <ErrorNote error={project.error} />;
  const p = project.data!;

  const onFile = (file: File) => {
    const problem = validateUpload(file);
    if (problem) toast.error(problem);
    else upload.mutate(file);
  };

  return (
    <>
      <Link href="/projects" className="mb-3 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="size-4" /> Projects
      </Link>
      <PageHeader
        title={
          <span className="flex items-center gap-2">
            {p.name} {p.archived && <span className="text-sm font-normal text-slate-400">(archived)</span>}
          </span>
        }
        description={p.description ?? undefined}
        actions={
          <>
            {can('project.write') && (
              <>
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <Button variant="secondary" onClick={() => archive.mutate(!p.archived)} loading={archive.isPending}>
                  <Archive className="size-4" /> {p.archived ? 'Restore' : 'Archive'}
                </Button>
              </>
            )}
            {can('project.delete') && (
              <Button variant="ghost" onClick={() => setDeleting(true)} aria-label="Delete project">
                <Trash2 className="size-4 text-red-600" />
              </Button>
            )}
          </>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Files" value={p.stats?.files ?? 0} />
        <StatCard label="Valid URLs" value={p.stats?.valid ?? 0} />
        <StatCard label="Duplicates removed" value={p.stats?.duplicate ?? 0} />
        <StatCard label="Invalid URLs" value={p.stats?.invalid ?? 0} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader title="Upload product file" description="Step 1 of the workflow." />
          <div className="p-5">
            {can('import.create') && !p.archived ? (
              <FileDropzone onFile={onFile} disabled={upload.isPending} />
            ) : (
              <p className="text-sm text-slate-500">{p.archived ? 'Restore the project to upload files.' : 'Your role cannot upload files.'}</p>
            )}
            <p className="mt-3 text-xs text-slate-500">
              Duplicates are detected by marketplace + ASIN within the file and against earlier uploads in this project.
            </p>
          </div>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader title="Uploaded files" />
          {files.isLoading ? <Spinner /> : <FilesTable files={files.data ?? []} />}
        </Card>
      </div>

      <EditProjectModal project={p} open={editing} onClose={() => setEditing(false)} />
      <ConfirmDialog
        open={deleting}
        danger
        title="Delete project?"
        message={
          <>
            This permanently deletes <strong>{p.name}</strong> with all uploaded files, import results and job history. This cannot be undone.
          </>
        }
        confirmLabel="Delete project"
        loading={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setDeleting(false)}
      />
    </>
  );
}

function EditProjectModal({ project, open, onClose }: { project: Project; open: boolean; onClose(): void }) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');
  const qc = useQueryClient();
  const save = useMutation({
    mutationFn: () => api(`/projects/${project.id}`, { method: 'PATCH', body: { name, description: description || null } }),
    onSuccess: () => {
      void qc.invalidateQueries();
      onClose();
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit project"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>
            Save
          </Button>
        </>
      }
    >
      <ErrorNote error={save.error} />
      <Field label="Name">
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Description">
        <Input value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
    </Modal>
  );
}
