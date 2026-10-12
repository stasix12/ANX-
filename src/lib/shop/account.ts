/** Sub-pages of /shop/account (plain module so server routes can import it). */
export const ACCOUNT_SECTIONS = ['orders', 'addresses', 'details', 'payments', 'notifications', 'settings'] as const;
export type AccountSection = (typeof ACCOUNT_SECTIONS)[number];
