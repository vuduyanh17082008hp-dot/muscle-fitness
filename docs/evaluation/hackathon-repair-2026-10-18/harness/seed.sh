#!/bin/sh
# usage: seed.sh <label> -> prints email; seeds a fresh demo user on the local stack
cd /c/Dev/Projects/muscle-fitness-claude
E="rep-$1-$(date +%s)@local.test"
MF_DEMO_SUPABASE_URL=http://127.0.0.1:54331 MF_DEMO_EMAIL=$E MF_DEMO_PASSWORD='Repair-Pass-2026!' timeout 300 npm run demo:seed-local > /dev/null 2>&1 || { echo "SEED_FAILED $E"; exit 1; }
echo "$1 $E" >> docs/evaluation/hackathon-repair-2026-10-18/users.txt
echo "$E"
