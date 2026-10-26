# Purge des comptes inactifs (`inactive-accounts`, #426)

Mode d'emploi de la fonction Supabase `supabase/functions/inactive-accounts/`. Elle tient ce
qu'annonce la politique de confidentialité : un compte sans accès Plus pendant 12 mois est supprimé,
après un e-mail d'avertissement ; un compte dont l'adresse n'a jamais été confirmée est supprimé au
bout de 7 jours, sans e-mail. Elle est livrée **à blanc** et **sans canal d'e-mail** : tant que
Gaelle n'a pas fait les étapes ci-dessous, elle ne fait que compter.

## Ce qu'elle fait, une fois par jour

| Compte | Étape |
| --- | --- |
| Plus fini depuis 60 jours | client RevenueCat effacé |
| Plus fini depuis 11 mois, ou adresse confirmée créée depuis 11 mois sans jamais acheter | e-mail d'avertissement, avec la date J |
| Averti, lendemain du jour J à 0 h UTC | suppression du compte, par la même `eraseAccount` que « Supprimer mon compte » |
| Adresse jamais confirmée (aucun code saisi) depuis 7 jours | suppression du compte **sans aucun e-mail**, par la même `eraseAccount` (`due.unconfirmedDeletions`, `done.unconfirmedDeletions`) ; D2 tranché par Gaelle le 2026-10-24 (alternative écartée : 12 mois), #1224 |
| Abonnement en cours (période de grâce comprise), pause Google Play avec reprise à venir, ou achat à vie | jamais rien |

- **Fin d'accès retenue** : la plus tardive de la fin de l'accès Plus et de la création du compte. Un
  achat restauré sur un nouveau compte (plus ancien que lui) ne fait jamais supprimer ce compte moins
  de 12 mois après sa création. L'e-mail cite la vraie date de fin d'accès.
- **Date J** : la plus tardive de « fin retenue + 12 mois » et « avertissement + 30 jours », arrondie
  au jour UTC suivant. La suppression ne devient possible que le **lendemain de J à 0 h UTC** : jamais
  avant le jour J, heure locale, où que la personne vive. Pour J = 16 novembre, c'est le 17 à 0 h UTC,
  soit le 16 à 16 h à Los Angeles ; la passe de 03:00 UTC supprime le compte le 17 vers 03:00 UTC. Le
  compte est donc gardé jusqu'à un jour de plus que la date annoncée par l'e-mail.
- **Adresse jamais confirmée** : due 7 × 24 h après la création, à l'instant près ; la passe de
  03:00 UTC qui suit la supprime. Créé le 25 octobre à 15 h UTC : dû le 1er novembre à 15 h, supprimé
  par la passe du 2 novembre vers 03:00 UTC. Juste avant, la fonction relit le compte : une adresse
  confirmée entre-temps annule tout (le compte suit alors la règle des 12 mois).
- **Relecture avant d'agir** : avant chaque avertissement, suppression ou effacement RevenueCat, la
  fonction relit les dates du compte puis **RevenueCat pour tout compte** (qu'il ait ou non une ligne
  `plus_entitlements` : un webhook perdu laisse un abonné sans ligne). Un accès actif, une fin plus
  tardive que la base, un droit que la base ne connaît pas ou une pause avec reprise à venir annulent
  tout. La lecture recrée le client chez RevenueCat : il est effacé aussitôt, sauf pour un compte
  qu'on supprime (`eraseAccount` l'efface).
- **Fenêtre résiduelle** : de la relecture en base à `deleteUser` passent la lecture RevenueCat,
  l'effacement PostHog, l'effacement RevenueCat et les pages de photos. Chaque appel attend au plus
  15 s : en pratique 1 à 3 s, au pire environ 45 s plus les photos. Un achat fait pendant cette
  fenêtre laisse un abonnement payé sans compte (à rembourser à la main). Elle vaut aussi pour un code
  d'inscription saisi à ce moment : compte créé le 25 octobre à 02:30 UTC, code saisi le 1er novembre
  à 03:00:10 pendant la lecture RevenueCat ou l'effacement PostHog, le compte est supprimé ; aucune
  donnée n'a pu y être écrite, la personne se réinscrit.
- Au plus 10 suppressions **tentées** par passe, réussies ou non, adresses jamais confirmées comprises :
  une panne de `deleteUser` n'efface pas chez les prestataires plus de 10 comptes dus. Les suppressions
  annoncées par e-mail passent en premier, les adresses jamais confirmées en dernier, chaque groupe par date
  de création croissante ; une suppression au-delà de la limite est sautée sans relecture et passe à
  une passe suivante. La limite compte aussi les adresses jamais confirmées : au-delà de 10
  inscriptions abandonnées par jour, leur arriéré grossit. Question laissée à Gaelle : la limite de 10
  doit-elle compter ces comptes ?
- Journal (`Edge Functions › inactive-accounts › Logs`) : une ligne « Purge des comptes inactifs : »
  suivie des nombres (`channel`, `revenuecat`, `due`, `done`, `skipped`, `failures`), jamais
  d'identifiant ni d'adresse.
- Durées et calendrier : `purge-calendar.ts` ; la liste SQL `public.inactive_account_steps` reprend
  les mêmes durées et donne la même étape aux mêmes instants (tests).
- Aucune exemption (compte de démo de la revue Play, comptes de test) : question ouverte pour Gaelle.
- Points ouverts sur les adresses jamais confirmées : suppression sans canal d'e-mail branché (aujourd'hui
  non), 7 × 24 h à l'heure près ou lendemain du 7e jour à 0 h UTC, nom de l'étape `unconfirmed-pending`
  (code et liste SQL, renommage par migration).

## Réglages (secrets de la fonction)

| Secret | Rôle |
| --- | --- |
| `SUPABASE_SECRET_KEYS` | posée par Supabase, rien à saisir : la fonction lit sa clé secrète « default » (`sb_secret_…`) et rien d'autre, jamais l'ancienne clé `service_role`. Absente, illisible ou à l'ancienne forme (JWT `eyJ…`) : tout est refusé (`503`, `server-key-not-configured`) et le journal dit « Purge des comptes inactifs refusée : … » sans citer la valeur. Même règle pour `delete-account` et `revenuecat-webhook` (#1112) |
| `INACTIVE_ACCOUNTS_CRON_SECRET` | au moins 32 caractères (`openssl rand -hex 32`) ; sans lui, tout est refusé (`503`) |
| `INACTIVE_ACCOUNTS_MODE` | absent : à blanc. `apply`, en toutes lettres, est la seule valeur qui permet d'écrire, d'envoyer ou de supprimer |
| `POSTHOG_*`, `REVENUECAT_*` | les mêmes que `delete-account` ; un réglage invalide fait refuser la passe en mode `apply`. Sans RevenueCat (`REVENUECAT_ERASURE=disabled`), la passe reste à blanc même en `apply` (`"revenuecat": "absent"` dans le rapport) |

La demande du cron ne peut jamais changer le mode : son corps n'est pas lu.

**Secrets de `revenuecat-webhook`** (même écran, `Edge Functions › Secrets`) :
`REVENUECAT_WEBHOOK_AUTHORIZATION` (au moins 32 caractères, comme le secret du cron et
`ADMIN_DELETE_SECRET` : la règle est écrite une seule fois, dans `_shared/shared-secret.ts`),
`REVENUECAT_WEBHOOK_SIGNING_SECRET` (le secret « HMAC webhook signing » de RevenueCat) et
`REVENUECAT_SECRET_KEY`. Sans l'un des deux premiers, ou avec un en-tête trop court, chaque envoi
reçoit `503` `webhook-not-configured`. Contrôles d'un envoi :
[billing-plugins-capacitor.md §4.3](billing-plugins-capacitor.md#43-avec-revenuecat).

**Canal d'e-mail** : aucun n'est branché (`NO_EMAIL_CHANNEL`). Sans canal, même en `apply`, la passe
ne fait que compter : pas d'avertissement, donc pas de suppression, ni d'effacement RevenueCat, ni
suppression d'une adresse jamais confirmée (qui n'a pourtant besoin d'aucun e-mail). Le
canal (clé d'API Brevo, décision D3) reste à décider.

**Textes** : `messages.ts`, FR et EN selon la langue de l'inscription (`locale`, anglais sinon),
expéditeur `noreply@memopatte.app`, contact cité `contact@memopatte.app`. Deux variantes : Plus fini
(« votre accès MémoPatte Plus a pris fin le … ») et compte confirmé sans achat (« votre compte
MémoPatte a été créé le … sans abonnement Plus »). Aucun texte pour une adresse jamais confirmée : elle ne reçoit jamais d'e-mail.

## Ce que Gaelle pose à la main

Jamais par une migration : la CI l'appliquerait au merge. Dans cet ordre : chaque étape a besoin
des précédentes.

1. **Extensions** : `pg_cron` et `pg_net` activées dans `Database › Extensions` (`pg_cron` aussi par
   `Integrations › Cron`). Sans `pg_net`, le
   schéma `net` n'existe pas (« schema "net" does not exist ») : ni le contrôle de l'étape 4 ni la
   passe planifiée ne peuvent appeler la fonction.
2. **Secret, à deux endroits, même valeur** (au moins 32 caractères, `openssl rand -hex 32`, rangée
   aussi dans le gestionnaire de mots de passe) :
   - `Supabase › Edge Functions › Secrets`, Key `INACTIVE_ACCOUNTS_CRON_SECRET` : sans lui, la
     fonction répond `503` `purge-not-configured` ;
   - le Vault, avec l'adresse du projet, dans `SQL Editor` :

     ```sql
     select vault.create_secret('https://<ref>.supabase.co', 'project_url');
     select vault.create_secret('<la même valeur que le secret de la fonction>', 'inactive_accounts_cron_secret');
     ```

   La façon de tirer ce secret reste à décider (#1280) : par `openssl` puis collé dans le Vault, comme
   ci-dessus, ou tiré dans le Vault puis copié dans les secrets de la fonction, pour que la valeur
   n'apparaisse jamais dans le texte d'une requête. `INACTIVE_ACCOUNTS_MODE` reste absent : la passe
   est à blanc.
3. **Déploiement**, depuis `main` à jour :
   `pnpm dlx supabase@2.119.0 functions deploy inactive-accounts --project-ref <ref> --use-api --no-verify-jwt`.
4. **Une passe à blanc lancée à la main**, avant tout planning : dans `SQL Editor`, l'appel que fera
   le cron, une seule fois ; il rend un numéro `request_id` :

   ```sql
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
   ```

   Quelques secondes plus tard, la réponse de **cet** appel (`pg_net` la garde 6 heures) :

   ```sql
   select status_code, content, error_msg from net._http_response where id = <request_id>;
   ```

   | Réponse | Ce qui manque |
   | --- | --- |
   | `200`, rapport `"mode":"dry-run"`, ligne « Purge des comptes inactifs : » dans `Edge Functions › inactive-accounts › Logs` | rien : passer à l'étape 5 |
   | `503` `purge-not-configured` | le secret de la fonction, absent ou de moins de 32 caractères. Le journal de chaque appel dit seulement « Purge refusée : INACTIVE_ACCOUNTS_CRON_SECRET n'est pas réglé » ; un secret trop court se voit à la ligne écrite au démarrage de la fonction, « Purge désactivée : INACTIVE_ACCOUNTS_CRON_SECRET doit faire au moins 32 caractères » |
   | `401` `unauthorized` | la valeur du Vault diffère de celle de la fonction |
   | `503` `server-key-not-configured` | la clé secrète Supabase (section suivante) |
   | `500` `purge-failed` | la base refuse la liste des comptes à la clé lue |
   | `404` | la fonction n'est pas déployée, ou le chemin est faux : étape 3, ou `project_url` du Vault (sans `/` final) |
   | `status_code` vide, `error_msg` rempli | l'appel n'a pas atteint la fonction : `project_url` mal écrit dans le Vault, ou délai dépassé (`timed_out` vrai) |

   `content` porte la réponse de la fonction ; `error_msg` n'est rempli que quand `pg_net` n'a pas pu
   faire l'appel, et dit pourquoi (adresse introuvable, délai…).

5. **Planning**, une fois, seulement après un `200` à l'étape 4 :

   ```sql
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
   Chaque passe se lit dans `cron.job_run_details` et dans le journal de la fonction ; sa réponse
   n'est plus dans `net._http_response` six heures après.
6. **Laisser tourner à blanc** (décision D5 : un mois proposé) et lire les nombres du journal.
7. **Passer en `apply`** : secret `INACTIVE_ACCOUNTS_MODE` = `apply`, seulement une fois le canal
   d'e-mail branché, et après deux vérifications sur le vrai projet décrites hors du dépôt, dans le
   guide d'exploitation de Gaelle : aucun compte venu d'un fournisseur (Google) sans adresse
   confirmée, et case « Auto confirm user? » cochée pour le compte de revue Play.

## Bascule vers la clé secrète Supabase (#1112)

Décision de Gaelle du 2026-10-25 : clé secrète seule, sans repli sur l'ancienne clé `service_role`.
Les trois fonctions refusent tout tant que la clé secrète n'existe pas : **la clé se crée avant le
merge et avant tout déploiement depuis `main`**. Une fonction déployée avant la clé : suppressions de
compte en échec (demandes RGPD par e-mail comprises), événements RevenueCat refusés en `503` puis perdus
à la fin des relances (le droit Plus côté serveur reste figé jusqu'à l'événement suivant), purge sans
effet. Aucun secret GitHub n'est concerné : aucun workflow ne lit la clé du serveur (la CI de la pile
locale lit la clé de la pile jetable, `auth.secret_key`), et
`Settings › Secrets and variables › Actions` n'a pas de secret `SERVICE_ROLE` (vérifié le 2026-10-25).

1. **Créer la clé secrète** (avant le merge) : `Supabase › projet MémoPatte › Settings › API Keys`,
   onglet **Publishable and secret API keys**. Si l'onglet n'affiche que le bouton **Create new API
   keys**, le toucher : Supabase crée une clé publique et une clé secrète nommées `default`. Si une clé
   secrète nommée exactement `default` existe déjà, ne rien créer. Des clés secrètes existent, mais
   aucune ne s'appelle exactement `default` : en créer une de ce nom, ou s'arrêter là. Ne copier la
   valeur nulle part : la fonction la reçoit seule.
2. **Vérifier qu'elle arrive aux fonctions** : `Edge Functions › Secrets`, la liste doit contenir
   `SUPABASE_SECRET_KEYS`. Absente : s'arrêter là, ne pas merger.
3. **Merger**, puis **déployer les trois fonctions** depuis `main` à jour :
   `pnpm dlx supabase@2.119.0 functions deploy <nom> --project-ref <ref> --use-api --no-verify-jwt`,
   pour `inactive-accounts`, `delete-account` et `revenuecat-webhook`.
4. **Contrôle de la purge** : la passe à blanc lancée à la main (étape 4 de « Ce que Gaelle pose à
   la main »). Doivent exister avant : `pg_net` activée, le secret du cron dans les secrets de la
   fonction **et** dans le Vault, avec `project_url` (étapes 1 et 2). Le planning (étape 5) n'est pas
   nécessaire : il se pose après ce contrôle, jamais avant. Attendu : `200`, `"mode":"dry-run"`.
5. **Contrôle du webhook** : doivent exister avant : les secrets `REVENUECAT_WEBHOOK_AUTHORIZATION`
   (au moins 32 caractères) et `REVENUECAT_WEBHOOK_SIGNING_SECRET` de `revenuecat-webhook` (l'un
   absent, ou l'en-tête trop court : `503` `webhook-not-configured`), et la configuration du webhook
   dans `RevenueCat › Integrations › Webhooks`, adresse
   `https://<ref>.supabase.co/functions/v1/revenuecat-webhook`, en-tête d'autorisation identique au
   secret, caractère pour caractère, et « HMAC webhook signing » activé (secret affiché une seule fois,
   collé dans `REVENUECAT_WEBHOOK_SIGNING_SECRET` ; « Rotate secret » pour le changer). Le test envoyé
   depuis RevenueCat (événement `TEST`) doit recevoir `200` `{"status":"ignored","reason":"test"}` : il
   prouve l'en-tête et la signature, pas la lecture de RevenueCat ni l'écriture en base. Une signature
   absente, fausse ou datée de plus de 5 minutes reçoit `401`. Un vrai événement d'un compte MémoPatte a en plus besoin de `REVENUECAT_SECRET_KEY` dans les secrets
   de la fonction (sans elle : `500` `processing-failed`, puis l'événement est perdu à la fin des
   relances de RevenueCat).
6. **Contrôle de `delete-account`** : ses secrets de prestataires posés (`POSTHOG_*`, `REVENUECAT_*`,
   ou `*_ERASURE=disabled`), puis un compte de test jetable, jamais un vrai compte.

   Dans les `Logs` des trois fonctions, aucune ligne « … refusée : … SUPABASE_SECRET_KEYS … ».
7. **Désactiver l'ancienne clé** (décision de Gaelle du 2026-10-25), une fois les contrôles 4, 5 et 6
   propres : `Settings › API Keys`, clés historiques `anon` et `service_role`. La désactiver, ne pas
   la supprimer : une clé historique désactivée se réactive au même endroit, une clé supprimée ne
   revient pas.

Retour arrière : redéployer le commit précédent de la fonction, tant que l'ancienne clé est active.

