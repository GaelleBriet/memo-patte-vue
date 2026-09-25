# Proposition — synchronisation Plus (épic 8)

Statut : **architecture validée le 2026-09-19** — les dix décisions de §7 sont tranchées avec Gaelle,
plus trois garde-fous d'écriture atomique corrigés en cours de revue le même jour (§2, §3.2). Aucun
code applicatif, les extraits ci-dessous illustrent : reste à démarrer l'implémentation (lots du §6).
Tickets couverts : #38 (8.1), #39 (8.2), #40 (8.3), #41 (8.4), #42 (8.5), #83 (8.6), #85 (8.7),
#89 (9.5).

Mis à jour le 2026-09-25 (#383) : les injections et les prises (historique, migration v6 de l'app,
`proposition-historique-rappels.md` §10) sont synchronisées comme deux tables de plus, et le
curseur de pull est tenu par table (§4.1).

Déjà acté, non rediscuté ici : offline-first, Supabase en région UE, « la modification la plus
récente gagne » au niveau ligne, pas de temps réel, pas de fusion champ par champ, suppression
logique par `deleted_at`, un utilisateur gratuit ne touche jamais Supabase.

Les dix décisions de §7 sont tranchées (2026-09-19) ; chacune porte la date et pointe vers son entrée
dans `docs/product/decisions-log.md`.

## 1. Modèle de données

### 1.1 SQLite

Les six tables (`animal`, `vaccination`, `vaccination_injection`, `treatment`, `treatment_dose`,
`weight_entry`) portent déjà tout le nécessaire : `id` UUID généré en local, `created_at`,
`updated_at`, `deleted_at`. **Rien à ajouter dans ces tables.** Le rattachement à l'animal est figé
(2026-09-09), donc une ligne enfant ne change jamais de parent : le pull n'a pas à gérer de
déplacement.

Deux tables de service à créer (migration v5) :

```sql
CREATE TABLE IF NOT EXISTS sync_outbox (
  entity TEXT NOT NULL, entity_id TEXT NOT NULL,
  queued_at TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (entity, entity_id)
);
CREATE TABLE IF NOT EXISTS sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  enabled INTEGER NOT NULL DEFAULT 0,
  last_pulled_at TEXT, restoring INTEGER NOT NULL DEFAULT 0
);
```

`enabled` porte le CA « sans compte, aucune entrée n'est créée » de #38. Pas de colonne
`last_error` : un message d'erreur brut peut contenir du contenu de carnet, que la conformité
interdit de journaliser.

Depuis la migration v7, le curseur de pull vit dans `sync_pull_cursor (entity, last_pulled_at)`, une
ligne par table (§4.1) ; `sync_state.last_pulled_at` n'est plus lu.

### 1.2 Le miroir Postgres

Six tables de même nom et mêmes colonnes, plus `user_id` et `server_updated_at` :

```sql
create table public.animal (
  user_id uuid not null references auth.users(id) on delete cascade,
  id uuid not null,
  -- … colonnes métier identiques à SQLite …
  created_at timestamptz not null,
  updated_at timestamptz not null,
  deleted_at timestamptz,
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);
create index on public.animal (user_id, server_updated_at);
```

Clé primaire `(user_id, id)` : deux comptes ne peuvent pas se marcher dessus, et l'index sert
directement la clause RLS. Les tables enfants ajoutent
`foreign key (user_id, animal_id) references public.animal(user_id, id) on delete cascade` — ce qui
impose l'ordre du push (animaux d'abord) et interdit une ligne orpheline côté serveur. Les
injections et les prises référencent en plus leur vaccin ou leur traitement, de la même façon.
L'échéance vit sur l'événement qui l'a fixée (`next_due_date` de l'injection ou de la prise), jamais
sur le parent : elle voyage avec sa ligne, et un « fait » est une ligne nouvelle, jamais la
modification d'une autre. Deux « fait » concurrents donnent donc deux événements, la tête se calcule
partout pareil (date, puis `created_at`, puis `id`), et un renommage concurrent se compose avec eux.

### 1.3 Horodatage : deux colonnes, deux rôles

Point technique le plus important, et il corrige la note de #39 (« pull par `updated_at` »).

| Colonne             | Horloge                        | Rôle                                         |
| ------------------- | ------------------------------ | -------------------------------------------- |
| `updated_at`        | celle de l'appareil            | Arbitre le conflit (« la plus récente gagne ») |
| `server_updated_at` | celle de Postgres, par trigger | Curseur du pull                              |

`updated_at` **doit** venir de l'appareil, sinon il n'est pas comparable à la valeur locale au moment
d'arbitrer. Mais un curseur de pull assis sur une horloge d'appareil est cassé : un téléphone en
retard de dix minutes pousse une ligne datée dans le passé, que les autres appareils ne reverront
**jamais**, leur curseur ayant déjà dépassé cette date. Le curseur vient donc d'une horloge unique.

Garde-fou contre une horloge partie en avant, dans le même trigger `before insert or update` :
tout `updated_at` à plus de 24 h dans le futur est ramené à `now()`, et `server_updated_at := now()`.
Sans ça, une ligne datée 2030 gagne pour toujours et ne peut plus jamais être modifiée.

### 1.4 RLS

Lecture par le propriétaire ; écriture par le propriétaire **et** seulement s'il a un droit Plus
actif côté serveur (#89). Aucune policy `delete` : seule la suppression logique voyage, la purge
physique reste au rôle service (suppression de compte, #87).

```sql
alter table public.animal enable row level security;

create policy animal_select on public.animal for select
  using (user_id = (select auth.uid()));

create policy animal_update on public.animal for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and public.has_active_plus());
-- idem for insert (with check seul)
```

`has_active_plus()` : fonction `stable security definer set search_path = ''` qui lit
`plus_entitlements` (#89) — `active` vrai et (`expires_at` nul ou futur). La lecture reste ouverte
après expiration, pour que la restauration marche encore pendant la durée de conservation (§7-7). Le
`(select auth.uid())` entre parenthèses n'est pas cosmétique : c'est la forme qui fait évaluer
l'appel une fois par requête au lieu d'une fois par ligne.

## 2. Résolution de conflit

**Grain : la ligne entière.** À l'application d'une ligne distante : si
`distant.updated_at > local.updated_at`, elle remplace la ligne locale en entier ; sinon on ne touche
à rien. **À égalité, l'appareil garde sa version**, comme l'import JSON
(`docs/technical/export-format.md`). Les instants sont des chaînes ISO 8601 UTC : la comparaison de
chaînes suffit, pas de parsing.

**La comparaison et l'écriture ne font qu'une seule instruction, dans les deux sens.** Une lecture en
JS suivie d'une décision puis d'une écriture séparée laisse une fenêtre où une autre écriture peut se
glisser entre les deux. Le même garde-fou s'applique au pull et au push :

```sql
-- Pull, en local (SQLite) : une ligne plus ancienne que celle déjà en base ne l'écrase pas
insert into animal (id, name, …, updated_at, deleted_at)
values (:id, :name, …, :updated_at, :deleted_at)
on conflict (id) do update set
  name = excluded.name, …, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
where excluded.updated_at > animal.updated_at;

-- Push, côté serveur (Postgres) : un appareil resté longtemps hors-ligne ne peut pas régresser
-- une ligne plus récente déjà arrivée d'un autre appareil
insert into public.animal (user_id, id, name, …, updated_at, deleted_at)
values (:user_id, :id, :name, …, :updated_at, :deleted_at)
on conflict (user_id, id) do update set
  name = excluded.name, …, updated_at = excluded.updated_at, deleted_at = excluded.deleted_at
where excluded.updated_at > public.animal.updated_at;
```

Sans le `where` du push, l'appareil resté hors-ligne écraserait silencieusement la valeur plus récente
du serveur. Les appareils qui ont déjà la bonne valeur en local s'en sortiraient au pull suivant (leur
propre comparaison la rejette), mais un appareil qui restaure pour la première fois récupérerait la
valeur régressée, sans rien en local pour la corriger. Sans le `where` du pull, une modification locale
survenue pendant l'attente réseau d'un cycle pourrait être écrasée par le lot qui arrive, construit
avant cette modification. Même schéma pour les cinq autres tables.

**Suppression contre modification : aucun cas particulier.** Une suppression *est* une modification —
elle écrit `deleted_at` **et** `updated_at`. Donc une modification postérieure à une suppression fait
réapparaître la ligne, une suppression postérieure l'emporte (§7-4).

**Cascade.** `animal-deletion.service.ts` marque déjà l'animal et tout son carnet avec le **même**
`deleted_at`. Si l'animal réapparaît, la proposition reprend la règle déjà écrite pour l'import : les
lignes portant exactement le même `deleted_at` reviennent avec lui, celles supprimées séparément
restent supprimées (§7-5).

## 3. La file d'attente locale (#38, #42)

### 3.1 Une référence par ligne, pas un journal d'opérations

`sync_outbox` ne stocke pas de charge utile, seulement « la ligne X de la table Y est à renvoyer ».
Au push, on relit la ligne courante et on l'envoie en `upsert`. Trois conséquences gratuites : trois
modifications successives du même animal ne font qu'une entrée, dont l'horodatage suit toujours la
dernière (clé primaire, §3.2) ; l'ordre entre deux modifications d'une même ligne n'existe plus, donc
ne peut pas se perdre ; rejouer une entrée est sans effet. Un journal d'opérations n'apporterait que
des états intermédiaires dont « la plus récente gagne » ne fait rien, au prix d'une compaction à
écrire.

### 3.2 Alimentation : des triggers SQLite

```sql
CREATE TRIGGER animal_outbox AFTER INSERT ON animal
WHEN (SELECT enabled FROM sync_state WHERE id = 1) = 1
BEGIN
  INSERT INTO sync_outbox (entity, entity_id, queued_at)
  VALUES ('animal', NEW.id, NEW.updated_at)
  ON CONFLICT (entity, entity_id) DO UPDATE SET queued_at = excluded.queued_at;
END;
```

(et le même en `AFTER UPDATE`, pour les six tables — douze triggers, déclarés dans
`src/core/db/migrations.ts`.)

**`DO UPDATE`, pas `DO NOTHING`.** Une ligne déjà en file qui change une deuxième fois doit avancer
`queued_at` — sinon la garde de fin d'entrée (§3.3) ne peut pas voir qu'une nouvelle modification est
arrivée pendant qu'un push était en vol, et supprimerait l'entrée après un acquittement qui ne portait
que sur l'ancienne valeur : la nouvelle resterait en local sans repartir, jusqu'à un edit ultérieur sur
cette même ligne.

Le `WHEN` fait porter à la base elle-même la garantie qu'un utilisateur gratuit ne remplit rien.
Déconnexion et expiration se traitent alors en deux instructions, sans toucher aux données :
`UPDATE sync_state SET enabled = 0` et `DELETE FROM sync_outbox`. Discussion en §7-3.

### 3.3 Cadence, réessais, ordre

- **Debounce** : 2 s après la dernière écriture, attente maximale 30 s pour qu'une longue session de
  saisie ne repousse pas le push indéfiniment.
- **Réessais** : backoff 5 s → 15 s → 1 min → 5 min → 15 min (plafond), avec gigue. `attempts` sert
  au diagnostic ; le minuteur est global, un seul cycle à la fois.
- **Sérialisation** : le patron déjà en place pour les rappels (`enqueueReminderTask` dans
  `shared/due-reminders-schedule.ts`), une promesse chaînée.
- **Ordre intra-cycle** : `animal`, `vaccination`, `vaccination_injection`, `treatment`,
  `treatment_dose`, `weight_entry` (`SYNC_ENTITY_ORDER`, au push comme au pull) — la clé étrangère
  Postgres l'impose. Par lots de 200 lignes.
- **Redémarrage** : rien à sérialiser en JS, la file est en base. Au lancement, après restauration de
  session, s'il y a un compte Plus et des entrées, on programme un cycle. C'est ce que couvre le CA
  « sérialisation de la file » de #42 : reconstruire le service sur la même base et vérifier que les
  entrées partent toujours.
- **Fin d'entrée** : on ne la supprime qu'après acquittement **et** si son `queued_at` n'a pas bougé
  depuis la lecture (§3.2) — sinon une modification survenue pendant la requête resterait en attente,
  l'entrée est gardée pour repartir au prochain cycle.

### 3.4 Le piège du ping-pong

Une ligne écrite par le pull ne doit pas retourner dans la file. Comme un lot de pull s'applique en
un seul `runMany`, il suffit d'y encadrer les écritures : `enabled = 0`, les lignes, `enabled = 1`,
le tout dans la même transaction. Le `WHEN` des triggers fait le reste.

## 4. Enchaînements

### 4.1 Un cycle (#39)

**Push, puis pull.** L'ordre n'a pas d'incidence sur le résultat (la règle est commutative), mais
pousser d'abord réduit la fenêtre pendant laquelle un autre appareil lit une version périmée.

_Push_ : réclamer les entrées → relire les lignes (tombstones compris) → `upsert` par table dans
l'ordre → retirer les entrées acquittées.

_Pull_ : pour chaque table dans le même ordre, depuis **son propre curseur**,
`select * where server_updated_at >= last_pulled_at order by server_updated_at limit 500`, paginé.
Le curseur est en `>=` et non `>` : deux lignes peuvent partager l'horodatage à la microseconde près,
et réappliquer une ligne déjà appliquée ne coûte rien puisque la règle est idempotente. Lot appliqué
en une transaction, puis le curseur de la table avance. Un curseur unique, avancé au maximum vu sur
toutes les tables, sauterait pour toujours une ligne écrite côté serveur pendant le parcours d'une table
suivante ; et un parent sauté bloquerait ensuite chacun de ses enfants sur la clé étrangère locale.
Un enfant tiré avant son parent, écrit pendant la passe, fait échouer sa page sur cette clé : rien
n'avance, et le cycle suivant tire le parent puis l'enfant. Les rappels ne sont reconstruits que si
une table de rappels a avancé son curseur, et ils le sont même si la suite du pull échoue : une ligne
passée derrière son curseur ne reviendra pas au cycle suivant.

_Déclencheurs_ : lancement (après `authStore.restore()`), retour au premier plan (`onAppResume`, déjà
là), debounce après écriture, retour du réseau, connexion réussie.

_Réseau_ : pas de plugin aujourd'hui, et `navigator.onLine` dans une WebView Android ment (portail
captif, Doze) — voir §7-8.

_Vigilance_ : le projet Supabase Free peut se mettre en pause (incident du 2026-09-14). Une erreur
réseau ou 5xx ne doit jamais vider la file ni casser l'UI, seulement repousser le cycle.

### 4.2 Envoi initial à la souscription (#83)

À la fin du parcours d'achat, compte créé et `Purchases.logIn(userId)` passé : (1)
`UPDATE sync_state SET enabled = 1` ; (2) amorcer la file avec tout l'existant, tombstones compris —
`INSERT INTO sync_outbox SELECT 'animal', id, updated_at, 0 FROM animal`, et les cinq autres, dont
`vaccination_injection` et `treatment_dose` ; (3)
le cycle normal fait le reste. Aucun chemin d'envoi séparé, donc l'idempotence demandée par #83 est
celle de l'`upsert`. Progression : entrées restantes sur total initial, l'app reste utilisable.

_Vigilance_ : le webhook RevenueCat peut arriver après le premier push. Une écriture refusée par la
RLS (403, droit pas encore actif) doit être traitée comme **réessayable**, sinon la file s'arrête
juste après l'achat.

### 4.3 Restauration à l'installation (#40)

Appareil **sans carnet visible** : pull complet, curseurs nuls, paginé. Chaque lot avance le
curseur de sa table, donc une coupure réseau reprend où elle s'est arrêtée. `sync_state.restoring`
tient l'écran de progression et survit à un redémarrage en cours de route.

Appareil **avec un carnet local** : choix explicite, jamais d'écrasement silencieux.

- **Fusionner** = amorcer la file comme en #83, puis pull complet. « La plus récente gagne » fait la
  réconciliation, exactement comme le mode « fusionner » de l'import JSON.
- **Remplacer** = effacer le carnet local, puis pull complet (§7-6). Irréversible, donc confirmation.

Point d'entrée : Paramètres → « Je suis déjà abonné ».

### 4.4 Reconstruction des notifications (#41)

**Déjà fait à 80 %.** `installRemindersSync` (`src/app/reminders-sync.ts`) appelle
`syncAllReminders()` au lancement et à chaque retour au premier plan, et la fonction compare le
programmé au voulu avant de reprogrammer — donc idempotente. Le scénario « restauration Auto Backup
Android » du ticket est couvert par le seul lancement. Les identifiants de notification sont des
empreintes déterministes d'une clé stable (`reminderNotificationId`), pas des numéros stockés en
base : rien ne devient périmé après réinstallation, contrairement à ce que craint la note de #41.

Fait depuis #39 et #383 : `syncAllReminders()` est appelé à la fin de tout pull qui a ramené une
ligne nouvelle de `animal` (le prénom est dans le texte), `vaccination`, `treatment` ou de l'une de
leurs injections ou prises (l'échéance vit sur l'événement, un « fait » reçu doit reprogrammer),
même si le pull échoue ensuite. Un pull qui ne ramène rien de nouveau ne reconstruit rien. Reste à
faire : l'appel à la fin d'une restauration, plus les tests du CA. Les cycles lointains d'un
traitement ne sont programmés que sur 60 jours / 400 rappels : cette fenêtre se remplit au lancement
et à chaque retour au premier plan (`installRemindersSync`), pas par la synchronisation.

### 4.5 Photos (#85)

Bucket `animal-photos` privé, 2 Mo par objet, `image/jpeg` (l'app ne produit que du JPEG). Les photos
passent par la même file, `entity = 'animal_photo'`, `entity_id` = nom du fichier local. Le chemin de
l'objet est à trancher (§7-9) : `animal.photo_path` contient aujourd'hui un UUID **propre à la
photo**, pas l'`animal_id` que suppose le ticket.

À la restauration : les lignes d'abord, les photos ensuite et une par une, sans bloquer l'écran —
l'app tolère déjà une photo absente (c'est le cas après un Auto Backup, qui les exclut). On ne
supprime un objet que lorsque son nom n'est plus référencé par aucune ligne locale, jamais parce
qu'un animal est passé en tombstone : il peut revenir.

RLS `storage.objects`, pour les quatre opérations :
`(storage.foldername(name))[1] = (select auth.uid())::text`, plus `has_active_plus()` en écriture.

_Vigilance_ #87 : Supabase refuse de supprimer un utilisateur propriétaire d'objets Storage. Ordre
imposé — objets du dossier, puis lignes, puis `deleteUser`.

## 5. Interaction avec l'existant

| État                             | Effet sur la synchronisation                                               |
| -------------------------------- | -------------------------------------------------------------------------- |
| `sessionState = 'restoring'`     | On attend, aucun cycle                                                      |
| `'active'`                       | Cycles normaux                                                              |
| `'needs-refresh'` (réseau)       | Cycle repoussé, **file conservée**                                          |
| `'needs-sign-in'` (jeton refusé) | Cycles arrêtés, **file et `enabled` conservés**, bandeau « reconnecte-toi » |
| `signOut()` explicite            | `enabled = 0` **et** file vidée ; les données locales ne bougent pas        |

La nuance compte : #38 dit « à la déconnexion ou à l'expiration, la file est vidée ».
`needs-sign-in` n'est ni l'un ni l'autre — l'utilisateur n'a rien demandé, vider sa file perdrait ses
modifications en silence.

**Statut Plus hors ligne** : `purchase.store.status` ramène déjà un `expiresAt` dépassé à « aucun »,
sans réseau. `enabled` se pilote donc sur `hasPlusAccount && status.plan !== 'none'` : un abonnement
qui expire pendant un séjour en zone blanche coupe la synchronisation tout seul, le carnet local
reste entier et modifiable. Une période de grâce RevenueCat reste dans `entitlements.active` et
repousse `expiresAt` : elle ne coupe rien, conformément à #89.

**Droit côté serveur** : `enabled` n'est qu'une politesse qui évite des appels inutiles. L'autorité,
c'est `has_active_plus()` dans la RLS, alimentée par le webhook (#89). Un 403 persistant après
plusieurs réessais ⇒ minuteur arrêté et « synchronisation suspendue » affiché ; le prochain
`verifyKnownStatus()` qui revient actif relance. `clearAllTables` (outil de dev) prendra les deux
nouvelles tables tout seul, il lit les migrations.

## 6. Découpage en lots

| Lot   | Contenu                                                                                                                                 | Supabase configuré ?         |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **A** | Migration v5, triggers, `core/sync/` (file, debounce, backoff, sérialisation), tests #42 — couvre #38 et #42                              | **Non**                      |
| **B** | `supabase/migrations/` : 4 tables, triggers d'horodatage, `plus_entitlements`, `has_active_plus()`, RLS, bucket + policies Storage (#85, #89) | Non (instance locale suffit) |
| **C** | Push / pull, détection réseau, déclencheurs — #39                                                                                         | Oui                          |
| **D** | Envoi initial #83, restauration #40, hook notifications #41                                                                               | Oui                          |
| **E** | Photos côté app #85, Edge Function `revenuecat-webhook` #89                                                                               | Oui                          |

A est entièrement testable en Vitest sur une base en mémoire, sans compte ni réseau : c'est le plus
gros morceau et il ne dépend de rien. B s'écrit et s'applique sur une instance locale. Les deux
peuvent démarrer tout de suite, en parallèle.

`core/sync/` ne peut pas importer les features (règle ESLint) : il définit une interface de port par
table, chaque repository l'implémente, et `main.ts` fait la composition — comme
`provideAnimalsRepository` aujourd'hui.

**Pré-requis hors code** : le projet Supabase n'a encore aucune table (#187) et sa région n'est pas
arrêtée. Paris (`eu-west-3`) plutôt que Francfort : la cible est francophone et la politique de
confidentialité doit nommer une région précise.

## 7. Décisions à trancher

1. **Deux horodatages plutôt qu'un.** _Tranché le 2026-09-19 avec Gaelle, la reco est retenue_ (détail
   des alternatives considérées dans `docs/product/decisions-log.md`). _Reco_ : garder `updated_at`
   (horloge de l'appareil, arbitre le conflit) et ajouter `server_updated_at` (horloge Postgres,
   curseur du pull). _Raison_ : un curseur
   assis sur l'horloge d'un appareil rate définitivement les lignes d'un téléphone en retard, sans
   aucun signal. _Alternative écartée_ : le `updated_at` unique que suppose la note de #39 — une
   colonne de moins, contre une perte de données silencieuse dès qu'une horloge est mal réglée.

2. **Écrêter une date future côté serveur.** _Tranché le 2026-09-19 avec Gaelle, la reco est retenue._
   _Reco_ : un trigger ramène à `now()` tout `updated_at` à
   plus de 24 h dans le futur. _Raison_ : sinon une ligne datée 2030 gagne pour toujours et
   l'utilisateur ne peut plus jamais la modifier. _Alternative écartée_ : refuser l'écriture — il
   serait bloqué sans comprendre pourquoi, et sans recours depuis l'app.

3. **Où la file se remplit.** _Tranché le 2026-09-19 avec Gaelle, la reco est retenue._ _Reco_ : des
   triggers SQLite conditionnés par `sync_state.enabled`.
   _Raison_ : aucun chemin d'écriture ne peut être oublié (cascade, import, fixtures), et le CA
   « sans compte, aucune entrée » est garanti par la base elle-même. _Alternative écartée_ : un appel
   explicite dans chaque repository — plus lisible pris isolément, mais cinq repositories, trois
   mutations chacun, plus les services, et la connaissance de la synchro se répand dans toutes les
   features. Un trigger avait été écarté le 2026-09-08 pour la cascade ; la raison d'alors (« logique
   métier invisible depuis `src/` ») ne vaut pas pour de la plomberie déclarée dans `migrations.ts`.

4. **Suppression contre modification : aucun cas particulier ?** _Tranché le 2026-09-19 avec Gaelle,
   la reco est retenue._ _Reco_ : aucun — la suppression est
   une modification, la plus récente gagne, donc une modification postérieure fait réapparaître une
   ligne supprimée sur un autre appareil. _Raison_ : une seule règle à comprendre et à tester, déjà
   celle de l'import JSON. _Alternative écartée_ : la pierre tombale l'emporte toujours — plus
   rassurant, mais une suppression faite par erreur depuis un autre appareil devient irréversible.

5. **Un animal qui réapparaît ramène-t-il son carnet ?** _Tranché le 2026-09-19 avec Gaelle, la reco
   est retenue._ _Reco_ : oui, avec la règle déjà écrite pour
   l'import — les lignes portant exactement le même `deleted_at` que l'animal reviennent avec lui,
   les autres restent supprimées. _Raison_ : import et synchronisation doivent se comporter à
   l'identique, sinon deux modèles mentaux. _Alternative écartée_ : l'animal revient vide — plus
   simple à coder, mais la cascade deviendrait une perte définitive.

6. **« Remplacer » à la restauration : effacement physique ou pierre tombale ?** _Tranché le
   2026-09-19 avec Gaelle, la reco est retenue._ _Reco_ : effacement
   physique des lignes locales, puis pull complet. _Raison_ : ces lignes n'ont jamais quitté
   l'appareil, leur pierre tombale n'a aucun destinataire et ne ferait qu'encombrer le compte.
   _Alternative écartée_ : la pierre tombale comme à l'import — cohérent avec #84, mais remplit le
   cloud de lignes mortes sans objet. Action irréversible dans les deux cas : confirmation explicite.

7. **Rétention du cloud après expiration.** _Tranché le 2026-09-19 avec Gaelle, la reco est retenue —
   confirme le point laissé « à confirmer en 11.7 » par le decisions-log du 2026-09-07._ Les deux
   documents ne disent pas la même chose : « 12 mois
   **sans sync** » (decisions-log, 2026-09-07) et « 12 mois après expiration du dernier droit Plus »
   (politique de confidentialité). _Reco_ : « 12 mois après l'expiration du dernier droit Plus, avec
   un email un mois avant » ; lecture maintenue pendant ce délai, écriture coupée dès l'expiration.
   _Raison_ : le déclencheur est vérifiable côté serveur sans dépendre d'un appareil qui se connecte,
   et il s'écrit en une phrase dans la politique. _Alternative écartée_ : « sans sync » — plus
   généreux, mais un utilisateur qui réinstalle sans se reconnecter verrait son délai courir sans le
   savoir. Vraie décision produit : la durée est affichée à l'utilisateur. (Relève de #88 / 11.7.)

8. **Ajouter `@capacitor/network` ?** _Tranché le 2026-09-19 avec Gaelle, la reco est retenue._ _Reco_ :
   oui. _Raison_ : `navigator.onLine` dans une WebView
   Android ne détecte ni portail captif ni sortie de Doze ; la reprise après retour du réseau
   dépendrait du seul backoff, soit jusqu'à quinze minutes d'attente. _Alternative écartée_ : s'en
   passer — une dépendance et un `cap sync` de moins, contre une synchronisation qui a l'air en panne
   juste après que le réseau est revenu.

9. **Chemin des photos dans le bucket.** _Tranché le 2026-09-19 avec Gaelle, la reco est retenue._
   _Reco_ : `<user_id>/<nom du fichier local>` — le nom local
   est déjà un UUID. _Raison_ : le chemin se déduit de `animal.photo_path` seul, sans colonne
   supplémentaire, et une photo remplacée est un objet différent, donc aucun cache périmé à
   invalider. _Alternative écartée_ : `<user_id>/<animal_id>.jpg`, ce que dit #85 — jamais d'objet
   orphelin, mais il faut une colonne `photo_uploaded_at` pour savoir si l'objet distant est à jour,
   et un objet écrasé peut rester affiché depuis le cache.

10. **Purger les pierres tombales ?** _Tranché le 2026-09-19 avec Gaelle, la reco est retenue._ _Reco_ :
    non, ni en local ni côté serveur, en v1. _Raison_ : le
    volume est dérisoire (quelques lignes par animal supprimé) et toute purge crée le risque qu'un
    appareil resté longtemps hors ligne ressuscite une ligne — le scénario déjà identifié le
    2026-09-08. _Alternative écartée_ : purger au-delà de 90 jours — gagne quelques kilo-octets contre
    un vrai risque de résurrection. (Ferme le « reste à définir » de `01-architecture-v2.md`.)
