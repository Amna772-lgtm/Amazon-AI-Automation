'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, ConfirmDialog, ErrorNote, Field, Input, Modal, PageHeader, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { relativeTime } from '@/lib/format';
import type { IntegrationRecord } from '@/lib/types';

interface ProviderDef {
  provider: string;
  name: string;
  purpose: string;
  phase: number;
  fields: Array<{ key: string; label: string; secret?: boolean }>;
}

const PROVIDERS: ProviderDef[] = [
  {
    provider: 'KEEPA',
    name: 'Keepa',
    purpose: 'Authorised Amazon product data: prices, sales rank history, offers, stock and seller data.',
    phase: 2,
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
  },
  {
    provider: 'AMAZON_SP_API',
    name: 'Amazon SP-API',
    purpose: 'Official Selling Partner API — only for data your seller account is eligible to access.',
    phase: 2,
    fields: [
      { key: 'clientId', label: 'LWA client ID' },
      { key: 'clientSecret', label: 'LWA client secret', secret: true },
      { key: 'refreshToken', label: 'Refresh token', secret: true },
    ],
  },
  {
    provider: 'ANTHROPIC',
    name: 'Anthropic (Claude)',
    purpose: 'Language model used by the agents for analysis and email drafting.',
    phase: 2,
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
  },
  {
    provider: 'EMAIL_VERIFIER',
    name: 'Email verification service',
    purpose: 'Optional deliverability checks for Agent 2, in addition to built-in syntax, domain and MX checks.',
    phase: 3,
    fields: [{ key: 'apiKey', label: 'API key', secret: true }],
  },
  {
    provider: 'SMTP',
    name: 'SMTP',
    purpose: 'Send approved outreach emails through your own mail server.',
    phase: 4,
    fields: [
      { key: 'host', label: 'Host' },
      { key: 'port', label: 'Port' },
      { key: 'username', label: 'Username' },
      { key: 'password', label: 'Password', secret: true },
    ],
  },
];

export default function IntegrationsPage() {
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['integrations'], queryFn: () => api<IntegrationRecord[]>('/integrations') });
  const [editing, setEditing] = useState<ProviderDef | null>(null);
  const [removing, setRemoving] = useState<IntegrationRecord | null>(null);
  const qc = useQueryClient();
  const toast = useToast();
  const remove = useMutation({
    mutationFn: (id: string) => api(`/integrations/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Integration removed');
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ['integrations'] });
    },
    onError: toast.error,
  });

  return (
    <>
      <PageHeader
        title="Integrations"
        description="Connect data providers, AI and email services for this workspace. Each provider is an independent module and can be swapped later."
      />
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800">
        <ShieldCheck className="size-4 shrink-0" /> Credentials are encrypted (AES-256-GCM) before storage and are never shown again after saving.
      </div>
      {q.isLoading ? (
        <Spinner />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {PROVIDERS.map((p) => {
            const existing = q.data?.find((i) => i.provider === p.provider);
            return (
              <Card key={p.provider} className="flex flex-col p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <KeyRound className="size-4 text-slate-400" />
                    <h2 className="text-sm font-semibold">{p.name}</h2>
                  </div>
                  {existing ? <Badge tone="green">Connected</Badge> : <Badge>Used from phase {p.phase}</Badge>}
                </div>
                <p className="mt-2 flex-1 text-sm text-slate-500">{p.purpose}</p>
                {existing && (
                  <div className="mt-3 text-xs text-slate-500">
                    {Object.entries(existing.credentialHints).map(([k, v]) => (
                      <span key={k} className="mr-3">
                        {k}: <span className="font-mono">{v}</span>
                      </span>
                    ))}
                    · updated {relativeTime(existing.updatedAt)}
                  </div>
                )}
                {can('integrations.manage') && (
                  <div className="mt-4 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => setEditing(p)}>
                      {existing ? 'Replace credentials' : 'Connect'}
                    </Button>
                    {existing && (
                      <Button size="sm" variant="ghost" onClick={() => setRemoving(existing)}>
                        Disconnect
                      </Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {editing && <CredentialsModal def={editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!removing}
        danger
        title="Disconnect integration?"
        message="The stored credentials are deleted. Agents that depend on this provider will stop working until it is reconnected."
        confirmLabel="Disconnect"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

function CredentialsModal({ def, onClose }: { def: ProviderDef; onClose(): void }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const qc = useQueryClient();
  const toast = useToast();
  const save = useMutation({
    mutationFn: () => api('/integrations', { method: 'PUT', body: { provider: def.provider, credentials: values } }),
    onSuccess: () => {
      toast.success(`${def.name} connected`);
      void qc.invalidateQueries({ queryKey: ['integrations'] });
      onClose();
    },
  });
  const complete = def.fields.every((f) => values[f.key]?.trim());
  return (
    <Modal
      open
      onClose={onClose}
      title={`Connect ${def.name}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!complete}>
            Save
          </Button>
        </>
      }
    >
      <ErrorNote error={save.error} />
      {def.fields.map((f) => (
        <Field key={f.key} label={f.label}>
          <Input
            type={f.secret ? 'password' : 'text'}
            autoComplete="off"
            value={values[f.key] ?? ''}
            onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
          />
        </Field>
      ))}
    </Modal>
  );
}
