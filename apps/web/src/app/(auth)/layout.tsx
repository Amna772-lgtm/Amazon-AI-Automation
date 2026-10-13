import { Boxes } from 'lucide-react';
import type { ReactNode } from 'react';
import { APP_NAME } from '@/components/ui';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-8 flex items-center gap-2">
        <div className="rounded-md bg-brand-600 p-2 text-white">
          <Boxes className="size-5" />
        </div>
        <span className="text-lg font-semibold">{APP_NAME}</span>
      </div>
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      <p className="mt-6 max-w-sm text-center text-xs text-slate-500">
        Seller contact discovery and outreach — with every AI result reviewed by you.
      </p>
    </div>
  );
}
