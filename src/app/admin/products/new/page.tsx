'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm, type ProductFormValue } from '@/components/admin/ProductForm';

type Category = { id: string; slug: string; nameZh: string };

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [catRes, setRes] = await Promise.all([
        fetch('/api/admin/categories'),
        fetch('/api/admin/settings')
      ]);
      const cat = (await catRes.json()) as { categories: Category[] };
      const set = (await setRes.json()) as { settings: { brand_options: string } };
      setCategories(cat.categories);
      setBrandOptions(
        (set.settings.brand_options ?? '')
          .split(/\r?\n/)
          .map((s) => s.trim())
          .filter(Boolean)
      );
    })();
  }, []);

  async function submit(v: ProductFormValue) {
    const sizeInfo = v.sizeInfo ? (JSON.parse(v.sizeInfo) as Record<string, string>) : undefined;
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleZh: v.titleZh,
        titleEn: v.titleEn || undefined,
        descZh: v.descZh || undefined,
        descEn: v.descEn || undefined,
        brand: v.brand,
        categoryId: v.categoryId,
        price: v.price,
        originalPrice: v.originalPrice || undefined,
        condition: v.condition,
        sizeInfo,
        serialNumber: v.serialNumber || undefined,
        status: v.status,
        images: [...v.photos, ...v.certs]
      })
    });
    if (res.ok) {
      router.push('/admin/products');
      return { ok: true };
    }
    return { ok: false, message: '保存失败' };
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">新建商品</h1>
      <ProductForm
        categories={categories}
        brandOptions={brandOptions}
        onSubmit={submit}
        submitLabel="创建"
      />
    </div>
  );
}
