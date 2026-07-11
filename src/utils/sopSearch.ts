import type { SopContentItem, SopSection } from '../pages/sopData';

export type SopScope = 'all' | 'recommended' | 'general' | 'department' | 'critical';

export interface SopSearchResult {
  sectionTitle: string;
  sectionId: string;
  item: SopContentItem;
  score: number;
  excerpt: string;
  isCritical: boolean;
  matchedTerms: string[];
}

const SYNONYM_GROUPS = [
  ['khieu nai', 'phan nan', 'khach la', 'khach buc xuc', 'complaint'],
  ['het mon', 'sold out', 'tam het', 'khong con mon'],
  ['thanh toan loi', 'loi bill', 'sai hoa don', 'loi may pos'],
  ['chay', 'pccc', 'hoa hoan', 'cuu hoa'],
  ['do vo', 'vo ly', 'vo chen', 'vo bat'],
  ['tai nan', 'so cuu', 'bi thuong', 'cap cuu'],
  ['ve sinh', 'an toan thuc pham', 'attp', 'vsattp'],
  ['ban giao', 'giao ca', 'nhan ca'],
  ['phuc vu', 'service', 'cham soc khach'],
  ['thu ngan', 'cashier', 'tinh tien'],
  ['pha che', 'bar', 'do uong'],
  ['bep', 'kitchen', 'nau an'],
];

const CRITICAL_TERMS = [
  'pccc', 'chay', 'hoa hoan', 'cap cuu', 'tai nan', 'nguy hiem',
  'an toan', 'khieu nai', 'phan nan', 'ky luat', 'cam', 'tuyet doi',
];

const POSITION_SECTION_MAP: Record<string, string[]> = {
  'phuc vu': ['phuc-vu', 'qtpv-chi-tiet', 'tiep-thuc'],
  'tiep thuc': ['tiep-thuc', 'phuc-vu', 'qtpv-chi-tiet'],
  'le tan': ['phuc-vu', 'qtpv-chi-tiet'],
  'thu ngan': ['thu-ngan'],
  'pha che': ['pha-che'],
  'bep': ['bep'],
  'bao ve': ['bao-ve'],
  'tap vu': ['tap-vu'],
};

export function normalizeSopText(value: string) {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function plainSopText(value: string) {
  return value
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/li>/gi, '. ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

function expandQuery(query: string) {
  const normalized = normalizeSopText(query);
  const expanded = new Set(normalized.split(' ').filter(Boolean));

  SYNONYM_GROUPS.forEach(group => {
    if (group.some(term => normalized.includes(term))) {
      group.flatMap(term => term.split(' ')).forEach(term => expanded.add(term));
    }
  });

  return { normalized, terms: [...expanded] };
}

function editDistanceAtMostOne(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 1) return false;
  if (a === b) return true;
  let i = 0;
  let j = 0;
  let changes = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++changes > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return true;
}

export function isCriticalSop(section: SopSection, item: SopContentItem) {
  const text = normalizeSopText(`${section.title} ${item.subtitle} ${item.details}`);
  return CRITICAL_TERMS.some(term => text.includes(term));
}

export function getRecommendedSectionIds(position?: string) {
  const normalizedPosition = normalizeSopText(position || '');
  const matched = Object.entries(POSITION_SECTION_MAP).find(([key]) => normalizedPosition.includes(key));
  return matched?.[1] || [];
}

export function sectionMatchesScope(
  section: SopSection,
  scope: SopScope,
  position?: string,
) {
  if (scope === 'all') return true;
  if (scope === 'general') return section.group === 'general';
  if (scope === 'department') return section.group === 'department';
  if (scope === 'critical') return section.content.some(item => isCriticalSop(section, item));
  const recommended = getRecommendedSectionIds(position);
  if (recommended.length === 0) return true;
  return section.group === 'general' || recommended.includes(section.id);
}

export function searchSops(
  sections: SopSection[],
  query: string,
  scope: SopScope = 'all',
  position?: string,
): SopSearchResult[] {
  const { normalized: normalizedQuery, terms } = expandQuery(query);
  if (!normalizedQuery) return [];

  const results: SopSearchResult[] = [];

  sections.filter(section => sectionMatchesScope(section, scope, position)).forEach(section => {
    section.content.forEach(item => {
      const title = normalizeSopText(item.subtitle);
      const sectionTitle = normalizeSopText(section.title);
      const details = normalizeSopText(item.details);
      const words = `${title} ${sectionTitle} ${details}`.split(' ');
      const matchedTerms: string[] = [];
      let score = 0;

      if (title.includes(normalizedQuery)) score += 120;
      if (sectionTitle.includes(normalizedQuery)) score += 70;
      if (details.includes(normalizedQuery)) score += 45;

      terms.forEach(term => {
        if (title.includes(term)) {
          score += 28;
          matchedTerms.push(term);
        } else if (sectionTitle.includes(term)) {
          score += 18;
          matchedTerms.push(term);
        } else if (details.includes(term)) {
          score += 8;
          matchedTerms.push(term);
        } else if (term.length >= 4 && words.some(word => word.length >= 4 && editDistanceAtMostOne(term, word))) {
          score += 3;
          matchedTerms.push(term);
        }
      });

      if (score > 0 && matchedTerms.length >= Math.max(1, Math.ceil(Math.min(terms.length, 3) / 2))) {
        const rawText = plainSopText(item.details);
        const firstMatch = terms
          .map(term => normalizeSopText(rawText).indexOf(term))
          .filter(index => index >= 0)
          .sort((a, b) => a - b)[0] ?? 0;
        const start = Math.max(0, firstMatch - 55);
        const excerpt = `${start > 0 ? '…' : ''}${rawText.slice(start, start + 220)}${rawText.length > start + 220 ? '…' : ''}`;
        results.push({
          sectionTitle: section.title,
          sectionId: section.id,
          item,
          score,
          excerpt,
          isCritical: isCriticalSop(section, item),
          matchedTerms: [...new Set(matchedTerms)],
        });
      }
    });
  });

  return results.sort((a, b) => b.score - a.score || a.item.subtitle.localeCompare(b.item.subtitle, 'vi'));
}
