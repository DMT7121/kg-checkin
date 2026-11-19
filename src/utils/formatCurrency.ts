/**
 * Shared VND currency & numeric input formatters.
 */
export function formatVnd(amount: number, suffix = ' VNĐ'): string {
  const rounded = Math.round(Number(amount) || 0);
  const formatted = rounded.toLocaleString('vi-VN');
  if (!suffix) return formatted;
  if (suffix.startsWith(' ') || suffix === 'đ') {
    return `${formatted}${suffix}`;
  }
  return `${formatted} ${suffix}`;
}

export function formatMoneyInput(raw: string): string {
  const digits = String(raw || '').replace(/\D/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('vi-VN');
}
