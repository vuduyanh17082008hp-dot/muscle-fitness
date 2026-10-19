#!/bin/bash
# Re-run of the ENVIRONMENT_INVALID rows (dev server killed after batch 6) on the same frozen candidate; one runner at a time.
cd "$(dirname "$0")/../harness"
echo "H1 start $(date +%T)"; CASES_FILE=./casesH1.mjs node runner.mjs ../raw/h1-LM2b.jsonl --only=I16,W11,W12,C18,C19,M07 --conc=1 >> ../raw/h1-LM2b.log 2>&1; echo "H1 done $(date +%T)"
echo "CR start $(date +%T)"; CASES_FILE=./casesCR.mjs node runner.mjs ../raw/cr-LM2b.jsonl --rep=5 --conc=1 >> ../raw/cr-LM2b.log 2>&1; echo "CR done rows=$(wc -l < ../raw/cr-LM2b.jsonl) $(date +%T)"
echo "SUP start"; CASES_FILE=./casesSUP.mjs node runner.mjs ../raw/sup-LM2b.jsonl --conc=1 >> ../raw/sup-LM2b.log 2>&1; echo "SUP done rows=$(wc -l < ../raw/sup-LM2b.jsonl) $(date +%T)"
echo ALLDONE
