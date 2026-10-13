'use client';

import { useRouter } from 'next/navigation';
import { useEffect, type ReactNode } from 'react';
import { AppShell } from '@/components/app-shell';
import { Spinner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

export default function AppLayout({ children }: { children: ReactNode }) {
  const { status, workspace } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === 'anonymous') router.replace('/login');
  }, [status, router]);

  if (status !== 'authenticated') return <Spinner label="Loading your workspace…" />;
  if (!workspace) {
    return <div className="p-10 text-center text-sm text-slate-500">You are not a member of any workspace yet. Ask an admin for an invitation.</div>;
  }
  // Re-mount pages on workspace switch so no state leaks between tenants.
  return <AppShell key={workspace.id}>{children}</AppShell>;
}
