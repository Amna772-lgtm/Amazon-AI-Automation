'use client';

import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { AuthForm } from '@/components/auth-form';
import { Button, ErrorNote, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

interface Preview {
  email: string;
  role: string;
  workspaceName: string;
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { status, user, reload, switchWorkspace } = useAuth();
  const router = useRouter();
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  const preview = useQuery({
    queryKey: ['invite', token],
    queryFn: () => api<Preview>(`/invitations/${token}`, { noWorkspace: true }),
    retry: false,
  });

  if (preview.isLoading || status === 'loading') return <Spinner />;
  if (preview.error) return <ErrorNote error={preview.error} />;
  const inv = preview.data!;

  async function accept() {
    setBusy(true);
    try {
      const m = await api<{ workspaceId: string }>('/invitations/accept', { method: 'POST', body: { token }, noWorkspace: true });
      await reload();
      switchWorkspace(m.workspaceId);
      router.replace('/overview');
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">
        You have been invited to join <strong>{inv.workspaceName}</strong> as <strong>{inv.role.toLowerCase()}</strong>.
      </p>
      {status === 'authenticated' ? (
        user?.email === inv.email ? (
          <>
            <ErrorNote error={error} />
            <Button className="w-full" loading={busy} onClick={accept}>
              Accept invitation
            </Button>
          </>
        ) : (
          <ErrorNote error={`This invitation is for ${inv.email}, but you are signed in as ${user?.email}. Sign out and try again.`} />
        )
      ) : (
        <AuthForm mode="register" inviteToken={token} presetEmail={inv.email} />
      )}
    </div>
  );
}
