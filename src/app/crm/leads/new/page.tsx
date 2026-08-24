'use client';

import { useRouter } from 'next/navigation';
import { CrmShell } from '@/components/crm/CrmShell';
import { LeadForm } from '@/components/crm/LeadForm';
import { createLead } from '@/lib/crm/leads';

export default function NewLeadPage() {
  const router = useRouter();

  return (
    <CrmShell title="ליד חדש">
      <LeadForm
        submitLabel="שמירת הליד"
        onSubmit={async (input) => {
          const lead = await createLead(input);
          router.replace(`/crm/leads/${lead.id}`);
        }}
      />
    </CrmShell>
  );
}
