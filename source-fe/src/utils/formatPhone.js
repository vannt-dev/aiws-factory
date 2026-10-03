/** Formats a normalized phone number for display by length only: 10 -> 4-3-3, 11 -> 3-4-4, otherwise unchanged. */
export function formatPhone(phone) {
  if (phone.length === 10) return phone.slice(0, 4) + ' ' + phone.slice(4, 7) + ' ' + phone.slice(7);
  if (phone.length === 11) return phone.slice(0, 3) + ' ' + phone.slice(3, 7) + ' ' + phone.slice(7);
  return phone;
}
