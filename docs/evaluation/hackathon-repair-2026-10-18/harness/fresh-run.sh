#!/bin/sh
# usage: fresh-run.sh <label> <script> [mobile]  — restart the dev server, seed a user, run one journey, stop the server.
SP="C:/Users/DUYANH~1/AppData/Local/Temp/claude/C--Dev-Projects-muscle-fitness-claude/27527542-dc79-4a0f-b65b-b0175ad6e670/scratchpad"
cd /c/Dev/Projects/muscle-fitness-claude
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { \$_.Name -eq 'node.exe' -and \$_.CommandLine -like '*muscle-fitness-claude*next*' } | ForEach-Object { Stop-Process -Id \$_.ProcessId -Force -ErrorAction SilentlyContinue }" >/dev/null 2>&1
sleep 2 2>/dev/null || powershell -NoProfile -Command "Start-Sleep 2"
npm run dev > "$SP/dev-$1.log" 2>&1 &
for i in $(seq 1 60); do curl -s -o /dev/null --max-time 5 http://localhost:3000/login && break; powershell -NoProfile -Command "Start-Sleep 2"; done
for p in /login /dashboard /dashboard/recovery /dashboard/nutrition /dashboard/ai-coach; do curl -s -o /dev/null --max-time 240 "http://localhost:3000$p"; done
E=$(sh "$SP/seed.sh" "$1") || exit 1
cd docs/evaluation/hackathon-repair-2026-10-18/harness
EMAIL=$E PW='Repair-Pass-2026!' PROFILE="$1" timeout 1200 node step.mjs journeys/day "$1" "$2" $3 > /dev/null 2>&1
echo "done $1 $E"
