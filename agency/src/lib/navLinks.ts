import { nav } from '@/content/copy';
import { hasPortfolio } from '@/content/portfolio';

/** Nav entries whose target section actually renders in this build. */
export const navLinks = nav.links.filter((link) => link.href !== '#portfolio' || hasPortfolio);
