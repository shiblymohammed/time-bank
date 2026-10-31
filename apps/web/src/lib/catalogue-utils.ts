export function staffing(
  minimum: string | undefined,
  preferred: string | undefined,
  safetyMinimum: number,
) {
  const min = Number(minimum),
    pref = Number(preferred);
  if (!Number.isInteger(min) || !Number.isInteger(pref) || min < safetyMinimum || pref < min)
    throw new Error(
      `Minimum staffing must be at least ${safetyMinimum}, and preferred staffing must cover the minimum.`,
    );
  return { minVolunteers: min, preferredVolunteers: pref };
}
export function skillCodes(value: string | undefined, required: boolean) {
  const codes = [
    ...new Set(
      (value ?? '')
        .split(',')
        .map((code) => code.trim())
        .filter(Boolean),
    ),
  ];
  if (codes.length > 50 || codes.some((code) => code.length > 50))
    throw new Error('Use at most 50 skill codes, each up to 50 characters.');
  if (required && !codes.length)
    throw new Error('Enter at least one skill code when verified skills are required.');
  return codes;
}
