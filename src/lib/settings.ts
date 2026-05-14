import { prisma } from './prisma';

export const SETTING_KEYS = [
  'contact_phone',
  'contact_wechat_id',
  'contact_wechat_qr_url',
  'brand_options'
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ''])) as Record<SettingKey, string>;
  for (const r of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(r.key)) {
      out[r.key as SettingKey] = r.value;
    }
  }
  return out;
}

export async function bulkUpdate(patch: Partial<Record<SettingKey, string>>): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) =>
    (SETTING_KEYS as readonly string[]).includes(k)
  );
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value ?? '' },
        update: { value: value ?? '' }
      })
    )
  );
}
