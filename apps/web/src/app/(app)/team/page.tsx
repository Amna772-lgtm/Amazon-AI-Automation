'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Copy, UserPlus, X } from 'lucide-react';
import { useState } from 'react';
import { ROLES, type Role } from '@app/shared';
import { useToast } from '@/components/toast';
import { Badge, Button, Card, CardHeader, ConfirmDialog, ErrorNote, Field, Input, Modal, PageHeader, Select, Spinner, td, th } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { formatDateTime, relativeTime } from '@/lib/format';
import type { Invitation, Member } from '@/lib/types';

const ROLE_HELP: Record<Role, string> = {
  ADMIN: 'Full access, including members, integrations and deletion.',
  MANAGER: 'Manage projects, run and control jobs, export data.',
  MEMBER: 'View data, upload files and export results.',
};

export default function TeamPage() {
  const { can, user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const manage = can('members.manage');
  const [inviting, setInviting] = useState(false);
  const [removing, setRemoving] = useState<Member | null>(null);

  const members = useQuery({ queryKey: ['members'], queryFn: () => api<Member[]>('/workspace/members') });
  const invites = useQuery({ queryKey: ['invitations'], queryFn: () => api<Invitation[]>('/workspace/invitations'), enabled: manage });

  const changeRole = useMutation({
    mutationFn: ({ id, role }: { id: string; role: Role }) => api(`/workspace/members/${id}`, { method: 'PATCH', body: { role } }),
    onSuccess: () => {
      toast.success('Role updated');
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
    onError: toast.error,
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(`/workspace/members/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      toast.success('Member removed');
      setRemoving(null);
      void qc.invalidateQueries({ queryKey: ['members'] });
    },
    onError: toast.error,
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/workspace/invitations/${id}`, { method: 'DELETE' }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['invitations'] }),
    onError: toast.error,
  });

  return (
    <>
      <PageHeader
        title="Users & team"
        description="Members of this workspace and their roles."
        actions={
          manage && (
            <Button onClick={() => setInviting(true)}>
              <UserPlus className="size-4" /> Invite member
            </Button>
          )
        }
      />
      <div className="space-y-6">
        <Card>
          <CardHeader title="Members" />
          {members.isLoading ? (
            <Spinner />
          ) : members.error ? (
            <div className="p-5">
              <ErrorNote error={members.error} />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="border-b border-slate-100 bg-slate-50/60">
                  <tr>
                    <th className={th}>Name</th>
                    <th className={th}>Role</th>
                    <th className={th}>Last sign-in</th>
                    <th className={th} />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {members.data?.map((m) => (
                    <tr key={m.id}>
                      <td className={td}>
                        <div className="font-medium text-slate-900">
                          {m.user.name} {m.user.id === user?.id && <span className="text-xs font-normal text-slate-400">(you)</span>}
                        </div>
                        <div className="text-xs text-slate-500">{m.user.email}</div>
                      </td>
                      <td className={td}>
                        {manage ? (
                          <Select
                            value={m.role}
                            onChange={(e) => changeRole.mutate({ id: m.id, role: e.target.value as Role })}
                            aria-label={`Role for ${m.user.name}`}
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r.charAt(0) + r.slice(1).toLowerCase()}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          <Badge tone="blue">{m.role}</Badge>
                        )}
                      </td>
                      <td className={td}>{relativeTime(m.user.lastLoginAt)}</td>
                      <td className={`${td} text-right`}>
                        {manage && (
                          <Button size="sm" variant="ghost" onClick={() => setRemoving(m)}>
                            Remove
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {manage && !!invites.data?.length && (
          <Card>
            <CardHeader title="Pending invitations" />
            <ul className="divide-y divide-slate-100">
              {invites.data.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-5 py-3 text-sm">
                  <div>
                    <span className="font-medium">{i.email}</span> <Badge>{i.role}</Badge>
                    <div className="text-xs text-slate-500">Expires {formatDateTime(i.expiresAt)}</div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => revoke.mutate(i.id)}>
                    <X className="size-3.5" /> Revoke
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Role permissions</h2>
          <dl className="grid gap-3 sm:grid-cols-3">
            {ROLES.map((r) => (
              <div key={r} className="rounded-lg bg-slate-50 p-3">
                <dt className="text-sm font-medium">{r.charAt(0) + r.slice(1).toLowerCase()}</dt>
                <dd className="mt-1 text-xs text-slate-500">{ROLE_HELP[r]}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>

      <InviteModal open={inviting} onClose={() => setInviting(false)} />
      <ConfirmDialog
        open={!!removing}
        danger
        title="Remove member?"
        message={removing && <>{removing.user.name} will immediately lose access to this workspace.</>}
        confirmLabel="Remove"
        loading={remove.isPending}
        onConfirm={() => removing && remove.mutate(removing.id)}
        onClose={() => setRemoving(null)}
      />
    </>
  );
}

function InviteModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('MEMBER');
  const [link, setLink] = useState<string | null>(null);

  const invite = useMutation({
    mutationFn: () => api<{ inviteUrl: string }>('/workspace/invitations', { method: 'POST', body: { email, role } }),
    onSuccess: (res) => {
      setLink(res.inviteUrl);
      void qc.invalidateQueries({ queryKey: ['invitations'] });
    },
  });

  const close = () => {
    setEmail('');
    setLink(null);
    invite.reset();
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title="Invite a member"
      footer={
        link ? (
          <Button onClick={close}>Done</Button>
        ) : (
          <>
            <Button variant="secondary" onClick={close}>
              Cancel
            </Button>
            <Button onClick={() => invite.mutate()} loading={invite.isPending} disabled={!email}>
              Create invitation
            </Button>
          </>
        )
      }
    >
      {link ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Share this one-time link with {email}. It expires in 7 days.</p>
          <div className="flex gap-2">
            <Input readOnly value={link} onFocus={(e) => e.target.select()} />
            <Button
              variant="secondary"
              onClick={() => navigator.clipboard.writeText(link).then(() => toast.success('Link copied'))}
              aria-label="Copy link"
            >
              <Copy className="size-4" />
            </Button>
          </div>
        </div>
      ) : (
        <>
          <ErrorNote error={invite.error} />
          <Field label="Email">
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Role" hint={ROLE_HELP[role]}>
            <Select value={role} onChange={(e) => setRole(e.target.value as Role)} className="w-full">
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r.charAt(0) + r.slice(1).toLowerCase()}
                </option>
              ))}
            </Select>
          </Field>
        </>
      )}
    </Modal>
  );
}
