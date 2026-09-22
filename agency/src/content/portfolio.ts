/**
 * Portfolio — real projects only.
 *
 * ┌─────────────────────────────────────────────────────────────────────┐
 * │ PLACEHOLDER: `projects` is empty until real work is added. While it │
 * │ is empty and `showPlaceholders` is true, the section renders three  │
 * │ clearly-labelled sample cards ("פרויקט לדוגמה") so the layout can be│
 * │ reviewed. Set `showPlaceholders: false` before launch, or add real  │
 * │ projects — never invent clients.                                    │
 * └─────────────────────────────────────────────────────────────────────┘
 */
export type Project = {
  /** Business name as it appears on the live site. */
  name: string;
  /** Field / industry, e.g. "קליניקת שיניים". */
  field: string;
  /** Live URL (opens in a new tab). */
  url: string;
  /** Screenshots in /public/portfolio — desktop (4:3) and mobile (9:16). */
  desktopImage: string;
  mobileImage: string;
  /** Alt text describing the screenshot. */
  alt: string;
};

export const projects: Project[] = [
  // TODO: add real projects, e.g.
  // {
  //   name: 'שם העסק',
  //   field: 'תחום',
  //   url: 'https://example.co.il',
  //   desktopImage: '/portfolio/example-desktop.webp',
  //   mobileImage: '/portfolio/example-mobile.webp',
  //   alt: 'צילום מסך של עמוד הבית באתר שם העסק',
  // },
];

/**
 * Placeholder cards are shown on dev/preview builds only. To show them in
 * production anyway (not recommended) set this to `true`.
 */
export const showPlaceholders = process.env.NODE_ENV !== 'production';

/** Whether the portfolio section (and its nav link) renders at all. */
export const hasPortfolio = projects.length > 0 || showPlaceholders;

export const placeholderCount = 3;
