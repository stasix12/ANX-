import type { Channel, CtaType, MediaItem, SocialTarget } from '../types';

/**
 * A Channel adapter knows how to publish one rendered post to one kind of
 * target. Adding Instagram (or TikTok, Google Business…) means implementing
 * this interface and registering it in ./registry.ts — nothing in the queue,
 * scheduler or UI changes.
 */

export interface PublishInput {
  target: SocialTarget;
  text: string;
  link: string;
  cta: CtaType;
  media: MediaItem[];
  /** Ready-made wa.me URL, if the post has one (for a WhatsApp CTA). */
  whatsappUrl: string;
  phone: string;
}

export type PublishResult =
  | { mode: 'api'; externalPostId: string; permalink: string | null; notes?: string }
  /** The channel cannot publish via API — the item waits for the owner. */
  | { mode: 'manual'; instructions: string };

export interface ChannelAdapter {
  readonly channel: Channel;
  readonly label: string;
  /** True when Meta's official API supports publishing to this channel. */
  readonly apiPublishing: boolean;
  publish(input: PublishInput): Promise<PublishResult>;
}
