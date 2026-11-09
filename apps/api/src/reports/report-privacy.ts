/**
 * What keeps a report from pointing at a person (FR-REPORT-02). Only counts leave the service, and
 * small counts in a breakdown are hidden before they are shown, saved or downloaded.
 */
export const SMALL_COUNT_LIMIT = 5;
export const SMALL = `<${SMALL_COUNT_LIMIT}`;
export const HIDDEN = 'hidden';

export type Shown = number | string;

/**
 * Hides each count under the limit. If that hides only one, the next smallest goes too, or the
 * hidden one could be worked out from the total. A breakdown of all zeros has nothing to protect.
 */
export function hideSmallCounts(counts: readonly number[]): Shown[] {
  const shown: Shown[] = [...counts];
  if (counts.every((count) => count === 0)) return shown;
  const small = counts.flatMap((count, index) => (count < SMALL_COUNT_LIMIT ? [index] : []));
  for (const index of small) shown[index] = SMALL;
  if (small.length === 1) {
    let next = -1;
    counts.forEach((count, index) => {
      if (index === small[0]) return;
      if (next === -1 || count < (counts[next] as number)) next = index;
    });
    if (next !== -1) shown[next] = HIDDEN;
  }
  return shown;
}

/** Keeps a figure that goes with a count, such as hours beside visits, only if the count is shown. */
export const followCount = (count: Shown, value: number): Shown =>
  typeof count === 'number' ? value : HIDDEN;

/** A count of people going outside the service: never exact below the limit. */
export const hideSmallPeople = (count: number): Shown =>
  count > 0 && count < SMALL_COUNT_LIMIT ? SMALL : count;

/**
 * Ward numbers are typed in, so only a recognisable number is reported. Anything else could be a
 * name or an address, and goes under Other.
 */
export const OTHER_WARD = 'Other';
export function tidyWard(raw: string | null | undefined): string {
  const match = /^(?:ward)?\s*(?:no\.?|number|#)?\s*0*(\d{1,3}[a-z]?)$/i.exec((raw ?? '').trim());
  return match?.[1] ? `Ward ${match[1].toUpperCase()}` : OTHER_WARD;
}

/** A spreadsheet treats text starting with these as a formula, so it is made plain text. */
export function cleanText(value: string): string {
  const flat = value.replace(/[\r\n\t]+/g, ' ').trim();
  return /^[=+\-@]/.test(flat) ? `'${flat}` : flat;
}
