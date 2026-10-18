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
chaque échéance, et le volet (RA-19, `view.isNoted`). La comparaison avec les rappels de l'ancien
moteur a disparu avec lui au pas 10.

```sh
RAPPELS_FROM=641000000 RAPPELS_SEEDS=3000 RAPPELS_STEPS=40 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.reminders-campaign.spec.ts --reporter=verbose
```

La ligne « Campagne rappels » dit ce qui a été joué. Par défaut (suite normale) : 25 carnets × 24
gestes.

## Deux téléphones (#867, #882, #883)

`src/shared/__tests__/dose-calendar.deux-appareils-campagne.spec.ts` mène des carnets par les gestes
de v2 et, à certains pas, fourche le carnet (`two-devices.ts`) : le téléphone A fait un geste (report,
avec ou sans « Décaler aussi les doses suivantes », prise, dose à renseigner), le téléphone B fait
« Modifier » (heures, date, fréquence, fin) sans le voir, chacun dans un ordre tiré au sort, puis la
synchro garde, par ligne et par réglage, la modification la plus récente. La date d'écriture d'un
réglage n'avance que si son calendrier change (migration v14). Un constat : le report de A, qui
déplaçait une dose sur A, est sans effet après la synchro alors que la réécriture de B, sur le réglage
du report, n'a pas ôté sa dose de départ (la journée lue sans ce report l'a encore). Un report écrit
sous un autre réglage que celui que B réécrit n'est pas jugé.

```sh
TW_FROM=9050000000 TW_SEEDS=3000 TW_STEPS=30 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.deux-appareils-campagne.spec.ts --reporter=verbose
```

La ligne « Campagne deux téléphones : N carnets × M pas, graines A à B : F fourches, R reports
perdus » dit ce qui a été joué ; un réglage illisible arrête la campagne. Par défaut (suite normale) :
10 carnets × 30 pas.
