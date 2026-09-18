import type { ChannelAdapter, PublishResult } from './types';

/**
 * Facebook Groups. Meta removed the Groups API (publish_to_groups and the
 * whole Groups API product) on 22 April 2024, so there is no official way
 * for an app to post into a group any more. This adapter therefore never
 * calls Meta: it hands the queue item back as "manual_pending" and the UI
 * shows the owner a ready-to-paste kit (text, images, the group link).
 *
 * Deliberately no browser automation, cookies or scraping — those violate
 * Meta's terms and get accounts blocked.
 */
export const manualGroupChannel: ChannelAdapter = {
  channel: 'facebook_group_manual',
  label: 'קבוצת פייסבוק (ידני)',
  apiPublishing: false,

  async publish(): Promise<PublishResult> {
    return {
      mode: 'manual',
      instructions:
        'Meta אינה מאפשרת פרסום אוטומטי לקבוצות דרך ה-API (בוטל באפריל 2024). הפוסט מוכן — העתיקו את הטקסט, הורידו את התמונות ופרסמו בקבוצה, ואז סמנו "פורסם".',
    };
  },
};
