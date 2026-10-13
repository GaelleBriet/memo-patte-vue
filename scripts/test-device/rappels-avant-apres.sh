#!/bin/bash
# rappels-avant-apres.sh <dossier des carnets> <apk> <sortie> : pour chaque carnet de
# rappels-avant-apres.spec.ts, importe dans MémoPatte Dev, donne la permission, relance l'app (qui
# reprogramme tout au démarrage) et relève les alarmes (`dumpsys alarm`) et les rappels en attente.
set -e
: "${ANDROID_SERIAL:?}"
D=$(dirname "$0"); APP=com.gaellebriet.memopatte.dev
CARNETS=$1; APK=$2; OUT=$3
mkdir -p "$OUT"
adb install -r "$APK" >/dev/null
for FILE in "$CARNETS"/graine-*.json "$CARNETS"/dix-carnets.json; do
  NAME=$(basename "$FILE" .json)
  "$D/import.sh" "$FILE" >/dev/null
  sleep 4
  adb shell pm grant $APP android.permission.POST_NOTIFICATIONS
  adb shell am force-stop $APP
  adb shell am start -n $APP/com.gaellebriet.memopatte.MainActivity >/dev/null
  sleep 12
  adb forward tcp:${CDP_PORT:-9340} localabstract:webview_devtools_remote_$(adb shell pidof $APP | tr -d '\r') >/dev/null
  node "$D/cdp.mjs" eval "window.Capacitor.Plugins.LocalNotifications.getPending().then(({notifications})=>notifications.map(n=>[n.extra&&n.extra.key,n.schedule&&n.schedule.at,n.body&&n.body.includes('ouvre MémoPatte')]).sort())" > "$OUT/$NAME.pending.json"
  adb shell dumpsys alarm | grep -oE "origWhen [0-9]+ whenElapsed [0-9]+ $APP\}" | awk '{print $2}' | sort -n > "$OUT/$NAME.alarms.txt" || true
  echo "$NAME : $(grep -c '"' "$OUT/$NAME.pending.json") lignes en attente, $(wc -l < "$OUT/$NAME.alarms.txt") alarmes"
done
