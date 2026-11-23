import { parse } from 'csv-parse/browser/esm/sync';
import { z } from 'zod';
import { fromZonedTime } from 'date-fns-tz';
export { emailIssue } from '../../supabase/functions/_shared/outreach-policy';
import { IMPORT_FIELDS, IMPORT_KEYS, normalizeImport, importTimezone } from '../../supabase/functions/_shared/outreach-import';
export { IMPORT_FIELDS, normalizeImport } from '../../supabase/functions/_shared/outreach-import';

export const CSV_FIELDS = IMPORT_KEYS;
export type CsvField = typeof CSV_FIELDS[number];
export type CsvContact = Record<CsvField, string> & { source_system: string };
export function readCsv(text: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = parse(text, { bom: true, skip_empty_lines: true, trim: true, max_record_size: 20000 });
  if (records.length < 2) throw new Error('Include a header and at least one contact');
  if (records.length > 501) throw new Error('Import up to 500 contacts at a time');
  const [headers, ...rows] = records;
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) throw new Error('Column headings must be unique and nonempty');
  return { headers, rows };
}
export function guessMapping(headers: string[]): Record<CsvField, string> {
  const key = (h: string) => h.toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  return Object.fromEntries(CSV_FIELDS.map(f => [f, IMPORT_FIELDS[f].slice(1).map(alias => headers.find(h => key(h) === alias)).find(Boolean) || ''])) as Record<CsvField, string>;
}
export function previewCsv(headers: string[], rows: string[][], map: Record<CsvField, string>, existingEmails: string[]) {
  const seen = new Set(existingEmails.map(e => e.toLowerCase()));
  const accepted: CsvContact[] = [];
  const issues: string[] = [];
  const warnings: string[] = [];
  const tami = headers.includes('TAMI Contact Id') || headers.includes('Contact Email Address');
  rows.forEach((row, i) => {
    const raw = Object.fromEntries(CSV_FIELDS.map(f => [f, row[headers.indexOf(map[f])] || '']));
    if (!raw.website && map.website === 'Website') raw.website = row[headers.indexOf('Simple Url')] || '';
    let contact: CsvContact;
    try { contact = { ...normalizeImport(raw).row, source_system: tami ? 'TAMI' : '' }; }
    catch (e) { issues.push(`Row ${i + 2}: ${e instanceof Error ? e.message : 'invalid contact'}`); return; }
    contact.email = contact.email.trim().toLowerCase();
    if (!z.string().email().safeParse(contact.email).success) { issues.push(`Row ${i + 2}: invalid email`); return; }
    if (seen.has(contact.email)) { issues.push(`Row ${i + 2}: duplicate email`); return; }
    const zone = importTimezone(contact.timezone);
    if (zone === null) { warnings.push(`Row ${i + 2}: timezone “${contact.timezone}” not recognised; use the reviewed default`); contact.timezone = ''; }
    else contact.timezone = zone;
    seen.add(contact.email); accepted.push(contact);
  });
  return { accepted, issues, warnings };
}
export function nextTouch<T extends { touch_number: number; status: string }>(touches: T[]) {
  return [...touches].sort((a, b) => a.touch_number - b.touch_number).find(t => t.status === 'pending');
}
export function ctDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' CT';
}
export function ctInputToUtc(value: string) { return fromZonedTime(value, 'America/Chicago').toISOString(); }