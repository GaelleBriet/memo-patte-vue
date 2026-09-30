---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — Données : exports, import, sauvegarde (validée le 2026-09-30)

Suivi : cadrage produit. Sources : [principes](../principes.md) (3 : dire honnêtement jusqu'où on
protège ; 7 : données jamais otages), parcours 1, 6, 10, 13, 15, matrice des fonctionnalités (G8) ;
existant (#81, #343, #349, #356, #382, #413, #416) ; dépôt :
[`docs/technical/export-format.md`](../../technical/export-format.md),
[`docs/technical/auto-backup-android.md`](../../technical/auto-backup-android.md). Une règle marquée
**(à valider)** renvoie à une question ouverte.

## 1. Problème

Sans Plus, le carnet n'existe que sur le téléphone. Sophie doit pouvoir l'emporter (exports), le
retrouver (import, sauvegarde d'Android), le montrer (PDF) et l'effacer, et savoir exactement ce qui
est protégé et ce qui ne l'est pas.

## 2. Objectifs

1. Tout le carnet s'exporte gratuitement, sans compte, dans des formats lisibles (principe 7).
2. Un export JSON se réimporte sans perte, sur ce téléphone ou un autre.
3. Sophie sait, sans chercher, ce qui est sauvegardé (principe 3).

**Hors objectifs** : import CSV ; export vers un service tiers intégré (Drive, Dropbox) autrement que
par le partage d'Android ; export d'un seul animal en JSON (piste « à prévoir », P10).

## 3. Règles

### 3.1 Exports

- **DO-1** Depuis Paramètres › Mes données : JSON (réimportable, format documenté) ou CSV (tableur) ;
  « Enregistrer sur le téléphone » (Documents › MémoPatte) ou « Partager ». Gratuits, sans compte.
  (Existant, #343 ; principe 7)
- **DO-2** JSON : tout le carnet, historique compris (injections, prises données, oubliées et
  reportées, périodes, posologie, heures, dates de fin, date approximative, animaux qu'on ne suit plus,
  motif et date du départ), et les réglages du carnet (heure des rappels de vaccins, « Me prévenir avant
  l'échéance ») ; format versionné (v3 à venir), toujours en kilos. (#382, #413 ; spec Traitements,
  données ; spec Animaux ; modèle de données, M4 et M8)
- **DO-3** CSV : dans l'unité de poids choisie ; titres, valeurs et séparateur dans la langue de l'app,
  lisible directement dans un tableur ; dans la v1. (#416 ; spec Q1, 2026-09-29)
- **DO-4** PDF, gratuit : depuis le Carnet, l'animal affiché ; depuis les Paramètres, « Tous les
  animaux » (un seul fichier, une partie par animal suivi, dans l'ordre des chips) ou un animal au choix
  (parmi tous, animaux qu'on ne suit plus compris : les suivis d'abord, dans l'ordre des chips, puis
  les autres sous un petit titre « Animaux que tu ne suis plus ») ; un animal qu'on ne suit plus
  s'exporte aussi depuis son carnet. (Spec Q3 ; relecture du lot C)
  Contenu : identité (date de naissance et âge, « environ » si approximatifs ; « jusqu'au … » pour un
  animal qu'on ne suit plus, s'il a été renseigné), vaccins et leur historique regroupé,
  traitements (périodes, posologie, prises regroupées, oubliées regroupées, reports (« Reportée au … »),
  « Arrêté le » / « Terminé le »), poids et courbe, photo. (P6 Q2 ; G8 ; #356 ; #386, #401) Les doses non renseignées
  y figurent sobrement, à leur place : « Non renseigné du 3 au 27 sept. », distinct des prises données
  et des oublis. (Spec Q2, 2026-09-29)
- **DO-5** Noms de fichier : `carnet-<nom>-AAAAMMJJ-HHmm.pdf` pour un animal,
  `carnet-memopatte-AAAAMMJJ-HHmm.pdf` pour tous ; suffixe ` (1)` dans la même minute. (#343, #356)
- **DO-6** Après un export enregistré : toast avec « Ouvrir » pour un CSV ou un PDF, jamais pour un
  JSON (copie de secours à réimporter, qu'aucune app n'ouvre sur beaucoup de téléphones). (#349 ;
  décision du 2026-09-30)

### 3.2 Import

- **DO-7** JSON seulement, depuis Paramètres ou l'accueil de bienvenue ; si des données existent :
  « Fusionner » (ajoute ce qui manque, la modification la plus récente gagne) ou « Remplacer »
  (confirmé, irréversible). (Existant, #413)
- **DO-8** N'accepte que le format v3 ; un fichier plus ancien est refusé avec un message clair. Pas de
  conversion des anciens formats : l'app n'est pas publiée et toutes les données actuelles sont des
  données de test. (Revue du modèle, 2026-09-29)
- **DO-9** Refus du fichier entier, avec un message clair : version plus ancienne ou plus récente, valeur hors limites,
  nom trop long, entrée rattachée à un autre animal. (Existant)
- **DO-10** Après un import, les rappels sont reconstruits, puis l'écran « Ne rate plus aucun rappel »
  vient si l'autorisation n'a jamais été demandée sur ce téléphone (spec Rappels, RA-21). (Existant ;
  spec Rappels Q4)

### 3.3 Sauvegarde et protection

- **DO-11** Sauvegarde d'Android : la base du carnet seulement (sans photos, sans préférences), environ
  une fois par jour, en Wi-Fi et en charge, si l'utilisateur l'a activée ; restaurée à l'installation
  seulement ; l'app ne peut pas savoir si elle est active. ([`auto-backup-android.md`](../../technical/auto-backup-android.md))
- **DO-12** Rubrique Paramètres › Sauvegarde (après « Se déconnecter », celle d'un gratuit : relecture de cohérence du 2026-09-30, validé en bloc) : ce
  qui reste sur ce téléphone (pour un gratuit, « Si ce
  téléphone est perdu, ton carnet peut l'être aussi. Une copie ou Plus l'évite. ») ; ce que la
  sauvegarde d'Android peut garder (« si la sauvegarde de ton téléphone est active », sans les photos
  ni les réglages, sans garantie) ; une copie à exporter (section « Copie de ton carnet », plus bas) ;
  ce que Plus garantit, avec « Découvrir MémoPatte Plus » pour un gratuit ; pour les abonnés, l'état
  (« Dernière sauvegarde : il y a 5 min », « En attente de réseau », « Interrompue depuis hier à
  18 h 20. Rien n'est perdu. » avec « Reconnecte-toi… » ; « En pause » est réservé à Plus arrêté, plus
  bas) ; « Effacer les données de ce téléphone ». Pour un abonné, pas de partie « sauvegarde
  d'Android » ; « Photos sauvegardées » en simple ligne d'état ; aucune liste d'appareils. On dit
  « sauvegarde cloud » partout. Section « Copie de ton carnet », ligne « Exporter une copie »
  (sous-titre « Vers Google Drive, un e-mail ou un ordinateur » ; pour un abonné dont la sauvegarde est interrompue, « Conseillé
  tant que la sauvegarde est interrompue »), qui ouvre directement le partage d'Android ;
  l'enregistrement dans Documents reste dans Mes données (spec Q6). Ancien abonné (Plus arrêté) : sous
  la carte « Ta sauvegarde cloud est en pause », « Depuis la pause, tes changements ne sont plus
  sauvegardés : si ce téléphone est perdu, ils peuvent l'être aussi. » puis « Ta dernière sauvegarde est
  conservée jusqu'au … Réactive Plus pour reprendre là où elle s'était arrêtée. » (date : 12 mois après
  la fin de Plus, PL-20) ; la section « Sauvegarde d'Android » comme pour un gratuit ; « Ta sauvegarde
  cloud n'est pas touchée » sous « Effacer », qui suit la variante abonné (le compte existe) ; une fois
  la date de conservation passée, la rubrique redevient celle d'un gratuit (spec Q7 ; #426). (P1 Q1 ; P12 Q2 ; G4 bis ; P15 Q1 ; relecture du lot C, validé en bloc ; lot C révisé)
- **DO-13** Carte trimestrielle pour les gratuits : spec Accueil (AC-15). (P13 Q1)
- **DO-14** « Effacer les données de ce téléphone » : propose d'abord un export (« Avant d'effacer,
  exporte une copie de ton carnet. », bouton « Exporter une copie », spec Q6), double confirmation ; pour un abonné, l'app le déconnecte d'abord (la sauvegarde cloud n'est pas
  touchée, et la synchro ne peut ni la ramener ni l'effacer) ; toutes les données de l'app sur ce
  téléphone sont effacées, réglages et réponse aux statistiques compris (pas les exports, ci-dessous) ;
  l'app revient à son premier lancement (« Avant de commencer »).
  Titre « Effacer les données de ce téléphone ? ». Second palier : un dialogue simple, sans saisie,
  bouton « Effacer définitivement » placé autrement que dans le premier (spec Q4). Abonné dont des
  changements ne sont pas encore sauvegardés : avant les confirmations, « Tes derniers changements ne
  sont pas encore dans ta sauvegarde cloud. Connecte-toi à Internet et attends la sauvegarde, ou
  exporte une copie. », sans bloquer (spec Q5). Les exports enregistrés dans Documents › MémoPatte
  restent sur le téléphone, et l'écran le dit. (P15 Q1 ; relecture du lot C, validé en bloc)

## 4. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** un carnet avec des prises oubliées et des périodes, **quand** Sophie exporte en JSON
   puis importe ce fichier sur un téléphone vide, **alors** le carnet est identique et les rappels
   reprogrammés.
2. **Étant donné** un export au format v2, **quand** Sophie l'importe, **alors** l'app le refuse avec un
   message clair, sans rien modifier.
3. **Étant donné** trois animaux suivis, **quand** Sophie exporte « Tous les animaux » en PDF depuis les
   Paramètres, **alors** un seul fichier contient les trois carnets, chacun sur une nouvelle page.
4. **Étant donné** un gratuit, **quand** il ouvre Paramètres › Sauvegarde, **alors** il lit que la
   sauvegarde d'Android garde le carnet sans les photos, si elle est active, et qu'un téléphone perdu
   peut emporter le carnet sans Plus.
5. **Étant donné** « Effacer les données de ce téléphone », **quand** Sophie confirme deux fois,
   **alors** le carnet local est effacé et l'app revient à son premier lancement (« Avant de
   commencer », puis l'accueil de bienvenue) ; pour un abonné, la sauvegarde cloud reste intacte.

## 5. Décisions de la spec

- 2026-09-29 — **Q1 : le CSV lisible dans un tableur (#416) est dans la v1** (DO-3). Raison : tel quel,
  il paraît cassé ; ticket petit et défini ; « données jamais otages » vaut aussi pour la lisibilité.
  Écartée : plus tard.

- 2026-09-29 — **Q2 : le PDF montre les doses non renseignées**, sobrement (« Non renseigné du 3 au 27
  sept. ») (DO-4). Raison : le principe 1 vaut aussi sur papier ; un trou muet dans l'historique trompe
  le vétérinaire. Écartées : ne montrer que les prises données et oubliées ; proposer de renseigner
  avant d'exporter (étape de plus, piste possible).

- 2026-09-29 — **Q3 : « Tous les animaux » ne contient que les animaux suivis** (DO-4) ; les autres
  s'exportent seuls (« un animal au choix », ou depuis leur carnet). Raison : ce PDF sert au foyer
  d'aujourd'hui ; y retrouver un animal disparu serait déroutant pour le lecteur et peut-être douloureux.
  Écarté : les inclure avec « jusqu'au … ». (Relecture de cohérence des specs, question D.)

- 2026-09-30 — **Relecture du lot C, points validés en bloc** : titre et exports conservés de
  l'effacement (DO-14) ; Sauvegarde d'un abonné sans partie Android ni liste d'appareils, « sauvegarde
  cloud » partout (DO-12) ; ordre de la feuille PDF (DO-4) ; restauration « Fusionner / Remplacer »
  identique à l'import (DO-7). Textes nouveaux acceptés ; pour un gratuit, la rubrique Sauvegarde dit
  « Si ce téléphone est perdu, ton carnet peut l'être aussi. Une copie ou Plus l'évite. »
  (`technical/relecture-maquettes-lot-C.md`, QC-2 à QC-8, QC-11, QC-12.)

- 2026-09-30 — **Q4 : pas de mot à taper pour effacer** (DO-14) : second dialogue simple, bouton
  « Effacer définitivement » à une autre place que dans le premier. Raison : l'écran de copie et deux
  confirmations font trois gestes délibérés pour une action rare ; la saisie est pénible au clavier et
  à traduire. Écartée : taper « EFFACER » (maquette V22 ter). (Relecture du lot C, QC-14.)

- 2026-09-30 — **Q5 : effacer avec des changements pas encore sauvegardés : le dire, sans bloquer**
  (DO-14). Raison : une fois déconnecté, la synchro ne peut plus les envoyer ; principes 3 et 5.
  Écartées : bloquer jusqu'à la synchro (un téléphone sans réseau ne pourrait jamais être effacé) ;
  ne rien dire (perte silencieuse). (Relecture du lot C, QC-16.)

- 2026-09-30 — **Q6 : « Exporter une copie » ouvre directement le partage d'Android** (DO-12, DO-14),
  dans Sauvegarde et avant d'effacer ; textes réécrits avec Gaelle (planches V21, V21 bis, V21 ter,
  V22). Raison : une copie rangée dans Documents disparaît avec un téléphone perdu (parcours 13) ; verbe
  standard, destination concrète, pas de « (JSON) ». Écartées : « Exporter mon carnet (JSON) » vers la
  feuille habituelle (maquette) ; « Sauvegarder une copie » (confusion avec la sauvegarde Plus ou
  Android). (Relecture du lot C, QC-18.)

- 2026-09-30 — **Q7 : la rubrique Sauvegarde d'un ancien abonné dit le risque et motive à reprendre**
  (DO-12), sur le modèle de la rubrique d'un gratuit (idée de Gaelle). Raison : ses changements ne
  partent plus dans le cloud (principe 3) ; sa sauvegarde attend 12 mois (PL-20). Écartées : l'écran tel
  quel (risque muet) ; tout le contenu du gratuit sans adaptation (faux : seul ce qui a changé depuis la
  pause est en risque). (Vérification du lot C révisé, T1.)

## 6. Questions ouvertes

Aucune. Spec « Données » validée le 2026-09-30.
