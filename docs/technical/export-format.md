# Format d'export des données (#80)

Contrat entre l'export (Paramètres → « Exporter mes données ») et l'import (#84, section
[Import](#import--importer-un-export-mémopatte)).
Le code de référence est `src/features/settings/logic/export-format.ts`, couvert par
`src/features/settings/__tests__/export-format.spec.ts` ; la remise du fichier vit dans
`src/features/settings/logic/export-delivery.ts` et `export-storage-access.ts`.

## Principes

- L'export lit **uniquement la base locale SQLite**, par les repositories : il marche hors ligne et
  ne dépend ni du compte ni de MémoPatte Plus.
- Il contient les données **visibles dans l'app** : les lignes supprimées logiquement
  (`deleted_at` renseigné) ne sont pas exportées, et la colonne `deletedAt` n'apparaît pas.
  L'export ne porte donc **aucune pierre tombale** : un import (#84) ne peut pas propager une
  suppression, une donnée absente du fichier n'est pas une donnée supprimée.
- Les photos ne sont **jamais** incluses : le JSON cite leur nom de fichier, le CSV les ignore.

## Remise du fichier : enregistrer ou partager

Les feuilles d'export (JSON et CSV depuis Paramètres, PDF depuis le Carnet ou Paramètres) proposent
deux actions. Le fichier est le même, seul son chemin change.

**Noms de fichier** : minute locale du téléphone, sur 24 h, au format `AAAAMMJJ-HHmm`, identique
dans toutes les langues (décision de Gaelle du 2026-09-23).

| Export | Nom                                                                  |
| ------ | -------------------------------------------------------------------- |
| JSON   | `memopatte-export-20260923-1432.json`                                |
| CSV    | `memopatte-export-20260923-1432.zip`                                 |
| PDF    | `carnet-milo-20260923-1432.pdf` (anglais : `health-record-milo-…`)   |

Pour le PDF, le premier mot vient de la clé `settings.pdf.fileNamePrefix` et le nom de l'animal est
simplifié : minuscules ASCII, accents retirés, tout autre caractère remplacé par `-`, sans tiret
doublé ni en bord. Un nom qui ne donne aucun caractère (un emoji seul) est omis :
`carnet-20260923-1432.pdf`. La feuille PDF affiche le nom qui sera écrit : l'export est daté de
l'ouverture de la feuille.

### « Enregistrer sur le téléphone » (action principale)

- Écriture directe dans le dossier public **Documents**, sous-dossier `MémoPatte/`
  (`Directory.Documents` de `@capacitor/filesystem`), sans fenêtre de choix. Le système indexe le
  fichier : il apparaît dans l'app Fichiers. Un toast dit où il se trouve
  (« Export JSON enregistré dans Documents › MémoPatte »), 4 s.
- Le fichier garde son nom. Un export n'écrase **jamais** un fichier existant : si le nom est déjà
  pris (deux exports dans la même minute), il prend un numéro, `memopatte-export-20260923-1432 (1).json`.
  Seul le « fichier introuvable » du plugin (`OS-PLUG-FILE-0008`) rend un nom libre : toute autre
  erreur de `stat` fait échouer l'export sans rien écrire ni effacer.
- Une panne d'écriture (disque plein…) fait échouer l'export au premier essai, avec le message
  d'erreur de la feuille ; le fichier entamé est effacé. Sauf si l'accès au stockage manque : sur
  Android 10 et moins, y toucher rouvrirait la demande d'Android.
- **Android 11 et plus** : aucune permission, l'app n'accède qu'aux fichiers qu'elle crée.
- **Android 7 à 10** : `READ_EXTERNAL_STORAGE` et `WRITE_EXTERNAL_STORAGE`, déclarées avec
  `android:maxSdkVersion="29"` (alias `publicStorage` du plugin), demandées au premier
  enregistrement, jamais au lancement. Sur Android 10, `android:requestLegacyExternalStorage="true"`
  est ce qui ouvre le dossier Documents à l'app. `pnpm test:manifest` vérifie le `maxSdkVersion` dans
  le manifest fusionné.
  - Refus (Android redemandera, état `prompt-with-rationale` de Capacitor) : la feuille l'explique,
    « Enregistrer » redemande l'accès, « Partager » reste disponible.
  - Refus définitif (« Ne plus demander », état `denied`) : « Enregistrer » devient indisponible et un
    lien ouvre la fiche de l'app dans les réglages Android (`capacitor-native-settings`). Au retour au
    premier plan, l'accès est relu : accordé, la feuille redevient normale.
  - La feuille lit l'accès à chaque ouverture, sans jamais afficher la demande d'Android.
- **Navigateur** (`pnpm dev`) : le fichier est téléchargé, aucun plugin n'est appelé.

### « Partager »

- Le fichier est écrit dans le cache de l'app (`Directory.Cache`, sous-dossier `exports/`) puis
  remis par la feuille de partage Android (`@capacitor/share`, via le `FileProvider` de l'app, qui
  n'ouvre que ce sous-dossier). Aucune permission de stockage n'est demandée.
- Le dossier est vidé avant chaque écriture et au lancement de l'app, jamais juste après un partage
  accepté : le partage rend la main quand MémoPatte revient au premier plan, alors que Gmail, Drive
  ou Quick Share lisent l'URI après coup — effacer tout de suite enverrait une pièce jointe vide.
  Un partage annulé ou en échec, lui, est effacé sur-le-champ : aucune appli n'a reçu l'URI.

## JSON — `memopatte-export-AAAAMMJJ-HHmm.json`

Date du nom de fichier : minute locale de l'export. Encodage UTF-8, sans BOM, indenté sur 2 espaces.

```json
{
  "schemaVersion": 2,
  "exportedAt": "2026-09-25T08:30:00.000Z",
  "appVersion": "0.1.41",
  "animals": [],
  "vaccinations": [],
  "vaccinationInjections": [],
  "treatments": [],
  "treatmentDoses": [],
  "weightEntries": [],
  "reminders": []
}
```

**Version 2** (#382, modèle de `docs/technical/proposition-historique-rappels.md` §10) : un vaccin
est un nom et la liste de ses injections, un traitement un plan et la liste de ses prises. Chaque
injection ou prise porte la prochaine échéance qu'elle a fixée ; la plus récente (la « tête » : date,
puis `createdAt`, puis `id`) fait foi. Les parents ne répètent ni la dernière date ni l'échéance,
portées par leurs événements. Un événement n'est exporté qu'avec son parent.

| Champ           | Type                   | Sens                                                                 |
| --------------- | ---------------------- | -------------------------------------------------------------------- |
| `schemaVersion` | entier                 | Version du contrat. Toute rupture (champ retiré, renommé, sens changé) l'incrémente ; un ajout de champ optionnel ne l'incrémente pas |
| `exportedAt`    | ISO 8601 UTC           | Instant de l'export                                                  |
| `appVersion`    | texte                  | Version de l'app (`package.json`) qui a produit le fichier           |

Un import doit refuser un `schemaVersion` supérieur à celui qu'il connaît (« Cet export vient
d'une version plus récente de l'app »).

### `animals[]`

| Champ             | Type                 | Notes                                                  |
| ----------------- | -------------------- | ------------------------------------------------------ |
| `id`              | UUID                 | Identifiant stable, repris par les autres tables       |
| `name`            | texte                |                                                        |
| `species`         | `"dog"` \| `"cat"`   |                                                        |
| `breed`           | texte \| `null`      |                                                        |
| `birthDate`       | `AAAA-MM-JJ` \| `null` | Date civile                                          |
| `initialWeightKg` | nombre \| `null`     | Kilogrammes                                            |
| `photoFileName`   | texte \| `null`      | Nom du fichier sous `files/photos/` (ex. `<uuid>.jpg`), jamais le contenu |
| `createdAt`       | ISO 8601 UTC         |                                                        |
| `updatedAt`       | ISO 8601 UTC         | Sert à « la modification la plus récente gagne »       |

### `vaccinations[]`

| Champ       | Type         | Notes          |
| ----------- | ------------ | -------------- |
| `id`        | UUID         |                |
| `animalId`  | UUID         | `animals[].id` |
| `name`      | texte        |                |
| `createdAt` | ISO 8601 UTC |                |
| `updatedAt` | ISO 8601 UTC |                |

### `vaccinationInjections[]`

| Champ           | Type                   | Notes                                             |
| --------------- | ---------------------- | ------------------------------------------------- |
| `id`            | UUID                   |                                                   |
| `vaccinationId` | UUID                   | `vaccinations[].id`                               |
| `animalId`      | UUID                   | Toujours celui de son vaccin                      |
| `injectedOn`    | `AAAA-MM-JJ`           |                                                   |
| `nextDueDate`   | `AAAA-MM-JJ` \| `null` | Rappel choisi ce jour-là ; `null` : pas de rappel |
| `createdAt`     | ISO 8601 UTC           |                                                   |
| `updatedAt`     | ISO 8601 UTC           |                                                   |

### `treatments[]`

| Champ       | Type                                                          | Notes                         |
| ----------- | ------------------------------------------------------------- | ----------------------------- |
| `id`        | UUID                                                          |                               |
| `animalId`  | UUID                                                          |                               |
| `name`      | texte                                                         |                               |
| `type`      | `"deworming"` \| `"antiparasitic"`                            | Vermifuge / antiparasitaire   |
| `frequency` | `{ "value": entier > 0, "unit": "day" \| "week" \| "month" }` | Fréquence du plan             |
| `stoppedOn` | `AAAA-MM-JJ` \| `null`                                        | Date d'arrêt, `null` en cours |
| `createdAt` | ISO 8601 UTC                                                  |                               |
| `updatedAt` | ISO 8601 UTC                                                  |                               |

### `treatmentDoses[]`

| Champ         | Type                                    | Notes                                                     |
| ------------- | --------------------------------------- | --------------------------------------------------------- |
| `id`          | UUID                                    |                                                           |
| `treatmentId` | UUID                                    | `treatments[].id`                                         |
| `animalId`    | UUID                                    | Toujours celui de son traitement                          |
| `givenOn`     | `AAAA-MM-JJ`                            |                                                           |
| `nextDueDate` | `AAAA-MM-JJ`                            | Prochaine dose fixée ce jour-là, stockée (report compris) |
| `frequency`   | même forme que `treatments[].frequency` | Fréquence avec laquelle `nextDueDate` a été calculée      |
| `createdAt`   | ISO 8601 UTC                            |                                                           |
| `updatedAt`   | ISO 8601 UTC                            |                                                           |

### `weightEntries[]`

| Champ        | Type         | Notes       |
| ------------ | ------------ | ----------- |
| `id`         | UUID         |             |
| `animalId`   | UUID         |             |
| `weightKg`   | nombre       | Kilogrammes |
| `measuredOn` | `AAAA-MM-JJ` |             |
| `createdAt`  | ISO 8601 UTC |             |
| `updatedAt`  | ISO 8601 UTC |             |

### `reminders[]` — dérivé, ignoré à l'import

Une ligne par échéance programmée, lue sur la tête de chaque parent : chaque vaccin dont la
dernière injection a un rappel, chaque traitement en cours (la prochaine dose de sa dernière prise ;
un traitement arrêté n'a plus de rappel), triés par date. C'est la donnée dont l'app reconstruit les
notifications locales (trois jours avant, le jour même, trois jours après, à 9 h) ; les instants de
notification ne sont pas exportés, car ils dépendent du jour de l'import. Un import **ne lit pas** ce
tableau : il reconstruit les rappels depuis les injections et les prises.

### Version 1 (jusqu'à la 0.1.40) — toujours importable

Un export v1 ne porte que la tête de chaque vaccin et traitement, sur la ligne du parent :
`vaccinations[]` avec `lastInjectionDate` et `dueDate`, `treatments[]` avec `lastDoseDate`,
`nextDueDate` et `stoppedOn` (optionnel, ajouté par #380 ; absent = en cours), sans
`vaccinationInjections` ni `treatmentDoses`. Son schéma de lecture est **figé**
(`src/features/settings/schema/export-v1.schema.ts`) : il ne suit plus les formulaires, pour qu'un
ancien fichier se relise toujours comme sa version l'écrivait. Il est testé sur un vrai export de la
0.1.37 (`src/features/settings/__tests__/fixtures/export-v1-0.1.37.json`).

| Champ      | Type                              |
| ---------- | --------------------------------- |
| `kind`     | `"vaccination"` \| `"treatment"`  |
| `sourceId` | UUID du vaccin ou du traitement   |
| `animalId` | UUID                              |
| `name`     | texte                             |
| `dueDate`  | `AAAA-MM-JJ`                      |

## Import — « Importer un export MémoPatte »

Code de référence : `src/features/settings/service/data-import.service.ts` (validation Zod et
écriture), `src/features/settings/logic/export-v1.ts` (adaptateur v1) et
`src/shared/domain/import-plan.ts` (module pur : entrées du fichier + état local → écritures à
jouer, réutilisable par la synchronisation Plus). Les types de lignes partagés vivent dans
`src/shared/domain/carnet-data.ts`.

- **Sélection du fichier** : `<input type="file">` de la WebView, que Capacitor confie au
  sélecteur de documents Android (`ACTION_GET_CONTENT`). Le fichier est lu par une permission
  temporaire accordée par le système : aucune permission de stockage, aucun plugin.
- **Validation**, avant toute écriture :
  - fichier de plus de 10 Mo (refusé sans être lu), pas du JSON, pas d'entier `schemaVersion`,
    champ obligatoire absent ou mal formé → « Ce fichier n'est pas un export MémoPatte. » ;
  - **aiguillage par version avant toute validation** : `schemaVersion` 1 se lit avec le schéma v1
    figé, puis passe par l'adaptateur v1 ; 2 avec le schéma courant ;
  - v2 : mêmes règles que les formulaires, reprises de leurs schémas : nom non vide, espèce, type et
    fréquence de traitement, poids strictement positif et de 200 kg au plus (poids initial comme
    pesée), date de naissance, d'injection, de prise et de pesée jamais dans le futur ; v1 : les
    mêmes règles, recopiées telles qu'elles étaient ;
  - un fichier dont le seul défaut est un poids au-delà de 200 kg est refusé avec un motif à part,
    « Ce fichier contient un poids hors limites : 200 kg maximum. », pour ne pas laisser croire que
    le fichier n'est pas un export MémoPatte ;
  - UUID pour les identifiants, instants ISO 8601 en UTC (`Z`) uniquement, textes libres limités à
    200 caractères, espaces de bord retirées, race vide lue comme absente ;
  - `schemaVersion` supérieur à celui que l'app connaît → « Cet export vient d'une version plus
    récente de l'app. », vérifié avant le reste du contenu ;
  - identifiant en double dans une table, entrée (événements compris) dont l'`animalId` n'est
    pas dans `animals[]`, ou vaccin ou traitement v2 sans aucun événement dans le fichier (l'app
    n'en exporte jamais, et il ne s'afficherait pas) → fichier refusé en entier (même message que
    le premier cas) : l'import est tout ou rien ;
  - champs inconnus ignorés, `reminders[]` jamais lu.
- **Base locale sans animal visible** : import direct, en mode « remplacer » (rien de visible à
  perdre, et un animal supprimé avant l'import redevient visible). La ligne de Paramètres affiche
  « Import… » et reste inactive pendant l'écriture.
- **Base avec des données** : choix explicite.
  - **Fusionner** — par identifiant : une entrée absente de l'appareil est ajoutée ; présente des
    deux côtés, la version au `updatedAt` le plus récent gagne (à égalité, l'appareil garde la
    sienne), comme la synchronisation Plus. Une suppression locale est une modification : un animal
    supprimé après l'export reste supprimé, et les entrées du fichier rattachées à un animal qui
    reste supprimé ne sont pas importées. Si le fichier rend visible un animal supprimé, les
    entrées de son carnet supprimées avec lui (même `deleted_at`) reviennent depuis le fichier ;
    celles supprimées à part restent supprimées.
  - **Remplacer**, après confirmation — toutes les lignes visibles sont marquées supprimées
    (suppression logique, `deleted_at` et `updated_at` à l'heure de l'import, pour que la
    synchronisation Plus propage la suppression), puis toutes les entrées du fichier sont écrites.
- **Rattachement figé** : un vaccin, un traitement, une pesée ne changent jamais d'animal (décision
  du 2026-09-09), y compris par import ; une injection ou une prise jamais de vaccin ou de
  traitement. Une entrée du fichier dont l'identifiant existe déjà sur l'appareil **sous un autre
  animal** (ou, pour un événement v2, sous un autre parent), ou un événement dont l'`animalId`
  diffère de celui de son parent (dans le fichier ou sur l'appareil), fait refuser l'import en
  entier, sans rien écrire — comme un identifiant en double, le fichier est incohérent. Le motif est
  distinct d'une panne d'écriture — « Ce fichier rattache une entrée de ton carnet à un autre
  animal. » — pour que l'utilisateur ne réessaie pas indéfiniment. L'invariant est aussi porté par
  le SQL : `restoreStatement` laisse `animal_id` (et le parent d'un événement) hors du `SET` de son
  `UPDATE`.
- **Événement sans parent** : une injection ou une prise dont le vaccin ou le traitement n'est ni
  dans le fichier ni sur l'appareil fait refuser l'import en entier (motif `orphanEvent`, message
  « Ce fichier n'est pas un export MémoPatte. » : l'app n'en écrit jamais).
- **Événements, v2** : retrouvés par leur identifiant, comme les autres entrées (la version la plus
  récente gagne) ; un événement plus récent dans le fichier y prend aussi sa date. Un événement
  n'est écrit que si son parent est visible après l'import.
- **Événements, v1** (adaptateur, décision du 2026-09-24) : chaque ligne v1 donne un événement, qui
  se rattache à l'événement local **de même date** (supprimés compris : un visible d'abord, puis un
  supprimé en même temps que son parent, puis le plus récent), jamais par son identifiant ; ses
  valeurs ne sont écrites que si le fichier est plus récent ou si l'événement avait été supprimé
  avec son parent. Date absente : un événement est créé, avec l'identifiant du parent s'il est
  libre, sinon un nouveau. Seul un parent que l'import écrit reçoit son événement. Réimporter deux
  fois le même fichier ne duplique rien et aucune date déjà en base n'est réécrite. Une prise v1
  recopie la fréquence de son traitement.
- **Cascade au niveau du parent** (fusion) : un vaccin ou un traitement que le fichier rend visible
  revient avec les événements supprimés en même temps que lui (même `deleted_at`) — ceux du fichier
  à ses valeurs, les autres tels quels ; un événement annulé à part reste annulé. C'est la règle
  « revient avec son animal » un étage plus bas (`deletedWithItsParent`).
- **Échéance importée** : la `nextDueDate` d'une injection ou d'une prise est reprise **telle
  quelle**, jamais recalculée — la ligne voyage entière, comme elle le fera dans la synchronisation
  Plus. Seule exception, la réconciliation ci-dessous.
- **Réconciliation des prises à fréquence périmée** (§10.7 de la spec, jouée dans la transaction de
  l'import, après toutes les écritures) : pour chaque traitement en cours, si la fréquence recopiée
  sur sa prise de tête diffère de celle du plan (fréquence changée sur un appareil pendant qu'un
  autre notait une prise), la prochaine dose est recalculée depuis la date de cette prise avec la
  fréquence du plan, qui y est recopiée, et `updatedAt` prend l'heure de l'import. Une prise de tête
  déjà à la fréquence du plan n'est jamais touchée : c'est ce qui protège un report manuel. Le calcul
  est fait en SQL (`reconcileStaleHeadsStatement`), vérifié identique à `addFrequency` (fins de
  mois, années bissextiles).
- **Dates** : une entrée écrite qui n'existait pas sur l'appareil garde son `createdAt` et son
  `updatedAt` d'origine. Une entrée qui existait déjà, même supprimée, garde le `createdAt` du
  fichier et prend l'heure de l'import comme `updatedAt` : la synchronisation « la plus récente
  gagne » ne revient ainsi jamais en arrière.
- **Transaction** : chaque repository fournit ses instructions (`markAllDeletedStatement`,
  `restoreStatement`, `reviveStatement`, `reconcileStaleHeadsStatement`), jouées ensemble par
  `animalsRepository.runImport` en une seule transaction, dans l'ordre des clés étrangères (animaux,
  vaccins, injections, traitements, prises, pesées, puis réconciliation). En mode « Remplacer »,
  les deux tables d'événements sont marquées supprimées comme les autres. Une contrainte de la base
  qui casse n'écrit rien, les données locales restent visibles.
- **Photos** : `photoPath` reprend `photoFileName` seulement si ce fichier existe dans
  `files/photos/` et qu'aucun autre animal ne l'utilise déjà (sur l'appareil ou plus tôt dans le
  fichier) ; sinon l'animal garde la photo déjà présente sur l'appareil pour ce même identifiant,
  ou prend le placeholder.
- **Après l'écriture** : synchronisation complète des rappels (`syncAllReminders`, file unique des
  notifications), rechargement des animaux, puis écran d'explication des notifications si le
  carnet a des échéances et que la permission n'a jamais été demandée
  (`promptNotificationsIfReminders(router, 'settings')`) ; les autres écrans relisent la base à leur
  ouverture.

## CSV — `memopatte-export-AAAAMMJJ-HHmm.zip`

Archive zip d'un fichier par table, pour un tableur. **Pas prévu pour l'import** : seul le JSON
se réimporte.

- Encodage UTF-8 **avec BOM**, fins de ligne CRLF, séparateur `;` (ouverture directe dans Excel ou
  LibreOffice en français).
- Un champ qui contient `;`, `"` ou un retour à la ligne est entouré de `"`, les `"` intérieurs
  doublés (RFC 4180).
- **Injection de formule neutralisée** (recommandation OWASP « CSV Injection ») : une cellule texte
  qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est préfixée par `'`
  (ex. `'=HYPERLINK(…)`), pour qu'un tableur l'affiche au lieu de l'exécuter. Les nombres et les
  dates ne sont jamais préfixés, et le JSON garde la valeur d'origine.
- Valeur absente : cellule vide. Dates civiles `AAAA-MM-JJ`, instants ISO 8601 UTC.
- Nombres décimaux avec une **virgule** (`4,25`), lisibles comme nombres par un tableur français.
- En-têtes identiques aux noms de champs du JSON, pour qu'une colonne se retrouve d'un format à
  l'autre ; `animalName` est ajouté à côté de `animalId` pour la lecture, comme `vaccinationName` et
  `treatmentName` à côté du parent d'un événement.
- **Une ligne par injection et par prise**, dans deux fichiers séparés reliés à leur vaccin ou
  traitement (décision du 2026-09-24). `vaccins.csv` et `traitements.csv` gardent, pour la lecture,
  la date et l'échéance de la dernière injection ou prise.
- **Poids dans l'unité choisie dans Paramètres** (#352), au centième, nommée par le titre de
  colonne : `initialWeightKg` et `weightKg` en kilogrammes, `initialWeightLb` et `weightLb` en
  livres. Seules exceptions aux en-têtes identiques au JSON, qui reste toujours en kilogrammes,
  valeur enregistrée sans arrondi.

| Fichier           | Colonnes                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `animaux.csv`     | `id;name;species;breed;birthDate;initialWeightKg;createdAt;updatedAt` (sans photo ; `…Lb` en lb)    |
| `vaccins.csv`     | `id;animalId;animalName;name;lastInjectionDate;dueDate`                                             |
| `injections.csv`  | `id;vaccinationId;vaccinationName;animalId;animalName;injectedOn;nextDueDate`                       |
| `traitements.csv` | `id;animalId;animalName;name;type;frequencyValue;frequencyUnit;lastDoseDate;nextDueDate`            |
| `prises.csv`      | `id;treatmentId;treatmentName;animalId;animalName;givenOn;nextDueDate;frequencyValue;frequencyUnit` |
| `poids.csv`       | `id;animalId;animalName;measuredOn;weightKg` (`weightLb` en lb)                                     |
| `rappels.csv`     | `kind;sourceId;animalId;animalName;name;dueDate`                                                    |

Les valeurs d'énumération (`dog`, `deworming`, `month`…) restent les codes du JSON, non traduits.

## PDF — historique du carnet (#382)

Le PDF (MémoPatte Plus) lit les mêmes lignes que l'export (`collect`), un animal à la fois
(`src/features/settings/logic/pdf-content.ts`, rendu par `render-carnet-pdf.ts`). Sous la ligne de
chaque vaccin ou traitement (nom, échéance, état), en retrait, en 9 pt gris, sur la même page que
sa ligne :

- **Vaccin** : `Injections : 27/05/2025 · 30/05/2022 · 02/06/2021`, toutes les injections, la plus
  récente d'abord, **jamais regroupées** ; une longue liste passe à la ligne.
- **Traitement** : `Dernière prise : 15/08/2026` toujours à part, puis `Prises précédentes : …`, par
  séries, la plus récente d'abord (décision du 2026-09-24) :
  - une série s'arrête quand l'écart entre deux prises dépasse 1,5 fois la fréquence de la première
    des deux (celle avec laquelle la suivante était attendue) ;
  - jusqu'à trois prises, leurs dates sont listées (`07/05/2026`) ; au-delà, la série se résume en
    `11 prises du 15/09/2025 au 15/07/2026`.
