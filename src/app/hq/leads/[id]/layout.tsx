/**
 * IDs exist only in the platform's data store, so there is nothing to
 * pre-render. output: 'export' (the GitHub Pages build) still refuses a
 * dynamic route with zero params — without this the whole store deploy
 * fails — so give it one placeholder path, same as the CRM lead pages. The
 * platform itself runs on a real server, where dynamicParams serves every
 * real ID.
 */
export function generateStaticParams() {
  return [{ id: '_placeholder' }];
}

export default function HqLeadLayout({ children }: { children: React.ReactNode }) {
  return children;
}
