import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAllSettings, bulkUpdate, SETTING_KEYS } from '@/lib/settings';

export const runtime = 'nodejs';

const Body = z
  .object(Object.fromEntries(SETTING_KEYS.map((k) => [k, z.string().max(2000).optional()])))
  .partial();
// Default Zod behavior strips unknown keys; bulkUpdate also filters by SETTING_KEYS.

export async function GET() {
  const settings = await getAllSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  await bulkUpdate(parsed);
  return NextResponse.json({ ok: true });
}
