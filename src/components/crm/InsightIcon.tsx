import {
  AlertTriangleIcon,
  CalendarIcon,
  CheckCircleIcon,
  FlameIcon,
  InboxIcon,
  LightbulbIcon,
  ScaleIcon,
  TagIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  TrophyIcon,
} from '@/components/icons';

/**
 * Maps the emoji an insight line was written with to the professional icon
 * set, tinted by what the emoji meant — so the analysis lists join the
 * icon language without rewriting every insight producer.
 */
const MAP: Record<string, [React.ComponentType<{ className?: string }>, string]> = {
  '✅': [CheckCircleIcon, 'text-emerald-600'],
  '📉': [TrendingDownIcon, 'text-emerald-600'],
  '🚀': [TrendingUpIcon, 'text-emerald-600'],
  '📈': [TrendingUpIcon, 'text-amber-600'],
  '⚖️': [ScaleIcon, 'text-mist-500'],
  '⚠️': [AlertTriangleIcon, 'text-amber-600'],
  '🚨': [AlertTriangleIcon, 'text-red-600'],
  '🔥': [FlameIcon, 'text-red-600'],
  '📅': [CalendarIcon, 'text-brand-400'],
  '🏆': [TrophyIcon, 'text-amber-600'],
  '🎯': [TargetIcon, 'text-brand-400'],
  '🧭': [TargetIcon, 'text-amber-600'],
  '🏷️': [TagIcon, 'text-brand-400'],
  '📥': [InboxIcon, 'text-brand-400'],
  '💡': [LightbulbIcon, 'text-amber-600'],
};

export function InsightIcon({ emoji, className = 'h-4.5 w-4.5' }: { emoji: string; className?: string }) {
  const entry = MAP[emoji];
  if (!entry) {
    return (
      <span aria-hidden className="shrink-0">
        {emoji}
      </span>
    );
  }
  const [Icon, tint] = entry;
  return <Icon className={`${className} ${tint} shrink-0`} aria-hidden />;
}
