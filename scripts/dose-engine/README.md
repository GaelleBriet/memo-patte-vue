# Oracle du moteur des doses

L'ancien moteur a été supprimé au pas 10 de l'épic #758 (2026-10-13) : l'oracle compare désormais
le moteur v2 (`treatmentView`) au modèle de référence naïf (`src/shared/domain/dose-calendar/reference-model.ts`),
sur des carnets menés par les gestes de v2 (`v2-walk.ts`, le générateur de la campagne d'invariants).
Chaque pas doit rendre la même lecture des deux côtés (`naive` de `v2-invariants-readings.ts`) ; un
seul écart fait échouer la spec, qui imprime le carnet avant le geste et les gestes joués.

Lancement (variables posées directement devant la commande, jamais par une variable shell
intermédiaire), sous le verrou des suites lourdes :

```sh
ORACLE_FROM=530000000 ORACLE_SEEDS=3000 ORACLE_STEPS=40 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.oracle.spec.ts --reporter=verbose
```

- `ORACLE_FROM`, `ORACLE_SEEDS`, `ORACLE_STEPS` : première graine, nombre de carnets, gestes par carnet
  (par défaut 530000000, 50, 24).
- `ORACLE_ENGINES` : seul `reference,v2` reste accepté. `ORACLE_SETTINGS`, `ORACLE_FILTER` et
  `ORACLE_OUT`, qui réglaient la comparaison avec l'ancien moteur, arrêtent l'oracle s'ils sont posés.

La ligne « Oracle : N carnets × M gestes, graines A à B » dit ce qui a été joué ; un réglage illisible
arrête l'oracle avant tout carnet.

Les carnets que l'ancien moteur menait pour les graines 570005085, 570012998 et 570010320 sont gardés,
pas à pas, dans `src/shared/__tests__/fixtures/dose-calendar-oracle-graines.jsonl`, avec ce que
l'ancien moteur en montrait. `ecarts-acceptes.md` garde les écarts acceptés entre les deux moteurs et
les décisions qui les justifient ; il n'est plus relu par l'oracle.

## Campagne d'invariants du moteur v2

`src/shared/__tests__/dose-calendar.invariants.spec.ts` mène des carnets par les gestes de v2
(`v2-walk.ts`, et `v2-walk-settings.ts` pour « Modifier » : posologie, heures, fréquence ou les deux,
à la première échéance proposée par `gestures/settings` ou à une autre date ; « Arrêter » ;
« Reprendre » ; le report qu'un plan de « Modifier » réécrit, #796, est écrit avec le réglage) et vérifie à chaque pas les huit invariants du plan §6.3 (`v2-invariants.ts`, qui
assemble `v2-invariants-lines.ts`, `v2-invariants-readings.ts` et `v2-invariants-settings.ts`) :
conservation des faits, pas de double, posologie sans effet, temps, symétrie, annuler,
préversion = résultat, équivalence au modèle naïf ; et un neuvième pour « Modifier » (R9, R12) : la
fiche montre la date proposée (`shownOn`, sinon la première échéance écrite), qui a encore une dose à
donner ; la même demande avec cette date passée en clair rend la même réponse (jamais un refus, sauf
`no-dose-before-end`, #787) ; une autre date choisie est celle que la fiche lit. « Heures seules »
(`v2-invariants-hours.ts`, décision de Gaelle du 15 octobre 2026) : changer seulement les heures,
sans date (une minute plus tard, une heure ajoutée, retirée, aucune), ne change ni les heures ni
l'état d'une journée passée, ni d'une journée à venir de la période qui porte une prise ou l'origine
ou l'arrivée d'un report ; « Elles restent à renseigner » comprise, « Elles n'étaient pas à donner »
corrige le réglage (Q38) ; un réglage ouvert aujourd'hui et remplacé, dont la date se recalcule
comme un seul « Modifier » (R10), n'est pas jugé. La campagne ne
choisit jamais une « Prochaine dose » après la date de fin, que le formulaire refuse (Q20). Variables
posées directement devant la commande, sous le même verrou :

```sh
INVARIANTS_FROM=620000000 INVARIANTS_SEEDS=3000 INVARIANTS_STEPS=40 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.invariants.spec.ts --reporter=verbose
```

La ligne « Campagne : N carnets × M gestes, graines A à B » dit ce qui a été joué ; un réglage
illisible arrête la campagne ; un échec imprime le carnet avant le geste fautif et les gestes joués.
Par défaut (suite normale) : 25 carnets × 24 gestes.

## Les services des traitements contre le moteur v2

`src/features/treatments/__tests__/treatment-services.oracle.service.spec.ts` rejoue les gestes du
moteur v2 par les services (base SQLite en mémoire) et compare les lignes écrites à la lecture du
moteur seul. Variables : `TREATMENT_ORACLE_FROM` (540000000), `TREATMENT_ORACLE_SEEDS` (20 par défaut),
`TREATMENT_ORACLE_STEPS` (30). Un geste que l'écran refuse n'est pas joué. Les gestes « Prochaine dose » de la dose du moment passent par le formulaire (report ou date de fin corrigée sur place) ; une suite arrêtée par un refus du formulaire est comptée, et seule une date de fin refusée (TR-6) est admise.

## Les rappels lus dans la vue (pas 8)

`src/shared/__tests__/dose-calendar.reminders-campaign.spec.ts` mène des carnets par les gestes de v2
(`v2-walk.ts`) ; à chaque pas, `v2-reminders.ts` vérifie que les rappels de `view.reminders` sont les
échéances de la fiche (RA-1, RA-6 : toute échéance à donner a son rappel du jour, aucune autre ; la
dernière dose après la date de fin), la prévenance et la relance (RA-2 à RA-5), relues sur l'état de
chaque échéance, et le volet (RA-19, `view.isNoted`). La dernière journée lue est entière, et la
lecture dit « tout lu » si et seulement si rien ne reste à donner après elle (#933).
`v2-reminder-plan.ts` relit ensuite le plan de l'app ouverte à 0 h et à 23 h 59, rappel « à l'heure »
et « 1 h avant », traitement sans heure rappelé à 7 h, 9 h et 21 h (RA-7, RA-8, RA-11, RA-12) :
aucune échéance de la fiche ne manque avant le dernier rappel programmé, et un plan sans relais
ne laisse rien après lui. La comparaison avec les rappels de l'ancien moteur a disparu avec lui au
pas 10.

```sh
RAPPELS_FROM=641000000 RAPPELS_SEEDS=3000 RAPPELS_STEPS=40 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.reminders-campaign.spec.ts --reporter=verbose
```

La ligne « Campagne rappels » dit ce qui a été joué. Par défaut (suite normale) : 25 carnets × 24
gestes.

## Deux téléphones (#867, #882, #883)

`src/shared/__tests__/dose-calendar.deux-appareils-campagne.spec.ts` mène des carnets par les gestes
de v2 et, à certains pas, fourche le carnet (`two-devices.ts`, constats dans `two-devices-constats.ts`) : le téléphone A fait un geste (report,
avec ou sans « Décaler aussi les doses suivantes », prise, dose à renseigner), le téléphone B fait
« Modifier » (heures, date, fréquence, fin) sans le voir, chacun dans un ordre tiré au sort, puis la
synchro garde, par ligne et par réglage, la modification la plus récente. La date d'écriture d'un
réglage n'avance que si son calendrier change (migration v14). Constats : le report de A, qui
déplaçait une dose sur A, est sans effet après la synchro alors que la réécriture de B, sur le réglage
du report, n'a pas ôté sa dose de départ (la journée lue sans ce report l'a encore) ; une dose de trop
sur le jour d'arrivée du report (une heure que ni A ni B n'y montraient). Un report écrit sous un
autre réglage que celui que B réécrit n'est pas jugé.

Une série longue se compare au moteur de `main` (`TW_MAIN`, chemin de son `index.ts`) : un constat
que `main` a aussi n'est pas compté ; les doses de trop ne sont jugées qu'avec `main`.

```sh
mkdir -p /tmp/claude-1000/main-moteur && git archive origin/main src | tar -x -C /tmp/claude-1000/main-moteur
TW_MAIN=/tmp/claude-1000/main-moteur/src/shared/domain/dose-calendar/index.ts \
  TW_FROM=9050000000 TW_SEEDS=3000 TW_STEPS=30 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.deux-appareils-campagne.spec.ts --reporter=verbose
```

La ligne « Campagne deux téléphones : N carnets × M pas, graines A à B, comparée à main : F
fourches, C constats » dit ce qui a été joué ; un réglage illisible arrête la campagne. Par défaut
(suite normale) : 10 carnets × 30 pas, sans `main`.

Fourches de notes (#931, `two-devices-notes.ts`), avec les mêmes variables : la même dose notée sur
A et sur B (donnée ou oubliée, chacun sans voir l'autre), puis un geste de note sur la même dose sur
l'un d'eux (« Marquer comme oubliée », « Marquer comme donnée », « Fait à une autre date »), l'autre
ligne reçue avant ou après le geste. Chaque geste est joué comme par l'app (`two-devices-app.ts` :
écritures de `doseChange`, réécritures inchangées sautées, lot inverse daté comme `applyBatch`), et
seulement là où l'écran le propose. Constats : la ligne qui couvre la dose ne porte pas le statut et
la date du geste (sur le téléphone, puis après la synchro) ; « Annuler » ne rend pas la fiche d'avant ;
les deux ordres ne donnent pas le même écran. La ligne « Campagne deux téléphones, notes : … F
fourches (J jouées comme l'app), C constats (main : M) » dit ce qui a été joué ; avec `TW_MAIN`, M
compte les fourches où le moteur seul de `main` donne deux écrans.

## Doses listées (#873)

`src/shared/__tests__/dose-calendar.reponses-listees.spec.ts` mène des carnets par les gestes de v2
(`listed-answers.ts`) et, après chaque réponse « Elles n'étaient pas à donner », repose la question sur
le carnet d'avant la réponse pour relire les doses qu'elle a montrées. À chaque pas : seules ces doses
sortent (une journée sans prise toute listée sort en entier), et une dose listée ne se montre plus à
donner tant que sa ligne « pas à donner » n'est ni supprimée ni battue par une ligne plus récente.

```sh
LISTED_FROM=9760000000 LISTED_SEEDS=3000 LISTED_STEPS=40 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.reponses-listees.spec.ts --reporter=verbose
```

La ligne « Campagne doses listées : N carnets × M gestes, graines A à B » dit ce qui a été joué. Par
défaut (suite normale) : 20 carnets × 40 gestes.

## Menu ⋮ de l'historique (#947, #961)

`src/shared/__tests__/dose-calendar.menu-historique.spec.ts` mène des carnets par les gestes de v2
(`history-menu.ts`) et, à chaque pas, ouvre le menu ⋮ de chaque ligne de l'historique : chaque note
proposée (« Marquer comme oubliée », « Marquer comme donnée ») et chaque « Supprimer » est joué par
le moteur. Une note ou un « Supprimer » actif ne doit être ni refusé ni lever ; un « Supprimer »
grisé doit être refusé. C'est une non-régression : les graines fixes 977001278, 977003652 et
9600000073 (note refusée, avant #947), 9600000154, 9600000163, 9600000418 et 9600001479
(« Supprimer » actif refusé, avant #961) en sont la preuve.

```sh
MENU_FROM=9600000000 MENU_SEEDS=1500 MENU_STEPS=40 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.menu-historique.spec.ts --reporter=verbose
```

La ligne « Campagne menu de l'historique : N carnets × M gestes, graines A à B » dit ce qui a été
joué. Par défaut (suite normale) : 10 carnets × 40 gestes.
