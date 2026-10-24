# Purge des comptes inactifs (`inactive-accounts`, #426)

Mode d'emploi de la fonction Supabase `supabase/functions/inactive-accounts/`. Elle tient ce
qu'annonce la politique de confidentialité : un compte sans accès Plus pendant 12 mois est supprimé,
après un e-mail d'avertissement. Elle est livrée **à blanc** et **sans canal d'e-mail** : tant que
Gaelle n'a pas fait les étapes ci-dessous, elle ne fait que compter.

## Ce qu'elle fait, une fois par jour

| Compte | Étape |
| --- | --- |
| Plus fini depuis 60 jours | client RevenueCat effacé |
| Plus fini depuis 11 mois, ou créé depuis 11 mois sans jamais acheter | e-mail d'avertissement, avec la date J |
| Averti, jour J atteint | suppression du compte, par la même `eraseAccount` que « Supprimer mon compte » |
| Adresse jamais confirmée (aucun code saisi) depuis 7 jours | suppression, sans e-mail (`UNCONFIRMED_ACCOUNT_DAYS`, en attente de la confirmation de Gaelle) |
| Abonnement en cours (période de grâce comprise) ou achat à vie | jamais rien |

- Date J : la plus tardive de « fin de l'accès + 12 mois » et « avertissement + 30 jours », arrondie au
  jour UTC suivant. Un avertissement envoyé en retard ne raccourcit jamais le préavis.
- Juste avant chaque action, la fonction relit les dates du compte et, pour un compte qui a eu Plus,
  RevenueCat : une reprise de Plus (accès actif, ou fin plus tardive que celle de la base) annule tout.
- Au plus 10 suppressions par passe ; le reste passe le lendemain.
- Journal (`Edge Functions › inactive-accounts › Logs`) : une ligne « Purge des comptes inactifs : »
  suivie des nombres (`due`, `done`, `skipped`, `failures`), jamais d'identifiant ni d'adresse.
- Durées et calendrier : `purge-calendar.ts` ; la liste SQL `public.inactive_account_steps` reprend
  les mêmes durées (un test le vérifie).

## Réglages (secrets de la fonction)

| Secret | Rôle |
| --- | --- |
| `INACTIVE_ACCOUNTS_CRON_SECRET` | au moins 32 caractères (`openssl rand -hex 32`) ; sans lui, tout est refusé (`503`) |
| `INACTIVE_ACCOUNTS_MODE` | absent : à blanc. `apply`, en toutes lettres, est la seule valeur qui permet d'écrire, d'envoyer ou de supprimer |
| `POSTHOG_*`, `REVENUECAT_*` | les mêmes que `delete-account` ; un réglage invalide fait refuser la passe en mode `apply` |

La demande du cron ne peut jamais changer le mode : son corps n'est pas lu.

**Canal d'e-mail** : aucun n'est branché (`NO_EMAIL_CHANNEL`). Sans canal, même en `apply`, la passe
ne fait que compter : pas d'avertissement, donc pas de suppression, ni d'effacement RevenueCat. Le
canal (clé d'API Brevo, décision D3) reste à décider.

**Textes** : `messages.ts`, FR et EN selon la langue de l'inscription (`locale`, anglais sinon),
expéditeur `noreply@memopatte.app`, contact cité `contact@memopatte.app`. Aucun texte pour un compte
qui n'a jamais acheté Plus : ces comptes ne sont pas avertis, donc pas supprimés, tant qu'il manque.

## Ce que Gaelle pose à la main

Jamais par une migration : la CI l'appliquerait au merge.

1. **Secret** : `Supabase › Edge Functions › Secrets`, Key `INACTIVE_ACCOUNTS_CRON_SECRET`, une valeur
   tirée par `openssl rand -hex 32`, rangée aussi dans le gestionnaire de mots de passe.
2. **Déploiement**, depuis `main` à jour :
   `pnpm dlx supabase@2.119.0 functions deploy inactive-accounts --project-ref <ref> --use-api --no-verify-jwt`.
3. **Planning**, une fois, dans `SQL Editor` (extensions `pg_cron` et `pg_net` activées dans
   `Database › Extensions`) :

   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<la même valeur que le secret de la fonction>', 'inactive_accounts_cron_secret');

   select cron.schedule(
     'inactive-accounts',
     '0 3 * * *',
     $$
     select net.http_post(
       url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url')
         || '/functions/v1/inactive-accounts',
       headers := jsonb_build_object(
         'Content-Type', 'application/json',
         'x-memopatte-cron-secret',
         (select decrypted_secret from vault.decrypted_secrets where name = 'inactive_accounts_cron_secret')
       ),
       body := '{}'::jsonb,
       timeout_milliseconds := 120000
     ) as request_id;
     $$
   );
   ```

   Une fois par jour à 03:00 UTC. Pour arrêter : `select cron.unschedule('inactive-accounts');`.
4. **Laisser tourner à blanc** (décision D5 : un mois proposé) et lire les nombres du journal.
5. **Passer en `apply`** : secret `INACTIVE_ACCOUNTS_MODE` = `apply`, seulement une fois le canal
   d'e-mail branché et le texte du compte jamais acheté validé.
