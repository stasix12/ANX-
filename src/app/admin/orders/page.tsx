'use client';

import { AdminShell } from '@/components/admin/AdminShell';
import { ClipboardListIcon } from '@/components/icons';

export default function AdminOrdersPage() {
  return (
    <AdminShell title="הזמנות">
      <div className="flex flex-col items-center gap-3 rounded-card border border-ink-700 surface p-8 text-center">
        <ClipboardListIcon className="h-9 w-9 text-mist-500" />
        <p className="text-sm font-bold">מסך ניהול ההזמנות בבנייה</p>
        <p className="text-sm text-mist-500">
          כרגע הזמנות מתקבלות ישירות בוואטסאפ. ניהול הזמנות בתוך הפאנל יתווסף בהמשך.
        </p>
      </div>
    </AdminShell>
  );
}
