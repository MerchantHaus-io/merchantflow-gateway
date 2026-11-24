import { describe, it, expect } from 'vitest';
import { MH_POSTAL_ADDRESS, MH_LEGAL_NAME, complianceFooterHtml, complianceFooterText, listUnsubscribe, withComplianceFooterHtml } from '../../supabase/functions/_shared/outreach-compliance';
import { emailIssue } from '../../supabase/functions/_shared/outreach-policy';

describe('CAN-SPAM outreach footer', () => {
  it('uses the same legal name and postal address as quotes and invoices', async () => {
    const source = await import('node:fs').then(fs => fs.readFileSync('src/config/quoteSchedule.ts', 'utf8'));
    expect(source).toContain(`const MH_ADDRESS = "${MH_POSTAL_ADDRESS}";`);
    expect(source).toContain(`const MH_COMPANY = "${MH_LEGAL_NAME}";`);
  });

  it('text and html footers carry the address and a reply-to-unsubscribe opt-out', () => {
    for (const footer of [complianceFooterText(), complianceFooterHtml()]) {
      expect(footer).toContain('1209 Mountain Road Pl NE Ste N, Albuquerque, NM 87110, USA');
      expect(footer).toContain('MerchantHaus LLC');
      expect(footer).toMatch(/unsubscribe/);
    }
  });

  it('builds a mailto List-Unsubscribe header, including from a display-name address', () => {
    expect(listUnsubscribe('rep@merchanthaus.io')).toBe('<mailto:rep@merchanthaus.io?subject=unsubscribe>');
    expect(listUnsubscribe('Merchant Haus Sales <sales@merchanthaus.io>')).toBe('<mailto:sales@merchanthaus.io?subject=unsubscribe>');
    expect(() => listUnsubscribe('not an address')).toThrow();
  });

  it('inserts the footer inside </body> when present, else appends it', () => {
    expect(withComplianceFooterHtml('<html><body><p>Hi</p></body></html>')).toMatch(/<p>Hi<\/p><p style=.*Albuquerque.*<\/p><\/body><\/html>$/);
    expect(withComplianceFooterHtml('<p>Hi</p>')).toMatch(/^<p>Hi<\/p><p style=.*Albuquerque/);
  });

  it('is added after the word/question check, so it cannot fail emailIssue for a valid draft', () => {
    const draft = 'Hi Maya,\n\nIs Gear Club billing something you look after?\n\nJordan';
    expect(emailIssue('Gear Club renewals', draft)).toBeNull();
    expect(complianceFooterText()).not.toContain('?');
    expect(complianceFooterHtml()).not.toContain('?');
  });
});

describe('contactMailSearch (out-of-thread opt-outs stop the cadence)', () => {
  it('searches from the enrolment creation time, to the second, excluding chats', async () => {
    const { contactMailSearch } = await import('../../supabase/functions/_shared/outreach-policy');
    expect(contactMailSearch('Maya@Fernbrook.example', '2026-11-24T15:30:05.123Z')).toBe('from:maya@fernbrook.example after:1795534205 -in:chats');
    expect(contactMailSearch('a+b@x.example', '2026-11-24T15:30:05+00:00')).toBe('from:a+b@x.example after:1795534205 -in:chats');
  });

  it('a backdated start date cannot widen the window: only created_at is used', async () => {
    const { contactMailSearch } = await import('../../supabase/functions/_shared/outreach-policy');
    expect(contactMailSearch('a@b.example', '2026-11-24T00:00:00Z')).toContain(`after:${Date.parse('2026-11-24T00:00:00Z') / 1000}`);
  });

  it('refuses inputs that cannot form a safe Gmail query', async () => {
    const { contactMailSearch } = await import('../../supabase/functions/_shared/outreach-policy');
    for (const [email, at] of [['not an email', '2026-11-24T00:00:00Z'], ['a@b.example OR from:x', '2026-11-24T00:00:00Z'], ['a@b.example', null], ['a@b.example', 'not a date'], ['"a"@b.example', '2026-11-24T00:00:00Z']] as const)
      expect(contactMailSearch(email, at)).toBeNull();
  });
});
