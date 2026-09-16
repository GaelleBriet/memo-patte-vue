# Format d'export des données (#80)

Contrat entre l'export (Paramètres → « Exporter mes données ») et l'import (#84, section
[Import](#import--importer-un-export-mémopatte)).
Le code de référence est `src/features/settings/export-format.ts`, couvert par
`src/features/settings/__tests__/export-format.spec.ts`.

## Principes

- L'export lit **uniquement la base locale SQLite**, par les repositories : il marche hors ligne et
  ne dépend ni du compte ni de MémoPatte Plus.
- Il contient les données **visibles dans l'app** : les lignes supprimées logiquement
  (`deleted_at` renseigné) ne sont pas exportées, et la colonne `deletedAt` n'apparaît pas.
  L'export ne porte donc **aucune pierre tombale** : un import (#84) ne peut pas propager une
  suppression, une donnée absente du fichier n'est pas une donnée supprimée.
- Le fichier est écrit dans le cache de l'app (`Directory.Cache`, sous-dossier `exports/`) puis
  remis par la feuille de partage Android (`@capacitor/share`, via le `FileProvider` de l'app, qui
  n'ouvre que ce sous-dossier). Aucune permission de stockage n'est demandée.
- Le dossier est vidé avant chaque écriture et au lancement de l'app, jamais juste après un partage
  accepté : le partage rend la main quand MémoPatte revient au premier plan, alors que Gmail, Drive
  ou Quick Share lisent l'URI après coup — effacer tout de suite enverrait une pièce jointe vide.
  Un partage annulé ou en échec, lui, est effacé sur-le-champ : aucune appli n'a reçu l'URI.
- Les photos ne sont **jamais** incluses : le JSON cite leur nom de fichier, le CSV les ignore.

## JSON — `memopatte-export-AAAA-MM-JJ.json`

Date du nom de fichier : jour local de l'export. Encodage UTF-8, sans BOM, indenté sur 2 espaces.

```json
{
  "schemaVersion": 1,
  "exportedAt": "2026-09-15T08:30:00.000Z",
  "appVersion": "0.1.24",
  "animals": [],
  "vaccinations": [],
  "treatments": [],
  "weightEntries": [],
  "reminders": []
}
```

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

| Champ               | Type                   | Notes                           |
| ------------------- | ---------------------- | ------------------------------- |
| `id`                | UUID                   |                                 |
| `animalId`          | UUID                   | `animals[].id`                  |
| `name`              | texte                  |                                 |
| `lastInjectionDate` | `AAAA-MM-JJ`           |                                 |
| `dueDate`           | `AAAA-MM-JJ` \| `null` | `null` : pas de rappel          |
| `createdAt`         | ISO 8601 UTC           |                                 |
| `updatedAt`         | ISO 8601 UTC           |                                 |

### `treatments[]`

| Champ          | Type                                                      | Notes                                   |
| -------------- | --------------------------------------------------------- | --------------------------------------- |
| `id`           | UUID                                                      |                                         |
| `animalId`     | UUID                                                      |                                         |
| `name`         | texte                                                     |                                         |
| `type`         | `"deworming"` \| `"antiparasitic"`                        | Vermifuge / antiparasitaire             |
| `frequency`    | `{ "value": entier > 0, "unit": "day" \| "week" \| "month" }` |                                     |
| `lastDoseDate` | `AAAA-MM-JJ`                                              |                                         |
| `nextDueDate`  | `AAAA-MM-JJ`                                              | Stockée ; recalculable depuis la dernière prise et la fréquence |
| `createdAt`    | ISO 8601 UTC                                              |                                         |
| `updatedAt`    | ISO 8601 UTC                                              |                                         |

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

Une ligne par échéance programmée : chaque vaccin qui a une `dueDate`, chaque traitement (sa
`nextDueDate`), triés par date. C'est la donnée dont l'app reconstruit les notifications locales
(trois jours avant, le jour même, trois jours après, à 9 h) ; les instants de notification ne sont
pas exportés, car ils dépendent du jour de l'import. Un import **ne lit pas** ce tableau : il
reconstruit les rappels depuis `vaccinations` et `treatments`.

| Champ      | Type                              |
| ---------- | --------------------------------- |
| `kind`     | `"vaccination"` \| `"treatment"`  |
| `sourceId` | UUID du vaccin ou du traitement   |
| `animalId` | UUID                              |
| `name`     | texte                             |
| `dueDate`  | `AAAA-MM-JJ`                      |

## Import — « Importer un export MémoPatte »

Code de référence : `src/features/settings/data-import.service.ts` (validation Zod et écriture) et
`src/shared/import-plan.ts` (module pur : entrées du fichier + état local → écritures à jouer,
réutilisable par la synchronisation Plus). Les types de lignes partagés vivent dans
`src/shared/carnet-data.ts`.

- **Sélection du fichier** : `<input type="file">` de la WebView, que Capacitor confie au
  sélecteur de documents Android (`ACTION_GET_CONTENT`). Le fichier est lu par une permission
  temporaire accordée par le système : aucune permission de stockage, aucun plugin.
- **Validation**, avant toute écriture :
  - fichier de plus de 10 Mo (refusé sans être lu), pas du JSON, pas d'entier `schemaVersion`,
    champ obligatoire absent ou mal formé → « Ce fichier n'est pas un export MémoPatte. » ;
  - mêmes règles que les formulaires, reprises de leurs schémas : nom non vide, espèce, type et
    fréquence de traitement, poids strictement positif et de 200 kg au plus (poids initial comme
    pesée), date de naissance, de dernière injection, de dernière prise et de pesée jamais dans le
    futur ;
  - un fichier dont le seul défaut est un poids au-delà de 200 kg est refusé avec un motif à part,
    « Ce fichier contient un poids hors limites : 200 kg maximum. », pour ne pas laisser croire que
    le fichier n'est pas un export MémoPatte ;
  - UUID pour les identifiants, instants ISO 8601 en UTC (`Z`) uniquement, textes libres limités à
    200 caractères, espaces de bord retirées, race vide lue comme absente ;
  - `schemaVersion` supérieur à celui que l'app connaît → « Cet export vient d'une version plus
    récente de l'app. », vérifié avant le reste du contenu ;
  - identifiant en double dans une table, ou entrée dont l'`animalId` n'est pas dans `animals[]`
    → fichier refusé en entier (même message que le premier cas) : l'import est tout ou rien ;
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
  du 2026-09-09), y compris par import. Une entrée du fichier dont l'identifiant existe déjà sur
  l'appareil **sous un autre animal** fait refuser l'import en entier, sans rien écrire — comme un
  identifiant en double, le fichier est incohérent. Le motif est distinct d'une panne d'écriture —
  « Ce fichier rattache une entrée de ton carnet à un autre animal. » — pour que l'utilisateur ne
  réessaie pas indéfiniment. L'invariant est aussi porté par le SQL : `restoreStatement` laisse
  `animal_id` hors du `SET` de son `UPDATE`.
- **Échéance d'un traitement** : `nextDueDate` du fichier est reprise **telle quelle**, jamais
  recalculée depuis `lastDoseDate` et `frequency` — la ligne voyage entière, comme elle le fera dans
  la synchronisation Plus.
- **Dates** : une entrée écrite qui n'existait pas sur l'appareil garde son `createdAt` et son
  `updatedAt` d'origine. Une entrée qui existait déjà, même supprimée, garde le `createdAt` du
  fichier et prend l'heure de l'import comme `updatedAt` : la synchronisation « la plus récente
  gagne » ne revient ainsi jamais en arrière.
- **Transaction** : chaque repository fournit ses instructions (`markAllDeletedStatement`,
  `restoreStatement`), jouées ensemble par `animalsRepository.runImport` en une seule transaction.
  Une contrainte de la base qui casse n'écrit rien, les données locales restent visibles.
- **Photos** : `photoPath` reprend `photoFileName` seulement si ce fichier existe dans
  `files/photos/` et qu'aucun autre animal ne l'utilise déjà (sur l'appareil ou plus tôt dans le
  fichier) ; sinon l'animal garde la photo déjà présente sur l'appareil pour ce même identifiant,
  ou prend le placeholder.
- **Après l'écriture** : synchronisation complète des rappels (`syncAllReminders`, file unique des
  notifications), rechargement des animaux, puis écran d'explication des notifications si le
  carnet a des échéances et que la permission n'a jamais été demandée
  (`promptNotificationsIfReminders(router, 'settings')`) ; les autres écrans relisent la base à leur
  ouverture.

## CSV — `memopatte-export-AAAA-MM-JJ.zip`

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
  l'autre ; `animalName` est ajouté à côté de `animalId` pour la lecture.

| Fichier           | Colonnes                                                                                           |
| ----------------- | -------------------------------------------------------------------------------------------------- |
| `animaux.csv`     | `id;name;species;breed;birthDate;initialWeightKg;createdAt;updatedAt` (sans photo)                 |
| `vaccins.csv`     | `id;animalId;animalName;name;lastInjectionDate;dueDate`                                            |
| `traitements.csv` | `id;animalId;animalName;name;type;frequencyValue;frequencyUnit;lastDoseDate;nextDueDate`           |
| `poids.csv`       | `id;animalId;animalName;measuredOn;weightKg`                                                       |
| `rappels.csv`     | `kind;sourceId;animalId;animalName;name;dueDate`                                                   |

Les valeurs d'énumération (`dog`, `deworming`, `month`…) restent les codes du JSON, non traduits.
