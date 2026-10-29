-- La production ne donne aucun droit par défaut à service_role : le webhook RevenueCat recevait 403.
revoke all on table public.plus_entitlements from service_role;
grant select, insert, update on table public.plus_entitlements to service_role;
