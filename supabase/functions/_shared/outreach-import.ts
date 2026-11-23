import { publicHttps } from './outreach-policy.ts';

export const IMPORT_FIELDS = {
  email: ['Contact email', 'contact_email_address', 'email', 'email_address'],
  first_name: ['First name', 'contact_first_name', 'first_name', 'first'],
  last_name: ['Last name', 'contact_last_name', 'last_name', 'last'],
  company: ['Company name', 'company_name', 'company', 'business', 'dba'],
  phone: ['Primary contact phone', 'contact_primary_phone_number', 'phone', 'phone_number', 'telephone'],
  direct_phone: ['Direct dial', 'contact_direct_dial', 'direct_phone'],
  mobile_phone: ['Mobile phone', 'contact_mobile_phone', 'mobile_phone'],
  contact_phone_numbers: ['All contact phones', 'contact_phone_numbers'],
  company_primary_phone: ['Company primary phone', 'company_primary_phone_number', 'company_primary_phone'],
  company_phone_numbers: ['All company phones', 'company_phone_numbers'],
  address_street: ['Street address', 'address_street', 'street', 'address'],
  address_city: ['City', 'address_city', 'city'],
  address_state: ['State', 'address_state', 'state'],
  address_state_code: ['State code', 'address_state_code', 'state_code'],
  address_zip: ['ZIP / postal code', 'address_zip', 'zip', 'postal_code'],
  address_country: ['Country', 'address_country', 'country'],
  address_country_code: ['Country code', 'address_country_code', 'country_code'],
  website: ['Company website', 'website', 'simple_url', 'website_url', 'url'],
  linkedin: ['Contact LinkedIn', 'contact_linkedin_link', 'linkedin', 'linkedin_url'],
  job_title: ['Job title', 'contact_title', 'job_title', 'title'],
  email_quality: ['Source email quality', 'contact_email_status', 'email_quality'],
  industry: ['Industry', 'industries', 'industry'],
  sub_industry: ['Sub-industry', 'sub_industries', 'sub_industry'],
  employee_count: ['Employee count', 'no_of_employees', 'employee_count'],
  employee_range: ['Employee range', 'employee_linkedin_range', 'employee_range'],
  reported_turnover: ['Reported turnover', 'turnover', 'reported_turnover'],
  estimated_online_turnover: ['Estimated online turnover', 'estimated_online_turnover'],
  payment_providers: ['Payment providers', 'payment_providers'],
  website_technology: ['Website technology', 'website_technology'],
  company_description: ['Company description', 'company_description'],
  source_company_id: ['Company source ID', 'tami_company_id', 'source_company_id'],
  source_contact_id: ['Contact source ID', 'tami_contact_id', 'source_contact_id'],
  timezone: ['Contact timezone', 'time_zone', 'timezone'],
  assignee: ['Assigned teammate', 'assignee', 'assigned_email', 'owner'],
} as const;
export type ImportField = keyof typeof IMPORT_FIELDS;
export const IMPORT_KEYS = Object.keys(IMPORT_FIELDS) as ImportField[];
export function cleanImportText(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return /^(?:upgrade your plan.*|n\/?a|not available|unavailable|null|undefined|-)$/i.test(text) ? '' : text;
}
export function phoneList(...values: string[]): string[] {
  const found = new Map<string, string>();
  for (const value of values) for (const part of value.split(/[;\n|]+/)) {
    const text = cleanImportText(part);
    if (!/^[+\d\s().-]+$/.test(text)) continue;
    const digits = text.replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) continue;
    const key = digits.replace(/^00/, '');
    const number = text.startsWith('00') ? '+' + digits.slice(2) : (text.startsWith('+') ? '+' : '') + digits;
    if (!found.has(key) || number.startsWith('+')) found.set(key, number);
  }
  return [...found.values()];
}
export function importUrl(value: string, linkedin = false): string {
  if (!value) return '';
  const url = publicHttps(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
  if (!url || (linkedin && !/(^|\.)linkedin\.com$/.test(new URL(url).hostname))) throw new Error(linkedin ? 'invalid public LinkedIn URL' : 'invalid public website URL');
  return url;
}
const windowsZones: Record<string, string> = {
  'eastern standard time': 'America/New_York', 'central standard time': 'America/Chicago',
  'mountain standard time': 'America/Denver', 'pacific standard time': 'America/Los_Angeles',
  'us mountain standard time': 'America/Phoenix', 'alaskan standard time': 'America/Anchorage',
  'hawaiian standard time': 'Pacific/Honolulu', 'gmt standard time': 'Europe/London',
  'south africa standard time': 'Africa/Johannesburg',
};
export function importTimezone(value: string): string | null {
  if (!value) return '';
  const mapped = windowsZones[value.toLowerCase()] || value;
  try { new Intl.DateTimeFormat('en', { timeZone: mapped }); return mapped; } catch { return null; }
}
export function normalizeImport(values: Record<string, unknown>) {
  const row = Object.fromEntries(IMPORT_KEYS.map(f => [f, cleanImportText(values[f])])) as Record<ImportField, string>;
  row.email = row.email.toLowerCase();
  row.direct_phone = phoneList(row.direct_phone)[0] || '';
  row.mobile_phone = phoneList(row.mobile_phone)[0] || '';
  const primary = phoneList(row.phone)[0] || '';
  row.company_primary_phone = phoneList(row.company_primary_phone)[0] || '';
  const contactPhones = phoneList(row.contact_phone_numbers, row.direct_phone, primary, row.mobile_phone);
  const companyPhones = phoneList(row.company_phone_numbers, row.company_primary_phone);
  row.phone = row.direct_phone || primary || row.mobile_phone || contactPhones[0] || row.company_primary_phone || companyPhones[0] || '';
  row.contact_phone_numbers = contactPhones.join('; '); row.company_phone_numbers = companyPhones.join('; ');
  row.website = importUrl(row.website); row.linkedin = importUrl(row.linkedin, true);
  const { website, linkedin, timezone: _timezone, assignee: _assignee, ...fields } = row;
  const contact = { ...fields, website_url: website || null, linkedin_url: linkedin || null,
    contact_phone_numbers: contactPhones, company_phone_numbers: companyPhones,
    source_system: values.source_system === 'TAMI' ? 'TAMI' : null };
  return { row, contact };
}