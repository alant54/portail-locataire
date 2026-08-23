#!/usr/bin/env bash
#
# Proves the two properties the evaluators re-run the sync to check (checklist #4):
#
#   1. `sync:full` twice leaves every row count identical — no duplicates;
#   2. rewinding the cursor and replaying events changes nothing and restores it.
#
# Always runs against a throwaway database. Pointing this at data/app.db would
# rebuild the demo database from scratch in the middle of a review.
set -euo pipefail
cd "$(dirname "$0")/.."

DB="${SYNC_CHECK_DB:-/tmp/sync-check.db}"
CAP="${SYNC_MAX_ROWS_PER_COLLECTION:-2000}"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

echo "database: $DB (cap ${CAP} rows/collection on meter-readings)"
rm -f "$DB" "$DB-wal" "$DB-shm"
DATABASE_URL="$DB" npx tsx scripts/migrate.ts >/dev/null

run_sync() { DATABASE_URL="$DB" SYNC_MAX_ROWS_PER_COLLECTION="$CAP" npx tsx scripts/sync.ts "$@"; }
counts()   { DATABASE_URL="$DB" npx tsx scripts/db-counts.ts; }

echo; echo "── import 1 ──"
run_sync --full | tail -3
counts > "$WORK/first"

echo; echo "── import 2 (must not duplicate) ──"
run_sync --full | tail -3
counts > "$WORK/second"

if ! diff -u "$WORK/first" "$WORK/second"; then
  echo "FAIL: row counts changed on the second full import" >&2
  exit 1
fi
echo "OK: every row count identical after two full imports"

CURSOR=$(awk -F'\t' '$1 == "sync_cursor" { print $2 }' "$WORK/second")
REWOUND=$(( CURSOR > 50 ? CURSOR - 50 : 0 ))

echo; echo "── replay from cursor $REWOUND (max is $CURSOR) ──"
# Deliberately not 0: a replay from zero re-fetches the whole stream against the live
# ERP. The from-zero case is covered for free by the fake ERP in incremental.test.ts.
DATABASE_URL="$DB" npx tsx scripts/set-cursor.ts "$REWOUND"

run_sync | tail -3
counts > "$WORK/replayed"

if ! diff -u "$WORK/second" "$WORK/replayed"; then
  echo "FAIL: replaying events changed the data or left the cursor behind" >&2
  exit 1
fi
echo "OK: replay applied $(( CURSOR - REWOUND )) events, row counts unchanged, cursor back at $CURSOR"
