"""Read-only regression checks for the three selected security fixes.

Run after lovable auth-session --self. No records or files are changed.
"""
import json
import subprocess
import unittest
from pathlib import Path

import requests


class SelectedSecurityChecks(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        result = subprocess.run([
            "lovable", "supabase", "query",
            "select schemaname, tablename, policyname, roles, qual from pg_policies "
            "where (schemaname='storage' and tablename='objects') or "
            "(schemaname='public' and tablename='billing_doc_sequences')"
        ], check=True, capture_output=True, text=True)
        cls.policies = {r["policyname"]: r for r in json.loads(result.stdout)}
        config = {}
        for line in Path(".env.example").read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                config[k] = v.strip().strip("\"'")
        cls.url = config["VITE_SUPABASE_URL"]
        key = config.get("VITE_SUPABASE_PUBLISHABLE_KEY") or config.get("VITE_SUPABASE_ANON_KEY")
        cls.session = json.loads(Path.home().joinpath(".cache/lovable-auth/session.json").read_text())["session"]
        cls.headers = {"apikey": key, "Authorization": "Bearer " + cls.session["access_token"]}
        cls.anon_headers = {"apikey": key, "Authorization": "Bearer " + key}

    def rpc(self, name, body):
        r = requests.post(self.url + "/rest/v1/rpc/" + name, headers=self.headers, json=body, timeout=30)
        self.assertEqual(r.status_code, 200, "Authorised read helper must respond")
        return r.json()

    def test_billing_sequences_require_legacy_organisation_staff(self):
        qual = self.policies["Auth team can read sequences"]["qual"]
        self.assertIn("is_internal_staff()", qual)
        self.assertIn("current_tenant_id() = default_tenant_id()", qual)
        self.assertNotEqual(qual, "true")
        r = requests.get(self.url + "/rest/v1/billing_doc_sequences?select=doc_type,year", headers=self.headers, timeout=30)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json(), "Authorised staff still see existing counters")

    def test_chat_requires_owner_or_visible_message(self):
        qual = self.policies["Authenticated users can view chat attachments"]["qual"]
        self.assertIn("owner_id", qual)
        self.assertIn("auth.uid()", qual)
        self.assertIn("can_read_chat_attachment(name)", qual)
        self.assertIn("is_internal_staff()", qual)
        self.assertFalse(self.rpc("can_read_chat_attachment", {"_name": "not-a-real-user/not-a-real-file"}))
        r = requests.get(self.url + "/rest/v1/chat_messages?select=attachment_url&attachment_url=not.is.null&limit=20", headers=self.headers, timeout=30)
        self.assertEqual(r.status_code, 200)
        paths = [m["attachment_url"] for m in r.json() if not m["attachment_url"].startswith("http")]
        self.assertTrue(paths, "An existing shared chat attachment must be tested")
        self.assertTrue(self.rpc("can_read_chat_attachment", {"_name": paths[0]}))
        self.assert_can_sign("chat-attachments", paths[0])

    def assert_can_sign(self, bucket, path):
        r = requests.post(self.url + "/storage/v1/object/sign/" + bucket + "/" + path,
                          headers=self.headers, json={"expiresIn": 60}, timeout=30)
        self.assertEqual(r.status_code, 200, "Authorised file sharing must still work")
        self.assertTrue(r.json().get("signedURL"))

    def test_merchant_files_require_visible_same_organisation_parent(self):
        qual = self.policies["Authenticated users can view opportunity documents"]["qual"]
        self.assertIn("is_internal_staff()", qual)
        self.assertIn("can_read_merchant_file(name)", qual)
        self.assertFalse(self.rpc("can_read_merchant_file", {"_name": "00000000-0000-0000-0000-000000000000/private.pdf"}))
        r = requests.get(self.url + "/rest/v1/documents?select=file_path&limit=1", headers=self.headers, timeout=30)
        self.assertEqual(r.status_code, 200)
        self.assertTrue(r.json(), "An existing merchant document must be tested")
        path = r.json()[0]["file_path"]
        self.assertTrue(self.rpc("can_read_merchant_file", {"_name": path}))
        self.assert_can_sign("opportunity-documents", path)

    def test_anonymous_cannot_use_file_read_helpers(self):
        for name in ("can_read_chat_attachment", "can_read_merchant_file"):
            r = requests.post(self.url + "/rest/v1/rpc/" + name, headers=self.anon_headers,
                              json={"_name": "private.pdf"}, timeout=30)
            self.assertIn(r.status_code, (401, 403, 404))

    def test_unselected_policies_remain_unchanged(self):
        self.assertEqual(len(self.policies), 15)
        self.assertEqual(self.policies["Authenticated users can upload documents"]["qual"], None)
        self.assertEqual(self.policies["Avatar images are publicly accessible"]["qual"], "(bucket_id = 'avatars'::text)")
        self.assertEqual(self.policies["Staff can read scoping PDFs"]["qual"], "((bucket_id = 'scoping-documents'::text) AND is_internal_staff())")


if __name__ == "__main__":
    unittest.main(verbosity=2)