import { randomBytes } from 'node:crypto';

const MAX_SLUG_LENGTH = 80;

/** "Money Plant (Golden)" → "money-plant-golden". Returns '' if nothing usable remains. */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
}

/**
 * Builds a slug from `value` that `isTaken` reports as free, adding -2, -3, … on clashes.
 * `fallback` is used when the value has no Latin letters or digits (e.g. a Hindi name).
 * A unique index on the slug field still guards against concurrent writes.
 */
export async function generateUniqueSlug(
  value: string,
  fallback: string,
  isTaken: (slug: string) => Promise<boolean>,
): Promise<string> {
  const base = slugify(value) || `${fallback}-${randomBytes(3).toString('hex')}`;

  if (!(await isTaken(base))) return base;
  for (let n = 2; n <= 50; n++) {
    const candidate = `${base}-${n}`;
    if (!(await isTaken(candidate))) return candidate;
  }
  return `${base}-${randomBytes(3).toString('hex')}`;
}
