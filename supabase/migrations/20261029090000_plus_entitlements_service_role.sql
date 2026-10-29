-- La production n'accorde à service_role ni lecture ni écriture sur les nouvelles tables.
revoke all on table public.plus_entitlements from service_role;
grant select, insert, update on table public.plus_entitlements to service_role;
