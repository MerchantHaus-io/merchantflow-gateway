"""Read-only live schema checks for the TAMI contact storage foundation."""
import json
import subprocess
import unittest


class TamiStorageChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run([
            'lovable', 'supabase', 'query',
            "select column_name, data_type, is_nullable, column_default, "
            "(select relrowsecurity from pg_class where oid='public.outreach_contacts'::regclass) as rls "
            "from information_schema.columns where table_schema='public' and table_name='outreach_contacts'"
        ], check=True, capture_output=True, text=True)
        cls.columns = {r['column_name']: r for r in json.loads(result.stdout)}

    def text_fields(self, fields):
        for field in fields:
            with self.subTest(field=field):
                self.assertIn(field, self.columns)
                self.assertEqual(self.columns[field]['data_type'], 'text')

    def test_first_and_last_name(self):
        self.text_fields(['first_name', 'last_name'])

    def test_company_and_address(self):
        self.text_fields(['company', 'address_street', 'address_city', 'address_zip', 'address_country', 'address_country_code'])

    def test_contact_email(self):
        self.text_fields(['email'])

    def test_separate_phone_numbers(self):
        self.text_fields(['phone', 'direct_phone', 'mobile_phone', 'company_primary_phone'])
        for field in ['contact_phone_numbers', 'company_phone_numbers']:
            with self.subTest(field=field):
                self.assertEqual(self.columns[field]['data_type'], 'ARRAY')
                self.assertEqual(self.columns[field]['is_nullable'], 'NO')
                self.assertEqual(self.columns[field]['column_default'], "'{}'::text[]")

    def test_state(self):
        self.text_fields(['address_state', 'address_state_code'])

    def test_website(self):
        self.text_fields(['website_url'])

    def test_relevant_business_context(self):
        self.text_fields(['linkedin_url', 'job_title', 'email_quality', 'industry', 'sub_industry', 'employee_count', 'employee_range', 'reported_turnover', 'estimated_online_turnover', 'payment_providers', 'website_technology', 'company_description', 'source_system', 'source_company_id', 'source_contact_id'])

    def test_existing_rls_stays_enabled(self):
        self.assertTrue(self.columns)
        self.assertTrue(all(c['rls'] is True for c in self.columns.values()))


if __name__ == '__main__':
    unittest.main(verbosity=2)