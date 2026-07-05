#!/usr/bin/env bash
# Applies every supabase/migrations/*.sql file in lexicographic order to $DATABASE_URL.
# Usage:
#   export DATABASE_URL='postgres://postgres:<pw>@db.<ref>.supabase.co:5432/postgres'
#   ./scripts/apply-migrations.sh
#
# Requires: psql on PATH.
set -euo pipefail

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

if ! command -v psql >/dev/null 2>&1; then
  echo "ERROR: psql not found on PATH. Install the Postgres client tools." >&2
  exit 1
fi

MIG_DIR="$(cd "$(dirname "$0")/.." && pwd)/supabase/migrations"
if [[ ! -d "$MIG_DIR" ]]; then
  echo "ERROR: migrations directory not found at $MIG_DIR" >&2
  exit 1
fi

shopt -s nullglob
files=( "$MIG_DIR"/*.sql )
if (( ${#files[@]} == 0 )); then
  echo "No .sql files found in $MIG_DIR" >&2
  exit 1
fi

echo "Applying ${#files[@]} migration(s) from $MIG_DIR"
for f in "${files[@]}"; do
  echo "→ $(basename "$f")"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"
done

echo "All migrations applied successfully."
