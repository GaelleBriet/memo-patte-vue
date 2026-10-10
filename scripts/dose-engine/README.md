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
- `ORACLE_OUT` : dossier où écrire, par graine qui diverge, le carnet avant le geste fautif
  (`avant-<graine>.json`).

La ligne « Oracle : N carnets × M gestes, graines A à B » dit ce qui a été joué ; un réglage illisible
arrête l'oracle avant tout carnet. Tout écart non rattaché à `ecarts-acceptes.md` fait échouer la
spec.

Les carnets sont ceux de la campagne d'invariants (`treatment-schedule.invariants.spec.ts`), même
graine, mêmes gestes : le générateur est recopié dans `carnet.ts` et `walk*.ts`, sans les
vérifications, jusqu'à la réécriture de la campagne (pas 3 de l'épic #758). Les lignes que le moteur
actuel fait purger restent dans le carnet lu par les deux moteurs (R11).
