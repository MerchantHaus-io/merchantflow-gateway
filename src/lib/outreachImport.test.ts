import { describe, expect, it } from 'vitest';
import { guessMapping, previewCsv, readCsv } from './outreachCadence';
import { importTimezone, normalizeImport, phoneList } from '../../supabase/functions/_shared/outreach-import';

function preview(text: string) { const csv = readCsv(text); return previewCsv(csv.headers, csv.rows, guessMapping(csv.headers), []); }
describe('TAMI lead mapping', () => {
  it('uses contact email and names, never company email', () => {
    const row = preview('Company Email,Contact Email Address,Contact First Name,Contact Last Name,Company Name\ncompany@example.com,person@example.com,Ann,Smith,Example Co').accepted[0];
    expect(row).toMatchObject({ email: 'person@example.com', first_name: 'Ann', last_name: 'Smith', company: 'Example Co', source_system: 'TAMI' });
  });
  it('preserves the full company address and state', () => {
    expect(preview('Email,Address Street,Address City,Address State,Address State Code,Address ZIP,Address Country,Address Country Code\na@example.com,10 Test St,Austin,Texas,TX,00123,United States,US').accepted[0]).toMatchObject({ address_street: '10 Test St', address_city: 'Austin', address_state: 'Texas', address_state_code: 'TX', address_zip: '00123', address_country: 'United States', address_country_code: 'US' });
  });
  it('preserves contact and company phone lists separately and prefers direct dial', () => {
    const { row, contact } = normalizeImport({ phone: '+1 202 555 0101', direct_phone: '+1 202 555 0100', mobile_phone: '+1 202 555 0102', contact_phone_numbers: '+1 (202) 555-0100;0012025550100; +442071234567', company_primary_phone: '+1 202 555 0199', company_phone_numbers: '+12025550198' });
    expect(row.phone).toBe('+12025550100'); expect(contact.contact_phone_numbers).toEqual(['+12025550100', '+442071234567', '+12025550101', '+12025550102']);
    expect(contact.company_phone_numbers).toEqual(['+12025550198', '+12025550199']);
  });
  it('does not turn unavailable values into phone numbers', () => {
    expect(phoneList('Upgrade your plan to get this info.;N/A;Unavailable')).toEqual([]);
    expect(normalizeImport({ direct_phone: 'Upgrade your plan to get this info.', company_primary_phone: '+12025550199' }).row.phone).toBe('+12025550199');
  });
  it('normalizes the website and falls back to Simple Url', () => {
    expect(preview('Email,Website,Simple Url\na@example.com,,example.com').accepted[0].website).toBe('https://example.com/');
  });
  it('keeps contact LinkedIn instead of the company profile', () => {
    expect(preview('Email,Company LinkedIn Link,Contact LinkedIn Link\na@example.com,linkedin.com/company/test,linkedin.com/in/ann').accepted[0].linkedin).toBe('https://linkedin.com/in/ann');
  });
  it('rejects private or unsafe website values', () => {
    expect(preview('Email,Website\na@example.com,127.0.0.1').issues).toEqual(['Row 2: invalid public website URL']);
    expect(() => normalizeImport({ website: 'javascript:alert(1)' })).toThrow();
  });
  it('converts Windows timezone labels with daylight saving support', () => {
    expect(importTimezone('Pacific Standard Time')).toBe('America/Los_Angeles');
    expect(importTimezone('Central Standard Time')).toBe('America/Chicago');
    expect(importTimezone('Eastern Standard Time')).toBe('America/New_York');
  });
  it('requires a reviewed default for unknown timezone labels without losing the contact', () => {
    const result = preview('Email,Time Zone\na@example.com,Unknown zone');
    expect(result.accepted[0].timezone).toBe(''); expect(result.warnings).toHaveLength(1); expect(result.issues).toEqual([]);
  });
  it('preserves useful business context as text without creating consent or volume', () => {
    const { contact } = normalizeImport({ job_title: 'Director', industry: 'Retail', employee_count: '101', employee_range: '51–200', reported_turnover: '$1m–$5m', estimated_online_turnover: 'Estimate: $2m', payment_providers: 'Stripe', website_technology: 'WooCommerce', company_description: 'Unverified source description', email_quality: 'Valid', status: 'consented', monthly_volume: '2000000', tenant_id: 'spoofed' });
    expect(contact).toMatchObject({ job_title: 'Director', industry: 'Retail', employee_count: '101', employee_range: '51–200', reported_turnover: '$1m–$5m', estimated_online_turnover: 'Estimate: $2m', payment_providers: 'Stripe', website_technology: 'WooCommerce', company_description: 'Unverified source description', email_quality: 'Valid' });
    expect(contact).not.toHaveProperty('status'); expect(contact).not.toHaveProperty('monthly_volume'); expect(contact).not.toHaveProperty('tenant_id');
  });
  it('allows reviewed mapping overrides', () => {
    const csv = readCsv('Email,Contact Email Address\nchosen@example.com,other@example.com');
    const map = { ...guessMapping(csv.headers), email: 'Email' };
    expect(previewCsv(csv.headers, csv.rows, map, []).accepted[0].email).toBe('chosen@example.com');
  });
});