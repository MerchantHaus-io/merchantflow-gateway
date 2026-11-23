"""Live cadence checks; creates only temporary test records and sends no outreach.

Run after `lovable auth-session --json --self` with:
python3 scripts/check-outreach-cadence.py
"""
import json
import unittest
import uuid
from pathlib import Path

import requests


class OutreachCadenceChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        session = json.loads(Path.home().joinpath('.cache/lovable-auth/session.json').read_text())['session']
        config = {}
        for line in Path('.env.example').read_text().splitlines():
            if '=' in line and not line.lstrip().startswith('#'):
                key, value = line.split('=', 1)
                config[key] = value.strip().strip('"').strip("'")
        cls.base = config['VITE_SUPABASE_URL'] + '/rest/v1'
        key = config.get('VITE_SUPABASE_PUBLISHABLE_KEY') or config.get('VITE_SUPABASE_ANON_KEY')
        if not key:
            raise RuntimeError('Public client configuration missing')
        cls.headers = {'apikey': key, 'Authorization': 'Bearer ' + session['access_token'], 'Prefer': 'return=representation'}
        cls.user = session['user']['id']
        cls.email = session['user']['email']
        cls.tenant = cls.request('POST', 'rpc/current_tenant_id', {})
        if cls.request('POST', 'rpc/is_internal_staff', {}) is not True:
            raise RuntimeError('Use an active internal teammate for these checks')
        cls.template = cls.request('POST', 'rpc/outreach_touch_template', {})
        cls.campaign = cls.request('POST', 'outreach_campaigns', {
            'name': 'Temporary cadence verification ' + str(uuid.uuid4())[:8],
            'subject': 'Verification only — no delivery', 'body_html': '',
            'created_by': cls.user, 'created_by_email': cls.email, 'tenant_id': cls.tenant,
        })[0]

    @classmethod
    def request(cls, method, path, body=None, params=None, fail=False):
        response = requests.request(method, cls.base + '/' + path, headers=cls.headers,
                                    json=body, params=params, timeout=30)
        if fail:
            if response.ok:
                raise AssertionError('Expected rejection but operation succeeded')
            return response.status_code
        response.raise_for_status()
        return response.json() if response.content else None

    @classmethod
    def tearDownClass(cls):
        if hasattr(cls, 'campaign'):
            cls.request('DELETE', 'outreach_campaigns', params={'id': 'eq.' + cls.campaign['id']})
            remaining = cls.request('GET', 'outreach_contacts', params={'campaign_id': 'eq.' + cls.campaign['id'], 'select': 'id'})
            if remaining:
                raise AssertionError('Temporary contacts did not cascade-delete')

    def contact(self):
        return self.request('POST', 'outreach_contacts', {
            'campaign_id': self.campaign['id'], 'tenant_id': self.tenant,
            'email': str(uuid.uuid4()) + '@example.com', 'company': 'Verification only',
            'phone': '+12025550100',
        })[0]

    def enroll(self, contact=None, **patch):
        contact = contact or self.contact()
        values = {'campaign_id': self.campaign['id'], 'contact_id': contact['id'],
                  'tenant_id': self.tenant, 'assigned_user_id': self.user,
                  'assigned_email': 'spoofed@example.com', 'start_on': '2027-01-04'}
        values.update(patch)
        return self.request('POST', 'outreach_enrollments', values)[0]

    def touches(self, enrollment):
        return self.request('GET', 'outreach_touches', params={
            'enrollment_id': 'eq.' + enrollment['id'], 'order': 'touch_number.asc'})

    def update_touch(self, touch, values, fail=False):
        return self.request('PATCH', 'outreach_touches', values, {'id': 'eq.' + touch['id']}, fail=fail)

    def test_12_steps_over_24_working_days(self):
        self.assertEqual([t['working_day'] for t in self.template], [1, 1, 3, 5, 7, 9, 10, 14, 16, 18, 21, 24])

    def test_five_emails(self):
        self.assertEqual([t['touch_number'] for t in self.template if t['channel'] == 'email'], [2, 5, 8, 11, 12])

    def test_three_calls(self):
        self.assertEqual([t['touch_number'] for t in self.template if t['channel'] == 'call'], [3, 6, 9])

    def test_four_linkedin_actions(self):
        self.assertEqual([t['touch_number'] for t in self.template if t['channel'] == 'linkedin'], [1, 4, 7, 10])

    def test_email_threads(self):
        self.assertEqual({t['touch_number']: t['thread_touch'] for t in self.template if t['thread_touch']}, {5: 2, 11: 8})

    def test_weekends_skipped(self):
        for day in ['2026-11-28', '2026-11-29']:
            self.assertFalse(self.request('POST', 'rpc/outreach_working_day', {'d': day}))

    def test_us_holidays_skipped(self):
        for day in ['2026-11-26', '2027-01-18', '2027-05-31', '2027-07-05', '2027-12-31']:
            self.assertFalse(self.request('POST', 'rpc/outreach_working_day', {'d': day}), day)
        self.assertTrue(self.request('POST', 'rpc/outreach_working_day', {'d': '2026-11-27'}))

    def test_nothing_before_1600_cape_town(self):
        due = self.request('POST', 'rpc/outreach_due_at', {
            'start_on': '2026-11-23', 'day_number': 7, 'touch_channel': 'email',
            'contact_zone': 'America/New_York', 'touch_no': 5})
        self.assertEqual(due, '2026-12-02T14:00:00+00:00')

    def test_call_two_different_slot(self):
        first = self.request('POST', 'rpc/outreach_due_at', {'start_on': '2026-11-23', 'day_number': 1, 'touch_channel': 'call', 'touch_no': 3})
        second = self.request('POST', 'rpc/outreach_due_at', {'start_on': '2026-11-23', 'day_number': 1, 'touch_channel': 'call', 'touch_no': 6})
        self.assertEqual(first, '2026-11-23T14:30:00+00:00')
        self.assertEqual(second, '2026-11-23T16:30:00+00:00')

    def test_assigned_sender_cannot_be_spoofed(self):
        e = self.enroll()
        self.assertEqual(e['assigned_email'].lower(), self.email.lower())
        self.assertEqual(len(self.touches(e)), 12)

    def test_invalid_assignee_rejected(self):
        c = self.contact()
        self.request('POST', 'outreach_enrollments', {
            'campaign_id': self.campaign['id'], 'contact_id': c['id'], 'tenant_id': self.tenant,
            'assigned_user_id': str(uuid.uuid4()), 'assigned_email': 'unknown@example.com', 'start_on': '2027-01-04'}, fail=True)

    def test_cross_organisation_write_rejected(self):
        c = self.contact()
        self.request('POST', 'outreach_enrollments', {
            'campaign_id': self.campaign['id'], 'contact_id': c['id'], 'tenant_id': str(uuid.uuid4()),
            'assigned_user_id': self.user, 'assigned_email': self.email, 'start_on': '2027-01-04'}, fail=True)

    def test_legacy_bulk_sender_excluded(self):
        c = self.contact()
        self.enroll(c)
        saved = self.request('GET', 'outreach_contacts', params={'id': 'eq.' + c['id']})[0]
        self.assertEqual(saved['status'], 'cadence_active')
        self.request('PATCH', 'outreach_contacts', {'status': 'pending'}, {'id': 'eq.' + c['id']}, fail=True)

    def test_steps_cannot_execute_out_of_order(self):
        touches = self.touches(self.enroll())
        self.update_touch(touches[2], {'status': 'completed', 'outcome': 'no_answer'}, fail=True)

    def test_email_requires_delivery_confirmation(self):
        touches = self.touches(self.enroll())
        self.update_touch(touches[0], {'status': 'completed'})
        self.update_touch(touches[1], {'status': 'completed'}, fail=True)

    def test_any_reply_stops_cadence(self):
        c = self.contact()
        e = self.enroll(c)
        self.request('PATCH', 'outreach_contacts', {'status': 'replied', 'reply_snippet': 'Yes, please call me.'}, {'id': 'eq.' + c['id']})
        saved = self.request('GET', 'outreach_enrollments', params={'id': 'eq.' + e['id']})[0]
        self.assertEqual(saved['status'], 'replied')
        self.assertEqual([t['status'] for t in self.touches(e)], ['cancelled'] * 12)

    def test_not_interested_stops_cadence(self):
        e = self.enroll()
        touches = self.touches(e)
        self.update_touch(touches[0], {'status': 'completed', 'outcome': 'not_interested', 'reply_word_for_word': 'Not interested.'})
        self.assertEqual([t['status'] for t in self.touches(e)], ['completed'] + ['cancelled'] * 11)


if __name__ == '__main__':
    unittest.main(verbosity=2)