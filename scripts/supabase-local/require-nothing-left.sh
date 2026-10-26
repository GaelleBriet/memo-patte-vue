#!/usr/bin/env bash
# Après les tests *.local.spec.ts sur une base remise à zéro : aucun compte ni aucune photo ne doit rester,
# sinon `supabase test db` relancé ensuite compte des lignes qui ne sont pas les siennes.
set -euo pipefail

config_toml="$(dirname "$0")/../../supabase/config.toml"
project=$(sed -n 's/^project_id = "\(.*\)"$/\1/p' "$config_toml")
container=$(docker ps --filter "label=com.supabase.cli.project=$project" --filter "name=^supabase_db_$project\$" --format '{{.Names}}')
if [ -z "$project" ] || [ "$container" != "supabase_db_$project" ]; then
  echo "Pile Supabase locale « ${project:-?} » introuvable : lancer supabase start d'abord" >&2
  exit 1
fi

left=$(docker exec "$container" psql --username=postgres --no-align --tuples-only --command \
  "select format('%s comptes, %s photos', (select count(*) from auth.users), (select count(*) from storage.objects))
   where exists (select 1 from auth.users) or exists (select 1 from storage.objects)")
if [ -n "$left" ]; then
  echo "Les tests locaux ont laissé $left sur la pile" >&2
  exit 1
fi
echo "Rien ne reste des tests locaux"
