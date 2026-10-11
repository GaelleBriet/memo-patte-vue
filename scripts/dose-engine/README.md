# Oracle des moteurs de doses

Lancement (variables posées directement devant la commande, jamais par une variable shell
intermédiaire), sous le verrou des suites lourdes :

```sh
ORACLE_FROM=530000000 ORACLE_SEEDS=20000 ORACLE_STEPS=40 ORACLE_ENGINES=actuel,reference ORACLE_SETTINGS=avec \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.oracle.spec.ts --reporter=verbose
```

- `ORACLE_FROM`, `ORACLE_SEEDS`, `ORACLE_STEPS` : première graine, nombre de carnets, gestes par carnet
  (par défaut 530000000, 50, 24).
- `ORACLE_ENGINES` : les deux moteurs comparés, `actuel`, `reference` (modèle naïf de
  `src/shared/domain/dose-calendar/`) et `v2` (`treatmentView`) ; par défaut `actuel,actuel`.
  `reference` et `v2` reçoivent le carnet par le même adaptateur (`viewInputOf`, plan §3.1) ;
  `reference,v2` doit rendre zéro écart. Le moteur actuel mène toujours les gestes ; placé en
  premier, c'est contre lui que les écarts sont rattachés.
- `ORACLE_SETTINGS` : `avec` (gestes de la campagne, « Modifier » et « Reprendre » compris) ou `sans`
  (un seul réglage).
- `ORACLE_FILTER` : `v2` (par défaut : un geste du moteur actuel n'est joué que si le moteur v2, pour
  le même geste, case cochée ou non, écrit le même carnet ; les gestes écartés sont comptés par raison,
  refus de v2 ou « v2 écrit autre chose » avec la règle en cause) ou `aucun` (tous les gestes du
  moteur actuel, carnets inatteignables compris).
- `ORACLE_OUT` : dossier où écrire, par graine qui diverge, le carnet avant le geste fautif
  (`avant-<graine>.json`), et les trois premiers carnets de chaque refus à analyser
  (`refus-<type>-<graine>-<n>.json`).

La ligne « Oracle » finit par les **refus à analyser** : un refus de v2 sur une échéance que sa propre
vue propose (dose du moment, prochaine dose, trois suivantes), et une correction de date que le moteur
actuel accepte et que v2 refuse à cause d'un report. Chacun est soit un défaut corrigé, soit un refus
justifié par une règle datée (`ecarts-acceptes.md`).

La ligne « Oracle : N carnets × M gestes, graines A à B » dit ce qui a été joué ; un réglage illisible
arrête l'oracle avant tout carnet. Tout écart non rattaché à `ecarts-acceptes.md` fait échouer la
spec.

Les carnets sont ceux de l'ancienne campagne d'invariants (`treatment-schedule.invariants.spec.ts`),
même graine, mêmes gestes, menés par le moteur actuel (`carnet.ts`, `walk*.ts`) et filtrés par les
refus de v2 (`walk-filter.ts`). Les lignes que le moteur actuel fait purger restent dans le carnet lu
par les deux moteurs (R11).

## Campagne d'invariants du moteur v2

`src/shared/__tests__/dose-calendar.invariants.spec.ts` mène des carnets par les gestes de v2
(`v2-walk.ts`) et vérifie à chaque pas les huit invariants du plan §6.3 (`v2-invariants.ts`) :
conservation des faits, pas de double, posologie sans effet, temps, symétrie, annuler,
préversion = résultat, équivalence au modèle naïf. Variables posées directement devant la commande,
sous le même verrou :

```sh
INVARIANTS_FROM=620000000 INVARIANTS_SEEDS=3000 INVARIANTS_STEPS=40 \
  flock /tmp/claude-1000/memo-patte-suite.lock nice -n 19 \
  pnpm exec vitest run src/shared/__tests__/dose-calendar.invariants.spec.ts --reporter=verbose
```

La ligne « Campagne : N carnets × M gestes, graines A à B » dit ce qui a été joué ; un réglage
illisible arrête la campagne ; un échec imprime le carnet avant le geste fautif et les gestes joués.
Par défaut (suite normale) : 25 carnets × 24 gestes.
