import { PrismaClient, Role, type Condition, type AdminUser } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();

type DemoCat = { slug: string; nameZh: string; nameEn: string; sortOrder: number };
type DemoProduct = {
  slug: string;
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  brand: string;
  categorySlug: string;
  price: string;
  originalPrice?: string;
  condition: Condition;
  serialNumber?: string;
  sizeInfo?: Record<string, string>;
  imageSeeds: string[];
};

const DEMO_CATEGORIES: DemoCat[] = [
  { slug: 'watch', nameZh: '腕表', nameEn: 'Watches', sortOrder: 1 },
  { slug: 'bag', nameZh: '包包', nameEn: 'Handbags', sortOrder: 2 },
  { slug: 'jewelry', nameZh: '珠宝', nameEn: 'Jewelry', sortOrder: 3 },
  { slug: 'accessory', nameZh: '配饰', nameEn: 'Accessories', sortOrder: 4 }
];

const DEMO_PRODUCTS: DemoProduct[] = [
  {
    slug: 'rolex-submariner-126610ln',
    titleZh: '劳力士 潜航者型 126610LN 黑水鬼',
    titleEn: 'Rolex Submariner 126610LN',
    descZh: '2022 年款，全套带证书与包装，仅佩戴数次，无明显划痕，走时精准。',
    descEn: '2022 model, full set with papers and box. Worn only a handful of times.',
    brand: 'Rolex',
    categorySlug: 'watch',
    price: '88000.00',
    originalPrice: '98000.00',
    condition: 'EXCELLENT',
    serialNumber: 'L9X12345',
    sizeInfo: { diameter: '41mm', material: '904L 钢' },
    imageSeeds: ['rolex-sub-1', 'rolex-sub-2', 'rolex-sub-3']
  },
  {
    slug: 'rolex-daytona-116500ln-white',
    titleZh: '劳力士 迪通拿 116500LN 熊猫盘',
    titleEn: 'Rolex Daytona 116500LN Panda',
    descZh: '白盘陶瓷圈，2023 年香港行货，原盒原卡保养卡齐全。',
    descEn: 'White dial, ceramic bezel, 2023 HK card, complete set.',
    brand: 'Rolex',
    categorySlug: 'watch',
    price: '168000.00',
    condition: 'LIKE_NEW',
    serialNumber: 'M2K88210',
    sizeInfo: { diameter: '40mm' },
    imageSeeds: ['rolex-day-1', 'rolex-day-2']
  },
  {
    slug: 'patek-philippe-nautilus-5711',
    titleZh: '百达翡丽 鹦鹉螺 5711/1A-010',
    titleEn: 'Patek Philippe Nautilus 5711/1A-010',
    descZh: '蓝盘经典款，停产款式，附原厂购买凭证。',
    descEn: 'Discontinued blue-dial reference, with original purchase receipt.',
    brand: 'Patek Philippe',
    categorySlug: 'watch',
    price: '320000.00',
    condition: 'EXCELLENT',
    sizeInfo: { diameter: '40mm' },
    imageSeeds: ['pp-naut-1', 'pp-naut-2']
  },
  {
    slug: 'audemars-piguet-royal-oak-15500',
    titleZh: '爱彼 皇家橡树 15500ST 蓝盘',
    titleEn: 'Audemars Piguet Royal Oak 15500ST',
    descZh: '2021 年款，蓝色 Tapisserie 表盘，磨损轻微，已专业抛光。',
    descEn: '2021 piece, blue Tapisserie dial, professionally polished.',
    brand: 'Audemars Piguet',
    categorySlug: 'watch',
    price: '210000.00',
    condition: 'GOOD',
    sizeInfo: { diameter: '41mm' },
    imageSeeds: ['ap-ro-1', 'ap-ro-2']
  },
  {
    slug: 'hermes-birkin-25-togo-etoupe',
    titleZh: '爱马仕 Birkin 25 Togo 大象灰',
    titleEn: 'Hermès Birkin 25 Togo Etoupe',
    descZh: '银扣，B 刻（2023 年生产），全新未使用，附防尘袋雨衣。',
    descEn: 'Palladium hardware, B-stamp, brand new with dust bag and rain cover.',
    brand: 'Hermès',
    categorySlug: 'bag',
    price: '180000.00',
    originalPrice: '195000.00',
    condition: 'LIKE_NEW',
    sizeInfo: { length: '25cm', width: '13cm', height: '20cm' },
    imageSeeds: ['birkin-25-1', 'birkin-25-2', 'birkin-25-3']
  },
  {
    slug: 'hermes-kelly-28-epsom-gold',
    titleZh: '爱马仕 Kelly 28 Epsom 金色',
    titleEn: 'Hermès Kelly 28 Epsom Gold',
    descZh: '内缝款，金色五金，C 刻（2018 年），状态极佳。',
    descEn: 'Sellier, gold hardware, C-stamp (2018), excellent condition.',
    brand: 'Hermès',
    categorySlug: 'bag',
    price: '150000.00',
    condition: 'EXCELLENT',
    sizeInfo: { length: '28cm', width: '10cm', height: '22cm' },
    imageSeeds: ['kelly-28-1', 'kelly-28-2']
  },
  {
    slug: 'lv-monogram-speedy-30',
    titleZh: 'Louis Vuitton 老花 Speedy 30',
    titleEn: 'Louis Vuitton Monogram Speedy 30',
    descZh: '经典款，正常使用痕迹，无明显损伤，附原盒。',
    descEn: 'Classic Speedy 30, light wear, original box included.',
    brand: 'Louis Vuitton',
    categorySlug: 'bag',
    price: '9800.00',
    originalPrice: '14000.00',
    condition: 'GOOD',
    imageSeeds: ['lv-speedy-1']
  },
  {
    slug: 'chanel-classic-flap-medium-caviar',
    titleZh: 'Chanel 经典口盖包 中号 鱼子酱',
    titleEn: 'Chanel Classic Flap Medium Caviar',
    descZh: '黑色鱼子酱牛皮，金扣，26 系列（2018 年），五金及链条状态优秀。',
    descEn: 'Black caviar, gold hardware, series 26 (2018), excellent hardware.',
    brand: 'Chanel',
    categorySlug: 'bag',
    price: '58000.00',
    condition: 'EXCELLENT',
    sizeInfo: { length: '25.5cm', width: '6.5cm', height: '15.5cm' },
    imageSeeds: ['chanel-cf-1', 'chanel-cf-2']
  },
  {
    slug: 'dior-lady-d-joy-mini',
    titleZh: 'Dior Lady D-Joy 迷你',
    titleEn: 'Dior Lady D-Joy Mini',
    descZh: '黑色羊皮藤格纹，银扣，近全新状态。',
    descEn: 'Black lambskin cannage, silver hardware, like-new.',
    brand: 'Dior',
    categorySlug: 'bag',
    price: '42000.00',
    condition: 'LIKE_NEW',
    imageSeeds: ['dior-ldj-1']
  },
  {
    slug: 'cartier-love-bracelet-yellow-gold',
    titleZh: 'Cartier Love 手镯 18K 黄金',
    titleEn: 'Cartier Love Bracelet 18K Yellow Gold',
    descZh: '17 号尺寸，附原盒证书及螺丝刀。',
    descEn: 'Size 17, with original box, certificate, and screwdriver.',
    brand: 'Cartier',
    categorySlug: 'jewelry',
    price: '48000.00',
    condition: 'EXCELLENT',
    sizeInfo: { size: '17' },
    imageSeeds: ['cartier-love-1', 'cartier-love-2']
  },
  {
    slug: 'vca-alhambra-vintage-necklace',
    titleZh: 'Van Cleef & Arpels Vintage Alhambra 10 motif 项链',
    titleEn: 'VCA Vintage Alhambra 10-motif Necklace',
    descZh: '玫瑰金 + 珍珠母贝，附鉴定卡。',
    descEn: 'Rose gold with mother-of-pearl, with authentication card.',
    brand: 'Van Cleef & Arpels',
    categorySlug: 'jewelry',
    price: '136000.00',
    condition: 'LIKE_NEW',
    imageSeeds: ['vca-alhambra-1']
  },
  {
    slug: 'hermes-silk-scarf-90',
    titleZh: 'Hermès 90cm 真丝方巾',
    titleEn: 'Hermès 90cm Silk Carré',
    descZh: '全新未拆封，附原盒丝带。',
    descEn: 'Brand new, sealed with original box and ribbon.',
    brand: 'Hermès',
    categorySlug: 'accessory',
    price: '2800.00',
    originalPrice: '3650.00',
    condition: 'NEW',
    imageSeeds: ['hermes-scarf-1']
  }
];

const DEMO_SETTINGS: Record<string, string> = {
  contact_phone: '+86 138 0000 0000',
  contact_wechat_id: 'luxury_resale_demo',
  contact_wechat_qr_url: '',
  brand_options: JSON.stringify([
    'Rolex',
    'Patek Philippe',
    'Audemars Piguet',
    'Hermès',
    'Louis Vuitton',
    'Chanel',
    'Dior',
    'Cartier',
    'Van Cleef & Arpels'
  ])
};

async function ensureOwner(): Promise<AdminUser> {
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@example.com';
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Owner ${email} 已存在，跳过创建。`);
    return existing;
  }
  const tempPassword = crypto.randomBytes(9).toString('base64url');
  const created = await prisma.adminUser.create({
    data: {
      email,
      name: 'Owner',
      role: Role.OWNER,
      passwordHash: await hashPassword(tempPassword)
    }
  });
  console.log('============================================');
  console.log(' 初始 OWNER 账号已创建');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${tempPassword}`);
  console.log(' 请立即登录并修改密码。');
  console.log('============================================');
  return created;
}

async function ensureCategories(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (const c of DEMO_CATEGORIES) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      create: { slug: c.slug, nameZh: c.nameZh, nameEn: c.nameEn, sortOrder: c.sortOrder },
      update: { nameZh: c.nameZh, nameEn: c.nameEn, sortOrder: c.sortOrder }
    });
    out.set(c.slug, row.id);
  }
  console.log(`分类已就绪：${[...out.keys()].join(', ')}`);
  return out;
}

async function ensureSettings(): Promise<void> {
  for (const [key, value] of Object.entries(DEMO_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value },
      update: {}
    });
  }
  console.log('联系方式 settings 已就绪（如已存在则保留现值）。');
}

async function ensureProducts(owner: AdminUser, catBySlug: Map<string, string>): Promise<void> {
  for (const p of DEMO_PRODUCTS) {
    const categoryId = catBySlug.get(p.categorySlug);
    if (!categoryId) {
      console.warn(`跳过 ${p.slug}：分类 ${p.categorySlug} 不存在`);
      continue;
    }
    const existing = await prisma.product.findUnique({ where: { slug: p.slug } });
    if (existing) {
      console.log(`商品 ${p.slug} 已存在，跳过。`);
      continue;
    }
    await prisma.product.create({
      data: {
        slug: p.slug,
        titleZh: p.titleZh,
        titleEn: p.titleEn,
        descZh: p.descZh,
        descEn: p.descEn,
        brand: p.brand,
        categoryId,
        price: p.price,
        originalPrice: p.originalPrice ?? null,
        currency: 'CNY',
        condition: p.condition,
        sizeInfo: p.sizeInfo ?? undefined,
        serialNumber: p.serialNumber ?? null,
        status: 'AVAILABLE',
        uploadedById: owner.id,
        images: {
          create: p.imageSeeds.map((seed, idx) => ({
            url: `https://picsum.photos/seed/${encodeURIComponent(seed)}/900/900`,
            kind: 'PHOTO' as const,
            sortOrder: idx
          }))
        }
      }
    });
  }
  const total = await prisma.product.count({ where: { status: 'AVAILABLE' } });
  console.log(`在售商品总数：${total}`);
}

async function main() {
  const owner = await ensureOwner();
  const cats = await ensureCategories();
  await ensureSettings();
  await ensureProducts(owner, cats);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
