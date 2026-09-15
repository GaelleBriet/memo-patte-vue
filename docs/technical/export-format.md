# Format d'export des données (#80)

Contrat entre l'export (Paramètres → « Exporter mes données ») et le futur import (#84).
Le code de référence est `src/features/settings/export-format.ts`, couvert par
`src/features/settings/__tests__/export-format.spec.ts`.

## Principes

- L'export lit **uniquement la base locale SQLite**, par les repositories : il marche hors ligne et
  ne dépend ni du compte ni de MémoPatte Plus.
- Il contient les données **visibles dans l'app** : les lignes supprimées logiquement
  (`deleted_at` renseigné) ne sont pas exportées, et la colonne `deletedAt` n'apparaît pas.
- Le fichier est écrit dans le cache de l'app (`Directory.Cache`, sous-dossier `exports/`, vidé à
  chaque export) puis remis par la feuille de partage Android (`@capacitor/share`, via le
  `FileProvider` de l'app). Aucune permission de stockage n'est demandée.
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
| `schemaVersion` | entier                 | Version du contrat. Toute rupture (champ retiré, renommé, sens changé) l'incrémente ; un ajout optionnel non |
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

## CSV — `memopatte-export-AAAA-MM-JJ.zip`

Archive zip d'un fichier par table, pour un tableur. **Pas prévu pour l'import** : seul le JSON
se réimporte.

- Encodage UTF-8 **avec BOM**, fins de ligne CRLF, séparateur `;` (ouverture directe dans Excel ou
  LibreOffice en français).
- Un champ qui contient `;`, `"` ou un retour à la ligne est entouré de `"`, les `"` intérieurs
  doublés (RFC 4180).
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
