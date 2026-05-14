import { pinyin } from 'pinyin-pro';

const MAX_LEN = 60;

export function toSlug(input: string): string {
  if (!input) return 'item';
  const pinyinized = pinyin(input, { toneType: 'none', separator: ' ', nonZh: 'consecutive' });
  const slug = pinyinized
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_LEN)
    .replace(/^-|-$/g, '');
  return slug || 'item';
}

export async function ensureUniqueSlug(
  base: string,
  existsCheck: (slug: string) => Promise<{ id: string } | null>
): Promise<string> {
  let candidate = base;
  let n = 1;
  while (await existsCheck(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
