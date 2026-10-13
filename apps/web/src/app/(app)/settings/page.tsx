'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Button, Card, CardHeader, ErrorNote, Field, Input, PageHeader } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { WorkspaceSummary } from '@/lib/types';

export default function SettingsPage() {
  const { workspace, can, reload, switchWorkspace } = useAuth();
  const toast = useToast();
  const [name, setName] = useState(workspace?.name ?? '');
  const [newName, setNewName] = useState('');
  const manage = can('workspace.manage');

  const rename = useMutation({
    mutationFn: () => api('/workspace', { method: 'PATCH', body: { name } }),
    onSuccess: async () => {
      toast.success('Workspace renamed');
      await reload();
    },
  });

  const create = useMutation({
    mutationFn: () => api<WorkspaceSummary>('/workspaces', { method: 'POST', body: { name: newName } }),
    onSuccess: async (ws) => {
      toast.success(`Workspace "${ws.name}" created`);
      setNewName('');
      await reload();
      switchWorkspace(ws.id);
    },
  });

  return (
    <>
      <PageHeader title="System settings" description="Workspace configuration." />
      <div className="max-w-2xl space-y-6">
        <Card>
          <CardHeader title="Workspace" description="Data, files and members are isolated per workspace." />
          <div className="space-y-4 p-5">
            <ErrorNote error={rename.error} />
            <Field label="Workspace name">
              <Input value={name} onChange={(e) => setName(e.target.value)} disabled={!manage} />
            </Field>
            <div className="text-xs text-slate-500">
              Workspace ID: <span className="font-mono">{workspace?.id}</span>
            </div>
            {manage && (
              <Button onClick={() => rename.mutate()} loading={rename.isPending} disabled={!name.trim() || name === workspace?.name}>
                Save
              </Button>
            )}
          </div>
        </Card>

        {manage && (
          <Card>
            <CardHeader title="New workspace" description="Create another workspace in your organization — for example per team, client or marketplace." />
            <div className="space-y-4 p-5">
              <ErrorNote error={create.error} />
              <Field label="Name">
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. EU sourcing" />
              </Field>
              <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!newName.trim()}>
                Create workspace
              </Button>
            </div>
          </Card>
        )}

        <Card>
          <CardHeader title="Data retention & privacy" description="Coming in phase 5" />
          <p className="p-5 text-sm text-slate-500">
            Configurable retention periods for uploads and contact records, workspace data export and full deletion requests.
          </p>
        </Card>
      </div>
    </>
  );
}
