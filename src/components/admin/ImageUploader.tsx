'use client';
import { useState, useRef, type ChangeEvent } from 'react';

export type UploadedImage = {
  key: string;
  publicUrl: string;
  kind: 'PHOTO' | 'CERT';
};

type Props = {
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  kind: 'PHOTO' | 'CERT';
  max?: number;
};

type Pending = { id: string; progress: number; error?: string };

const MIME_TO_TYPE: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp'
};

export function ImageUploader({ value, onChange, kind, max = 15 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const remaining = max - value.length;
    if (files.length > remaining) {
      alert(`最多 ${max} 张，已超出 ${files.length - remaining} 张`);
      return;
    }
    const groups: Record<'image/jpeg' | 'image/png' | 'image/webp', File[]> = {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    };
    for (const f of files) {
      const t = MIME_TO_TYPE[f.type];
      if (!t) {
        alert(`不支持的文件类型: ${f.name}`);
        return;
      }
      groups[t].push(f);
    }

    const pendingItems: Pending[] = files.map((f) => ({
      id: `${Date.now()}-${f.name}`,
      progress: 0
    }));
    setPending((p) => [...p, ...pendingItems]);

    const uploaded: UploadedImage[] = [];
    for (const ct of Object.keys(groups) as Array<keyof typeof groups>) {
      const list = groups[ct];
      if (list.length === 0) continue;
      const res = await fetch('/api/admin/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: list.length, contentType: ct })
      });
      const json = (await res.json()) as {
        ok: boolean;
        items?: Array<{ key: string; url: string }>;
      };
      if (!res.ok || !json.items) {
        alert('获取上传地址失败');
        return;
      }
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const slot = json.items[i];
        const put = await fetch(slot.url, {
          method: 'PUT',
          headers: { 'Content-Type': ct },
          body: file
        });
        const putJson = (await put.json()) as { ok: boolean; publicUrl?: string };
        if (!put.ok || !putJson.publicUrl) {
          alert(`上传 ${file.name} 失败`);
          continue;
        }
        uploaded.push({ key: slot.key, publicUrl: putJson.publicUrl, kind });
      }
    }

    onChange([...value, ...uploaded]);
    setPending([]);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...value];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {value.map((img, i) => (
          <div
            key={img.key}
            className="relative border border-line aspect-square overflow-hidden group"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.publicUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-ink/70 text-bone text-xs flex justify-between px-1 opacity-0 group-hover:opacity-100 transition">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}>
                ←
              </button>
              <button type="button" onClick={() => remove(i)}>
                ✕
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1}>
                →
              </button>
            </div>
          </div>
        ))}
        {pending.map((p) => (
          <div
            key={p.id}
            className="border border-dashed border-line aspect-square flex items-center justify-center text-xs text-ink-soft"
          >
            上传中…
          </div>
        ))}
      </div>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onPick}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={value.length >= max}
          className="px-4 py-2 border border-line text-sm disabled:opacity-50"
        >
          + 添加图片（剩余 {max - value.length}）
        </button>
      </div>
    </div>
  );
}
