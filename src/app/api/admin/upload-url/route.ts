import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as crypto from 'node:crypto';

export const runtime = 'nodejs';

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const Body = z.object({
  count: z.number().int().min(1).max(15),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'])
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const ext = EXT_MAP[parsed.contentType];
  const items = Array.from({ length: parsed.count }, () => {
    const key = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    return { key, url: `/api/admin/upload-local?key=${key}` };
  });
  return NextResponse.json({ ok: true, items });
}
