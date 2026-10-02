import 'server-only';
import type { Channel } from '../types';
import { facebookPageChannel } from './facebookPage';
import { manualGroupChannel } from './manualGroup';
import type { ChannelAdapter } from './types';

/**
 * All channel adapters, keyed by target.channel. Instagram will slot in here
 * once the Instagram Graph API (content publishing) adapter exists.
 */
const adapters: Partial<Record<Channel, ChannelAdapter>> = {
  facebook_page: facebookPageChannel,
  facebook_group_manual: manualGroupChannel,
};

export function adapterFor(channel: Channel): ChannelAdapter {
  const adapter = adapters[channel];
  if (!adapter) throw new Error(`ערוץ ${channel} עדיין לא נתמך במערכת.`);
  return adapter;
}
