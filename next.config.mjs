import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    // Disable the built-in optimizer:
    //  * Local /uploads/* are served directly by Nginx (location /uploads/ alias),
    //    so going through /_next/image fails when next start can't see files
    //    added to public/ after build.
    //  * External demo images (loremflickr, picsum, COS) work fine without
    //    optimization for current scale; can be re-enabled when traffic grows.
    unoptimized: true,
    remotePatterns: [
      { protocol: 'https', hostname: '*.myqcloud.com' },
      { protocol: 'https', hostname: '*.cos.ap-shanghai.myqcloud.com' },
      { protocol: 'https', hostname: 'picsum.photos' },
      { protocol: 'https', hostname: 'fastly.picsum.photos' },
      { protocol: 'https', hostname: 'loremflickr.com' }
    ]
  }
};

export default withNextIntl(nextConfig);
