#!/bin/bash
# Pilote MémoPatte Dev par la WebView (jamais par adb shell input) : voir .claude/rules/outils-de-test.md
D=$(dirname "$0")
FIND="const n=s=>(s||'').replace(/\s+/g,' ').trim();const q=n(\`$2\`)"
case "$1" in
  click) node "$D/cdp.mjs" eval "(()=>{$FIND;const b=[...document.querySelectorAll('button,a,[role=button],.v-list-item')].find(e=>n(e.innerText)===q||n(e.getAttribute('aria-label'))===q);if(!b)return 'absent';b.click();return 'ok'})()" ;;
  where) node "$D/cdp.mjs" eval "location.pathname+' :: '+[...document.querySelectorAll('button,a,[role=button]')].map(b=>(b.innerText.trim()||b.getAttribute('aria-label')||'').replace(/\s+/g,' ')).filter(Boolean).join(' | ')" ;;
  text) node "$D/cdp.mjs" eval "document.querySelector('main, .v-main, body').innerText" ;;
  rect) node "$D/cdp.mjs" eval "(()=>{$FIND;const a=r=>r.width*r.height;const m=[...document.querySelectorAll('button,a,[role=button],.v-list-item,.settings-row')].filter(e=>n(e.innerText).startsWith(q)||n(e.getAttribute('aria-label'))===q).map(e=>e.getBoundingClientRect()).filter(r=>r.width>0).sort((x,y)=>a(x)-a(y));return m.length?[m[0].x,m[0].y,m[0].width,m[0].height].map(Math.round).join(' '):'absent'})()" | tr -d '"' ;;
  date) node "$D/cdp.mjs" eval "(()=>{const i=document.querySelector('$2');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'$3');i.dispatchEvent(new Event('input',{bubbles:true}));i.dispatchEvent(new Event('change',{bubbles:true}));return i.value})()" ;;
  *) echo "usage : emu.sh click <texte> | where | text | rect <texte> | date <sélecteur> <AAAA-MM-JJ>" >&2; exit 1 ;;
esac
