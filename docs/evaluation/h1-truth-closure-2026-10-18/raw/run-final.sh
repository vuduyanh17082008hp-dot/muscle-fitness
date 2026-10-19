#!/bin/bash
# Sequential memory-safe batches for the frozen candidate; one runner at a time.
cd "$(dirname "$0")/../harness"
n=0
while read -r ids; do
  n=$((n+1))
  free=$(powershell -NoProfile -Command "[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)" | tr -d '\r')
  echo "BATCH $n start freeMB=$free $(date +%T)"
  conc=2; [ "$free" -lt 800 ] && conc=1
  echo "BATCH $n conc=$conc"
  CASES_FILE=./casesH1.mjs node runner.mjs ../raw/h1-A.jsonl --only=$ids --conc=$conc >> ../raw/h1-A.log 2>&1
  echo "BATCH $n done rc=$? rows=$(wc -l < ../raw/h1-A.jsonl) envErr=$(grep -c RUNNER_ERROR ../raw/h1-A.log) $(date +%T)"
done < ../raw/final-batches.txt
echo ALLDONE
