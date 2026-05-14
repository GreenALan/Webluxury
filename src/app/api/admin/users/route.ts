import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(60)
});

export async function GET() {
  const users = await prisma.adminUser.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const tempPassword = crypto.randomBytes(9).toString('base64url');
  try {
    const user = await prisma.adminUser.create({
      data: {
        email: parsed.email,
        name: parsed.name,
        role: 'ADMIN',
        passwordHash: await hashPassword(tempPassword)
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    return NextResponse.json({ ok: true, user, tempPassword }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ ok: false, code: 'DUPLICATE_EMAIL' }, { status: 409 });
    }
    throw e;
  }
}
