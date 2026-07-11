export const abbreviatePersonName = (fullname: string) => {
  const parts = fullname.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return parts.join(' ');
  const initials = parts
    .slice(0, -2)
    .map(part => `${Array.from(part)[0]?.toLocaleUpperCase('vi-VN') || ''}.`)
    .join(' ');
  return `${initials} ${parts.slice(-2).join(' ')}`.trim();
};
