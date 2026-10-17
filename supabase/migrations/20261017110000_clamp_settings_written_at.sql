-- Écrête une date d'écriture des réglages à plus de 24h dans le futur, comme updated_at : sinon une
-- horloge déréglée gagnerait pour toujours contre « la modification la plus récente gagne ».
create function public.clamp_settings_written_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.settings_written_at > now() + interval '24 hours' then
    new.settings_written_at := now();
  end if;
  return new;
end;
$$;

revoke execute on function public.clamp_settings_written_at() from public, anon, authenticated;

create trigger treatment_period_clamp_settings_written_at
  before insert or update on public.treatment_period
  for each row
  execute function public.clamp_settings_written_at();
