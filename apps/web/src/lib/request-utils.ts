export const REQUEST_STATUSES = [
  'MATCHING_ACTIVE',
  'PARTIALLY_ACCEPTED',
  'FULLY_MATCHED',
  'ESCALATED_TO_COORDINATOR',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
];
export function indiaInput(value: string | Date): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Date(date.getTime() + 330 * 60000).toISOString().slice(0, 16)
    : '';
}
export function indiaISO(value: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
    throw new Error('Enter a valid date and time in India time.');
  const date = new Date(`${value}:00+05:30`);
  if (!Number.isFinite(date.getTime()) || indiaInput(date) !== value)
    throw new Error('Enter a valid calendar date and time.');
  return date.toISOString();
}
export function indiaTime(value: string | null | undefined): string {
  if (!value || !Number.isFinite(new Date(value).getTime())) return 'Not recorded';
  return (
    new Intl.DateTimeFormat('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(value)) + ' IST'
  );
}
export function dispatchMessage(result: unknown): string {
  const status = (result as { status?: string } | null)?.status;
  return status === 'OFFERED'
    ? 'Confirmation offer sent. The volunteer must accept the current time.'
    : status === 'ACCEPTED'
      ? 'Volunteer assignment saved.'
      : 'Saved on the server. Refresh to check the assignment status.';
}
