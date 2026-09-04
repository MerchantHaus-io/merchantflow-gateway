import { describe, it, expect } from 'vitest';
import {
  sessionMinutes,
  summarizePartnerActivity,
  formatMinutes,
} from './partnerActivity';

const partners = [
  { id: 'r1', full_name: 'Gayle Edmond', email: 'gayle0608@gmail.com', auth_user_id: 'u1' },
  { id: 'r2', full_name: 'Urle Johnson', email: 'Urle.Johnson@gmail.com', auth_user_id: null },
];

describe('sessionMinutes', () => {
  it('prefers the stored duration', () => {
    expect(
      sessionMinutes({
        user_id: 'u1',
        user_email: null,
        logged_in_at: '2026-09-01T10:00:00Z',
        logged_out_at: '2026-09-01T12:00:00Z',
        duration_minutes: 15,
      })
    ).toBe(15);
  });

  it('falls back to the timestamp span', () => {
    expect(
      sessionMinutes({
        user_id: 'u1',
        user_email: null,
        logged_in_at: '2026-09-01T10:00:00Z',
        logged_out_at: '2026-09-01T10:45:00Z',
        duration_minutes: null,
      })
    ).toBe(45);
  });

  it('never returns a negative or unknown span', () => {
    expect(
      sessionMinutes({
        user_id: 'u1',
        user_email: null,
        logged_in_at: '2026-09-01T12:00:00Z',
        logged_out_at: '2026-09-01T10:00:00Z',
        duration_minutes: null,
      })
    ).toBe(0);
    expect(
      sessionMinutes({
        user_id: 'u1',
        user_email: null,
        logged_in_at: null,
        logged_out_at: null,
        duration_minutes: -5,
      })
    ).toBe(0);
  });
});

describe('summarizePartnerActivity', () => {
  it('counts logins and time per partner, matching by auth id or email', () => {
    const rows = summarizePartnerActivity(partners, [
      { user_id: 'u1', user_email: 'gayle0608@gmail.com', logged_in_at: '2026-09-01T10:00:00Z', logged_out_at: '2026-09-01T10:30:00Z', duration_minutes: 30 },
      { user_id: 'u1', user_email: 'gayle0608@gmail.com', logged_in_at: '2026-09-03T10:00:00Z', logged_out_at: null, duration_minutes: 10 },
      { user_id: 'other', user_email: 'urle.johnson@gmail.com', logged_in_at: '2026-09-02T09:00:00Z', logged_out_at: '2026-09-02T09:20:00Z', duration_minutes: null },
      { user_id: 'staff', user_email: 'admin@merchanthaus.io', logged_in_at: '2026-09-02T09:00:00Z', logged_out_at: null, duration_minutes: 99 },
    ]);

    const gayle = rows.find((r) => r.referrerId === 'r1')!;
    expect(gayle.logins).toBe(2);
    expect(gayle.totalMinutes).toBe(40);
    expect(gayle.averageMinutes).toBe(20);
    expect(gayle.lastLoginAt).toBe('2026-09-03T10:00:00Z');

    const urle = rows.find((r) => r.referrerId === 'r2')!;
    expect(urle.logins).toBe(1);
    expect(urle.totalMinutes).toBe(20);
  });

  it('includes partners with no sessions and sorts most active first', () => {
    const rows = summarizePartnerActivity(partners, [
      { user_id: 'u1', user_email: null, logged_in_at: '2026-09-01T10:00:00Z', logged_out_at: null, duration_minutes: 5 },
    ]);
    expect(rows.map((r) => r.referrerId)).toEqual(['r1', 'r2']);
    expect(rows[1].logins).toBe(0);
    expect(rows[1].lastLoginAt).toBeNull();
  });
});

describe('formatMinutes', () => {
  it('formats spans', () => {
    expect(formatMinutes(0)).toBe('—');
    expect(formatMinutes(42)).toBe('42m');
    expect(formatMinutes(120)).toBe('2h');
    expect(formatMinutes(192)).toBe('3h 12m');
  });
});
