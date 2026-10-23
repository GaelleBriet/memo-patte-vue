#!/usr/bin/env bash
# Active « Require current password when updating » sur la pile locale : config.toml n'a pas de clé
# pour ce réglage de GoTrue, le conteneur d'authentification est recréé avec la variable en plus.
set -euo pipefail

container=$(docker ps --filter label=com.supabase.cli.project --filter name=supabase_auth_ --format '{{.Names}}')
if [ "$(wc -l <<<"$container")" -ne 1 ] || [ -z "$container" ]; then
  echo "Une seule pile Supabase locale attendue, trouvé : ${container:-aucune}" >&2
  exit 1
fi

config=$(docker inspect "$container")
field() { jq -r "$1" <<<"$config"; }

image=$(field '.[0].Config.Image')
network=$(field '.[0].HostConfig.NetworkMode')
user=$(field '.[0].Config.User')
mapfile -d '' -t env < <(jq -j '.[0].Config.Env[] | . + "\u0000"' <<<"$config")
mapfile -d '' -t labels < <(jq -j '.[0].Config.Labels | to_entries[] | "\(.key)=\(.value)\u0000"' <<<"$config")
mapfile -d '' -t aliases < <(jq -j --arg n "$network" '.[0].NetworkSettings.Networks[$n].Aliases[]? | . + "\u0000"' <<<"$config")
mapfile -d '' -t hosts < <(jq -j '.[0].HostConfig.ExtraHosts[]? | . + "\u0000"' <<<"$config")
mapfile -d '' -t cmd < <(jq -j '.[0].Config.Cmd[]? | . + "\u0000"' <<<"$config")

args=(--detach --name "$container" --network "$network" --restart unless-stopped)
[ -n "$user" ] && args+=(--user "$user")
if [ "$(field '.[0].Config.Healthcheck.Test[0] // ""')" = CMD-SHELL ]; then
  args+=(--health-cmd "$(field '.[0].Config.Healthcheck.Test[1]')"
    --health-interval "$(($(field '.[0].Config.Healthcheck.Interval') / 1000000))ms"
    --health-timeout "$(($(field '.[0].Config.Healthcheck.Timeout') / 1000000))ms"
    --health-retries "$(field '.[0].Config.Healthcheck.Retries')")
fi
for value in "${env[@]}"; do
  [[ "$value" == GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=* ]] || args+=(--env "$value")
done
args+=(--env GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true)
for value in "${labels[@]}"; do args+=(--label "$value"); done
for value in "${aliases[@]}"; do args+=(--network-alias "$value"); done
for value in "${hosts[@]}"; do args+=(--add-host "$value"); done

docker rm --force "$container" >/dev/null
docker run "${args[@]}" "$image" "${cmd[@]}" >/dev/null

for _ in $(seq 1 60); do
  if docker exec "$container" wget --quiet --tries=1 --spider http://127.0.0.1:9999/health 2>/dev/null; then
    echo "GoTrue relancé avec GOTRUE_SECURITY_UPDATE_PASSWORD_REQUIRE_CURRENT_PASSWORD=true"
    exit 0
  fi
  sleep 1
done
echo "GoTrue ne répond pas après sa relance" >&2
docker logs --tail 30 "$container" >&2
exit 1
