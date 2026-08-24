'use client';

import { AdminShell } from '@/components/admin/AdminShell';
import { UsersIcon } from '@/components/icons';

export default function AdminCustomersPage() {
  return (
    <AdminShell title="לקוחות">
      <div className="flex flex-col items-center gap-3 rounded-card border border-ink-700 surface p-8 text-center">
        <UsersIcon className="h-9 w-9 text-mist-500" />
        <p className="text-sm font-bold">מסך ניהול לקוחות בבנייה</p>
        <p className="text-sm text-mist-500">יתווסף בהמשך, יחד עם ניהול ההזמנות.</p>
      </div>
    </AdminShell>
  );
}
