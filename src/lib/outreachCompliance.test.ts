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
  it('searches for any message from the contact since the day before the cadence started', async () => {
    const { contactMailSearch } = await import('../../supabase/functions/_shared/outreach-policy');
    expect(contactMailSearch('Maya@Fernbrook.example', '2026-11-24')).toBe('from:maya@fernbrook.example after:2026/11/23');
    expect(contactMailSearch('a+b@x.example', '2026-03-01')).toBe('from:a+b@x.example after:2026/02/28');
  });

  it('refuses inputs that cannot form a safe Gmail query', async () => {
    const { contactMailSearch } = await import('../../supabase/functions/_shared/outreach-policy');
    for (const [email, start] of [['not an email', '2026-11-24'], ['a@b.example OR from:x', '2026-11-24'], ['a@b.example', null], ['a@b.example', '24/11/2026'], ['"a"@b.example', '2026-11-24']] as const)
      expect(contactMailSearch(email, start)).toBeNull();
  });
});
