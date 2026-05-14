'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ImageUploader, type UploadedImage } from '@/components/admin/ImageUploader';

type Settings = {
  contact_phone: string;
  contact_wechat_id: string;
  contact_wechat_qr_url: string;
  brand_options: string;
};

export default function AdminSettingsPage() {
  const [v, setV] = useState<Settings>({
    contact_phone: '',
    contact_wechat_id: '',
    contact_wechat_qr_url: '',
    brand_options: ''
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/settings');
    const json = (await res.json()) as { settings: Settings };
    setV(json.settings);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v)
    });
    setBusy(false);
    setMsg(res.ok ? '已保存' : '保存失败');
  }

  const qrImages: UploadedImage[] = v.contact_wechat_qr_url
    ? [{ key: 'qr', publicUrl: v.contact_wechat_qr_url, kind: 'PHOTO' }]
    : [];

  return (
    <form onSubmit={save} className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-3xl">全站设置</h1>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">联系电话</span>
        <input
          value={v.contact_phone}
          onChange={(e) => setV({ ...v, contact_phone: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">微信号</span>
        <input
          value={v.contact_wechat_id}
          onChange={(e) => setV({ ...v, contact_wechat_id: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2"
        />
      </label>

      <div>
        <span className="text-xs uppercase tracking-wider text-ink-soft">微信二维码</span>
        <div className="mt-2">
          <ImageUploader
            value={qrImages}
            onChange={(next) =>
              setV({ ...v, contact_wechat_qr_url: next[0]?.publicUrl ?? '' })
            }
            kind="PHOTO"
            max={1}
          />
        </div>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">
          品牌候选词（每行一个）
        </span>
        <textarea
          rows={6}
          value={v.brand_options}
          onChange={(e) => setV({ ...v, brand_options: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2 font-mono text-sm"
          placeholder={'Rolex\nHermès\nChanel'}
        />
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2 bg-ink text-bone uppercase text-sm tracking-wider disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
        {msg && <span className="text-sm text-ink-soft">{msg}</span>}
      </div>
    </form>
  );
}
