# Contexte en cours (à mettre à jour à chaque lot)

- 2026-10-08 (nuit, autonomie) : **reprendre ici.** Mergés : #547 (#627), #630 (#631), #629 (#632),
  #594 (#634), #598 en partie (#633), #582 (#635), #353 (#637), #638 en partie (#639), #487 en partie
  (#641, refactor sans changement de comportement, comparé à `main` sur l'émulateur), #636 (#643),
  #640 (#644, CI `fuseaux` : Kiritimati, Pago Pago, Santiago), #642 (#645). `main` à **6 600 tests**,
  testé sur l'émulateur. Bilan et sept questions dans le coffre, `product/bilan-2026-10-08-nuit.md`.
  - **Téléphone** : test interrompu à la demande de Gaelle, base de MémoPatte Dev restaurée (même
    empreinte) ; au prochain branchement, réinstaller le build de `main` dans MémoPatte Dev, restaurer
    la base sauvegardée dans `~/memopatte-dev-sauvegarde-2026-10-08/`, redonner `POST_NOTIFICATIONS`.
  - **Ouverts** : #598 (à fermer si Gaelle le juge couvert), #638 (phrase des rappels précis), #487
    (pas laissés par prudence, liste dans #641), #469 (prompt Claude Design prêt), #612, #416.
  - **Pièges** : (1) `Closes #N` dans un **message de commit** ferme le ticket au merge même si la PR
    dit « Avance » : rouvrir, ou écrire « Avance » dans le commit aussi ; (2) un test qui fige un
    instant UTC puis lit le jour local casse hors d'Europe : construire l'instant en heure locale ; la
    CI tourne aussi en UTC+14, UTC-11 et Santiago ; (3) le téléphone de Gaelle et l'émulateur peuvent
    être branchés ensemble : toujours `ANDROID_SERIAL`.

- 2026-10-07 (soir) : **reprendre ici.** Mergés dans la journée, après les réponses de Gaelle au bilan
  de la nuit : #575 (#611, injection passée qui redemande le rappel), #580 (#614, Paramètres en
  rubriques, PDF gratuit), #578 (#618, ne plus suivre, supprimer), #577 (#615, photo de l'animal),
  #583 (#617, effacer les données), #483 (#613, « Aucune prise · en retard depuis le … », « Arrêté
  avant la première prise »), #579 (#619, animaux qu'on ne suit plus, date de départ jamais future),
  #356 (#620, PDF de tous les animaux ; « Tous les animaux » seulement à partir de deux animaux
  suivis), #581 (#621, Aide et contact, FAQ du site avec captures annotées FR et EN), plus #610
  (CLAUDE.md : un service peut importer le service d'une autre feature, sans boucle) et #616 (Supabase
  gardé, Pro au lancement de Plus ; analyse des coûts dans le coffre). #579 et #356 testés ensemble
  sur l'émulateur.
  - **Suite décidée par Gaelle** : rien de nouveau avant le **site dédié** (étude dans le coffre,
    `domaine-site/etude-domaine-page-vitrine.md`). memopatte.com est pris (boutique Shopify fermée,
    enregistré jusqu'au 2027-07-24), memopatte.app libre ; aucune marque MémoPatte à l'INPI. À
    trancher par Gaelle : .app seul ou .app + .fr, dépôt de marque, puis les autres questions de
    l'étude. Au changement de domaine : `src/shared/domain/help-page.ts`, adresse de contact,
    `websiteHint`, canonical et hreflang de `site/`.
  - **En attente** : #469 (anciens exports, après les lots 5 et 6 ; écran de résultat à maquetter,
    prompt Claude Design à préparer) ; #612 (programmer un départ) ; #547 (dont l'ajout d'un vaccin
    ou d'un traitement, et « Reprendre », encore proposés sur un animal qu'on ne suit plus) ; #594,
    #598, #582, #487, #488 ; `currentPeriods` devenu code mort en production (#483). Texte de
    « Fusionner » : la FAQ dit « ajoute ce qui est absent de tes données actuelles », l'app « Ajoute
    ce qui manque, garde tes données actuelles. » — à aligner si Gaelle le veut.
  - **Pièges du jour** : (1) une boucle d'attente `while pgrep -f motif` se trouve elle-même (le motif
    est dans sa propre ligne de commande) et ne s'arrête jamais : attendre un fichier de sortie ou un
    PID ; (2) Vitest 5 laisse un dossier de cache d'environ 12 Mo par lancement dans `/tmp` (noms de
    21 caractères avec `client/` et `ssr/`) : `/tmp` (16 Go) s'est rempli, à vider de temps en temps ;
    (3) un merge de `main` peut casser un test qui compile seul (signature de `renderCarnetPdf`,
    champs de départ de l'animal) : toujours relancer les quatre commandes après.

- 2026-10-07 (matin) : **reprendre ici.** Journée du 6 puis nuit en autonomie (Gaelle absente).
  **Lots 4 et 7 mergés** : rappels lus par le moteur (#550, #553 à #559, #556), « À faire », PDF et CSV
  lus par le moteur (#566, #568, #572), ligne du Carnet V15 (#570), messages de l'accueil (#571),
  finitions testées sur l'émulateur (#590), puis #548 (#607, plus aucun ancien calcul d'échéance dans
  la projection `Treatment`, garde `treatment-due-source.spec.ts`). Aussi : Paramètres › Rappels et
  Sauvegarde (#560, #567), page d'aide des rappels (#561), « 1er » (#586), anglais par défaut (#587),
  vaccin « Prévu » (#591), date de naissance approximative (#592), fiche et feuille « Fait » d'un vaccin
  (#597), dates insécables (#596, aide de test `plain()`), noms de vaccins de la base ANMV (#603,
  `pnpm vaccines:generate`), photos orphelines (#602), écritures concurrentes (#604, file d'écriture
  unique), vaccins dans « À faire » (#605), report sans effet (#606), pastilles du Carnet (#608).
  `main` à **5 757 tests**.
  - **Branches prêtes, sans PR, qui attendent Gaelle** (textes sans maquette ou questions, détail dans
    son coffre, `product/bilan-2026-10-07-nuit.md`) : #578 `feat/ne-plus-suivre`, #579
    `feat/animaux-non-suivis` (après #578), #577 `feat/photo-animal`, #583 `feat/effacer-donnees`, #580
    `feat/parametres-rubriques`, #581 `feat/aide-contact` (FAQ à relire, après #580), #575
    `feat/historique-vaccin`, #416 `feat/csv-traduit` (CSV à ouvrir dans un tableur), #483
    `feat/pdf-traitement-sans-prise`, **#356** `feat/pdf-tous-les-animaux` (V23 bis, construit sur
    #580 : PR après son merge) et **#469** `feat/anciens-exports` (anciens exports v1 à v3 relus par
    rejeu de l'ancien moteur ; **rien avant les lots 5 et 6**, comme le demande le commentaire du ticket).
  - **Ensuite** : #547 (après #578 et #579), #582 (après #483), #594 et #598 (questions), #487
    (refactor, après les branches ouvertes), #488.
  - **Pièges** : (1) un brief fait lire `gh issue view N --comments` : deux tickets de la nuit
    portaient un commentaire de Gaelle qui changeait la cible (#356 renvoyait à DO-4 et V23 bis, #469
    demandait d'attendre les lots 5 et 6) ; (2) attendre un processus avec `pgrep -f` sur sa propre
    ligne de commande ne finit jamais : attendre sur le contenu d'un fichier de sortie ; (3) juste
    après `gh pr update-branch`, GitHub dit encore « en retard » : attendre et réessayer ; (4) un test
    qui juge une date par l'horloge réelle casse après minuit (#595) ; (5) deux agents qui écrivent un
    log au même nom dans le dossier temporaire mélangent leurs sorties : un nom de log unique par agent.

- 2026-10-05 : **reprendre ici.** Mergés : #522 (maquettes « Décaler les doses suivantes », planches
  **V28 à V32**, nommées V9 à V13 dans le fichier : voir `docs/design/v1-specs/README.md`), #524 (#503,
  **prise en plus** : ne change jamais le calendrier), #526 (#523, décalage d'une dose avancée écrit sous
  son échéance d'origine, G18), **#530 (#505, la case « Décaler aussi les doses suivantes » et la ligne
  de décalage)**, #531 (#529, photos dans deux feuilles), #532 (#506, « C'est fait » en retard face à
  la date de fin, G20), puis la release 0.1.59. `main` à **5 036 tests**. #503, #505 et #506 testés
  sur le téléphone. Décisions de Gaelle du 3 et du 5 octobre dans `decisions-log.md` et la spec
  (G18 à G20) ; arbitrages en autonomie dans son journal.
  - **Campagne d'invariants** (`src/shared/__tests__/treatment-schedule.invariants.spec.ts`) : verte sans
    exclusion ; variables `INVARIANTS_FROM`, `INVARIANTS_SEEDS`, `INVARIANTS_STEPS` ; séries d'usage :
    20 000 × 24, 5 000 × 40, 3 000 × 40 depuis 60 000 000 et 85 000 000 ; elle rejoue « Annuler ».
  - **Ne pas publier** : l'accueil, la feuille « À faire » et les rappels lisent encore l'ancien calcul
    (lots 4 et 7).
  - **À faire ensuite, dans l'ordre** (accord de Gaelle du 2026-10-06) : lots 4 et 7 (#527 avec le
    lot 7), #528, #507.
  - **Questions en attente pour Gaelle** (son journal) : « Terminé le {dernière échéance} » alors que la
    dose a été donnée plus tard ; une dose reportée seule à deux jours d'une dose décalée ; trois choix
    de cohérence tranchés seuls (prise en plus et « Modifier », redatage borné, oubli qui garde son
    décalage).
  - **Pièges** : (1) le dossier temporaire est vidé à chaque nouvelle journée : recréer les scripts
    (CDP, fusion) avant de s'en servir ; (2) ne jamais enchaîner une suppression de branche après un
    merge sans la conditionner au merge réussi (`gh pr view --json state` = `MERGED`) ; (3) `adb devices`
    vide : `adb kill-server` puis `start-server`, puis vérifier l'USB.

- 2026-10-04 : **reprendre ici.** Gaelle malade, travail en autonomie complète. **Étude du modèle des
  prises (#488) terminée** (PR #508, `docs/technical/etude-modele-prises.md`, décisions de Gaelle du
  2026-10-03 au §5.1) : case « Décaler aussi les doses suivantes » partout où une date de dose change
  (sauf « C'est fait » en un tap, dose rattrapée, prise d'un traitement de tous les jours), **ligne de
  décalage à part** (`shift`, autonome, toujours visible, supprimable seule), **chaque ligne se supprime
  seule**, prise en plus (`extra`), une prise l'emporte sur un report entre deux appareils, appareil de
  création / modification sur chaque ligne. Plan : #501 à #507.
  - **Mergés** : #514 (#463, cycle de vie d'un traitement, testé sur le téléphone), #516 (import :
    instant sans secondes accepté avec zod 4.6), Dependabot #510, #509, #513, #512, #511, **#517 (#501,
    schéma v11 : migration rejouée sur le téléphone v10 remplie → v11, migration Supabase appliquée au
    vrai projet par la CI, job vert)**, #518 (#515, feuilles du bas qui défilent en paysage), release
    0.1.57 (#498), **#519 (#502, le moteur lit les lignes de décalage**, testé sur le téléphone).
  - **Ne pas publier** : le décalage n'est ni visible ni supprimable avant #505 ; l'accueil, la feuille
    « À faire » et les rappels lisent encore l'ancien modèle (lot 7).
  - **À faire ensuite, dans l'ordre** : #503 (prise en plus) ; #504 (maquette : prompt prêt dans le
    coffre, `design/prompt-maquettes-decalage.md`, à coller par Gaelle dans Claude Design) puis #505 (la
    case et la ligne de décalage ; y trancher la suppression du décalage d'un report qui avait dépassé
    la dose suivante) ; #506 ; #507 ; puis lots 4 et 7, #500, #487, #485, #486.
  - **À redire à Gaelle** (journal du 2026-10-04) : `device.model` = « fabricant modèle » (« Nothing
    A059 ») car Android ne donne pas le nom commercial ; « Marquer comme oubliée » garde le décalage ;
    garde `hitsAMove`.
  - **Pièges du jour** : (1) `adb devices` vide alors que le téléphone est branché : `adb kill-server`
    puis `start-server` ; (2) le téléphone passe en paysage : une feuille du bas débordait (#515, corrigé),
    viser après `scrollIntoView` ; (3) une base v11 ne redescend pas en v10 : après un test, installer
    le build de `main` puis restaurer le fichier de base sauvegardé ; (4) un test de garde statique
    (`device-stamps.integration.spec.ts`) exige `updated_by_device` dans chaque `SET … updated_at` : toute
    nouvelle écriture doit poser l'appareil.

- 2026-10-02 (soir) : **reprendre ici.** Mergés dans la journée : #474 (découpage de
  `treatment-schedule.ts` en fichiers à plat), #475 (#425, « anonymes » retiré), #477 (**socle du lot
  3** : `TreatmentWithHistory`, `treatmentScheduleOf`, traitement sans prise, type « médicament »,
  `applyBatch`), #479 (#418, `singleTop`), #489 (**correctifs du moteur** : redater sans décaler la
  suite, `stateOn`, Q36, Q37, `ScheduleTooLongError`), #491 (**#461, fiche v2**), #493 (**#460,
  formulaire v2**), plus #484 (décisions Q27 à Q33). Fiche et formulaire testés ensemble sur le
  téléphone (MémoPatte Dev, vrai plugin SQLite, gestes à la main par Gaelle).
  - **Relecture d'ensemble** demandée par Gaelle à un autre agent (coffre,
    `revues/2026-10-02-analyse-doses-reports-oublis/`) : moteur sain, défauts aux jointures. Corrigés :
    M1, M2 (redatage), P1 (notification qui notait une autre dose), P4, D6, U1, D5 / U7. Renvoyés :
    **#488** (évolution du modèle de données : une donnée explicite « a refixé la suite » sur la prise
    et un identifiant d'échéance ; prise un intervalle ou plus en avance, case « Décaler aussi les
    doses suivantes », mois courts, date de fin après un retard — limites écrites au §11 de la spec ;
    **avant toute publication**), #485 (écritures concurrentes, avant #83), #486 (rappels après une
    reprogrammation ratée, lot 4), #487 (clarifier les modules, pas M8 avant le lot 7), #481 (« 1er »),
    #482, #483.
  - **Décisions de Gaelle du jour** : spec `traitements.md` §10, Q27 à Q33 et Q36 à Q41 (la question
    à l'enregistrement quand un réglage change sur une période sans prise qui a des doses passées ;
    un oubli ne redevient pas donné depuis la feuille ou une notification ; la feuille demande l'heure ;
    une notification ne note que la dose de son jour d'échéance).
  - **Fin de journée** : mergés aussi #495 (moteur : noter des doses en lot en temps linéaire, zéro
    écart prouvé contre l'ancien moteur) et **#497 (#462, doses non renseignées : bandeau, « Choisir
    les jours », encart de création ; Q42 : l'encart compte la dose du moment déjà passée)**, testé
    sur le téléphone. **#463 est en branche, sans PR** : `feat/cycle-de-vie-traitement` (dialogue
    d'arrêt avec les doses à renseigner en une transaction, toasts de fin, « Supprimer » avec
    « Annuler », « Reprendre » depuis un terminé, **ligne du Carnet lue par le moteur**, 4 727 tests),
    livrée par son agent le soir, **ni relue ni testée sur le téléphone**. Huit questions de l'agent
    attendent (structure de la ligne du Carnet face à la planche B · V15, couleur du badge
    « À renseigner », textes du dialogue d'arrêt à une dose) : en autonomie, les trancher et les
    consigner au journal de Gaelle, sauf la structure de la ligne (ticket à part proposé).
  - **À faire ensuite, dans l'ordre** : #463 (merger `main` dans la branche, revue indépendante,
    corrections, test sur le téléphone avec Gaelle, PR, merge), puis #488, puis les lots 4 et 7. **Ne pas publier** : le Carnet, l'accueil et les
    rappels lisent encore l'ancien modèle (traitement à plusieurs heures « en retard » à tort, rappel
    quotidien à 9 h, date de fin inconnue) ; les décisions d'une notification passent encore par
    `isDoseNoted` / `isTreatmentDueDate` de l'ancien modèle (une dose déjà donnée en avance ouvre la
    fiche au lieu de dire « déjà notée »).
  - **Pièges du jour** : (1) toucher « Importer un export MémoPatte » par la WebView ouvre le
    sélecteur de fichiers d'Android, qui reste devant : donner le fichier au champ
    `input[type=file]` de la page (`DataTransfer`), sans toucher le bouton ; (2) la barre du bas est
    cachée sur un écran poussé : revenir par `history.back()` ; (3) une notification se rejoue par
    son intent (`am start` avec `LocalNotificationId`, `LocalNotificationUserAction`,
    `LocalNotficationObject`, drapeaux `0x24000000`), après les contrôles d'usage ; (4) les noms
    accessibles contiennent des espaces insécables : chercher un bouton en les normalisant ; un toast
    en bas de l'écran recouvre le bouton du pied de page pendant 4 s ; (5) champs d'heure et de date :
    poser la valeur par le setter natif plus `input` et `change`, sans ouvrir le sélecteur système ;
    (6) après une PR, vérifier que `main` n'a pas bougé (release-please) avant d'enchaîner merge et
    suppression de branche ; (7) ne pas remonter à Gaelle l'état de la vraie app ni d'un carnet de
    test vidé : tout est donnée de test.

- 2026-10-01 (soir) : **pause demandée par Gaelle, reprendre ici.** Lots 1 et 2 **mergés** : #464
  (#451, base neuve v9), #467 (#452, périodes et prises, v10), #470 (#454, export et import v3, carnet
  de démo), #468 (#455, miroirs Supabase v10 et ports de synchro, **migration appliquée au vrai projet
  avec Gaelle présente**, job vert), #471 (#453, moteur d'échéances, `src/shared/domain/treatment-schedule.ts`),
  plus #466 (tests qui lisaient l'heure réelle : un test cassait `main` depuis le 1er octobre 10 h UTC).
  `main` à **4093 tests**. Décisions de Gaelle du jour dans la spec `traitements.md` §10 (Q17 à Q26) :
  avancer comme reporter, une ligne par déplacement, pas après la date de fin, « Prochaine dose »
  déplace la journée, on raisonne par journée à plusieurs heures, un réglage changé vaut tout de
  suite, un report qui a servi est verrouillé, champ grisé et son texte. Texte du refus d'un ancien
  export validé ; #469 créé (relire les anciens exports au mieux, avant la publication).
  - **Pièges trouvés, à retenir** : (1) une migration qui contient un `DELETE FROM … WHERE` passe tous
    les tests et **échoue sur Android** (le plugin SQLite exige une base ouverte, qu'elle n'est pas
    pendant une mise à niveau) : un test de `core/db` n'autorise plus que `DROP`, `CREATE`, `INSERT`,
    `PRAGMA`, et toute migration se rejoue sur le téléphone (ancienne version remplie, puis nouvelle
    par-dessus) ; (2) un test qui compare une date fixe à l'heure réelle finit par casser : figer
    `Date` (`vi.useFakeTimers({ toFake: ['Date'], now })`), et rejouer la suite avec l'horloge avancée
    pour les débusquer ; (3) `gh pr checks` peut rester `BLOCKED` un moment, et GitHub ne lie pas
    toujours `Closes #N` (#471) : vérifier l'état du ticket après le merge.
  - **Tests sur le téléphone** : nouvelle méthode, écrite dans `collaboration.md` après deux incidents
    signalés à Gaelle (un tap tombé sur une notification de SMS, l'app passée devant un appel).
  - **À faire ensuite, dans l'ordre** : découper `treatment-schedule.ts` (1 130 lignes) en fichiers à
    plat dans `shared/domain/`, en un commit de déplacement pur ; puis lot 3, #460 et #461 en
    parallèle, #462, #463 (brouillons dans le coffre, `product/14-tickets-lot-3.md`). À demander à
    Gaelle avec #460 : les textes de « Prochaine dose » non déplaçable pour `'later-dose'` et
    `'no-date-left'`. À dédoublonner au lot 3 : `MAX_FREQUENCY_VALUE`, bornes d'années, motif `HH:mm`
    (moteur, schémas, import). Jusqu'au lot 3, **ne pas publier** : effets temporaires de #452 (PR
    #467) et import qui refuse un traitement sans prise et le type « médicament ». `06-mvp-scope.md`
    dit encore « Format JSON v2 ». Branche `docs/traitements-quotidiens` dépassée : la supprimer après
    accord de Gaelle. BIOS : SVM désactivé, pas d'émulateur tant que Gaelle ne le réactive pas.

- 2026-09-30 (soir) : **pause demandée par Gaelle, reprendre ici.** Lot 0 **mergé** : #456 (#349,
  « Ouvrir » après un export CSV ou PDF ; plus de bouton pour un JSON, qu'aucune app n'ouvre sur le
  téléphone de Gaelle : décision du jour, spec DO-6) et #457 (#384, « C'est fait » sur les
  notifications, premier code natif ; écart TR-20 accepté, corrigé au lot 4). Testés sur le téléphone
  dans MémoPatte Dev, puis MémoPatte Dev désinstallée, vraie app inchangée (0.1.37). `main` à **3564
  tests**. Les PR disaient `Closes #N` mais GitHub n'a pas lié les tickets : #349 et #384 fermés à la
  main (vérifier `closingIssuesReferences` après chaque PR). Tickets des lots 1 et 2 créés : #451
  (base neuve v9), #452 (périodes et prises), #453 (moteur d'échéances), #454 (export v3, démo), #455
  (miroirs Supabase). Échec Cloudflare Pages sur le merge de #456 : clone GitHub raté côté Cloudflare
  (erreur TLS), relancé par Gaelle, rien à corriger. **À faire ensuite, dans l'ordre** : #451, et
  #453 en parallèle ; puis #452 ; puis #454 et #455 (#455 avec Gaelle présente). Branche
  `docs/traitements-quotidiens` dépassée : la supprimer après accord de Gaelle.

- 2026-09-30 : **cadrage produit v1 terminé et entré dans le dépôt** (cette PR). Specs
  fonctionnelles validées (`docs/product/specs/`, règles numérotées), principes produit
  (`docs/product/principes.md`), modèle de données v2 (`docs/technical/modele-de-donnees-v2.md`),
  maquettes v1 validées (`docs/design/v1-specs/`, lots A, B, C en révision 2), journal des décisions
  des 28, 29 et 30 septembre, CLAUDE.md et périmètre alignés (PDF gratuit, médicaments, rappels précis
  en option, tournures neutres). Relecture de cohérence faite dans le coffre de Gaelle (216
  corrections). Les restes des maquettes à régler dans le code sont listés dans le plan de livraison
  (coffre, `product/12-plan-de-livraison.md` §4 bis). Glossaire anglais complété ; Gaelle ne juge pas
  l'anglais : à faire relire avec #353. **À faire ensuite, dans l'ordre** : tickets des lots 1 et 2
  (brouillons dans le coffre, `product/13-tickets-lots-1-2.md`), puis lot 0 (tests sur téléphone de
  #384 et #349, puis leurs PR) ; réécrire #447 (plusieurs heures) et mettre à jour #356 (choix de
  l'animal dans Paramètres) ; fermer la branche `docs/traitements-quotidiens`, dépassée.

- 2026-09-29 (soir) : **pause demandée par Gaelle, reprendre ici. Toujours aucun développement
  avant la relecture des specs par Gaelle.** Le cadrage produit est complet dans son coffre de notes
  (point d'entrée `Memo-Patte/docs/product/cadrage-produit.md`, section « Reprendre ici ») : 15
  parcours, matrice des fonctionnalités, 8 specs fonctionnelles, modèle de données v2 (M1 à M8 :
  périodes de traitement, prises « donnée / oubliée / reportée », réglages du carnet, **schéma v9
  neuf** qui remplace v1 à v8, import v3 seul), écart avec le code, **plan de livraison** (lots 0 à
  10, `12-plan-de-livraison.md`) et brouillons de tickets des lots 1 et 2
  (`13-tickets-lots-1-2.md`, créés sur GitHub après la relecture).
  - **Données** : l'app n'est pas publiée, toutes les données (MémoPatte Dev comme la vraie app de
    Gaelle) sont des données de test ; une migration peut repartir d'une base vide. Ça s'inverse à la
    publication.
  - **Maquettes v1** (Claude Design, `design/v1-specs/` du coffre) : lots A et B relus, 37 questions
    tranchées, **prompts de correction prêts** (`design/prompt-maquettes-v1-specs-corrections-lot-A.md`
    et `-lot-B.md`) ; Claude Design en panne, Gaelle les colle quand il remarche. Lot C : relecture
    lancée au moment de la pause, questions à poser ensuite.
  - **Décisions du jour qui changent l'existant** (au coffre, à reporter dans le dépôt par la PR de
    documentation) : chaque prise vise une échéance précise, jour et heure ; noter tard une dose non
    renseignée ne déplace pas la suite ; rappels précis permis (`SCHEDULE_EXACT_ALARM` sans
    déclaration Play, vérifié ; `USE_EXACT_ALARM` toujours interdite), l'option s'appelle « Rappels
    précis » ; « soin » au lieu de « rappel » sur l'accueil ; textes en tournures neutres ; âge en
    semaines jusqu'à 16 semaines ; « Valide jusqu'à » remplacé par « Prochain rappel le … ».
  - **À faire ensuite, dans l'ordre** : questions du lot C ; relecture des specs par Gaelle ; PR de
    documentation (specs, `decisions-log.md`, CLAUDE.md, `06-mvp-scope.md`, glossaire) ; tickets
    des lots 1 et 2 ; lot 0 (tests sur téléphone de #384 et #349, puis PR). La branche
    `docs/traitements-quotidiens` est dépassée : à fermer.

- 2026-09-28 (soir) : **pause demandée par Gaelle, reprendre ici. Plus aucun développement avant des
  specs validées** (décision de Gaelle du jour : « on a été beaucoup trop superficiels », reprendre la
  partie produit « dans les règles de l'art »).
  - **Matin** : **#445 mergée** (#352 unité de poids kg / lb ; merge de `main` avec les conflits
    attendus de #409, re-revue ciblée, captures kg et lb), `main` à **3470 tests** ; branche et worktree
    supprimés. `feat/export-ouvrir` (#349) mise à jour avec `main` (le journal ne garde qu'une entrée
    du choix du plugin), toujours sans PR : test sur téléphone à faire. #384 non touchée.
  - **Déclencheur** : en testant un vermifuge « tous les jours », Gaelle a trouvé des trous de
    conception (prochaine dose passée affichée, doses manquées invisibles, pas de date de fin, pas de
    début futur). Spec `docs/technical/traitements-quotidiens.md` et entrée de journal sur la branche
    `docs/traitements-quotidiens` (sans PR) : **dépassée** par le cadrage ci-dessous, à réécrire.
  - **Cadrage produit dans le coffre de Gaelle** (méthode Roman Pichler), point d'entrée
    `Memo-Patte/docs/product/cadrage-produit.md` (méthode, état, décisions, questions, « Reprendre
    ici ») : `07-personas`, `08-principes`, `09-vision-board`, `10-go-roadmap`, `parcours/` (1 à 7 écrits
    et tranchés, 8 en brouillon, 9 à 15 à écrire), `technical/recherche-permissions-rappels.md`,
    `technical/analyse-programmation-rappels.md`.
  - **Décisions du jour qui contredisent l'existant** (au coffre ; à reporter dans `decisions-log.md`,
    CLAUDE.md et `06-mvp-scope.md` une fois le cadrage validé — d'ici là, **ne pas coder d'après
    CLAUDE.md sur ces points**) : médicaments et plusieurs prises par jour en v1 ; export PDF gratuit
    (à condition de trouver l'attrait de Plus, parcours 12) ; rappels précis en option
    (`SCHEDULE_EXACT_ALARM` en contexte et dans Paramètres) ; plus de fenêtre de 60 jours (plafond de
    400 gardé, notification de relais) ; vaccins prévenus 2 semaines avant ; « C'est fait » touché en
    retard demande la date ; « Reprendre » crée une nouvelle période ; « Première prise le » (future
    possible, rien coché à la création) ; date de fin, posologie structurée (11 unités), heure du
    traitement (#447, ticket mis à jour) ; v1 avec Plus et phase de test interne avant la sortie ;
    mot « cure » banni de l'app.
  - **Nouvelle règle** (`collaboration.md`) : tout document produit pour Gaelle a sa copie dans son
    coffre d'abord ; prompts Claude Design et relectures ne vont que là.
  - **À faire ensuite, dans l'ordre** : parcours 8 (deux questions), puis 9 à 15 ; relecture des
    parcours par Gaelle ; specs par domaine ; revue globale du modèle de données (décision de Gaelle :
    à la fin, pas sujet par sujet) ; maquettes ajustées (planches `design/DosesQuotidiennes/` du coffre :
    garder le formulaire actuel, Q8 ter à corriger) ; écart avec le code ; tickets. En pause : tests sur
    téléphone de #349 et #384.

- 2026-09-27 : **pause demandée par Gaelle, reprendre ici.** Mergés : Dependabot #437
  (material-symbols), #436 (vue 3.5.43), #434 (sass), #435 (vuetify 4.2.2), après **#438** (Vuetify
  4.2 met `overflow: hidden` sur `.v-btn` : la pastille Plus du bouton PDF du Carnet était rognée ; vu
  seulement en comparant des captures, tests verts) ; **#441** (Vitest 5, ferme #439 et remplace #433
  : deux tests de `App.spec.ts` montaient l'app avec le vrai routeur, qui charge l'accueil et ses
  stores sans Pinia) ; **#442 (#409, noms limités à 80 caractères, emoji retirés du PDF, migration v8
  ; migration Supabase appliquée au vrai projet avec Gaelle présente, job vert)**. `main` à **3385
  tests**. **Piège à retenir** : une montée de Vuetify se vérifie aussi à l'œil (captures avant /
  après avec `pnpm dev:data` et Playwright), les tests tournent avec `css: false`. Les avertissements
  CI « Signal d'usage non enregistré… `setItem` » existent déjà avec Vitest 4, absents en local
  (ticket proposé, pas créé). **À faire ensuite, dans l'ordre** : #352 (`feat/unite-de-poids`, merger
  `main` : conflits attendus avec #409 dans `AnimalFormView`, deux specs, `toCsvTables(data, 'kg')`) ;
  tests sur le téléphone de #349 et #384 (MémoPatte Dev), puis leurs PR.

- 2026-09-26 (fin d'après-midi) : **pause demandée par Gaelle, reprendre ici demain.** Site public en
  ligne sur `memopatte.gaelle-briet.fr` (dossier `site/`, Cloudflare Pages, CNAME chez Infomaniak) :
  page d'attente (#423), politique de confidentialité et page de suppression de compte FR/EN (#428,
  vérifiées contre le code, revue et re-revue), page 404 (#430). Filtre Cloudflare `site/*`
  opérationnel (le champ du tableau de bord demande Entrée pour valider chaque valeur). Mentions
  légales sur `gaelle-briet.fr/mentions-legales/` (dépôt de son site, PR mergée par Gaelle ; téléphone
  en PR #11 de ce dépôt, à merger par elle). Décisions du jour au journal (site, contact
  `memopatte@gaelle-briet.fr`, durées, vouvoiement, remboursement, **compte d'abord puis achat**).
  Tickets créés : #425 (« anonymes »), #426 (purge des comptes inactifs), #427 (compte avant l'achat)
  ; notes sur #65, #86, #87. Les pages du site décrivent le parcours voulu : ne pas les déclarer dans
  la Play Console avant #427, #87, #65 et #426. D-U-N-S : réponse de D&B attendue. **À faire demain,
  dans l'ordre** : mettre à jour `fix/limites-texte-emoji` (#409, 26 commits de retard), quatre
  commandes, PR, montrer la migration à Gaelle puis merger devant elle ; #352 ensuite (conflits connus
  avec #409) ; tests sur le téléphone de #349 et #384 (MémoPatte Dev), puis leurs PR.

- 2026-09-26 (matin) : **Gaelle prépare Play Console et RevenueCat**, rien n'a été mergé ni lancé côté
  code. Sa micro-entreprise existe, avec une adresse de domiciliation pour l'adresse publique.
  **Compte organisation recommandé** (pas de test fermé de 12 testeurs × 14 jours) : il attend le
  **D-U-N-S**, demandé le matin par l'outil d'Apple (réponse de D&B sous 5 jours ouvrés) ; nom et
  adresse de la fiche D&B à recopier tels quels dans le profil de paiement Google. Guide pas à pas :
  `technical/guide-play-console-revenuecat.md` du coffre de notes. Ticket créé : #418 (`singleTop`,
  après #384). Questions notées pour plus tard : achats de test sur la vraie app, prix hors de France,
  déclaration « Health apps ». Stratégie produit, audit de Fable et guides de console déplacés dans le
  coffre de notes (règle dans `collaboration.md`). **Toujours à faire, dans l'ordre de l'entrée
  suivante** : #409 avec Gaelle présente, #352, tests sur le téléphone de #349 et #384.

- 2026-09-25 (fin de soirée) : **pause demandée par Gaelle, reprendre ici demain.** Gaelle a répondu
  aux questions en attente (journal du 2026-09-25 soir, points 1 à 5) : variation de poids à partir des
  poids affichés (#352) ; anciens noms de plus de 80 caractères coupés par la migration (#409) ; bouton
  de notification et textes « déjà notée (aujourd'hui) » validés (#384) ; ticket #416 créé (CSV
  traduit). Les agents appliquaient ces réponses sur leurs branches au moment de la pause.
  **À faire demain, dans l'ordre** :
  1. vérifier que les trois branches ont bien reçu leurs corrections (commits poussés, quatre commandes
     vertes), relecture ciblée si besoin ;
  2. **#409 d'abord, avec Gaelle présente** (migration Supabase appliquée au vrai projet par la CI) ;
  3. #352 ensuite : merge de `main` et résolution des conflits attendus avec #409 (`AnimalFormView`,
     deux specs, `toCsvTables(data, 'kg')`) ;
  4. **test sur le téléphone** (MémoPatte Dev, rien sur la vraie app) de #349 (ouvrir un PDF, un ZIP,
     un JSON) et de #384 (app fermée, rejeu à la réouverture par les récents et par l'icône), puis leurs
     PR ; #384 porte le premier code natif du dépôt (`MainActivity.java`) ;
  5. au merge de #349, le journal aura deux fois sa décision (sur la branche et ici) : n'en garder
     qu'une.

- 2026-09-25 (soir) : **reprendre ici.** Mergés depuis le point de midi : #410 (#401, noms longs
  à la ligne dans le PDF, « Arrêté le »), **#412 (#383, synchro des injections et des prises : migration
  Supabase appliquée au vrai projet avec Gaelle présente, CI verte ; curseur de pull par table, v7)**,
  #413 (#382, export JSON v2 avec l'historique, import v1 et v2, CSV séparés, PDF regroupé ; règle
  « la modification la plus récente (`updated_at`) gagne »), #414 (planche F10 corrigée). `main` à
  **3223 tests**. **Branches prêtes, sans PR, en attente** :
  - `feat/unite-de-poids` (#352) : attend la réponse de Gaelle sur le calcul de la variation (à partir
    des poids affichés, recommandé, ou exact) ; en-têtes CSV `weightLb` gardés (ticket de traduction du
    CSV proposé : titres, valeurs, séparateur selon la langue) ;
  - `fix/limites-texte-emoji` (#409) : attend la réponse sur les noms de plus de 80 caractères
    enregistrés avant la v8 (ne rien couper et parade dans #83, recommandé) ; **merge avec Gaelle
    présente** (migration Supabase) ; conflits attendus avec #352 (`AnimalFormView`, deux specs,
    `toCsvTables(data, 'kg')`) ;
  - `feat/notification-cest-fait` (#384, worktree `.claude/worktrees/notification-cest-fait`) : attend
    les réponses sur les noms accessibles (impossibles sur Android, garder « C'est fait ») et le texte
    « déjà noté » (« … déjà notée aujourd'hui » si du jour), puis **test sur le téléphone** (app fermée,
    rejeu à la réouverture) ; premier code natif du dépôt (`MainActivity.java`) ;
  - `feat/export-ouvrir` (#349, plugin `@capawesome-team/capacitor-file-opener`, décision au journal
    sur la branche) : attend le **test sur le téléphone** (PDF, ZIP, JSON).
    Tickets créés : #409 (tranché, en cours), #401 (fait). Notes ajoutées sur #83 : heure serveur au début
    de transaction, pagination bloquée par un même `server_updated_at`, curseurs à remettre à zéro à la
    déconnexion, `clearPullCursors()`, ligne refusée par un CHECK qui ne doit pas bloquer la file. Toujours
    mis de côté par Gaelle : l'audit de Fable et les suites de #388.

- 2026-09-25 : **reprendre ici.** Mergés dans la journée : #399 (#398, plus d'erreur au démarrage
  quand `cache/exports/` n'existe pas : le pont Capacitor journalise tout rejet natif en debug, même
  rattrapé), #403 (#386, sauts de page et numéros de page du PDF), #404 (étude
  `docs/product/etude-variation-poids.md` et décisions du jour), #405 (#385, variation « +0,3 kg depuis
  le 25 août », chiffre seul dans le bandeau), #406 (#402, corriger ou supprimer une pesée avec
  « Annuler »), #407 (#381, détail d'un vaccin et d'un traitement, historique, traitements terminés,
  reprise, redatage). `main` à **3109 tests**. Décisions de Gaelle au journal du 2026-09-25 (variation
  de poids, pesées, dialogue de suppression, redatage). Testé sur le téléphone dans MémoPatte Dev avec
  #381, #385 et #402 intégrés, puis MémoPatte Dev désinstallée ; **pas revérifié depuis les derniers
  correctifs de #381** (focus des menus ⋮, toast sur trois lignes, injection déplacée qui redemande le
  rappel). **Écart de process signalé à Gaelle** : lecture d'une copie de la base de la vraie app pour
  en prendre l'empreinte, alors que la règle de #388 l'interdit ; copie supprimée, ne plus le faire.
  **Nouveaux tickets** : #401 (PDF : noms longs et « Pas de rappel » en double, recommandation à
  trancher). **Suite** : #382 (export v2, PDF regroupé ; #386 fait), #383 (synchro des événements :
  merge avec Gaelle présente, migrations Supabase), #384 (bouton de notification, attend la planche
  F10 corrigée), #352 (unité kg / lb, le texte passe déjà par `shared/domain/weight-delta.ts`). Toujours
  mis de côté par Gaelle : l'audit de Fable (`audit-2026-09-24.md` du coffre de notes) et les suites de #388.

- 2026-09-24 (soir) : **pause demandée par Gaelle, reprendre ici.** **#395 mergée (#380, marquer un
  rappel comme fait)** : feuilles F2 à F6 depuis « À faire » (fenêtre J+29), toast « Annuler », dialogue
  de confirmation partagé, arrêt d'un traitement, « Modifier » avec retour sur la feuille rouverte,
  « C'est un rappel de Carré ? » à Enregistrer, titre du calendrier touchable (deux choix de Gaelle,
  au journal du jour). `main` à **2828 tests**. Testé sur le téléphone dans MémoPatte Dev (vrai
  plugin, vrais touchers), puis MémoPatte Dev désinstallée ; vraie app intacte (base v5, jamais
  rouverte depuis sa réinstallation). **Piège de test à retenir** : un clic simulé par CDP
  (`element.click()`) ne donne pas d'activation utilisateur, Chrome saute alors au retour les entrées
  d'historique qu'il a créées et le retour Android peut mettre l'app en arrière-plan ; pour tester la
  navigation, toucher pour de vrai (`adb shell input tap` aux coordonnées du bouton : x·dpr,
  126 + y·dpr sur ce téléphone). **Ne pas publier de version avant #381** : un traitement arrêté
  disparaît du Carnet alors que le toast annonce « Traitements terminés », et la date d'une prise
  passée ne se corrige plus par « Modifier ». **Suite** : #381 (détail, historique, traitements
  terminés), puis #382 à #384. Toujours mis de côté par Gaelle : l'audit de Fable
  (`audit-2026-09-24.md` du coffre de notes) et les suites de #388.

- 2026-09-24 (après-midi) : **reprendre ici.** Mergés : #390 (#388, app de dev séparée « MémoPatte
  Dev », `com.gaellebriet.memopatte.dev`, installée par `pnpm dev:mobile` et `pnpm test:device:dev` ;
  la vraie app ne reçoit que `main` par `pnpm test:device`), #389 (#351, Historique du poids par pages
  de 12 pesées, sous-titre des écrans poussés collé au titre) et **#391 (#379, migration v6 de
  l'historique)**. `main` à **2647 tests**. Migration rejouée sur le téléphone avec le vrai plugin
  (MémoPatte Dev, v5 puis v6) : données, identifiants, déclencheurs et 12 rappels identiques ;
  MémoPatte Dev désinstallée ensuite (absente avant le test). Pas d'émulateur possible : `/dev/kvm`
  absent. Décision de Gaelle du jour : l'import v1 rattache sa ligne à l'événement **de même date**.
  **Vraie app réinstallée depuis `main`** (0.1.37, par `./gradlew :app:installDebug`, sans l'ouvrir) :
  sa base, sauvegardée avant, est intacte en v5 et passera en v6 à la prochaine ouverture.
  **Petit défaut vu au passage, sur `main`** : `clearExports()` logue une erreur au démarrage quand
  `cache/exports/` n'existe pas encore (`OS-PLUG-FILE-0008`), sans effet.
  **Mis de côté par Gaelle** (« on voit ça après, quand le reste est ok ») : (1) l'audit de Fable,
  vérifié point par point, tickets rédigés dans `audit-2026-09-24.md` du coffre de notes, rien créé sur
  GitHub ; (2) les trois suites de #388 : installer sans que `cap run` puisse désinstaller la vraie
  app, garde « `test:device` depuis `main` seulement », phrase de `collaboration.md` sur la vraie app.
  Suite du lot historique : #380 (« Fait »), puis #381 à #384 ; #352, #385, #386 en attente.

- 2026-09-24 : **reprendre ici.** Maquette « rappel fait » reçue (`docs/design/rappels/`, écarts
  tranchés au journal du jour, points 1 à 5 ; planche F10 à faire corriger par Gaelle : l'app
  s'ouvre). **Modèle de l'historique tranché** (journal du jour ; spec
  `docs/technical/proposition-historique-rappels.md` §10). Prochaine étape : relecture de la spec
  (Gaelle, éventuellement Fable), puis tickets dans l'ordre du §10.9. **À ne pas oublier** : la
  réconciliation des prises à fréquence périmée est à faire avec l'activation de la synchro (#83,
  critère ajouté sur le ticket). #352 : unités kg / lb, défaut lb aux États-Unis, exports JSON / CSV
  en kg, PDF dans l'unité choisie (tranché le 2026-09-24, maquette attendue). #351 : nombre de pesées
  par page à juger sur la maquette (12 proposé).

- 2026-09-23 (soir) : **lot du soir.** Mergés dans la soirée : #367 (#344 « À faire » sur 30 jours,
  « Prochain rappel » à la place de « Aucun rappel à venir »), #369 (#354 toasts pétrole, au-dessus de
  toute barre fixe, tonalités réussite / information / échec), #370 (#350 courbe du PDF sur l'axe du
  temps ; aucune étiquette ne touche la ligne de base, Carnet compris). `main` à **2485 tests**, puis #373 (bande vide retirée sous la ligne de base de la courbe du Carnet, la place va au tracé) : voir la PR du même nom.
  Décisions au journal : « Cycle de vie d'un rappel » et « Finitions de #344, #350 et #354 ».
  **En attente de Gaelle** : (1) modèle de données de l'historique (#364) — document de comparaison
  sur la branche distante `docs/proposition-historique-rappels`, sans PR ; elle penche pour « une
  ligne de vaccin par injection » ; (2) maquette Claude Design de la feuille « Fait » (prompt donné,
  planches F1 à F11) ; (3) maquettes de #351 et #352 ; (4) #365 médicaments ; (5) ordre des tickets
  de synchro. Non vérifié sur appareil : l'annonce TalkBack des toasts (délai de 100 ms), la courbe
  avec police système agrandie, l'action de notification quand l'app est fermée.

- 2026-09-23 (fin) : **lot mergé.** Lot « retours de navigation » **mergé** : #346 (#339
  accueil à un animal), #355 (#342 + #341 écran Plus et pastille), #358 (#340 courbe de poids),
  #359 (#343 export enregistré dans Documents). `main` à **2403 tests**. Testé sur le téléphone de
  Gaelle (Android 16) avec le lot intégré : chip et feuille pesée à un animal, pastille, écran Plus
  depuis le PDF, courbe du Carnet, export JSON et CSV écrits dans Documents › MémoPatte sans
  permission, suffixe ` (1)` dans la même minute ; base sauvegardée puis restaurée à l'identique,
  fichiers de test et entrée MediaStore supprimés, build de `main` réinstallé. **Non testé sur
  appareil** : courbe avec la police système agrandie (réglage système interdit au test), export PDF
  (Plus requis), parcours Android 7 à 10 (émulateur API 29 nécessaire).
  **Suivis ouverts** : #344 (brainstorming de la liste « À faire », prochaine étape convenue), #349
  (« Ouvrir » du toast), #350 (courbe du PDF), #351 (Historique par pages, maquette Claude Design à
  recevoir), #352 (unité de poids, trois questions et maquette), #353 (relecture EN), #354 (style
  des toasts, plus le minuteur qui ne repart pas sur un message identique), #356 (PDF de tous les
  animaux). Synchro (#83, #40, #87…) à ordonner ensuite avec Gaelle.

- 2026-09-23 : **point de départ de la journée.** Gaelle a commencé à vérifier sur son téléphone le travail
  livré (`pnpm dev:mobile` depuis son dépôt principal). Deux questions lui ont été posées, la
  première est tranchée ; elle revient avec des retours de navigation dans l'app.

  **Premier retour, pas un bug de l'app** : sur l'écran « Avant de commencer », les boutons
  semblaient morts. Ils recevaient bien le tap (vérifié par `elementFromPoint`) et le choix était
  enregistré, mais le passage à l'accueil échouait. Le lien `adb reverse tcp:5173` avait sauté
  (reconnexion USB), donc chaque écran chargé à la demande échouait (console : « Failed to
  fetch dynamically imported module »). Rétabli par `adb reverse tcp:5173 tcp:5173`, l'app s'est
  rechargée seule. Symptôme à reconnaître : tout tap qui change d'écran « ne fait rien ».

  **Piège trouvé au passage** : dans le dépôt principal de Gaelle,
  `android/app/src/main/assets/capacitor.plugins.json` (ignoré par git) datait du 2026-09-07.
  `dev:mobile` tourne en `--no-sync` et ne le régénère jamais : seuls SQLite et les notifications
  y figuraient, donc App, Camera, Filesystem, Share et Network étaient « not implemented on
  android » en dev. Remède immédiat donné : `pnpm cap:sync` une fois, puis `pnpm dev:mobile`.

  **Question 1 tranchée par Gaelle** : `dev:mobile` lance désormais `cap update android` avant le
  `cap run` (liste des plugins régénérée sans build web, une seconde), et un `cap:sync` complet
  seulement si le dépôt n'a jamais été synchronisé. Plus de consigne à retenir.

  **Question 2 en attente** : quel lot lancer maintenant que #39 est mergé. Candidats : #83
  (amorçage de la synchro à la souscription), #40 (restauration), #87 (suppression de compte,
  débloqué par le bucket du Lot B), #82 (Auto Backup sur appareil), #51 (troisième critère, un
  second écran).

- 2026-09-22 : **#39 mergé (PR #334)** — cycle push/pull réel, Lot C de la synchro. Port par table
  (`core/sync/service/syncable-table.ts`) implémenté par les quatre repositories, `core/sync`
  n'écrit ni SQL ni appel Supabase direct. Pagination du pull avec curseur repositionné à
  `last_pulled_at` **pour chaque table** (pas chaîné d'une table à l'autre, sinon des modifications
  d'une table pas encore parcourue seraient sautées). Ping-pong (§3.4) vérifié avec les vrais
  triggers SQLite. `syncAllReminders()` rappelé après un pull touchant animal/vaccination/treatment
  (#41 avancé). `@capacitor/network` ajouté, `android/` resynchronisé, vrai `assembleDebug` relancé.

  **Point technique à retenir.** L'upsert atomique du doc, une seule requête avec condition sur
  `updated_at`, n'est pas exprimable via PostgREST (pas de condition possible sur un upsert).
  Remplacé par `guardedUpsert` (`core/supabase/guarded-upsert.ts`) : deux écritures indépendantes,
  chacune atomique (mise à jour conditionnée puis création si absente). Analysé : sûr pour deux
  appareils qui modifient la même ligne existante, le plus récent gagne quel que soit l'ordre.
  Fenêtre théorique résiduelle seulement sur la création simultanée de la même ligne pour la toute
  première fois par deux appareils à quelques ms d'intervalle — accepté comme compromis, une
  fonction RPC réglerait ça si besoin un jour.

  **Bug réel trouvé en testant contre une vraie instance Supabase locale** (jamais le vrai projet) :
  PostgREST rend un horodatage avec un décalage `+00:00`, jamais avec un `Z` final — la garde SQLite,
  une comparaison de chaînes, aurait pu juger une ligne distante plus ancienne à tort malgré un
  instant identique. Corrigé par `normalize-sync-timestamps.ts`.

  **Reste avant que ça serve à quelque chose en vrai** : #83 (amorçage à la souscription) est le seul
  endroit qui doit activer `sync_state.enabled` — sans lui, la file de Lot A reste vide pour tout le
  monde (sans effet pratique aujourd'hui, RevenueCat bloqué). #40 (restauration) reste aussi hors
  scope.

- 2026-09-22 : **Plugin Google tranché** — `@capawesome/capacitor-google-sign-in` (voir
  `docs/product/decisions-log.md` du jour). Le SIRET n'est toujours pas là (micro-entreprise pas
  créée) : Play Console/RevenueCat restent en pause côté Gaelle.
- 2026-09-21 : **#313 fermé — pas un bug, testé en vrai sur le téléphone (build de prod et
  `pnpm dev:mobile`).** En production, le sélecteur de photo s'ouvre du premier coup, à chaque
  fois. En dev, seule la **toute première** navigation vers un écran neuf dans une session fraîche
  peut couper un tap : Vite découvre à ce moment-là des composants Vuetify auto-importés
  (`VBottomSheet`, `VChip`, `VBtnToggle`…) pas encore dans son cache, s'optimise à chaud et
  recharge tout le live-reload (log Vite : « optimized dependencies changed. reloading »). Un
  correctif ciblé (`optimizeDeps.include` sur `@capacitor/camera`) a été essayé et écarté : ce
  n'était pas la bonne dépendance, donc aucun effet. **Piège général à retenir**, pas spécifique
  aux photos : le premier tour d'un écran jamais visité dans la session `pnpm dev`/`pnpm dev:mobile`
  en cours peut demander un deuxième essai — ça n'existe pas dans le vrai build (aucune
  optimisation à chaud dans un bundle de prod).
  **Incident de process signalé** : ce test a réinitialisé la base SQLite du téléphone plusieurs
  fois (jetons `VITE_FIXTURES` différents à chaque relance) sans sauvegarde préalable, contrairement
  à ce que dit `collaboration.md`. Aucune perte connue, mais la règle n'a pas été suivie — à corriger
  la prochaine fois : sauvegarder la base avant tout test qui touche aux fixtures.
- 2026-09-21 : **CI des migrations Supabase mise en place** (`.github/workflows/supabase-migrations.yml`,
  détail dans le coffre de notes de Gaelle, `docs/technical/supabase-migrations-ci.md`) — `supabase db
push --db-url` vers le Session Pooler, sans `supabase link` (cassé avec les tokens à permissions
  fines du Dashboard, [supabase/supabase#50244](https://github.com/supabase/supabase/issues/50244),
  encore ouvert) ni jeton de compte. Rattrape d'un coup les six migrations du Lot B jamais appliquées
  (miroir Postgres, droit Plus, RLS, bucket photos).
  **Incident signalé** : Gaelle a posé par erreur les secrets GitHub d'un tout autre projet
  (`symbaroum-bestiary`) sur le dépôt MémoPatte ; les six migrations sont donc parties sur la base
  Symbaroum au lieu de MémoPatte. **Contenu, sans perte** : les migrations n'ont fait qu'ajouter des
  objets nouveaux (4 tables, 2 fonctions, un bucket), jamais touché aux tables existantes de Symbaroum
  (`monsters` et son `grant` intacts) — tout supprimé proprement par `drop ... if exists` (le bucket via
  le Dashboard, la suppression directe des tables `storage.*` étant bloquée par
  `storage.protect_delete()`). Mot de passe de la base Symbaroum réinitialisé par précaution. Les bons
  secrets MémoPatte posés ensuite, migrations réellement appliquées sur le vrai projet, CI vérifiée
  verte. **Réflexe à en retenir** : après avoir posé des secrets dans un dépôt, vérifier une fois le nom
  du projet visé avant de relancer un job qui écrit dans une vraie base.
- 2026-09-19 : **pause demandée par Gaelle — reprendre exactement ici.**
  - **PostHog : fait et vérifié de bout en bout.** Clé posée dans `.env`, consentement testé sur le
    téléphone (`pnpm dev:mobile`, `VITE_ANALYTICS_CONSENT=ask` nécessaire pour voir l'écran en
    navigateur — sauté par défaut en dev hors natif), pageview reçu côté PostHog EU Cloud. Seul
    point laissé ouvert, pas bloquant : la rétention « 13 mois » de la doc n'est pas un réglage
    PostHog — la rétention des événements est fixée par palier d'abonnement (1 an gratuit, 7 ans
    payant), pas configurable à une valeur arbitraire. À trancher plus tard : ajuster ce que dit la
    politique de confidentialité sur la durée réelle, ou prévoir une purge programmée via l'API
    PostHog à 13 mois.
  - **Connexion Google (#65) : en cours, rien encore exécuté.** Projet Google Cloud « MémoPatte »
    créé par Gaelle. Guide donné pour la suite, vérifié dans la doc Supabase à jour (pas juste de
    mémoire) : le flux recommandé aujourd'hui est **Credential Manager + `signInWithIdToken`**,
    **sans** deep link — ça contredit ce que dit #65 (« schéma de redirection / deep link configuré
    côté Android et côté Supabase ») ; à corriger sur le ticket une fois qu'on y revient. Trois
    étapes détaillées, prêtes à exécuter dès que Gaelle veut s'y remettre : (1) écran de consentement
    OAuth sur le projet MémoPatte, (2) un client OAuth **Web** (« server client ID », donne un
    Client ID + Secret) et un client OAuth **Android** avec le SHA-1 **debug**
    (`cd android && ./gradlew signingReport`) — le SHA-1 de **release** attendra le premier upload
    Play Console, #53 n'étant pas fait (keystore pas créé) ; (3) déclarer dans Supabase → Auth →
    Providers → Google (client Web en principal, client Android en « Client ID supplémentaire
    autorisé »). ~~Reste à trancher avant du code : quel plugin Capacitor fait l'appel natif~~
    tranché le 2026-09-22 : `@capawesome/capacitor-google-sign-in` (voir decisions-log). Candidats
    comparés le 2026-09-19, à l'époque encore ouverts :
    `@capawesome/capacitor-google-sign-in`, `@capgo/capacitor-social-login`.
  - ~~#313 ouvert, pas encore investigué sur l'appareil~~ fermé depuis, pas un bug — voir l'entrée
    du 2026-09-21 ci-dessus.
  - **Play Console / RevenueCat en pause côté Gaelle**, en attente de la création de sa
    micro-entreprise — rien à faire de mon côté tant que ce n'est pas réglé.
- 2026-09-19 : **nettoyage de ce fichier** — deux entrées du 2026-09-16 corrigées après vérification (issues et branches réellement encore ouvertes) : `fix/conformite-maquettes` a atterri dans `main` depuis (le test qui verrouille le correctif, `row-title-wrap.styles.spec.ts`, y est) — la branche n'existe plus, rien à reprendre ; #66 et #67 (consentement analytics) sont fermées, réglées par la PR #269 mergée, la question de poids des boutons ne reste pas ouverte. Le reste de l'entrée du 2026-09-16 sur les dépendances externes (#187, #65, #47, PostHog, #8) reste exact, vérifié à la même date
- 2026-09-16 : **audit visuel app ↔ maquettes, puis lot de conformité** — branche `fix/conformite-maquettes` (mergée depuis) : 15 écarts relevés à la lecture des planches et tous corrigés (icône Paramètres sur la ligne du titre, astérisque collée au libellé, tri des vaccins par échéance, barre du bas pleine largeur, suffixe « kg » et icône date visibles, flèche de retour sur la ligne du titre…), plus **#282** (le mot « vaccin » ne précède plus le nom saisi, FR et EN, accueil et notifications) et l'ordre de création des chips. **Piège de mise en page à retenir** : sur une ligne « titre + badge », c'est le `min-width: 0` de la colonne de titre — pas la valeur d'`overflow-wrap` — qui laisse le flex couper un mot en deux ; il faut `flex-wrap: wrap` sur la ligne et `margin-inline-start: auto` sur le badge, verrouillés pour les trois listes par `row-title-wrap.styles.spec.ts`. **Piège d'outillage** : `vite.config.ts` supprime `sql-wasm.wasm` de tout build et `web-sqlite.ts` lève hors de `import.meta.env.DEV` — pour servir un build avec données, `NODE_ENV=development vite build --mode development` **et** recopier `public/assets/sql-wasm.wasm` dans `dist/assets/`
- 2026-09-16 (nuit, autonomie complète) : **mergés** — #244 (#44 service billing RevenueCat : trois offres, statut Plus persisté, indisponible sans clé, aucun appel pour un gratuit), #246 (#7 + #9 session Supabase persistante, drapeau « compte Plus » local, client chargé seulement à la première opération de compte), #247 (#90 outillage : rien à monter, maintien en pnpm 10 consigné), #249 (avance #41 : test d'intégration de la reprogrammation des rappels sur appareil restauré). `main` à **1607 tests**
- 2026-09-16 : ~~en attente d'une réponse de Gaelle sur `feat/consentement-statistiques` (#66 + #67)~~ réglé depuis, voir l'entrée du 2026-09-19. **PR #248** (proposition d'architecture de l'épic sync) : dix décisions de modèle de données à trancher, à ne merger qu'après — en cours, réglées une par une à partir du 2026-09-19 (voir `docs/product/decisions-log.md`)
- 2026-09-16 : **dépendances de Gaelle** — clé publique RevenueCat `goog_…` + produits Play Console (#47) ; projet PostHog EU (clé, « Discard client IP », rétention, DPA) ; projet Supabase à peupler (#187) et région à fixer ; configuration Google OAuth native (#65) ; confirmation d'e-mail à l'inscription à trancher avant #6 ; #8 à réaligner sur #7 (le drapeau est effacé à la déconnexion)
- 2026-09-15 : **flux de travail** — chaque agent travaille dans son propre worktree sous `.claude/worktrees/`, **jamais** dans l'espace Orca `Dev` de Gaelle (un agent s'y est trompé le 2026-09-16, sans perte) ; machine à 15 Gio : un seul Vite/Chromium à la fois, émulateur démarré juste avant un test et arrêté aussitôt ; merge par script (attente de la CI, `update-branch`, merge, vérification de `main`), suppression de la branche distante par `gh api -X DELETE` seulement après « mergée, main vérifiée »
- 2026-09-13 : **lot 6 en PR, en autonomie**, ordre de merge conseillé **#173 → #158 → #164 → #166 → #165 → #171** — #173 (routeur mémoire dans le spec de la barre du bas : 2,5 s → 33 ms, il faisait expirer `vitest run` sous charge), #158 (#147 resync `android/` après Capacitor 8.5.1), #164 (#30 feuille pesée), #166 (#36 accueil v2, 5 états ; « Ton foyer » faute de prénom, pas d'icône Paramètres avant #48, Actions rapides à #37), #165 (#157 fixtures `pnpm dev` / `pnpm dev:data`, **test sur téléphone à faire par Gaelle avant merge**), #171 (#25 formulaire traitement + patron `shared/form/` repris par les trois formulaires ; conflit `fr.json` attendu après #166, deux blocs à garder). Toutes les branches fusionnées à l'essai : 725 tests verts
- 2026-09-13 : **tickets de suivi créés** — #167 badge d'échéance partagé (les teintes « En retard » divergent entre Carnet et Accueil), #168 rafraîchir les écrans au retour au premier plan (« Aujourd'hui » reste affiché le lendemain), #169 onglet actif de la barre du bas sans fond gris, #170 `AnimalChipSelector` sans « + » ni débord (la feuille pesée le surcharge en CSS), #172 texte clair sur l'option cochée du sélecteur à boutons. Suites naturelles : #37 Actions rapides (ses trois destinations existent), #31 suivi de poids
- 2026-09-13 : **dettes remboursées** — patron formulaire extrait (`FormScreen`, `FormField`, `FormSegmented`), `todayIsoDate` dédupliqué, contrôle « rien des fixtures en prod » sorti de `vitest run` (`pnpm test:build` en CI, marqueur dédié plutôt que noms de démo). **Nouvelle exception d'architecture** : `core/dev/` importe les repositories des features (decisions-log et règle ESLint dans #165)
- 2026-09-13 : **suppression des branches mergées bloquée** par le mode automatique (`git push origin --delete`) : 10 branches des lots 4 et 5 restent sur GitHub, à supprimer par Gaelle ou après autorisation de la commande
- 2026-09-09 (soir) : **lot 5 mergé** — #141 (#35 agrégation des échéances, module pur), #142 (#127 édition d'un animal), #143 (#139 + #140 stores weight et treatments), #138 (règle `Closes #N`), #144 (test vaccins sans dents). En PR : #146 (#50 icône, splash). **En cours : #17 le Carnet** (`CarnetView` remplace `AnimalsView`, sections par feature, `reminders.ts` déménage dans `shared/`, cascade traitements branchée). Tickets créés : #147 (resync `android/` après montée Capacitor)
- 2026-09-09 : **ménage** — 11 tickets fermés à la main (mes PR disaient « Ferme #N », GitHub ne lit que `Closes`), 30 branches distantes et 41 locales mergées supprimées. Restent ouverts volontairement : #90 (`pnpm check` sur la machine de Gaelle), #82 (test Auto Backup sur appareil, règles XML vérifiées), #23 (part « échéance » couverte par #35), #16 (requalifié)
- 2026-09-09 : **bloqués faute de maquette** — #11 (écran de priming) et #12 (permission refusée) ; #22 (notifications des vaccins) attend #11, sinon la popup système apparaîtrait sans explication. Un écran de contenu simple suffit
- 2026-09-09 : **à brancher après #17** — #25 formulaire traitement (et l'extraction du patron champ/label/erreur dans `shared/`, dupliqué entre les deux formulaires), #30 feuille pesée, #31 suivi de poids, #36 accueil (mapping vers `shared/reminders.ts`, icône de ligne selon le type de traitement). #101 doit préserver la photo en édition (note sur le ticket)
- 2026-09-09 : **lot 4 en PR, ordre de merge #132 → #134 → #133 → #136 → #135** — #132 règle « jamais de PR empilée », #134 (#102 cascade de suppression : vaccins + pesées branchés, traitements à brancher d'une ligne après #133), #133 (#24 table `treatment`, fréquence valeur + unité, `next_due_date` stockée), #136 (#20 formulaire vaccin + store `vaccinations` + tokens du patron formulaire dans `_tokens.scss`), #135 (journal des décisions du jour). Mergés plus tôt : #128 maquettes pesée/poids, #129 (#29 table `weight_entry`), #130 (#15 formulaire animal, **re-livré** après l'incident #126), #125 (#103 PRAGMA)
- 2026-09-09 : **incident #126** — PR empilée sur la branche de la maquette, mergée dedans et jamais dans `main` ; détecté par un compte de tests. Règle ajoutée dans `flux-tickets.md`. Réflexe : après chaque série de merges, vérifier `main` (fichier clé, nombre de tests)
- 2026-09-09 : décisions déléguées par Gaelle (« prends des décisions ») et consignées au journal : un store par domaine (question du lot 2 close), fréquence valeur + unité, échéance de vaccin saisie, rattachement à l'animal figé partout, cascade par constructeurs d'instruction, `*.service.spec.ts` exempté de la règle ESLint d'accès aux données
- 2026-09-09 : **dettes à reprendre au ticket #25 (troisième formulaire)** — extraire le patron champ/label/erreur dans `shared/` (dupliqué entre `AnimalFormView` et `VaccinationFormView`, ~150 lignes de SCSS), remonter `todayIsoDate` dans `shared/` (dupliqué faute d'import croisé). **À #33 ou ticket dédié** : masquer la bottom nav sur les écrans poussés (`App.vue`). **À #17** : point d'entrée des formulaires vaccin et #127 (édition animal), retour sur l'animal précis après enregistrement, brancher `getTreatmentsRepository` dans `animal-deletion.service.ts`
- 2026-09-09 : **rien n'a été vérifié visuellement** sur #15 et #20 (extension Chrome absente) : premier point à regarder sur appareil, en particulier `height: 100%` sous `v-main`
- 2026-09-09 : #16 requalifié (chips = liste ; reste le débordement après #36), #21 aligné sur `carnet.md` (deux badges + « Pas de rappel », pas d'« À venir »), #127 créé (édition animal), #90 réécrit (pnpm 11 écarté tant que Dependabot ne le supporte pas ; 10.34.5 ; groupe Capacitor)
- 2026-09-08 (soir) : **lot 3 mergé** — #112 (ticket #110, passe de sobriété des commentaires sur tout `src/` : 33 fichiers, +70/−443, aucune ligne de code touchée, 143 tests avant comme après), #113 (règle d'import croisé assouplie : un **service de cas d'usage** `xxx.service.ts` peut importer les repositories d'autres features pour les orchestrer ; un composant, un store ou un repository, jamais), #114 (`.claude/worktrees` exclu du scan de vitest, ESLint et Prettier)
- 2026-09-08 : **piège d'outillage à retenir** — les worktrees sont des copies du dépôt posées _dans_ le dépôt, donc toute commande lancée depuis la racine ramassait leurs `src/` : 423 tests au lieu de 143, dont 2 faux échecs (les specs d'une copie résolvent `@/` vers le `src/` de la racine). Corrigé par exclusion dans les trois configs ; **sortir les worktrees du dépôt reste l'option durable, non tranchée**, et l'exclusion sera à répéter dans tout outil ajouté plus tard
- 2026-09-08 : **#102 débloqué** — la cascade logique de suppression vivra dans `src/features/animals/animal-deletion.service.ts`, chaque repository enfant recevant un `markDeletedByAnimal()` pour rester le seul à écrire dans sa table. Elle dépend de **#111** (`runMany` dans `DbClient`, créé le même jour) : ordre de traitement **#111 → #102**. Les deux décisions sont au journal
- 2026-09-08 : **lot 2 livré, revu et proposé en PR** — #104 (#19 table `vaccination` + repository), #105 (#100 store Pinia animals), #106 (#33 coquille de navigation), #108 (#34 sélecteur d'animaux en chips), plus #107 pour la documentation des décisions. **L'ordre de numérotation des PR est un ordre de merge valide** : 104 → 105 → 106 → 107 → 108. Seule #108 accroche, sur `fr.json`, une fois #106 fusionnée : deux insertions en tête du même objet (`"nav"` + `"home"` d'un côté, `"animals"` de l'autre), trois lignes, les deux objets sont à garder. Les cinq autres fusions deux à deux passent seules
- 2026-09-08 : quatre décisions tranchées par Gaelle et consignées dans `docs/product/decisions-log.md` — palette de six dégradés d'avatar, cascade logique de la suppression d'un animal vers son carnet (à implémenter dans #16), contrat du store (`load()` ne lève pas, les écritures lèvent), fabrique paresseuse dans le repository appelée depuis `main.ts` comme point de composition
- 2026-09-08 : **questions encore ouvertes** — `update` d'un vaccin accepte `animalId` et déplace donc le vaccin d'un animal à l'autre (#19, à trancher avant la PR) ; le composant `AnimalChipSelector` porte lui-même son décalage à cheval, avec une marge négative qui fusionnerait s'il était le premier enfant de son conteneur (#34) ; `mandatory: true` n'assure pas « un animal toujours actif », seul `'force'` le ferait — le JSDoc du composant est donc faux (#34) ; duplication du 22 entre le TS de la bottom nav et `$padding-bottom-nav` (#33) ; `PRAGMA foreign_keys` activé par le plugin et non par notre code (`sqlite.ts`)
- 2026-09-08 : faiblesse héritée de #14, à corriger dans les deux repositories en même temps hors de ce lot — le test d'idempotence de `remove` ne pose pas de faux timers, les deux appels tombent dans la même milliseconde et retirer `AND deleted_at IS NULL` du `WHERE` ne fait tomber aucun test
- 2026-09-08 : piège de vérification à retenir — un composant de `shared/` que personne n'importe encore n'est compilé ni par `build-only` ni par Vitest (`css: false`) : le vert des commandes ne prouve rien sur son style, il faut un build jetable ou une mesure dans un navigateur
- 2026-09-08 : tickets fermés sans PR parce que déjà couverts — #18 (les 15 tests de `animals.repository.spec.ts` livrés avec #14 couvrent CRUD, suppression logique et contrainte chien/chat) et #13 (12 tests du service notifications livrés avec #10, mock Capacitor inclus ; la part « calcul des dates de rappel » est devenue un critère d'acceptation de #23 et #28, là où la logique vivra)
- 2026-09-08 : #15 allégé, la photo d'animal part dans #101 (3.7, Photo Picker + `files/photos/`). `animal.photo_path` et le champ Zod `photoPath` existent déjà depuis #14 : pas de migration à prévoir
- 2026-09-08 : **question ouverte** — les épics 4, 5 et 6 n'ont aucun ticket de store, contrairement à l'épic 3. À trancher au moment de #17 (le Carnet), premier écran qui affiche vaccins + traitements + poids ensemble : un store par domaine, ou un seul store « carnet de l'animal consulté » ? `auth.store.ts` (#7) et `purchase.store.ts` (#44) sont, eux, déjà couverts
- 2026-09-07 : outillage aligné sur Node 26 (`.nvmrc`, `engines`, CI via `setup-node` qui lit `.nvmrc`), pnpm épinglé par `packageManager`. Ticket #90 quasi clos (reste l'évaluation de pnpm 11) ; #82 Auto Backup quasi clos (reste le test sur appareil)
- Premier lot de tickets livré en PR : #10 service notifications (alarmes inexactes, `POST_NOTIFICATIONS` en contexte), #14 table `animal` + `core/db` (migrations versionnées, suppression logique via `deleted_at`), #70 design system v2 (palette, polices fontsource, icônes Material Symbols SVG, palette système `error` / `warning` / `success` distincte des urgences). Tickets suivants conseillés après le lot 2 : #15 / #16 / #17 écrans animaux, puis #20 à #23 vaccins
- Intégration à ne pas oublier : l'écran de priming (#11) doit appeler `requestPermission()` avant le premier `scheduleReminder()`, sinon le plugin demande la permission tout seul. Le plugin SQLite ajoute `USE_BIOMETRIC` / `USE_FINGERPRINT` au manifest : à retirer ou justifier avant le Play Store
- Points administratifs Play Store reportés par Gaelle (adresse publique, date de création du compte, durées de rétention) : consignés dans `docs/technical/conformite-play-store-rgpd.md` §4, à ressortir à l'épic 11 ou aux tickets #86 / #88, pas avant
