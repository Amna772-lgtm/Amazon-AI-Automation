'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Button, ErrorNote, Field, Input } from './ui';

interface Props {
  mode: 'login' | 'register';
  inviteToken?: string;
  presetEmail?: string;
}

export function AuthForm({ mode, inviteToken, presetEmail }: Props) {
  const { setSession, status } = useAuth();
  const router = useRouter();
  const [values, setValues] = useState({ name: '', email: presetEmail ?? '', password: '', organizationName: '' });
  const [error, setError] = useState<unknown>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (status === 'authenticated' && !inviteToken) router.replace('/overview');
  }, [status, inviteToken, router]);

  const set = (k: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => setValues((v) => ({ ...v, [k]: e.target.value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setFieldErrors({});
    try {
      const body =
        mode === 'login'
          ? { email: values.email, password: values.password }
          : {
              name: values.name,
              email: values.email,
              password: values.password,
              ...(inviteToken ? { inviteToken } : values.organizationName ? { organizationName: values.organizationName } : {}),
            };
      const res = await api<{ accessToken: string }>(`/auth/${mode}`, { method: 'POST', body, noWorkspace: true });
      await setSession(res.accessToken);
      router.replace('/overview');
    } catch (err) {
      if (err instanceof ApiError && err.issues) {
        setFieldErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
      } else setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <h1 className="text-lg font-semibold">{mode === 'login' ? 'Sign in' : inviteToken ? 'Create your account to join' : 'Create your account'}</h1>
      <ErrorNote error={error} />
      {mode === 'register' && (
        <Field label="Full name" error={fieldErrors.name}>
          <Input value={values.name} onChange={set('name')} autoComplete="name" required />
        </Field>
      )}
      <Field label="Work email" error={fieldErrors.email}>
        <Input type="email" value={values.email} onChange={set('email')} autoComplete="email" required readOnly={!!presetEmail} />
      </Field>
      <Field label="Password" error={fieldErrors.password} hint={mode === 'register' ? 'At least 10 characters, with a letter and a number.' : undefined}>
        <Input type="password" value={values.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required />
      </Field>
      {mode === 'register' && !inviteToken && (
        <Field label="Company name" hint="Optional — creates your organization and first workspace." error={fieldErrors.organizationName}>
          <Input value={values.organizationName} onChange={set('organizationName')} autoComplete="organization" />
        </Field>
      )}
      <Button type="submit" loading={busy} className="w-full">
        {mode === 'login' ? 'Sign in' : 'Create account'}
      </Button>
      {!inviteToken && (
        <p className="text-center text-sm text-slate-500">
          {mode === 'login' ? (
            <>
              New here?{' '}
              <Link className="font-medium text-brand-600 hover:underline" href="/register">
                Create an account
              </Link>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <Link className="font-medium text-brand-600 hover:underline" href="/login">
                Sign in
              </Link>
            </>
          )}
        </p>
      )}
    </form>
  );
}
