#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs flow_test.sql.
# Needs a local Postgres you can reach with `psql` (e.g. PGUSER=postgres).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=porter_test_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/supabase_stub.sql
for f in migrations/*.sql; do psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f tests/flow_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f tests/referral_test.sql
