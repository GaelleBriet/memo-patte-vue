# Format d'export des données (#80, v3 : #454, v4 : #501)

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
- Le toast propose **« Ouvrir »**, sur le téléphone seulement, pour un export CSV ou un PDF (jamais
  pour un JSON, copie de secours à réimporter, qu'aucune app n'ouvre sur beaucoup de téléphones) : le
  fichier tout juste écrit est confié à l'app par défaut (`@capawesome-team/capacitor-file-opener`,
  via le `FileProvider` de l'app), avec son type MIME explicite : `application/zip` (CSV) ou
  `application/pdf`. Quand aucune app ne sait l'ouvrir, le plugin ne le dit que par son message,
  sans code : tout rejet affiche donc un toast d'échec, « Aucune app n'a pu ouvrir ce fichier. Il
  reste dans Documents › MémoPatte. » Aucune permission de plus.
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
- **Navigateur** (`pnpm dev`) : le fichier est téléchargé, aucun plugin n'est appelé, et le toast
  n'a pas d'« Ouvrir ».

### « Partager »

- Le fichier est écrit dans le cache de l'app (`Directory.Cache`, sous-dossier `exports/`) puis
  remis par la feuille de partage Android (`@capacitor/share`, via le `FileProvider` de l'app).
  Aucune permission de stockage n'est demandée. Le `FileProvider` n'expose que deux dossiers : ce
  sous-dossier du cache, pour « Partager », et `Documents/MémoPatte/`, pour « Ouvrir »
  (`file_paths.xml`, verrouillé par `android-file-paths.spec.ts`).
- Le dossier est vidé avant chaque écriture et au lancement de l'app, jamais juste après un partage
  accepté : le partage rend la main quand MémoPatte revient au premier plan, alors que Gmail, Drive
  ou Quick Share lisent l'URI après coup — effacer tout de suite enverrait une pièce jointe vide.
  Un partage annulé ou en échec, lui, est effacé sur-le-champ : aucune appli n'a reçu l'URI.

## JSON — `memopatte-export-AAAAMMJJ-HHmm.json`

Date du nom de fichier : minute locale de l'export. Encodage UTF-8, sans BOM, indenté sur 2 espaces.

```json
{
  "schemaVersion": 4,
  "exportedAt": "2026-10-01T08:30:00.000Z",
  "appVersion": "0.1.48",
  "carnetSettings": null,
  "animals": [],
  "vaccinations": [],
  "vaccinationInjections": [],
  "treatments": [],
  "treatmentPeriods": [],
  "treatmentDoses": [],
  "weightEntries": [],
  "devices": [],
  "reminders": []
}
```

**Version 3** (#454, modèle de [`modele-de-donnees-v2.md`](modele-de-donnees-v2.md) §4.1) : le fichier
porte toutes les tables du carnet, colonne par colonne. Un vaccin est un nom, un rappel prévu et la
liste de ses injections ; un traitement est un nom et un type, ses réglages vivent sur ses
**périodes** (début, fin, fréquence, heures, posologie, moment du rappel, arrêt) et chaque ligne de
son historique (prise donnée, oubliée ou reportée) se rattache à sa période. Les réglages du carnet
voyagent avec lui. Une ligne enfant n'est exportée qu'avec son parent : une injection avec son
vaccin, une période avec son traitement, une prise avec sa période.

**Version 4** (#501, étude [`etude-modele-prises.md`](etude-modele-prises.md) §2.6 et §6) : chaque
ligne du carnet (réglages, animaux, vaccins, injections, traitements, périodes, prises, pesées) porte
en plus `createdByDevice` et `updatedByDevice`, les identifiants (UUID) de l'appareil qui l'a créée
et de celui qui a écrit sa valeur actuelle ; une période porte son jour de référence `referenceOn` ;
une prise peut valoir `"extra"` (prise en plus) ou `"shift"` (ligne de décalage) ; le fichier porte
la liste des appareils (`devices[]`). Le CSV ne reprend ni les appareils ni leurs identifiants.

| Champ           | Type                   | Sens                                                                 |
| --------------- | ---------------------- | -------------------------------------------------------------------- |
| `schemaVersion` | entier                 | Version du contrat. Toute rupture (champ retiré, renommé, sens changé) l'incrémente ; un ajout de champ optionnel ne l'incrémente pas |
| `exportedAt`    | ISO 8601 UTC           | Instant de l'export                                                  |
| `appVersion`    | texte                  | Version de l'app (`package.json`) qui a produit le fichier           |

L'import n'accepte **que la version 4** (spec Données DO-8) : un `schemaVersion` supérieur est refusé
(« Cet export vient d'une version plus récente de l'app. »), un `schemaVersion` inférieur aussi
(« Cet export vient d'une version plus ancienne de MémoPatte. Il ne peut plus être importé. »). Les formats v1 (jusqu'à la 0.1.40), v2
(jusqu'à la 0.1.48) et v3 (jusqu'à la 0.1.56) ne se relisent plus, sans conversion : l'app n'est pas publiée, les fichiers
existants ne portent que des données de test (décision du 2026-09-29).

Dates : une date civile s'écrit `AAAA-MM-JJ`, existe au calendrier et tombe entre 1900 et 2199 ; un
instant s'écrit en ISO 8601 UTC (`Z`), entre les mêmes années ; une heure s'écrit `HH:mm` sur 24 h.

### `carnetSettings`

`null` tant que rien n'a été réglé dans Paramètres (les valeurs par défaut s'appliquent : 9 h, « Me
prévenir avant l'échéance » activé). Les réglages de l'appareil (unité de poids, rappels précis,
accord aux statistiques, messages fermés) ne sont pas exportés.

| Champ                 | Type         | Notes                                           |
| --------------------- | ------------ | ----------------------------------------------- |
| `vaccineReminderTime` | `HH:mm`      | Heure de tous les rappels de vaccins            |
| `remindBeforeDue`     | booléen      | « Me prévenir avant l'échéance »                |
| `createdAt`           | ISO 8601 UTC |                                                 |
| `updatedAt`           | ISO 8601 UTC | Sert à « la modification la plus récente gagne » |

### `animals[]`

| Champ                  | Type                                           | Notes                                                  |
| ---------------------- | ---------------------------------------------- | ------------------------------------------------------ |
| `id`                   | UUID                                           | Identifiant stable, repris par les autres tables       |
| `name`                 | texte                                          | 1 à 80 caractères                                      |
| `species`              | `"dog"` \| `"cat"`                             |                                                        |
| `breed`                | texte \| `null`                                | 80 caractères au plus                                  |
| `birthDate`            | `AAAA-MM-JJ` \| `null`                         | Jamais dans le futur                                   |
| `birthDateApproximate` | booléen                                        | « Environ » : la date de naissance est une estimation  |
| `photoFileName`        | texte \| `null`                                | Nom du fichier sous `files/photos/` (ex. `<uuid>.jpg`), jamais le contenu |
| `unfollowedOn`         | `AAAA-MM-JJ` \| `null`                         | Jour du geste « Ne plus suivre » ; `null` : animal suivi |
| `departureReason`      | `"death"` \| `"rehomed"` \| `"other"` \| `null` | Motif du départ, facultatif                            |
| `departureDate`        | `AAAA-MM-JJ` \| `null`                         | Date du départ, facultative, distincte du geste        |
| `createdAt`            | ISO 8601 UTC                                   |                                                        |
| `updatedAt`            | ISO 8601 UTC                                   | Sert à « la modification la plus récente gagne »       |

Le poids saisi à la création d'un animal est sa première pesée (`weightEntries[]`) : l'animal ne
porte plus de poids initial.

### `vaccinations[]`

| Champ            | Type                   | Notes                                                             |
| ---------------- | ---------------------- | ----------------------------------------------------------------- |
| `id`             | UUID                   |                                                                   |
| `animalId`       | UUID                   | `animals[].id`                                                    |
| `name`           | texte                  | 1 à 80 caractères                                                 |
| `plannedDueDate` | `AAAA-MM-JJ` \| `null` | Rappel prévu, lu tant que le vaccin n'a aucune injection          |
| `createdAt`      | ISO 8601 UTC           |                                                                   |
| `updatedAt`      | ISO 8601 UTC           |                                                                   |

### `vaccinationInjections[]`

| Champ           | Type                   | Notes                                             |
| --------------- | ---------------------- | ------------------------------------------------- |
| `id`            | UUID                   |                                                   |
| `vaccinationId` | UUID                   | `vaccinations[].id`                               |
| `animalId`      | UUID                   | Toujours celui de son vaccin                      |
| `injectedOn`    | `AAAA-MM-JJ`           | Jamais dans le futur                              |
| `nextDueDate`   | `AAAA-MM-JJ` \| `null` | Rappel choisi ce jour-là ; `null` : pas de rappel |
| `createdAt`     | ISO 8601 UTC           |                                                   |
| `updatedAt`     | ISO 8601 UTC           |                                                   |

L'injection la plus récente (la « tête » : date, puis `createdAt`, puis `id`) fait foi pour le rappel.

### `treatments[]`

| Champ       | Type                               | Notes                       |
| ----------- | ---------------------------------- | --------------------------- |
| `id`        | UUID                               |                             |
| `animalId`  | UUID                               |                             |
| `name`      | texte                              | 1 à 80 caractères           |
| `type`      | `"deworming"` \| `"antiparasitic"` | Vermifuge / antiparasitaire |
| `createdAt` | ISO 8601 UTC                       |                             |
| `updatedAt` | ISO 8601 UTC                       |                             |

Le type `"medication"` (médicament), déjà accepté par la base, entrera dans le format avec le
formulaire qui le propose (lot 3) : un ajout de valeur, sans changement de version. D'ici là, l'import
le refuse. Un traitement a toujours au moins une période dans le fichier.

Un **traitement sans aucune prise** est valide pour le format (sa prochaine échéance est la première
échéance de sa période), mais l'app ne sait pas encore l'afficher ni lui programmer un rappel : elle
n'en exporte pas, et l'import le refuse jusqu'au lot 3, comme `"medication"`.

### `treatmentPeriods[]`

| Champ                   | Type                                                          | Notes                                                                 |
| ----------------------- | ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `id`                    | UUID                                                          |                                                                       |
| `treatmentId`           | UUID                                                          | `treatments[].id`                                                     |
| `animalId`              | UUID                                                          | Toujours celui de son traitement                                      |
| `startsOn`              | `AAAA-MM-JJ`                                                  | Début de la période                                                   |
| `firstDueOn`            | `AAAA-MM-JJ`                                                  | Première échéance de la période                                       |
| `referenceOn`           | `AAAA-MM-JJ`                                                  | Origine de la grille des échéances ; par défaut, la première échéance |
| `endsOn`                | `AAAA-MM-JJ` \| `null`                                        | Date de fin, facultative                                              |
| `stoppedOn`             | `AAAA-MM-JJ` \| `null`                                        | Date d'arrêt, `null` en cours                                         |
| `frequency`             | `{ "value": 1 à 365, "unit": "day" \| "week" \| "month" }`    |                                                                       |
| `times`                 | liste de `HH:mm`                                              | Heures de chaque jour d'échéance, sans doublon ; `[]` : sans heure    |
| `doseQuantity`          | nombre > 0 \| `null`                                          | Posologie : quantité, avec `doseUnit` ou pas du tout                  |
| `doseUnit`              | une des 11 unités \| `null`                                   | `tablet`, `capsule`, `pipette`, `collar`, `ml`, `drop`, `g`, `sachet`, `spray`, `application`, `dose` |
| `reminderOffsetMinutes` | `0` \| `15` \| `30` \| `60` \| `null`                         | Avance du rappel sur l'heure de la dose, quand il y a des heures      |
| `reminderTime`          | `HH:mm` \| `null`                                             | Heure du rappel, quand il n'y a pas d'heures                          |
| `createdAt`             | ISO 8601 UTC                                                  |                                                                       |
| `updatedAt`             | ISO 8601 UTC                                                  |                                                                       |

La période en cours d'un traitement est celle qui commence le plus tard (`startsOn`, puis `createdAt`,
puis `id`). Une reprise ou un changement de réglages après des prises ouvre une nouvelle période, sans
toucher la précédente.

### `treatmentDoses[]`

Une ligne par échéance renseignée. Une échéance sans ligne est une **dose non renseignée** : rien ne
la décrit dans le fichier.

| Champ         | Type                                     | Notes                                                                    |
| ------------- | ---------------------------------------- | ------------------------------------------------------------------------ |
| `id`          | UUID                                     |                                                                          |
| `periodId`    | UUID                                     | `treatmentPeriods[].id`, une période du même traitement                  |
| `treatmentId` | UUID                                     | `treatments[].id`                                                        |
| `animalId`    | UUID                                     | Toujours celui de son traitement                                         |
| `dueOn`       | `AAAA-MM-JJ`                             | Jour de l'échéance couverte                                              |
| `dueTime`     | `HH:mm` \| `null`                        | Heure de l'échéance ; `null` sans heure                                  |
| `givenOn`     | `AAAA-MM-JJ` \| `null`                   | Date réelle, jamais dans le futur ; `null` pour une oubliée ou un report |
| `status`      | `"given"` \| `"missed"` \| `"postponed"` \| `"extra"` \| `"shift"` | Donnée, oubliée, reportée, prise en plus, ligne de décalage |
| `nextDueDate` | `AAAA-MM-JJ`                             | Prochaine échéance fixée par la ligne ; pour un report, sa nouvelle date |
| `createdAt`   | ISO 8601 UTC                             |                                                                          |
| `updatedAt`   | ISO 8601 UTC                             |                                                                          |

`givenOn` est renseigné si et seulement si `status` vaut `"given"` ou `"extra"`. Une prise en plus
(`"extra"`, #503) est rangée sous sa date réelle : son `dueOn` vaut son `givenOn`. La dernière ligne d'un traitement
(la « tête » : `dueOn`, puis `dueTime`, puis `createdAt`, puis `id`) fait foi pour la prochaine dose.

### `weightEntries[]`

| Champ        | Type         | Notes                                         |
| ------------ | ------------ | --------------------------------------------- |
| `id`         | UUID         |                                               |
| `animalId`   | UUID         |                                               |
| `weightKg`   | nombre       | Kilogrammes, plus de 0 et 200 au plus         |
| `measuredOn` | `AAAA-MM-JJ` | Jamais dans le futur                          |
| `createdAt`  | ISO 8601 UTC |                                               |
| `updatedAt`  | ISO 8601 UTC |                                               |

### `devices[]`

Les appareils qui ont écrit dans le carnet. L'identifiant est tiré au hasard au premier lancement et
rangé dans le stockage du WebView, exclu de la sauvegarde d'Android : jamais un identifiant matériel
ni publicitaire. Nom lisible : le fabricant suivi du modèle, et la date d'installation.

| Champ         | Type                  | Notes                                                     |
| ------------- | --------------------- | --------------------------------------------------------- |
| `id`          | UUID                  | Repris par `createdByDevice` et `updatedByDevice`         |
| `model`       | texte \| `null`       | Fabricant puis modèle (« samsung SM-X710 »), 200 car. max |
| `installedAt` | ISO 8601 UTC          | Premier lancement de l'app sur cet appareil               |
| `createdAt`   | ISO 8601 UTC          |                                                           |
| `updatedAt`   | ISO 8601 UTC          |                                                           |

### `reminders[]` — dérivé, ignoré à l'import

Une ligne par prochaine échéance, triées par date : chaque vaccin dont la dernière injection a un
rappel, ou dont le rappel est prévu tant qu'il n'a aucune injection ; chaque traitement en cours, avec
la prochaine dose que fixe la dernière ligne de sa période en cours, ou la première échéance de cette
période tant qu'elle n'a aucune ligne. Un traitement arrêté, ou dont la date de fin est passée, n'y
figure pas. C'est un résumé pour qui lit le fichier ; les instants de notification ne sont pas
exportés, car ils dépendent du jour de l'import. Un import **ne lit pas** ce tableau : il reconstruit
les rappels depuis le carnet écrit.

| Champ      | Type                              |
| ---------- | --------------------------------- |
| `kind`     | `"vaccination"` \| `"treatment"`  |
| `sourceId` | UUID du vaccin ou du traitement   |
| `animalId` | UUID                              |
| `name`     | texte                             |
| `dueDate`  | `AAAA-MM-JJ`                      |

## Import — « Importer un export MémoPatte »

Code de référence : `src/features/settings/service/data-import.service.ts` (validation Zod du
fichier et écriture) et `src/shared/domain/import-plan.ts` (module pur : entrées du fichier + état local → écritures à
jouer, réutilisable par la synchronisation Plus). Les types de lignes partagés vivent dans
`src/shared/domain/carnet-data.ts`.

Un fichier d'import est une **entrée non fiable** : tout champ est validé avant la moindre écriture,
aucune valeur du fichier n'entre dans le texte d'une instruction SQL (paramètres liés seulement),
l'écriture est une seule transaction, et rien du contenu du fichier n'est journalisé (une panne
d'écriture ne journalise que le type de l'erreur).

- **Sélection du fichier** : `<input type="file">` de la WebView, que Capacitor confie au
  sélecteur de documents Android (`ACTION_GET_CONTENT`). Le fichier est lu par une permission
  temporaire accordée par le système : aucune permission de stockage, aucun plugin.
- **Validation**, avant toute écriture :
  - fichier de plus de 10 Mo (refusé sans être lu : c'est ce qui borne le nombre de lignes), pas du
    JSON, pas d'entier `schemaVersion` strictement positif, champ obligatoire absent ou mal formé →
    « Ce fichier n'est pas un export MémoPatte. » ;
  - **la version tranche avant toute validation** : `schemaVersion` supérieur à 4 → « Cet export
    vient d'une version plus récente de l'app. » ; inférieur à 4 → « Cet export vient d'une version
    plus ancienne de MémoPatte. Il ne peut plus être importé. » ; dans les deux cas, quel que soit le reste du contenu ;
  - chaque champ a son type exact (un booléen n'est pas `1`, un nombre n'est pas du texte), ses
    valeurs fermées (espèce, type, unité de fréquence, état d'une prise, motif du départ, unité de
    posologie, moment du rappel) et ses bornes : dates civiles réelles entre 1900 et 2199, instants
    ISO 8601 en UTC (`Z`) entre les mêmes années, réécrits dans la forme que l'app enregistre
    (`AAAA-MM-JJTHH:mm:ss.sssZ`) avant toute écriture, car la synchronisation compare les instants
    comme des chaînes ; heures `HH:mm`, fréquence de 1 à 365, poids de
    plus de 0 à 200 kg, date de naissance, d'injection, de prise et de pesée jamais dans le futur ;
  - **posologie** : quantité strictement positive et unité parmi les onze, toutes deux présentes ou
    toutes deux `null` ;
  - **période** : heures sans doublon, 24 au plus ; première échéance, date de fin et date d'arrêt
    jamais avant le début ;
  - **état d'une prise** : `givenOn` renseigné pour une prise donnée, `null` pour une oubliée ou un
    report ;
  - UUID pour les identifiants, noms (animal, race, vaccin, traitement) limités à 80 caractères
    comme dans les formulaires (`MAX_NAME_LENGTH`, #409), version de l'app à 200, espaces de bord retirées, race vide lue comme absente ; nom de photo
    réduit à un nom de fichier de l'app (lettres, chiffres, `_`, `-`, puis `.jpg` : ni chemin, ni
    `..`, ni autre extension) ;
  - un fichier dont le seul défaut est un poids au-delà de 200 kg ou une fréquence au-delà de 365 est
    refusé avec un motif à part, « Ce fichier contient une valeur hors limites : 200 kg maximum pour
    un poids, 365 pour une fréquence. » ; un fichier dont le seul défaut est un nom trop long,
    « Un nom de ce fichier dépasse 80 caractères. » ;
  - identifiant en double dans une table, ligne dont l'`animalId` n'est pas dans `animals[]`,
    traitement sans aucune période ou sans aucune prise dans le fichier → fichier refusé en entier (« Ce fichier n'est
    pas un export MémoPatte. ») : l'import est tout ou rien ;
  - un vaccin sans injection est valide (rappel prévu) ;
  - champs inconnus ignorés, `reminders[]` jamais lu.
- **Base locale sans animal visible** : import direct, en mode « remplacer » (rien de visible à
  perdre, et un animal supprimé avant l'import redevient visible). La ligne de Paramètres affiche
  « Import… » et reste inactive pendant l'écriture.
- **Base avec des données** : choix explicite.
  - **Fusionner** — par identifiant, ligne par ligne : une ligne absente de l'appareil est ajoutée ;
    présente des deux côtés, la version au `updatedAt` le plus récent gagne (à égalité, l'appareil
    garde la sienne), comme la synchronisation Plus. Une suppression locale est une modification :
    un animal supprimé après l'export reste supprimé, et les lignes du fichier rattachées à un
    animal qui reste supprimé ne sont pas importées. Si le fichier rend visible un animal supprimé,
    les lignes de son carnet supprimées avec lui (même `deleted_at`) reviennent depuis le fichier ;
    celles supprimées à part restent supprimées.
  - **Remplacer**, après confirmation — toutes les lignes visibles sont marquées supprimées
    (suppression logique, `deleted_at` et `updated_at` à l'heure de l'import, pour que la
    synchronisation Plus propage la suppression), puis toutes les lignes du fichier sont écrites.
- **Réglages du carnet** : une seule ligne, arbitrée comme les autres. En fusion, ceux du fichier
  sont écrits s'ils sont plus récents que ceux de l'appareil (ou si l'appareil n'en a pas) ; un
  fichier sans réglages (`null`) ne touche à rien. En remplacement, ceux du fichier sont écrits, et un
  fichier sans réglages ramène l'appareil aux valeurs par défaut.
- **Rattachement figé** : un vaccin, un traitement, une pesée ne changent jamais d'animal (décision
  du 2026-09-09), y compris par import ; une injection jamais de vaccin, une période jamais de
  traitement, une prise jamais de période ni de traitement. Fait refuser l'import en entier, sans
  rien écrire :
  - une ligne du fichier dont l'identifiant existe déjà sur l'appareil **sous un autre animal** ou
    sous un autre parent ;
  - une injection, une période ou une prise dont l'`animalId` diffère de celui de son parent (dans
    le fichier ou sur l'appareil) ;
  - une prise qui vise la période **d'un autre traitement**.

  Le motif est distinct d'une panne d'écriture — « Ce fichier rattache une entrée de ton carnet à un
  autre animal. » — pour que l'utilisateur ne réessaie pas indéfiniment. L'invariant est aussi porté
  par le SQL : `restoreStatement` laisse `animal_id` et les identifiants de parents hors du `SET` de
  son `UPDATE`.
- **Ligne sans parent** : une injection, une période ou une prise dont le vaccin, le traitement ou
  la période n'est ni dans le fichier ni sur l'appareil fait refuser l'import en entier (motif
  `orphanEvent`, message « Ce fichier n'est pas un export MémoPatte. » : l'app n'en écrit jamais).
- **Lignes enfants** : retrouvées par leur identifiant, comme les autres (la version la plus
  récente gagne). Une injection ou une période n'est écrite que si son parent est visible après
  l'import ; une prise, que si son traitement **et** sa période le sont.
- **Cascade au niveau du parent** (fusion) : un vaccin ou un traitement que le fichier rend visible
  revient avec les lignes supprimées en même temps que lui (même `deleted_at`) — celles du fichier
  à ses valeurs, les autres telles quelles ; une ligne annulée à part reste annulée. C'est la règle
  « revient avec son animal » un étage plus bas (`deletedWithItsParent`).
- **Échéance importée** : chaque ligne voyage entière, comme elle le fera dans la synchronisation
  Plus. La `nextDueDate` d'une injection ou d'une prise est reprise **telle quelle**, jamais
  recalculée, et il n'y a plus de réconciliation après l'écriture : les réglages d'une prise sont
  ceux de sa période.
- **Dates** : une ligne écrite qui n'existait pas sur l'appareil garde son `createdAt` et son
  `updatedAt` d'origine. Une ligne qui existait déjà, même supprimée, prend le `createdAt` du
  fichier, dans toutes les tables (la ligne voyage entière, comme dans la synchronisation, et deux
  appareils départagent alors la « tête » de la même façon), et l'heure de l'import comme
  `updatedAt` : la synchronisation « la plus récente gagne » ne revient ainsi jamais en arrière.
  L'appareil suit la date : une ligne nouvelle garde son `updatedByDevice`, une ligne déjà présente
  prend l'appareil qui importe ; `createdByDevice` vient toujours du fichier.
- **Appareils** : jamais effacés, même en remplacement ; un appareil absent est ajouté, un appareil
  connu n'est réécrit que si le fichier en porte une version plus récente.
- **Transaction** : chaque repository fournit ses instructions (`markAllDeletedStatement`,
  `restoreStatement`, `reviveStatement`), jouées ensemble par `animalsRepository.runImport` en une
  seule transaction, dans l'ordre des clés étrangères (réglages, animaux, vaccins, injections,
  traitements, périodes, prises, pesées). Une contrainte de la base qui casse n'écrit rien, les
  données locales restent visibles.
- **Photos** : `photoPath` reprend `photoFileName` seulement si ce fichier existe dans
  `files/photos/` et qu'aucun autre animal ne l'utilise déjà (sur l'appareil ou plus tôt dans le
  fichier) ; sinon l'animal garde la photo déjà présente sur l'appareil pour ce même identifiant,
  ou prend le placeholder. Un nom qui n'est pas celui d'une photo de l'app fait refuser le
  fichier, et `photoExists` le rejetterait de toute façon : rien n'est cherché hors de
  `files/photos/`.
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
  `treatmentName` à côté du parent d'une ligne. La fréquence d'une période s'écrit en deux colonnes,
  `frequencyValue` et `frequencyUnit` ; ses heures dans une seule cellule (`08:00, 20:00`).
- **Une ligne par injection, par période et par prise**, dans trois fichiers séparés reliés à leur
  vaccin ou traitement (décision du 2026-09-24 ; périodes : #454). `vaccins.csv` et
  `traitements.csv` gardent, pour la lecture, la date de la dernière injection ou prise donnée et la
  prochaine échéance (celle de `reminders[]` ; vide pour un traitement arrêté ou terminé).
- Booléen : `true` ou `false`.
- **Poids dans l'unité choisie dans Paramètres** (#352), au centième, nommée par le titre de
  colonne : `weightKg` en kilogrammes, `weightLb` en livres. Seule exception aux en-têtes identiques
  au JSON, qui reste toujours en kilogrammes, valeur enregistrée sans arrondi.
- Les réglages du carnet ne sont pas dans le CSV : ils voyagent dans le JSON.

| Fichier           | Colonnes                                                                                            |
| ----------------- | --------------------------------------------------------------------------------------------------- |
| `animaux.csv`     | `id;name;species;breed;birthDate;birthDateApproximate;unfollowedOn;departureReason;departureDate;createdAt;updatedAt` (sans photo) |
| `vaccins.csv`     | `id;animalId;animalName;name;plannedDueDate;lastInjectionDate;dueDate`                              |
| `injections.csv`  | `id;vaccinationId;vaccinationName;animalId;animalName;injectedOn;nextDueDate`                       |
| `traitements.csv` | `id;animalId;animalName;name;type;lastDoseDate;nextDueDate`                                         |
| `periodes.csv`    | `id;treatmentId;treatmentName;animalId;animalName;startsOn;firstDueOn;endsOn;stoppedOn;frequencyValue;frequencyUnit;times;doseQuantity;doseUnit;reminderOffsetMinutes;reminderTime` |
| `prises.csv`      | `id;periodId;treatmentId;treatmentName;animalId;animalName;dueOn;dueTime;givenOn;status;nextDueDate` |
| `poids.csv`       | `id;animalId;animalName;measuredOn;weightKg` (`weightLb` en lb)                                     |
| `rappels.csv`     | `kind;sourceId;animalId;animalName;name;dueDate`                                                    |

Les valeurs d'énumération (`dog`, `deworming`, `month`, `missed`, `tablet`…) restent les codes du
JSON, non traduits (traduction du CSV : #416).

## PDF — historique du carnet (#382)

Le PDF (MémoPatte Plus) lit les mêmes lignes que l'export (`collect`), un animal à la fois
(`src/features/settings/logic/pdf-content.ts`, rendu par `render-carnet-pdf.ts`). Son contenu n'a pas
changé avec le format v3 : il montre les prises **données**, par leur date réelle, et la date d'arrêt
de la période en cours ; les prises oubliées, les reports et les doses non renseignées y entreront
avec le lot 8. Sous la ligne de
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
