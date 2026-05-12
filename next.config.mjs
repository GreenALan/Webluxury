import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.myqcloud.com' },
      { protocol: 'https', hostname: '*.cos.ap-shanghai.myqcloud.com' }
    ]
  }
};

export default withNextIntl(nextConfig);
