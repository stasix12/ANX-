'use client';

import { useRouter } from 'next/navigation';
import { AdminShell } from '@/components/admin/AdminShell';
import { LogOutIcon } from '@/components/icons';
import { signOut, useAdminSession } from '@/lib/adminAuth';

export default function AdminSettingsPage() {
  const router = useRouter();
  const { session } = useAdminSession();

  return (
    <AdminShell title="הגדרות">
      <div className="rounded-card border border-ink-700 surface p-5">
        <p className="text-sm text-mist-500">מחובר כ־</p>
        <p className="mt-1 text-base font-bold" dir="ltr">
          {session?.user.email}
        </p>
      </div>

      <button
        type="button"
        onClick={async () => {
          await signOut();
          router.replace('/admin/login');
        }}
        className="mt-5 flex w-full items-center justify-center gap-2 rounded-full border border-ink-600 px-6 py-3.5 text-base font-bold text-mist-100 transition-colors hover:border-red-500 hover:text-red-600"
      >
        <LogOutIcon className="h-5 w-5" />
        התנתקות
      </button>
    </AdminShell>
  );
}
