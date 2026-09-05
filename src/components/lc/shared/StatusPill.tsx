'use client';

import { useLc } from '@/lib/lc/context';
import { conversationStatusKey, jobStatusKey, sourceKey } from '@/lib/lc/i18n';
import type { ConversationStatus, JobStatus, LeadSourceKey, PaymentStatus } from '@/lib/lc/types';
import { FacebookIcon, GlobeIcon, GoogleIcon, InstagramIcon, SparklesIcon, WhatsAppIcon } from '../icons';
import { Badge, type BadgeTone } from '../ui/primitives';

export const CONV_TONE: Record<ConversationStatus, BadgeTone> = { new: 'primary', ai: 'violet', waiting: 'warning', quote_sent: 'info', booked: 'success', lost: 'neutral', human: 'pink' };
export const JOB_TONE: Record<JobStatus, BadgeTone> = { booked: 'primary', confirmed: 'info', on_the_way: 'warning', in_progress: 'violet', completed: 'success', cancelled: 'neutral' };
export const PAY_TONE: Record<PaymentStatus, BadgeTone> = { unpaid: 'warning', deposit: 'info', paid: 'success', refunded: 'neutral' };

export function ConversationStatusPill({ status, size = 'sm' }: { status: ConversationStatus; size?: 'sm' | 'md' }) {
  const { t } = useLc();
  return (
    <Badge tone={CONV_TONE[status]} dot size={size}>
      {t(conversationStatusKey(status))}
    </Badge>
  );
}

export function JobStatusPill({ status, size = 'sm' }: { status: JobStatus; size?: 'sm' | 'md' }) {
  const { t } = useLc();
  return (
    <Badge tone={JOB_TONE[status]} dot size={size}>
      {t(jobStatusKey(status))}
    </Badge>
  );
}

export function SourceIcon({ source, className = 'h-4 w-4' }: { source: LeadSourceKey; className?: string }) {
  switch (source) {
    case 'google':
      return <GoogleIcon className={className} />;
    case 'facebook':
      return <FacebookIcon className={`${className} text-[#1877F2]`} />;
    case 'instagram':
      return <InstagramIcon className={`${className} text-[#E1306C]`} />;
    case 'whatsapp':
      return <WhatsAppIcon className={`${className} text-[#25D366]`} />;
    case 'website':
      return <GlobeIcon className={`${className} text-lc-violet`} />;
    default:
      return <SparklesIcon className={`${className} text-lc-faint`} />;
  }
}

export function SourceLabel({ source }: { source: LeadSourceKey }) {
  const { t } = useLc();
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-lc-muted">
      <SourceIcon source={source} className="h-3.5 w-3.5" />
      {t(sourceKey(source))}
    </span>
  );
}

export function LangFlag({ lang }: { lang: 'he' | 'ru' | 'en' }) {
  return <span className="text-[13px] leading-none" title={lang}>{{ he: '🇮🇱', ru: '🇷🇺', en: '🇬🇧' }[lang]}</span>;
}
