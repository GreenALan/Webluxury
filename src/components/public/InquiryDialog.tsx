'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { useLocale, useTranslations } from 'next-intl';

type Props = {
  open: boolean;
  onClose: () => void;
  productId?: string | null;
  productTitle?: string | null;
};

type SubmitState =
  | { phase: 'idle' }
  | { phase: 'submitting' }
  | { phase: 'error'; code: 'INVALID_INPUT' | 'RATE_LIMITED' | 'OTHER' }
  | { phase: 'success' };

export function InquiryDialog({ open, onClose, productId, productTitle }: Props) {
  const t = useTranslations('public.inquiry');
  const locale = useLocale() as 'zh' | 'en';
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState('');
  const [state, setState] = useState<SubmitState>({ phase: 'idle' });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) return;
    // reset when fully closed (after user dismisses success)
    setName('');
    setContact('');
    setMessage('');
    setState({ phase: 'idle' });
  }, [open]);

  if (!open) return null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setState({ phase: 'submitting' });
    try {
      const res = await fetch('/api/inquiries', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          contact: contact.trim(),
          message: message.trim(),
          locale,
          productId: productId ?? undefined
        })
      });
      if (res.ok) {
        setState({ phase: 'success' });
        return;
      }
      const json = (await res.json().catch(() => ({}))) as { code?: string };
      const code = json.code === 'INVALID_INPUT'
        ? 'INVALID_INPUT'
        : json.code === 'RATE_LIMITED'
          ? 'RATE_LIMITED'
          : 'OTHER';
      setState({ phase: 'error', code });
    } catch {
      setState({ phase: 'error', code: 'OTHER' });
    }
  }

  const isSubmitting = state.phase === 'submitting';
  const title = productId ? t('title') : t('titleGeneral');

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <button
        type="button"
        aria-label="close"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative w-full md:w-[28rem] bg-bone p-6 md:rounded-sm shadow-xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-serif text-xl">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('cancel')}
            className="text-xl leading-none text-ink-soft hover:text-ink"
          >
            ×
          </button>
        </div>

        {state.phase === 'success' ? (
          <div className="space-y-3">
            <p className="font-serif text-lg">{t('successTitle')}</p>
            <p className="text-sm text-ink-soft">{t('successBody')}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 w-full bg-ink text-bone py-2 text-xs tracking-widest uppercase"
            >
              {t('cancel')}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            {productTitle && (
              <div className="text-xs text-ink-soft">
                <span className="uppercase tracking-widest">{t('productLabel')}: </span>
                <span className="text-ink">{productTitle}</span>
              </div>
            )}

            <label className="block">
              <span className="text-xs uppercase tracking-widest text-ink-soft">{t('name')}</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                required
                placeholder={t('namePlaceholder')}
                className="mt-1 w-full border border-line px-3 py-2 text-sm bg-white"
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-widest text-ink-soft">{t('contact')}</span>
              <input
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                maxLength={80}
                required
                placeholder={t('contactPlaceholder')}
                className="mt-1 w-full border border-line px-3 py-2 text-sm bg-white"
              />
            </label>

            <label className="block">
              <span className="text-xs uppercase tracking-widest text-ink-soft">{t('message')}</span>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                maxLength={1000}
                required
                rows={4}
                placeholder={t('messagePlaceholder')}
                className="mt-1 w-full border border-line px-3 py-2 text-sm bg-white resize-none"
              />
            </label>

            {state.phase === 'error' && (
              <p className="text-xs text-red-600">
                {state.code === 'INVALID_INPUT'
                  ? t('errorInvalid')
                  : state.code === 'RATE_LIMITED'
                    ? t('errorRateLimited')
                    : t('errorGeneric')}
              </p>
            )}

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 bg-ink text-bone py-2 text-xs tracking-widest uppercase disabled:opacity-50"
              >
                {isSubmitting ? t('submitting') : t('submit')}
              </button>
              <button
                type="button"
                onClick={onClose}
                className="px-4 border border-line text-xs tracking-widest uppercase"
              >
                {t('cancel')}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
