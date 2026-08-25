'use client';

import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { LeadForm } from '@/components/crm/LeadForm';
import { SpinnerIcon } from '@/components/icons';
import { getLead, updateLead, type Lead } from '@/lib/crm/leads';

export default function EditLeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [lead, setLead] = useState<Lead | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLead(id)
      .then(setLead)
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <CrmShell title="עריכת ליד">
      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : !lead ? (
        <p className="mt-8 text-center text-sm font-semibold text-mist-500">הליד לא נמצא.</p>
      ) : (
        <LeadForm
          initial={lead}
          excludeId={lead.id}
          submitLabel="שמירת שינויים"
          onSubmit={async (input) => {
            await updateLead(lead.id, input);
            router.replace(`/crm/leads/${lead.id}`);
          }}
        />
      )}
    </CrmShell>
  );
}
