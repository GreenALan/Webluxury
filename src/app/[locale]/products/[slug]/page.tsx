import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getPublicProductBySlug } from '@/lib/products';
import { ImageGallery } from '@/components/public/ImageGallery';
import { PriceTag } from '@/components/public/PriceTag';
import { ConditionBadge } from '@/components/public/ConditionBadge';
import { FavoriteButton } from '@/components/public/FavoriteButton';
import { InquiryButton } from '@/components/public/InquiryButton';
import { LocaleLink } from '@/components/public/LocaleLink';
import { pickLocalized } from '@/lib/format';
import type { Locale } from '@/i18n/config';

export default async function ProductDetailPage({
  params
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const p = await getPublicProductBySlug(slug);
  if (!p) notFound();
  const t = await getTranslations('public.detail');

  const title = pickLocalized(p.titleZh, p.titleEn, locale);
  const desc = pickLocalized(p.descZh ?? '', p.descEn, locale);
  const categoryName = pickLocalized(p.category.nameZh, p.category.nameEn, locale);

  const photos = p.images.filter((i) => i.kind === 'PHOTO');
  const certs = p.images.filter((i) => i.kind === 'CERT');
  const sizeInfo = p.sizeInfo as Record<string, string> | null;

  return (
    <article className="container mx-auto px-4 py-6 md:py-12">
      <LocaleLink href="/products" className="text-xs tracking-widest uppercase text-ink-soft">
        ← {t('backToList')}
      </LocaleLink>

      <div className="grid md:grid-cols-2 gap-8 md:gap-12 mt-4">
        <ImageGallery
          images={photos.map((i) => ({ id: i.id, url: i.url }))}
          alt={title}
        />

        <div className="space-y-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-ink-soft">{p.brand}</div>
            <h1 className="font-serif text-3xl md:text-4xl mt-1">{title}</h1>
            <div className="text-xs text-ink-soft mt-1">
              <LocaleLink
                href={`/products?category=${encodeURIComponent(p.category.slug)}`}
                className="hover:text-ink"
              >
                {categoryName}
              </LocaleLink>
            </div>
          </div>

          <PriceTag price={p.price.toString()} originalPrice={p.originalPrice?.toString() ?? null} size="lg" />

          <dl className="grid grid-cols-2 gap-y-3 text-sm border-t border-line pt-4">
            <dt className="text-ink-soft">{t('condition')}</dt>
            <dd>
              <ConditionBadge condition={p.condition} />
            </dd>
            {p.serialNumber && (
              <>
                <dt className="text-ink-soft">{t('serial')}</dt>
                <dd className="font-mono text-xs">{p.serialNumber}</dd>
              </>
            )}
            {sizeInfo && Object.keys(sizeInfo).length > 0 && (
              <>
                <dt className="text-ink-soft">{t('size')}</dt>
                <dd>
                  <ul className="text-xs space-y-0.5">
                    {Object.entries(sizeInfo).map(([k, v]) => (
                      <li key={k}>
                        <span className="text-ink-soft">{k}:</span> {String(v)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>

          <div className="flex flex-wrap gap-3">
            <InquiryButton
              productId={p.id}
              productTitle={title}
              label={t('inquireCTA')}
            />
            <FavoriteButton productId={p.id} />
          </div>

          <section>
            <h2 className="text-xs uppercase tracking-widest text-ink-soft mb-2">
              {t('descTitle')}
            </h2>
            {desc ? (
              <p className="text-sm leading-relaxed whitespace-pre-line">{desc}</p>
            ) : (
              <p className="text-sm text-ink-soft">{t('noDesc')}</p>
            )}
          </section>

          {certs.length > 0 && (
            <details className="border border-line">
              <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-widest hover:bg-bone-dark">
                {t('certs')} ({certs.length})
              </summary>
              <div className="grid grid-cols-3 gap-2 p-3 border-t border-line">
                {certs.map((c) => (
                  <a
                    key={c.id}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border border-line aspect-square"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={c.url}
                      alt="cert"
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}
