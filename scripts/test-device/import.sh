#!/bin/bash
# import.sh <export.json> : vide MémoPatte Dev, la relance, refuse les statistiques et importe le fichier
set -e
D=$(dirname "$0"); APP=com.gaellebriet.memopatte.dev
adb shell pm clear $APP >/dev/null
adb shell am start -n $APP/com.gaellebriet.memopatte.MainActivity >/dev/null
sleep 7
adb forward tcp:${CDP_PORT:-9340} localabstract:webview_devtools_remote_$(adb shell pidof $APP | tr -d '\r') >/dev/null
"$D/emu.sh" click Refuser >/dev/null || "$D/emu.sh" click Decline >/dev/null
sleep 2
B64=$(base64 -w0 "$1")
node "$D/cdp.mjs" eval "(()=>{const i=document.querySelector('input[type=file]');const bin=atob('$B64');const u=Uint8Array.from(bin,c=>c.charCodeAt(0));const dt=new DataTransfer();dt.items.add(new File([u],'export.json',{type:'application/json'}));i.files=dt.files;i.dispatchEvent(new Event('change',{bubbles:true}));return 'importé'})()"
