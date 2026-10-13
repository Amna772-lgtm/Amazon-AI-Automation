'use client';

import { notFound } from 'next/navigation';
import { use } from 'react';
import { Badge, Card, PageHeader } from '@/components/ui';
import { ALL_NAV_ITEMS } from '@/lib/nav';

/** Placeholder for dashboard sections delivered in later phases (see docs/IMPLEMENTATION_PLAN.md). */
export default function UpcomingSection({ params }: { params: Promise<{ section: string }> }) {
  const { section } = use(params);
  const item = ALL_NAV_ITEMS.find((i) => i.href === `/${section}` && i.phase);
  if (!item) notFound();
  const Icon = item.icon;

  return (
    <>
      <PageHeader title={item.label} />
      <Card className="flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 rounded-full bg-brand-50 p-4 text-brand-600">
          <Icon className="size-7" />
        </div>
        <Badge tone="blue">Coming in phase {item.phase}</Badge>
        <p className="mt-4 max-w-xl text-sm text-slate-600">{item.description}</p>
      </Card>
    </>
  );
}
