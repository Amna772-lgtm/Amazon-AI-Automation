'use client';

import clsx from 'clsx';
import { Boxes, ChevronDown, LogOut, Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { NAV } from '@/lib/nav';
import { APP_NAME, Badge } from './ui';

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <div className="flex min-h-screen">
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-30 w-64 transform border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <Sidebar onNavigate={() => setMobileOpen(false)} />
      </aside>
      {mobileOpen && <div className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setMobileOpen(false)} />}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur lg:px-8">
          <button className="rounded p-1.5 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open menu">
            <Menu className="size-5" />
          </button>
          <div className="flex-1" />
          <UserMenu />
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

function Sidebar({ onNavigate }: { onNavigate(): void }) {
  const pathname = usePathname();
  const { can } = useAuth();
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-5">
        <div className="rounded-md bg-brand-600 p-1.5 text-white">
          <Boxes className="size-4" />
        </div>
        <span className="truncate text-sm font-semibold">{APP_NAME}</span>
      </div>
      <div className="border-b border-slate-100 p-3">
        <WorkspaceSwitcher />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto p-3" aria-label="Main">
        {NAV.map((group) => (
          <div key={group.group}>
            <div className="mb-1 px-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase">{group.group}</div>
            <ul className="space-y-0.5">
              {group.items
                .filter((i) => !i.permission || can(i.permission))
                .map((item) => {
                  const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        className={clsx(
                          'flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm',
                          active ? 'bg-brand-50 font-medium text-brand-700' : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                        )}
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="flex-1 truncate">{item.label}</span>
                        {item.phase && <span className="text-[10px] text-slate-400">Soon</span>}
                      </Link>
                    </li>
                  );
                })}
            </ul>
          </div>
        ))}
      </nav>
    </div>
  );
}

function WorkspaceSwitcher() {
  const { workspaces, workspace, switchWorkspace } = useAuth();
  return (
    <label className="block">
      <span className="sr-only">Workspace</span>
      <div className="relative">
        <select
          value={workspace?.id ?? ''}
          onChange={(e) => switchWorkspace(e.target.value)}
          className="h-9 w-full appearance-none rounded-md border border-slate-200 bg-slate-50 pr-8 pl-3 text-sm font-medium focus:border-brand-500 focus:outline-none"
        >
          {workspaces.map((w) => (
            <option key={w.id} value={w.id}>
              {w.name}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-2.5 right-2.5 size-4 text-slate-400" />
      </div>
      {workspace && (
        <div className="mt-1.5 px-1">
          <Badge tone="blue">{workspace.role}</Badge>
        </div>
      )}
    </label>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const initials = user.name
    .split(' ')
    .map((p) => p[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center gap-2 rounded-md px-2 py-1 hover:bg-slate-100" aria-haspopup="menu">
        <span className="flex size-7 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">{initials}</span>
        <span className="hidden text-sm font-medium sm:block">{user.name}</span>
        <ChevronDown className="size-4 text-slate-400" />
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg" role="menu">
          <div className="border-b border-slate-100 px-3 py-2">
            <div className="truncate text-sm font-medium">{user.name}</div>
            <div className="truncate text-xs text-slate-500">{user.email}</div>
          </div>
          <button onClick={() => void logout()} className="flex w-full items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50" role="menuitem">
            <LogOut className="size-4" /> Sign out
          </button>
        </div>
      )}
      {open && <button className="fixed inset-0 z-[-1] cursor-default" aria-hidden tabIndex={-1} onClick={() => setOpen(false)} />}
    </div>
  );
}
