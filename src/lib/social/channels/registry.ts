import 'server-only';
import type { Channel } from '../types';
import { manualGroupChannel } from './manualGroup';
import type { ChannelAdapter } from './types';

/**
 * All channel adapters, keyed by target.channel.
 *
 * Facebook Pages are gone. This product publishes to GROUPS, and groups have
 * had no Meta API since April 2024 — they go through the browser on the
 * owner's own machine. The Pages path was the other half of a two-channel
 * design that the business never used: zero Pages connected, zero published.
 * What is left here is the one channel the server still owns, the manual
 * hand-off for a group the browser could not finish on its own.
 */
const adapters: Partial<Record<Channel, ChannelAdapter>> = {
  facebook_group_manual: manualGroupChannel,
};

export function adapterFor(channel: Channel): ChannelAdapter {
  const adapter = adapters[channel];
  if (!adapter) throw new Error(`ערוץ ${channel} עדיין לא נתמך במערכת.`);
  return adapter;
}
