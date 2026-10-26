# Contexte en cours (à mettre à jour à chaque lot)

Les entrées antérieures au 2026-10-01 sont archivées dans le coffre de notes de Gaelle (`Memo-Patte/claude/contexte-en-cours-archive.md`).

- 2026-10-20 (soir) : **Gaelle : Plus = un appareil à la fois**, plus de fusion fine entre deux appareils
  (decisions-log du jour, PL-15) ; #986 fermé hors périmètre ; campagne à deux téléphones hors du bloquant.
  Les 30 scénarios de fin (coffre, `technical/etudes/moteur-v2-scenarios-de-fin.md`) joués sur
  l'émulateur : moteur terminé à un téléphone après #1004, #1005, #1006, #1003. Dette connue : #992,
  #998, #1000, #997, deux mineurs d'affichage.

- 2026-10-20 (matin) : **Gaelle : accélérer le moteur v2.** Chantier « deux téléphones » clos après #958
  (résidus dans un ticket, repris avec #83) ; une relecture + une re-relecture puis merge ; campagnes
  bloquantes à un téléphone seulement, volumes fixés (`outils-de-test.md`, `couts-agents.md`). Reste
  avant un moteur utilisable : #958, #946, #910, #979 (le PDF « pas à donner » est mergé, #956). Décisions de règles des 19 et 20
  octobre dans le coffre, `product/questions-analyse-moteur.md` (Q9 à Q17).

- 2026-10-13 (nuit) : **moteur des doses v2 en place, ancien moteur supprimé** (pas 10, #757) : tous
  les écrans, les rappels et les exports lisent `src/shared/domain/dose-calendar/` ; l'oracle compare
  v2 au modèle naïf. Ouverts : #810 et #817 (#825). Téléphone : réinstaller le build de `main` dans
  MémoPatte Dev.

- 2026-10-09 (nuit, autonomie) : **reprendre ici.** Le 8 au soir : nouveau site en ligne sur
  `memopatte.app` (#682 socle, #683 mentions légales, #684 aide en pages, #685 vitrine). La nuit :
  bugs #688 (#674), #689 (#672), #690 (#673), #691 (#675), #693 (#656, dont une double dose), #694
  (#657) ; rangement de l'audit #695 (L0), #696 (L9), #697 (L3), #698 (L1), #700 (L4), #701 (L7),
  #702 (L5, en partie), #704 (L6, en partie), #705 (L11, en partie), #708 (L8) ; #706 (#687, cache
  ESLint par contenu : le push ne relit plus tout le dépôt). Bilan et huit questions dans le coffre,
  `product/bilans/bilan-2026-10-09-nuit.md` ; décisions au journal autonome.
  - **Ouverts** : #665 (formulaire animal), #666 (sélection d'animal), #671 (`NotificationPrimingView`),
    #670 (L10), #662 (L2 : proposition de découpe à faire relire, coffre
    `technical/etudes/proposition-decoupe-formulaire-traitement.md`), #692, #699, #703, #707, #638.
  - **Méthode de la nuit, à garder** : un relecteur indépendant par branche, puis intégration du lot
    dans un worktree jetable, puis le même parcours rejoué sur l'émulateur avec `main` et avec le lot,
    captures comparées au pixel (scripts dans le dossier temporaire de la session, à recréer : import
    du carnet de démo, heure figée, clics par la WebView). Un refactor de types seuls se prouve par un
    build identique (`diff -r dist`).
  - **Pièges** : (1) l'import du carnet de démo remet la permission des notifications à zéro : la
    redonner (`pm grant`) ou toucher « Autoriser » ; (2) un arrêt forcé de l'app efface ses alarmes ;
    (3) la vraie app installée sur l'émulateur affiche ses notifications de test quand on avance
    l'horloge : ne pas y toucher, vider le volet ; (4) une résolution de conflit dans un worktree
    jetable se valide avec les hooks, jamais en les désactivant ; (5) `@intlify/vue-i18n/no-unused-keys`
    ne voit pas une clé construite à la volée : écrire les clés en entier.

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

- 2026-10-04 : **reprendre ici.** Travail en autonomie complète. **Étude du modèle des
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
    accord de Gaelle.
