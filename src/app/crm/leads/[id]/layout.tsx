/**
 * Lead pages are rendered on demand — IDs exist only in the database, so
 * there is nothing to pre-render. output: 'export' (npm run export) still
 * refuses a dynamic route with zero params, so give it one placeholder path;
 * the static store export keeps building, and the CRM itself runs on a real
 * server anyway (the README says as much), where dynamicParams serves every
 * real lead ID.
 */
export function generateStaticParams() {
  return [{ id: '_placeholder' }];
}

export default function LeadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
