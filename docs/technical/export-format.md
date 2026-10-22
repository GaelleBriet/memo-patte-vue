# Format d'export des données (#80, v3 : #454, v4 : #501, v5 : #754, v6 : #825 et #836, v7 : #867, v8 : #873, v9 : #939, v10 : décision 1 du 19 octobre 2026, v1 et v2 relus : #469)

Contrat entre l'export (Paramètres → « Exporter mes données ») et l'import (#84, section
[Import](#import--importer-un-export-mémopatte)).
Le code de référence est `src/features/settings/logic/export-format.ts`, couvert par
`src/features/settings/__tests__/export-format.spec.ts` ; la remise du fichier vit dans
`src/features/settings/service/export-delivery.service.ts` et `export-storage-access.service.ts`.

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
- **Android 10** : `READ_EXTERNAL_STORAGE` et `WRITE_EXTERNAL_STORAGE`, déclarées avec
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
  "schemaVersion": 10,
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

**Version 5** (#754, schéma v12, [`moteur-doses-v2-plan.md`](moteur-doses-v2-plan.md) §3) : une colonne
par sens. Une période porte l'origine de sa grille `gridOriginOn` à la place de `referenceOn`, `null`
quand elle hérite celle du réglage précédent (R3) ; une ligne porte son jour d'arrivée `targetOn` à la
place de `nextDueDate`, renseigné pour un report (jour d'arrivée) et une ligne de décalage (jour
d'ancrage) seulement, `null` pour une prise.

**Version 6** (#825 et #836, schéma v13, [`modele-de-donnees-v2.md`](modele-de-donnees-v2.md) §4.3) :
une période porte deux faits, `firstDueChosen` (première dose choisie par la personne, pas proposée
par l'app) et `pastDosesStayUnlogged` (réponse « Elles restent à renseigner » à la question Q38).

**Version 7** (#867, schéma v14, [`modele-de-donnees-v2.md`](modele-de-donnees-v2.md) §4.4) : une
période porte `settingsWrittenAt`, la dernière écriture de ce qui fait son calendrier (R10).

**Version 8** (#873, schéma v15, [`modele-de-donnees-v2.md`](modele-de-donnees-v2.md) §4.5) : une
période porte `fallenDosesAnswer`, la réponse à la question Q38 des doses tombées, à la place du
booléen `pastDosesStayUnlogged` : `"unasked"` (aucune question posée), `"stay-unlogged"` (« Elles
restent à renseigner ») ou `"not-due"` (« Elles n'étaient pas à donner ») ; une prise peut valoir
`"not-due"` (dose déclarée pas à donner par cette réponse, #873).

**Version 9** (#939, schéma v16, [`modele-de-donnees-v2.md`](modele-de-donnees-v2.md) §4.6) : une
ligne de report porte `previousTargetOn` et `previousTargetTime`, le jour et l'heure de son arrivée
d'avant quand la dose a été déplacée de nouveau, et `dueRank`, le rang (à partir de 1) de son heure
dans sa journée d'origine ; `null` pour toute autre ligne, ou quand ils sont inconnus.

**Version 10** (schéma v17, [`modele-de-donnees-v2.md`](modele-de-donnees-v2.md) §4.7) : une période
porte `gridWrittenAt`, la dernière écriture de ce qui fait ses échéances (première échéance,
fréquence, origine, fin), les heures exclues. L'import ne refuse jamais un fichier pour elle : une
date postérieure de plus de 24 h à `exportedAt` devient `exportedAt`, une date antérieure à la
création du traitement devient ce `createdAt` (une période qui hérite de la grille de la précédente
porte une date plus ancienne qu'elle-même) ; seule une valeur illisible refuse le fichier. Elle porte
aussi `gridBefore`, la grille que le moteur lisait juste avant son ouverture par « Modifier »
(`{ frequency, endsOn, writtenAt, runs: [[premier jour, dernier jour ou null], …] }` : suites triées
et disjointes, chacune sur la grille de son premier jour, seule la dernière sans fin ; `writtenAt`, la
date de grille de la période remplacée, s'écrête comme `gridWrittenAt`), ou `null`. Une valeur
absente, illisible, incohérente ou trop longue se lit `null`, sans refuser le fichier.

| Champ           | Type                   | Sens                                                                 |
| --------------- | ---------------------- | -------------------------------------------------------------------- |
| `schemaVersion` | entier                 | Version du contrat. Toute rupture (champ retiré, renommé, sens changé) l'incrémente ; un ajout de champ optionnel ne l'incrémente pas |
| `exportedAt`    | ISO 8601 UTC           | Instant de l'export                                                  |
| `appVersion`    | texte                  | Version de l'app (`package.json`) qui a produit le fichier           |

L'import relit les versions **3, 4, 5, 6, 7, 8, 9 et 10** (plan du moteur v2 §3.3) : un fichier v3 à v9
est converti au format v10 avant toute autre étape. `referenceOn` devient `gridOriginOn` par la règle de la migration
v12 (`gridOriginsOf`, `src/shared/domain/dose-calendar/legacy-input.ts`) : `null` quand la période suit
sans arrêt une période de même fréquence et de même `referenceOn`, sinon `referenceOn` s'il est sur la
grille qui passe par `firstDueOn`, sinon `firstDueOn` ; `nextDueDate` devient `targetOn` pour un report
et un décalage, `null` pour une prise. Un fichier v3, qui n'a ni appareils ni `referenceOn`, est signé
par l'appareil qui importe (`createdByDevice`, `updatedByDevice`) et part de `referenceOn` = `firstDueOn`.
Un fichier v3, v4 ou v5 reçoit ensuite les deux faits par la règle de la migration v13
(`legacyFactsOf`) : `firstDueChosen` vaut `true` quand `gridOriginOn` est posée, sinon `false` ;
`pastDosesStayUnlogged` vaut `false`. Un fichier v3 à v6 reçoit enfin `settingsWrittenAt` par la règle
de la migration v14 : la date de création de la période (`createdAt`), que le moteur lit comme un
réglage jamais réécrit. Un fichier v3 à v7 reçoit enfin `fallenDosesAnswer` par la règle de la
migration v15 : `"stay-unlogged"` quand `pastDosesStayUnlogged` vaut `true`, sinon `"unasked"`, jamais
`"not-due"` (le booléen ne distinguait pas cette réponse d'aucune question : rien n'est retiré après
coup). Un fichier v3 à v8 reçoit enfin, sur chaque ligne, `previousTargetOn`, `previousTargetTime` et
`dueRank` vides (`null`) : arrivée d'avant et rang inconnus. Un fichier v3 à v9 reçoit enfin
`gridWrittenAt` par la règle de la migration v17 : la valeur de `settingsWrittenAt`, et `gridBefore`
vide (`null`).
Un `schemaVersion` supérieur est refusé (« Cet export vient d'une version plus récente de l'app. »).
Les formats v1 (jusqu'à la 0.1.40) et v2 (jusqu'à la 0.1.48) se relisent aussi (#469, décision du
2026-10-21) : voir [Anciens formats v1 et v2](#anciens-formats-v1-et-v2--conversion-469). La lecture de
chaque format publié reste : un fichier de chaque version vit dans
`src/features/settings/__tests__/fixtures/` (v1 de la 0.1.37, v2 de la 0.1.48, v3, v4).

### Anciens formats v1 et v2 : conversion (#469)

Un fichier v1 ou v2 est d'abord validé par son propre schéma (`legacy-export-file.schema.ts`), aussi
strict que l'import de la 0.1.48 qui le relisait et borné comme aujourd'hui (noms à 80 caractères,
poids à 200 kg, fréquence à 365, dates entre 1900 et 2199 et jamais dans le futur, identifiants
uniques, chaque ligne rattachée à un animal du fichier, chaque injection à un vaccin du fichier et
chaque prise à un traitement du fichier, chaque vaccin avec une injection et chaque traitement avec
une prise). Il est ensuite converti, puis validé une seconde fois par le schéma du format courant :
tout ou rien, avec les mêmes messages.

- **v1 → v2**, comme l'import de la 0.1.48 : la ligne d'un vaccin donne son injection (dernière
  injection, rappel), la ligne d'un traitement sa prise (dernière prise, prochaine dose), chacune à
  l'identifiant de son parent.
- **Animaux** : suivis, sans date approximative ni départ ; le poids à l'arrivée (`initialWeightKg`)
  devient une pesée datée du jour de création de l'animal (heure du téléphone qui importe), à
  l'identifiant de l'animal (modèle v2, M7).
- **Vaccins** : sans rappel prévu (`plannedDueDate` vide) ; les injections telles quelles.
- **Traitements** : une seule période, à l'identifiant du traitement, à sa fréquence actuelle, sans
  heure, sans posologie, sans date de fin ; elle commence à la première prise (ou à l'arrêt, s'il est
  plus tôt) et garde la date d'arrêt. Elle passe ensuite par les conversions v3 à v10 ci-dessus.
- **Prises**, rejouées par le moteur des doses dans l'ordre des dates réelles : l'app de l'époque
  notait la dose du moment et refixait la suite (prochaine dose = date réelle + fréquence, ou une date
  choisie à la main). Chaque prise rejoue « C'est fait » sur la première échéance encore à donner, à sa
  date réelle, avec « Décaler aussi les doses suivantes » quand le moteur le propose ; quand la
  prochaine dose qu'il en tire n'est pas celle que l'app annonçait, une ligne de décalage de la même
  journée ancre la suite pour la retrouver. Une seconde prise du même jour devient, par la règle du
  moteur, une prise en plus. Chaque prise garde son identifiant ; une ligne de décalage prend un UUID
  tiré de celui de sa prise (`derivedId`), toujours le même : réimporter le même fichier ne duplique
  rien.
- **Ce que la conversion ne garde pas** : la fréquence propre à chaque prise v2 (celle en vigueur ce
  jour-là) : la période prend la fréquence actuelle du traitement, et la prochaine dose annoncée reste
  juste par la ligne de décalage.
- **Limite connue**, mesurée sur 3 000 carnets simulés de la 0.1.48 : une prochaine dose choisie à la
  main un 29, 30 ou 31 qu'aucun rythme mensuel ne peut atteindre depuis le jour de la prise (un mois
  plus court en chemin) est annoncée au plus près, un jour plus tôt (2 carnets sur 3 000). Les autres
  annoncent la même prochaine dose qu'à l'époque, sans dose à renseigner avant elle.
- Une prise que le moteur ne saurait pas placer refuse le fichier entier (« Ce fichier n'est pas un
  export MémoPatte. ») ; aucun export de la 0.1.37 ou de la 0.1.48 n'en produit.

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
| `gridOriginOn`          | `AAAA-MM-JJ` \| `null`                                        | Origine de la grille (R2) ; `null` : celle du réglage précédent (R3)  |
| `firstDueChosen`        | booléen                                                       | Première dose choisie par la personne (R9), pas proposée par l'app    |
| `fallenDosesAnswer`     | `"unasked"` \| `"stay-unlogged"` \| `"not-due"`                | Réponse à la question Q38 (R10, #873) : aucune question, « Elles restent à renseigner », « Elles n'étaient pas à donner » |
| `settingsWrittenAt`     | ISO 8601 UTC                                                  | Dernière écriture du calendrier (R10, #867) ; `createdAt` sinon       |
| `gridWrittenAt`         | ISO 8601 UTC                                                  | Dernière écriture des échéances, heures exclues (v10) ; héritée de la période précédente qui avait la même grille |
| `gridBefore`            | objet \| `null`                                              | Grille d'avant l'ouverture par « Modifier » (v10) ; `null` : aucune |
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
| `status`      | `"given"` \| `"missed"` \| `"postponed"` \| `"extra"` \| `"shift"` \| `"not-due"` | Donnée, oubliée, reportée, prise en plus, ligne de décalage, pas à donner (v8, #873) |
| `targetOn`    | `AAAA-MM-JJ` \| `null`                   | Report : jour d'arrivée ; décalage : jour d'ancrage ; `null` pour une prise |
| `previousTargetOn` | `AAAA-MM-JJ` \| `null`              | Report déplacé de nouveau : jour de son arrivée d'avant (v9) ; `null` sinon |
| `previousTargetTime` | `HH:mm` \| `null`                  | Report déplacé de nouveau : heure de son arrivée d'avant (v9) ; `null` sinon |
| `dueRank`     | entier ≥ 1 \| `null`                     | Report : rang de son heure dans sa journée d'origine (v9) ; `null` : inconnu |
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
la dose du moment que donne le moteur d'échéances au jour de l'export (la dose en retard, celle du
jour ou la prochaine ; heures, date de fin, reports et décalages compris). Un traitement arrêté ou
terminé n'y figure pas, ni un traitement que le moteur ne sait pas relire (donnée illisible). C'est un résumé pour qui lit le fichier ; les instants de notification ne sont pas
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

Code de référence : `src/features/settings/schema/export-file.schema.ts` (validation Zod du
fichier), `src/features/settings/service/data-import.service.ts` (écriture) et `src/shared/domain/import-plan.ts` (module pur : entrées du fichier + état local → écritures à
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
  - **la version tranche avant toute validation** : `schemaVersion` supérieur au format courant →
    « Cet export vient d'une version plus récente de l'app. », quel que soit le reste du contenu ; de 1
    à 9, le fichier est validé dans son format puis converti ;
  - **relu par le moteur** (Q40) : après conversion, chaque traitement du fichier est relu par le
    moteur des doses ; un traitement qu'il ne sait pas lire refuse tout le fichier, avec le message
    d'un fichier invalide, et rien n'est écrit ;
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
  Plus. La `nextDueDate` d'une injection et le `targetOn` d'une ligne sont repris **tels quels**, jamais
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

- Encodage UTF-8 **avec BOM**, fins de ligne CRLF (ouverture directe dans Excel ou LibreOffice).
- **Langue de l'app** (#416) : titres de colonnes, valeurs codées (espèce, motif de départ, type de
  traitement, unité de fréquence, posologie, état d'une prise, type de rappel, booléens « Oui » /
  « Non ») et nombres suivent la langue de l'app au moment de l'export, selon le glossaire
  (`docs/product/glossaire-fr-en.md`). En français : séparateur `;` et virgule décimale (`4,25`).
  En anglais : séparateur `,` et point décimal (`4.25`). Les titres vivent dans `settings.csv.columns`
  des fichiers de langue ; le JSON, lui, garde ses noms de champs et ses codes (`dog`, `deworming`,
  `missed`…) et reste la seule porte d'import.
- Un champ qui contient le séparateur de la langue, `"` ou un retour à la ligne est entouré de `"`,
  les `"` intérieurs doublés (RFC 4180).
- **Injection de formule neutralisée** (recommandation OWASP « CSV Injection ») : une cellule texte
  qui commence par `=`, `+`, `-`, `@`, une tabulation ou un retour chariot est préfixée par `'`
  (ex. `'=HYPERLINK(…)`), pour qu'un tableur l'affiche au lieu de l'exécuter. Les nombres et les
  dates ne sont jamais préfixés, et le JSON garde la valeur d'origine.
- Valeur absente : cellule vide. Dates civiles `AAAA-MM-JJ` (un tableur les lit comme des dates) ;
  les instants de création et de modification sont écrits à l'heure locale de l'appareil, `AAAA-MM-JJ
  HH:mm:ss`, sans `T` ni `Z`.
- Les titres nomment la colonne pour la lecture : `animalName` est ajouté à côté de `animalId`,
  comme `vaccinationName` et `treatmentName` à côté du parent d'une ligne. La fréquence d'une
  période s'écrit en deux colonnes ; ses heures dans une seule cellule (`08:00, 20:00`).
- **Une ligne par injection, par période et par prise**, dans trois fichiers séparés reliés à leur
  vaccin ou traitement (décision du 2026-09-24 ; périodes : #454). `vaccins.csv` et
  `traitements.csv` gardent, pour la lecture, la date de la dernière injection ou prise donnée et la
  prochaine échéance (celle de `reminders[]` ; vide pour un traitement arrêté, terminé ou illisible).
- **Poids dans l'unité choisie dans Paramètres** (#352), au centième, l'unité entre parenthèses dans
  le titre de colonne : « Poids (kg) », « Poids (lb) », « Weight (kg) », « Weight (lb) ». Le JSON reste
  toujours en kilogrammes, valeur enregistrée sans arrondi.
- Les noms des fichiers de l'archive (`animaux.csv`…) ne changent pas avec la langue.
- Les réglages du carnet ne sont pas dans le CSV : ils voyagent dans le JSON.

Titres des colonnes, par fichier :

| Fichier | Titres en français | Titres en anglais |
| ------- | ------------------ | ----------------- |
| `animaux.csv` | `Identifiant;Nom;Espèce;Race;Date de naissance;Date de naissance approximative;Plus suivi depuis le;Motif du départ;Date du départ;Date de création;Dernière modification` | `ID,Name,Species,Breed,Date of birth,Approximate date of birth,Stopped following on,Departure reason,Departure date,Created,Last modified` |
| `vaccins.csv` | `Identifiant;Identifiant de l’animal;Animal;Vaccin;Rappel prévu;Dernière injection;Prochain rappel` | `ID,Pet ID,Pet,Vaccine,Planned reminder,Last injection,Next reminder` |
| `injections.csv` | `Identifiant;Identifiant du vaccin;Vaccin;Identifiant de l’animal;Animal;Date d’injection;Prochain rappel` | `ID,Vaccine ID,Vaccine,Pet ID,Pet,Injection date,Next reminder` |
| `traitements.csv` | `Identifiant;Identifiant de l’animal;Animal;Traitement;Type;Dernière prise;Prochaine dose` | `ID,Pet ID,Pet,Treatment,Type,Last dose,Next dose` |
| `periodes.csv` | `Identifiant;Identifiant du traitement;Traitement;Identifiant de l’animal;Animal;Début de la période;Première prise le;Date de fin;Arrêté le;Fréquence;Unité de fréquence;Heures du traitement;Posologie (quantité);Posologie (unité);Rappel avant la dose (min);Heure du rappel` | `ID,Treatment ID,Treatment,Pet ID,Pet,Period start,First dose on,End date,Stopped on,Frequency,Frequency unit,Treatment times,Dosage (quantity),Dosage (unit),Reminder before the dose (min),Reminder time` |
| `prises.csv` | `Identifiant;Identifiant de la période;Identifiant du traitement;Traitement;Identifiant de l’animal;Animal;Prévue le;Heure prévue;Donnée le;État;Nouvelle date` | `ID,Period ID,Treatment ID,Treatment,Pet ID,Pet,Due on,Due time,Given on,Status,New date` |
| `poids.csv` | `Identifiant;Identifiant de l’animal;Animal;Date de la pesée;Poids (kg)` | `ID,Pet ID,Pet,Weigh-in date,Weight (kg)` |
| `rappels.csv` | `Type;Identifiant du vaccin ou du traitement;Identifiant de l’animal;Animal;Nom;Échéance` | `Type,Vaccine or treatment ID,Pet ID,Pet,Name,Due date` |

## PDF — carnet de santé (#382, #356, #582)

Le PDF est gratuit. Il lit les mêmes lignes que l'export (`collect`) et contient soit tous les
animaux suivis, chacun à partir d'une nouvelle page, soit un seul animal (#356)
(`src/features/settings/logic/pdf-content.ts`, textes par `carnet-pdf-text.ts`, mise en page par `render-carnet-pdf.ts`). Les échéances et
l'historique des traitements viennent du moteur d'échéances.

- **Identité** : espèce, race, date de naissance et âge (règle AN-8). Si la date est approximative :
  `Date de naissance : environ 20 juin 2026 · estimé 15 semaines`. Pour un animal qu'on ne suit plus,
  `jusqu'au 28 sept. 2026` si la date du départ est renseignée, et alors sans âge. Le motif du départ
  n'est jamais écrit.
- **Statut** (`En retard`, `À jour`, `Pas de rappel`, `Prévu le 5 oct.` pour un vaccin jamais fait) :
  aucun pour un animal qu'on ne suit plus.

Sous la ligne de chaque vaccin ou traitement (nom, échéance, statut), l'historique est écrit en
retrait, en 9 pt gris. Il reste sur la même page que sa ligne, sauf s'il dépasse 200 mm : il
continue alors sur la page suivante.

- **Vaccin** : `Injections : 27/05/2025 · 30/05/2022 · 02/06/2021`. Toutes les injections y sont, la
  plus récente d'abord, **jamais regroupées**. Un vaccin prévu n'a pas cette ligne.
- **Traitement** :
  - d'abord `Dernière prise : 15/08/2026`, avec `(prise en plus)` si c'est le cas ;
  - sans aucune prise, la ligne donne l'état à la place : `Aucune prise · …`, ou `Aucune prise` seul ;
  - puis chaque période, la plus récente d'abord, avec sa fréquence, ses heures quand il y en a
    plusieurs, et sa posologie : `Du 01/09/2026 au 20/10/2026 · Tous les jours · 8 h et 20 h · ½ comprimé`.
    Une période close (arrêtée ou remplacée) avant sa première échéance, sans aucune ligne, n'est pas écrite : elle se
    lirait comme une date prévue ; les autres périodes du traitement restent ;
  - une prise unique, seule ligne de l'historique, ne se répète pas sous sa période quand elle ne dit
    rien de plus que `Dernière prise` (même date, sans heure) ;
  - sous chaque période, du plus récent au plus ancien : prises (`Prises : …`), oublis
    (`Oubliée : …`), reports (`Reportée au … (prévue le …)`, `Avancée au …`) et doses non renseignées
    (`Non renseigné du 11/09/2026 au 27/09/2026`) ;
  - chaque type se regroupe sur des jours qui se suivent, même quand une autre heure s'intercale. Une
    série s'arrête quand l'écart dépasse 1,5 fois la fréquence. Jusqu'à trois prises ou oublis, les
    dates sont listées, avec leur heure si la période en a plusieurs. Au-delà, la série se résume :
    `19 prises du 01/09/2026 au 10/09/2026`, `3 prises oubliées du … au …`. Si toute la série tombe
    à la même heure, cette heure est ajoutée : `· 20 h`.
