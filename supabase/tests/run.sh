#!/usr/bin/env bash
# Applies the migrations to a throwaway local Postgres database and runs flow_test.sql.
# Needs a local Postgres you can reach with `psql` (e.g. PGUSER=postgres).
set -euo pipefail
cd "$(dirname "$0")/.."
DB=porter_test_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f tests/supabase_stub.sql
# 0001-0014 first: flow_test and referral_test describe the rules before 0015 (business-plan referrals).
for f in migrations/00{0,1}[0-9]_*.sql; do case "$f" in migrations/0015*|migrations/0016*) continue;; esac; psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$f"; done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f tests/flow_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f tests/referral_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f migrations/0015_referral_plan.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f tests/referral_plan_test.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f migrations/0016_referral_flows.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -o /dev/null -f tests/referral_flows_test.sql
