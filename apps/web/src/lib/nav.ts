import type { Permission } from '@app/shared';
import {
  Activity,
  Bot,
  CreditCard,
  FileDown,
  FileUp,
  FolderKanban,
  LayoutDashboard,
  Mail,
  Megaphone,
  PlugZap,
  Settings,
  Users,
  Contact,
  FileText,
  type LucideIcon,
} from 'lucide-react';

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Delivery phase for sections that are not built yet (rendered as "coming soon"). */
  phase?: number;
  permission?: Permission;
  description?: string;
}

export const NAV: Array<{ group: string; items: NavItem[] }> = [
  {
    group: 'Workspace',
    items: [
      { href: '/overview', label: 'Overview', icon: LayoutDashboard },
      { href: '/projects', label: 'Projects', icon: FolderKanban },
      { href: '/imports', label: 'Excel/CSV Imports', icon: FileUp },
      { href: '/exports', label: 'Exported Reports', icon: FileDown },
    ],
  },
  {
    group: 'AI agents',
    items: [
      {
        href: '/contacts',
        label: 'Seller Contacts',
        icon: Contact,
        phase: 3,
        description: 'Agent 2 finds official seller/brand websites for imported products, extracts public business contact details, verifies emails and phone numbers separately, and lets you edit and approve contacts.',
      },
      {
        href: '/outreach',
        label: 'Email Outreach',
        icon: Mail,
        phase: 4,
        description: 'Agent 3 drafts personalised B2B emails for approved contacts. Every email is reviewed and approved by you before sending, with suppression lists, unsubscribe handling and delivery tracking.',
      },
      {
        href: '/agents',
        label: 'AI Agent Settings',
        icon: Bot,
        phase: 3,
        description: 'Configure each agent: data providers, rate limits and default instructions.',
      },
    ],
  },
  {
    group: 'Outreach',
    items: [
      { href: '/templates', label: 'Email Templates', icon: FileText, phase: 4, description: 'Reusable templates per business objective, language and tone — written by you or generated with AI.' },
      { href: '/campaigns', label: 'Campaigns', icon: Megaphone, phase: 4, description: 'Bulk campaigns with sending limits, scheduling, follow-ups and campaign-level reporting.' },
    ],
  },
  {
    group: 'Administration',
    items: [
      { href: '/integrations', label: 'Integrations', icon: PlugZap, permission: 'integrations.read' },
      { href: '/team', label: 'Users & Team', icon: Users },
      { href: '/billing', label: 'Billing & Subscription', icon: CreditCard, phase: 5, description: 'Plans, usage limits and invoices.' },
      { href: '/activity', label: 'Activity Logs', icon: Activity, permission: 'activity.read' },
      { href: '/settings', label: 'System Settings', icon: Settings },
    ],
  },
];

export const ALL_NAV_ITEMS = NAV.flatMap((g) => g.items);
