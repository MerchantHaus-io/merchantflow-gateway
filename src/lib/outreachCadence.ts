import { parse } from 'csv-parse/browser/esm/sync';
import { z } from 'zod';
import { fromZonedTime } from 'date-fns-tz';
export { emailIssue } from '../../supabase/functions/_shared/outreach-policy';

export const CSV_FIELDS = ['email', 'first_name', 'last_name', 'company', 'phone', 'website', 'linkedin', 'timezone', 'assignee'] as const;
export type CsvField = typeof CSV_FIELDS[number];
export type CsvContact = Record<CsvField, string>;
export function readCsv(text: string): { headers: string[]; rows: string[][] } {
  const records: string[][] = parse(text, { bom: true, skip_empty_lines: true, trim: true, max_record_size: 20000 });
  if (records.length < 2) throw new Error('Include a header and at least one contact');
  if (records.length > 501) throw new Error('Import up to 500 contacts at a time');
  const [headers, ...rows] = records;
  return { headers, rows };
}
export function guessMapping(headers: string[]): Record<CsvField, string> {
  const aliases: Record<CsvField, string[]> = {
    email: ['email', 'email_address'], first_name: ['first_name', 'first'], last_name: ['last_name', 'last'],
    company: ['company', 'company_name', 'business', 'dba'], phone: ['phone', 'phone_number', 'telephone'],
    website: ['website', 'website_url', 'url'], linkedin: ['linkedin', 'linkedin_url'], timezone: ['timezone', 'time_zone'], assignee: ['assignee', 'assigned_email', 'owner'],
  };
  return Object.fromEntries(CSV_FIELDS.map(f => [f, headers.find(h => aliases[f].includes(h.toLowerCase().trim().replace(/[ -]+/g, '_'))) || ''])) as Record<CsvField, string>;
}
export function previewCsv(headers: string[], rows: string[][], map: Record<CsvField, string>, existingEmails: string[]) {
  const seen = new Set(existingEmails.map(e => e.toLowerCase()));
  const accepted: CsvContact[] = [];
  const issues: string[] = [];
  rows.forEach((row, i) => {
    const contact = Object.fromEntries(CSV_FIELDS.map(f => [f, row[headers.indexOf(map[f])] || ''])) as CsvContact;
    contact.email = contact.email.trim().toLowerCase();
    if (!z.string().email().safeParse(contact.email).success) { issues.push(`Row ${i + 2}: invalid email`); return; }
    if (seen.has(contact.email)) { issues.push(`Row ${i + 2}: duplicate email`); return; }
    if (contact.timezone) { try { new Intl.DateTimeFormat('en', { timeZone: contact.timezone }); } catch { issues.push(`Row ${i + 2}: invalid timezone`); return; } }
    seen.add(contact.email); accepted.push(contact);
  });
  return { accepted, issues };
}
export function nextTouch<T extends { touch_number: number; status: string }>(touches: T[]) {
  return [...touches].sort((a, b) => a.touch_number - b.touch_number).find(t => t.status === 'pending');
}
export function ctDate(iso: string) {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso)) + ' CT';
}
export function ctInputToUtc(value: string) { return fromZonedTime(value, 'America/Chicago').toISOString(); }