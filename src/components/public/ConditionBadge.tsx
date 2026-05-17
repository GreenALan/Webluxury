import { useTranslations } from 'next-intl';
import type { Condition } from '@prisma/client';

type Props = { condition: Condition; className?: string };

const TONE: Record<Condition, string> = {
  NEW: 'bg-bone-dark text-ink',
  LIKE_NEW: 'bg-bone-dark text-ink',
  EXCELLENT: 'border border-accent text-accent',
  GOOD: 'border border-line text-ink-soft',
  FAIR: 'border border-line text-ink-soft'
};

export function ConditionBadge({ condition, className = '' }: Props) {
  const t = useTranslations('public.condition');
  return (
    <span
      className={`inline-block text-[10px] tracking-widest uppercase px-2 py-0.5 ${TONE[condition]} ${className}`}
    >
      {t(condition)}
    </span>
  );
}
