import { NextResponse } from 'next/server';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const runtime = 'nodejs';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB per image
const KEY_RE = /^[a-f0-9]{24}\.(jpg|png|webp)$/;

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') ?? '';
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, code: 'INVALID_KEY' }, { status: 400 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, code: 'TOO_LARGE' }, { status: 413 });
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), buf);
  return NextResponse.json({ ok: true, publicUrl: `/uploads/${key}` });
}
