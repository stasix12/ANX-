/**
 * Article review pages are rendered on demand — the IDs exist only in the
 * database, so there is nothing to pre-render. output: 'export'
 * (npm run export) still refuses a dynamic route with zero params, so give it
 * one placeholder path; the static export keeps building, and the SEO
 * dashboard runs on a real server anyway, where dynamicParams serves every
 * real article ID.
 *
 * Same pattern as src/app/crm/leads/[id]/layout.tsx — kept identical so the two
 * read as one convention rather than two workarounds.
 */
export function generateStaticParams() {
  return [{ id: '_placeholder' }];
}

export default function SeoArticleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
