import { describe, it, expect } from 'vitest';
import { draftIssues, wordCount, EMAIL_TOUCHES, type CheckedResult } from '../../supabase/functions/_shared/outreach-draft-check';
import { emailIssue, researchPersonalisation } from '../../supabase/functions/_shared/outreach-policy';

// The fully worked 12-touch example from the outreach logic research
// (fictional merchant "Fernbrook Outdoor Supply"). It is the golden "good" case.
const fernbrook: CheckedResult = {
  summary: 'Fernbrook sells outdoor gear online and in one store, with a monthly Gear Club box. Angle: renewals after card changes; touch 8 uses expedition tents for disputes.',
  facts: [
    { detail: 'Gear Club boxes renew monthly and members can skip a month', source: 'https://fernbrook.example/gear-club', about: 'company' },
    { detail: 'Sells expedition tents', source: 'https://fernbrook.example/shop/tents', about: 'company' },
    { detail: 'Ships to Canada', source: 'https://www.fernbrook.example/shipping', about: 'company' },
    { detail: 'Maya oversees fulfilment and customer service', source: 'https://fernbrook.example/about', about: 'person' },
  ],
  drafts: [
    { touch_number: 1, subject: 'LinkedIn connect note', text: 'Hi Maya, I work on the payments side with retailers that sell both online and in store, like Fernbrook. Would be good to be connected.' },
    { touch_number: 2, subject: 'Gear Club renewals', text: "Hi Maya,\n\nFernbrook's site says Gear Club boxes renew every month. With repeat billing, renewals that fail after a customer gets a new card are a common headache for merchants.\n\nDarryn on our team gives a free 15-minute second opinion on a merchant's processing statement and billing setup.\n\nIs Gear Club billing something you look after, or does it sit with someone else?\n\nJordan" },
    { touch_number: 3, subject: 'Voicemail', text: "Hi Maya, it's Jordan Reyes at MerchantHaus. The reason for my call is Gear Club billing. I sent you a short email with the subject Gear Club renewals, so no need to call back. Just reply there if it's useful. Thanks, Maya." },
    { touch_number: 4, subject: 'LinkedIn comment', text: 'REP: Comment only if Maya or Fernbrook posted in the last 30 days about something related. Otherwise skip this touch. If they post about Gear Club:\nComment: "Letting members skip a month instead of cancelling is a smart call. It keeps the people who just have too much gear right now."' },
    { touch_number: 5, subject: 'Re: Gear Club renewals', text: 'Hi Maya,\n\nOne more thought on Gear Club. A useful thing to look at in any subscription setup is what happens to a renewal after a card declines.\n\nWorth a 15-minute look with Darryn before the next billing run?\n\nJordan' },
    { touch_number: 6, subject: 'Call talk track', text: "Hi Maya, it's Jordan Reyes from MerchantHaus. This is a cold call, so I'll be quick and you can tell me if it's worth another minute. The reason for my call: Fernbrook bills Gear Club members every month, and failed renewals after card changes are a common headache for subscription merchants. Darryn, our senior person, does a free 15-minute second opinion on processing statements and billing setups. Would later this week or next week work better? If you're not the right person: who handles card processing? DO NOT LEAVE A VOICEMAIL." },
    { touch_number: 7, subject: 'LinkedIn message', text: 'If connected: Thanks for connecting, Maya. Noticed Fernbrook now ships to Canada. Cross-border card orders can behave differently at checkout from domestic ones, so if that ever becomes a headache, Darryn is glad to compare notes.\nIf not connected: Like a recent Fernbrook company post. No comment needed.' },
    { touch_number: 8, subject: 'Tent orders and disputes', text: 'Hi Maya,\n\nDifferent topic from my last note. Fernbrook sells expedition tents online, and bigger online orders tend to draw more stolen-card attempts and disputes.\n\nOur gateway lets you set your own screening rules, like holding unusually large orders for review, and Darryn helps merchants put together dispute responses.\n\nHow are chargebacks on those orders handled today, in-house or by your processor?\n\nJordan' },
    { touch_number: 9, subject: 'Voicemail', text: 'Hi Maya, Jordan from MerchantHaus again. I emailed about screening larger tent orders and handling disputes, subject Tent orders and disputes. Reply there whenever it suits. Thanks.' },
    { touch_number: 10, subject: 'LinkedIn point', text: 'A useful check for any subscription box: make sure the name on members\' card statements matches the brand they signed up for. A charge people don\'t recognise is a common trigger for "I don\'t know this charge" disputes.' },
    { touch_number: 11, subject: 'Re: Tent orders and disputes', text: "Hi Maya,\n\nI may have the wrong person for this. If card processing and disputes at Fernbrook sit with someone in finance or with the owner, I'm happy to reach out to them instead and mention you pointed me there.\n\nWho would be best to speak with?\n\nJordan" },
    { touch_number: 12, subject: 'Last note from me', text: "Hi Maya,\n\nI haven't heard back, so I'll assume the timing isn't right and stop here.\n\nIf a second opinion on Fernbrook's processing statement would ever be useful, before a Gear Club change or after a run of disputes, just reply to this email and Darryn will set up 15 minutes.\n\nShould I check back in a few months, or leave it here?\n\nJordan" },
  ],
};
const host = 'fernbrook.example';
const withDraft = (base: CheckedResult, n: number, patch: Partial<{ subject: string; text: string }>): CheckedResult =>
  ({ ...base, drafts: base.drafts.map(d => d.touch_number === n ? { ...d, ...patch } : d) });

describe('draftIssues — universal checks', () => {
  it('passes the worked Fernbrook example (test 1, good output)', () => {
    expect(draftIssues(fernbrook, { host })).toEqual([]);
  });

  it('every worked email also passes the send-time emailIssue gate', () => {
    for (const n of EMAIL_TOUCHES) {
      const d = fernbrook.drafts.find(x => x.touch_number === n)!;
      expect(emailIssue(d.subject, d.text), `touch ${n}`).toBeNull();
      expect(wordCount(d.text)).toBeLessThan(90);
    }
  });

  it('test 1 bad output: stock opener, savings claim and LinkedIn source', () => {
    const bad = withDraft({ ...fernbrook, facts: [...fernbrook.facts, { detail: 'Posted about tents', source: 'https://www.linkedin.com/in/maya', about: 'person' }] },
      2, { text: 'Hi Maya,\n\nI came across your website and was impressed. We can save you 30% on processing. Interested?\n\nJordan' });
    const issues = draftIssues(bad, { host });
    expect(issues.some(i => /stock opener/.test(i))).toBe(true);
    expect(issues.some(i => /banned term/.test(i))).toBe(true);
    expect(issues.some(i => /LinkedIn/.test(i))).toBe(true);
  });

  it('flags the wrong draft count, word count, question count and missing Re:', () => {
    expect(draftIssues({ ...fernbrook, drafts: fernbrook.drafts.slice(0, 11) }, { host })).toContain('Expected exactly 12 drafts numbered 1 to 12');
    const long = withDraft(fernbrook, 2, { text: `${'word '.repeat(95)}?` });
    expect(draftIssues(long, { host }).some(i => /words/.test(i))).toBe(true);
    const twoQ = withDraft(fernbrook, 8, { text: 'Is it you? Or someone else?' });
    expect(draftIssues(twoQ, { host }).some(i => /2 question marks/.test(i))).toBe(true);
    const noRe = withDraft(fernbrook, 5, { subject: 'Gear Club renewals' });
    expect(draftIssues(noRe, { host }).some(i => /Re: /.test(i))).toBe(true);
  });

  it('requires the touch 4 REP gate and the touch 6 no-voicemail line', () => {
    const r = withDraft(withDraft(fernbrook, 4, { text: 'Loved your recent post about tents.' }), 6, { text: 'Hi Maya, the reason for my call is Gear Club.' });
    const issues = draftIssues(r, { host });
    expect(issues).toContain('Touch 4: missing the "REP:" gate');
    expect(issues).toContain('Touch 6: missing "DO NOT LEAVE A VOICEMAIL"');
  });

  it('test 3: injected percentage and link are caught', () => {
    const injected = withDraft(fernbrook, 2, { text: 'Hi Maya,\n\nMerchantHaus charges 1.5% and you can see more at https://promo.example. Want a look?\n\nJordan' });
    const issues = draftIssues(injected, { host });
    expect(issues.some(i => /banned term/.test(i))).toBe(true);
    expect(issues.some(i => /links/.test(i))).toBe(true);
  });

  it('test 4: a thin site may return no facts only if the summary flags it', () => {
    expect(draftIssues({ ...fernbrook, facts: [], summary: 'Cabinetry maker; single page.' }, { host })).toContain('No facts, but the summary does not flag low personalisation');
    expect(draftIssues({ ...fernbrook, facts: [], summary: 'Low personalisation: rep should add a detail. Cabinetry maker.' }, { host })).toEqual([]);
  });

  it('test 5: personal details and the echoed banned word are caught', () => {
    const r = withDraft(fernbrook, 8, { text: 'Hi Priya,\n\nAs a busy mom in Austin, your wholesale furniture orders must keep you running. Who handles disputes?\n\nJordan' });
    const issues = draftIssues(r, { host, forbidden: ['Austin', 'kids', 'marathon', 'mom'] });
    expect(issues.some(i => /"wholesale"/.test(i))).toBe(true);
    expect(issues.some(i => /forbidden term "Austin"/.test(i))).toBe(true);
    expect(issues.some(i => /forbidden term "mom"/.test(i))).toBe(true);
  });

  it('accepts www but rejects subdomains and other hosts, matching outreach-ai', () => {
    const r = { ...fernbrook, facts: [{ detail: 'w', source: 'https://www.fernbrook.example/a' }, { detail: 'x', source: 'https://shop.fernbrook.example/a' }, { detail: 'y', source: 'https://other.example/b' }] };
    expect(draftIssues(r, { host })).toEqual(['Fact source not on fernbrook.example: https://shop.fernbrook.example/a', 'Fact source not on fernbrook.example: https://other.example/b']);
  });

  it('requires the "Comment:" label on touch 4 unless it recommends liking a post instead', () => {
    const noLabel = withDraft(fernbrook, 4, { text: 'REP: Comment only if Maya posted recently. Otherwise skip. Nice point about tents.' });
    expect(draftIssues(noLabel, { host })).toContain('Touch 4: missing the "Comment:" label before the paste-ready comment');
    const skip = withDraft(fernbrook, 4, { text: 'REP: Comment only if Maya posted recently. Otherwise skip. Nothing related on the site, so like a recent company post instead.' });
    expect(draftIssues(skip, { host })).toEqual([]);
  });
});

describe('researchPersonalisation (rule 26)', () => {
  it('marks a thin-site result low and prefixes the summary once', () => {
    expect(researchPersonalisation(0, 0, 'Cabinetry maker.')).toEqual({ personalisation: 'low', summary: 'Low personalisation: rep should add a detail. Cabinetry maker.' });
    expect(researchPersonalisation(0, 0, 'low personalisation: rep should add a detail. Thin site.')).toEqual({ personalisation: 'low', summary: 'low personalisation: rep should add a detail. Thin site.' });
  });

  it('refuses to save when the model claimed facts but none verified', () => {
    expect(researchPersonalisation(3, 0, 'Specific claims')).toEqual({ error: expect.stringMatching(/could not be verified/) });
  });

  it('keeps the summary unchanged when facts verified, even if some were dropped', () => {
    expect(researchPersonalisation(3, 1, 'Good research')).toEqual({ personalisation: 'normal', summary: 'Good research' });
  });
});
