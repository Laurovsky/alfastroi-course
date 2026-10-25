export function formatDisplayName(
  lastName: string,
  firstName: string,
  middleName?: string | null,
): string {
  if (!lastName && !firstName) return '—'
  const initials = [firstName, middleName]
    .filter(Boolean)
    .map((n) => n![0].toUpperCase() + '.')
    .join(' ')
  return initials ? `${lastName} ${initials}` : lastName
}
