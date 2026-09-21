alter table public.animal enable row level security;

create policy animal_select on public.animal for select
  using (user_id = (select auth.uid()));

create policy animal_insert on public.animal for insert
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create policy animal_update on public.animal for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_active_plus());

alter table public.vaccination enable row level security;

create policy vaccination_select on public.vaccination for select
  using (user_id = (select auth.uid()));

create policy vaccination_insert on public.vaccination for insert
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create policy vaccination_update on public.vaccination for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_active_plus());

alter table public.treatment enable row level security;

create policy treatment_select on public.treatment for select
  using (user_id = (select auth.uid()));

create policy treatment_insert on public.treatment for insert
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create policy treatment_update on public.treatment for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_active_plus());

alter table public.weight_entry enable row level security;

create policy weight_entry_select on public.weight_entry for select
  using (user_id = (select auth.uid()));

create policy weight_entry_insert on public.weight_entry for insert
  with check (user_id = (select auth.uid()) and public.has_active_plus());

create policy weight_entry_update on public.weight_entry for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_active_plus());
