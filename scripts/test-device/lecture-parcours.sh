#!/bin/bash
# lecture-parcours.sh <carnets> <sortie> <carnet:traitement[:animal]>... : importe chaque carnet, fige son jour, puis capture
# l'accueil, la feuille « À faire » ouverte, le Carnet, la fiche du traitement (haut, puis historique).
set -e
D=$(dirname "$0"); IN=$1; OUT=$2; shift 2
CDP="node $D/cdp.mjs"
wait() { sleep "${1:-2}"; }
open() { $CDP eval "(()=>{const n=s=>(s||'').replace(/\s+/g,' ').trim();const b=[...document.querySelectorAll('button,a,[role=button],.v-list-item')].find(e=>n(e.innerText).startsWith(\`$1\`));if(!b)return 'absent';b.click();return 'ok'})()"; }
chip() { $CDP eval "(()=>{const c=[...document.querySelectorAll('.v-chip')].find(e=>e.innerText.trim()===\`$1\`);if(!c)return 'absent';c.click();return 'ok'})()"; }
bottom() { $CDP eval "(()=>{document.scrollingElement.scrollTop=1e6;for(const e of document.querySelectorAll('*'))if(e.scrollHeight>e.clientHeight+10&&getComputedStyle(e).overflowY!=='visible')e.scrollTop=1e6;return 'ok'})()" >/dev/null; }
mkdir -p "$OUT"
for entry in "$@"; do
  IFS=: read -r name treatment animal <<< "$entry"
  "$D/import.sh" "$IN/$name.json" >/dev/null
  wait 4
  "$D/emu.sh" click "Plus tard" >/dev/null || true
  $CDP freeze "$(cat "$IN/$name.today")" >/dev/null
  "$D/emu.sh" click "Plus tard" >/dev/null || true
  wait 2
  $CDP shot "$OUT/$name-1-accueil.png"
  open "$treatment" >/dev/null; wait
  $CDP shot "$OUT/$name-2-a-faire.png"
  $CDP eval "document.activeElement?.blur();document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));'ok'" >/dev/null; wait
  "$D/emu.sh" click Carnet >/dev/null; wait
  [ -n "$animal" ] && { chip "$animal" >/dev/null; wait; }
  $CDP shot "$OUT/$name-3-carnet.png"
  open "$treatment" >/dev/null; wait
  $CDP shot "$OUT/$name-4-fiche.png"
  bottom; wait 1
  $CDP shot "$OUT/$name-5-historique.png"
  "$D/emu.sh" text > "$OUT/$name-5-historique.txt"
  echo "$name : $("$D/emu.sh" where | cut -c1-80)"
done
