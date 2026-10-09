#!/bin/bash
# merge-pr.sh <numéro> <branche> : attend la CI, exige une branche à jour et CLEAN, merge, supprime la branche, vérifie main
P=$1; B=$2
ROOT=$(git rev-parse --path-format=absolute --git-common-dir | xargs dirname)
CHECK=$ROOT/.claude/worktrees/integ
LOG=$(mktemp)
cd "$ROOT" || exit 1
# « Verdict » ne finit qu'après tous les jobs du passage, matrices comprises : on l'attend, puis plus rien en cours.
checks() { gh pr checks "$P" --json name,bucket 2>/dev/null; true; }
until C=$(checks) && [ "$(jq '[.[]|select(.name=="Verdict" and .bucket!="pending")]|length' <<<"${C:-[]}")" = 1 ] &&
  [ "$(jq '[.[]|select(.bucket=="pending")]|length' <<<"$C")" = 0 ]; do sleep 30; done
git fetch -q origin
git merge-base --is-ancestor origin/main "origin/$B" || { echo "PR $P EN RETARD"; exit 2; }
# Un passage sauté n'est accepté que si « Verdict » est vert : lui seul sait si le saut était voulu.
BAD=$(jq -r '.[]|select(.bucket!="pass" and .bucket!="skipping")|.name' <<<"$C")
[ -z "$BAD" ] && [ "$(jq -r '.[]|select(.name=="Verdict")|.bucket' <<<"$C")" = pass ] ||
  { echo "PR $P CI NON VERTE :" $BAD; exit 3; }
for _ in 1 2 3 4 5 6; do st=$(gh pr view "$P" --json mergeStateStatus -q .mergeStateStatus); [ "$st" = CLEAN ] && break; sleep 20; done
[ "$st" = CLEAN ] || { echo "PR $P état $st"; exit 4; }
gh pr merge "$P" --merge || exit 5
[ "$(gh pr view "$P" --json state -q .state)" = MERGED ] || { echo "PR $P PAS MERGÉE"; exit 6; }
git fetch -q origin && echo "main: $(git log --oneline -1 origin/main)"
gh api -X DELETE "repos/GaelleBriet/memo-patte-vue/git/refs/heads/$B" >/dev/null && echo "branche $B supprimée"
[ -d "$CHECK" ] || git worktree add -q --detach "$CHECK" origin/main
cd "$CHECK" && git checkout -q --detach origin/main && pnpm install --frozen-lockfile >/dev/null 2>&1 &&
  pnpm lint >/dev/null 2>&1 && pnpm type-check >/dev/null 2>&1 && pnpm exec vitest run >"$LOG" 2>&1
R=$?; T=$(grep -E "Tests +[0-9]" "$LOG"); rm -f "$LOG"
[ $R -eq 0 ] && pnpm build-only >/dev/null 2>&1 && echo "MAIN OK $T" || echo "MAIN KO $T"
