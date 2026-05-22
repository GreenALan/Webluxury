'use client';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { InquiryDialog } from './InquiryDialog';

type Props = {
  productId?: string | null;
  productTitle?: string | null;
  variant?: 'primary' | 'outline';
  className?: string;
  /** 若传，按钮显示这段文本（覆盖默认 i18n key） */
  label?: string;
};

export function InquiryButton({
  productId,
  productTitle,
  variant = 'primary',
  className = '',
  label
}: Props) {
  const t = useTranslations('public.inquiry');
  const [open, setOpen] = useState(false);
  const fallback = productId ? t('openCTA') : t('openGeneral');
  const base =
    'inline-flex items-center px-6 py-2 text-xs tracking-widest uppercase';
  const variants =
    variant === 'primary'
      ? 'bg-ink text-bone hover:bg-accent'
      : 'border border-line hover:bg-bone-dark';
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${base} ${variants} ${className}`}
      >
        {label ?? fallback}
      </button>
      <InquiryDialog
        open={open}
        onClose={() => setOpen(false)}
        productId={productId}
        productTitle={productTitle}
      />
    </>
  );
}
