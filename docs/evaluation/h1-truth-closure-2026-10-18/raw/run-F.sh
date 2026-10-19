#!/bin/bash
# Sequential memory-safe batches for the frozen candidate; one runner at a time.
cd "$(dirname "$0")/../harness"
n=0
while read -r ids; do
  n=$((n+1))
  free=$(powershell -NoProfile -Command "[int]((Get-CimInstance Win32_OperatingSystem).FreePhysicalMemory/1024)" | tr -d '\r')
  echo "BATCH $n start freeMB=$free $(date +%T)"
  conc=1
  echo "BATCH $n conc=$conc"
  CASES_FILE=./casesH1.mjs node runner.mjs ../raw/h1-F.jsonl --only=$ids --conc=$conc >> ../raw/h1-F.log 2>&1
  echo "BATCH $n done rc=$? rows=$(wc -l < ../raw/h1-F.jsonl) envErr=$(grep -c RUNNER_ERROR ../raw/h1-F.log) $(date +%T)"
done < ../raw/final-batches.txt
echo "CR start $(date +%T)"; CASES_FILE=./casesCR.mjs node runner.mjs ../raw/cr-F.jsonl --rep=5 --conc=1 >> ../raw/cr-F.log 2>&1; echo "CR done rows=$(wc -l < ../raw/cr-F.jsonl) $(date +%T)"
echo "SUP start"; CASES_FILE=./casesSUP.mjs node runner.mjs ../raw/sup-F.jsonl --conc=1 >> ../raw/sup-F.log 2>&1; echo "SUP done rows=$(wc -l < ../raw/sup-F.jsonl) $(date +%T)"
echo ALLDONE
