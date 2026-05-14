'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Condition, ProductStatus } from '@prisma/client';
import { ProductForm, type ProductFormValue } from '@/components/admin/ProductForm';
import type { UploadedImage } from '@/components/admin/ImageUploader';

type Category = { id: string; slug: string; nameZh: string };

type Detail = {
  id: string;
  titleZh: string;
  titleEn: string | null;
  descZh: string | null;
  descEn: string | null;
  brand: string;
  categoryId: string;
  price: string;
  originalPrice: string | null;
  condition: Condition;
  sizeInfo: Record<string, string> | null;
  serialNumber: string | null;
  status: ProductStatus;
  images: Array<{ id: string; url: string; kind: 'PHOTO' | 'CERT'; sortOrder: number }>;
};

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<ProductFormValue | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [detailRes, catRes, setRes] = await Promise.all([
        fetch(`/api/admin/products/${params.id}`),
        fetch('/api/admin/categories'),
        fetch('/api/admin/settings')
      ]);
      const d = (await detailRes.json()) as { product: Detail };
      const cat = (await catRes.json()) as { categories: Category[] };
      const set = (await setRes.json()) as { settings: { brand_options: string } };
      const photos: UploadedImage[] = d.product.images
        .filter((i) => i.kind === 'PHOTO')
        .map((i) => ({ key: i.id, publicUrl: i.url, kind: 'PHOTO' }));
      const certs: UploadedImage[] = d.product.images
        .filter((i) => i.kind === 'CERT')
        .map((i) => ({ key: i.id, publicUrl: i.url, kind: 'CERT' }));
      setInitial({
        titleZh: d.product.titleZh,
        titleEn: d.product.titleEn ?? '',
        descZh: d.product.descZh ?? '',
        descEn: d.product.descEn ?? '',
        brand: d.product.brand,
        categoryId: d.product.categoryId,
        price: String(d.product.price),
        originalPrice: d.product.originalPrice ? String(d.product.originalPrice) : '',
        condition: d.product.condition,
        sizeInfo: d.product.sizeInfo ? JSON.stringify(d.product.sizeInfo) : '',
        serialNumber: d.product.serialNumber ?? '',
        status: d.product.status,
        photos,
        certs
      });
      setCategories(cat.categories);
      setBrandOptions(
        (set.settings.brand_options ?? '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      );
    })();
  }, [params.id]);

  async function submit(v: ProductFormValue) {
    const sizeInfo = v.sizeInfo ? (JSON.parse(v.sizeInfo) as Record<string, string>) : {};
    const res = await fetch(`/api/admin/products/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleZh: v.titleZh,
        titleEn: v.titleEn,
        descZh: v.descZh,
        descEn: v.descEn,
        brand: v.brand,
        categoryId: v.categoryId,
        price: v.price,
        originalPrice: v.originalPrice,
        condition: v.condition,
        sizeInfo,
        serialNumber: v.serialNumber,
        images: [...v.photos, ...v.certs]
      })
    });
    if (res.ok) {
      router.push('/admin/products');
      return { ok: true };
    }
    return { ok: false, message: '保存失败' };
  }

  if (!initial) return <p className="text-sm text-ink-soft">加载中…</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">编辑商品</h1>
      <ProductForm
        initial={initial}
        categories={categories}
        brandOptions={brandOptions}
        onSubmit={submit}
        submitLabel="保存"
      />
    </div>
  );
}
