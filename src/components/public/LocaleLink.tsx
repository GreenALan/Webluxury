import Link from 'next/link';
import { useLocale } from 'next-intl';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

export function LocaleLink({ href, ...rest }: Props) {
  const locale = useLocale();
  const prefixed = href.startsWith('/') ? `/${locale}${href === '/' ? '' : href}` : href;
  return <Link href={prefixed} {...rest} />;
}
