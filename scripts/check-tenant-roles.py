"""Read-only integration checks using a locally minted, authorized session.

Run with python3 scripts/check-tenant-roles.py after lovable auth-session.
No production rows are created or changed.
"""
import json
from pathlib import Path
import requests


def main():
    session = json.loads(Path.home().joinpath(".cache/lovable-auth/session.json").read_text())["session"]
    # The project URL and publishable key are public client configuration.
    config = Path(".env.example").read_text().splitlines()
    values = {}
    for line in config:
        if "=" in line and not line.lstrip().startswith("#"):
            key, value = line.split("=", 1)
            values[key] = value.strip().strip('"').strip("'")
    base = values["VITE_SUPABASE_URL"] + "/rest/v1"
    key = values.get("VITE_SUPABASE_PUBLISHABLE_KEY") or values.get("VITE_SUPABASE_ANON_KEY")
    if not key:
        raise RuntimeError("A public client key is required in .env.example")
    headers = {"apikey": key, "Authorization": "Bearer " + session["access_token"]}

    def rpc(name, body):
        response = requests.post(base + "/rpc/" + name, json=body, headers=headers, timeout=30)
        response.raise_for_status()
        return response.json()

    tenant = rpc("current_tenant_id", {})
    assert tenant == "34623237-1a3d-4926-89a2-2964cef66ab7", "Test session must belong to MerchantHaus"
    user = session["user"]["id"]
    response = requests.get(base + "/user_roles", params={"select": "role,tenant_id", "user_id": "eq." + user}, headers=headers, timeout=30)
    response.raise_for_status()
    roles = response.json()
    assert roles, "Existing user roles must remain readable"
    assert all(row["tenant_id"] == tenant for row in roles), "Existing roles must be stamped MerchantHaus"
    for row in roles:
        assert rpc("has_role", {"_user_id": user, "_role": row["role"]}) is True, "Existing roles must keep working"
        assert rpc("has_tenant_role", {"_user_id": user, "_role": row["role"], "_tenant_id": "00000000-0000-0000-0000-000000000001"}) is False, "MerchantHaus role must not grant rights in another organisation"
    assert rpc("has_tenant_role", {"_user_id": user, "_role": "admin", "_tenant_id": None}) is False, "Missing organisation must fail closed"
    print("PASS: existing MerchantHaus roles preserved; wrong/missing organisation denied")


if __name__ == "__main__":
    main()