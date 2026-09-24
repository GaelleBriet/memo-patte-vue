# Historique du poids par pages, unité de poids (H1 à H3, U1, U2)

Maquettes de Claude Design (2026-09-24) : planches `MémoPatte v2 - Poids par pages et unité-selection.png`, relevé illustré `MémoPatte v2 - Poids par pages et unité-releve.png`. La version interactive (`(standalone).html`) est dans le coffre de notes de Gaelle ; le relevé ci-dessous en est extrait et fait foi pour les textes exacts, sous réserve des écarts listés.

Tickets : #351 (H1 à H3), #352 (U1, U2). Décisions : journal du 2026-09-23 (Historique par pages) et commentaire de Gaelle sur #352 du 2026-09-24 (unités, défaut, exports).

## Écarts avec des décisions déjà prises (on suit la décision)

- U1 montre d'anciennes lignes des Paramètres (« Restaurer mon achat », « Export PDF » avec une puce « Plus ») : l'app garde « Restaurer mes achats » et la pastille sur l'icône (#355)
- U2 dessine l'ancienne mini-courbe (un chiffre et une date par pesée) : le Carnet garde la courbe de #340 (plus haut, plus bas, pastille, mois), en livres

## Écarts tranchés avec Gaelle (2026-09-24)

Journal du 2026-09-24 :

- Unité par défaut : **lb si la région du téléphone est les États-Unis, kg ailleurs** (Royaume-Uni compris) ; la maquette disait kg partout
- Export : **CSV dans l'unité choisie** (unité dans le titre de colonne, comme la maquette), **JSON toujours en kg**, PDF dans l'unité choisie
- **12 pesées par page** retenues

## Relevé des textes exacts


### H1 · PAGE LA PLUS RÉCENTE

- ← (« Retour au carnet ») · Suivi de poids · Milo
- Poids actuel · 24,5 kg · +0,3 kg vs 25 août
- ‹ (« Pesées précédentes ») · mars 2026 – sept. 2026 · 12 pesées · › grisé (« Pesées suivantes, aucune »)
- Graduations : kg · 20 · 22 · 24 · 26 — mois : avr. mai juin juil. août sept.
- Toutes les pesées · 30 · 13 sept. 2026 · +0,3 kg · 24,5 kg …
- Ajouter une pesée
- Page = 12 pesées, découpées depuis la plus récente. Échelle en kg recalculée par page.
- Glisser vers la droite = page précédente ; les flèches font la même chose (et restent le seul moyen pour le lecteur d’écran).

### H2 · PAGE PRÉCÉDENTE, POINT TOUCHÉ

- Pesée du 3 févr. 2026 · [× Poids actuel] (« Revenir au poids actuel »)
- 17,8 kg · +0,8 kg vs 20 janv.
- ‹ · oct. 2025 – mars 2026 · 12 pesées · › (actif)
- Graduations : kg · 8 · 12 · 16 · 20 — mois : nov. déc. janv. févr. mars
- Trait vertical pétrole + point agrandi (7 dp, contour crème) ; zone de toucher 28 dp par point.
- Appui long puis glisser : le point suivi change en continu, le résumé suit (annoncé en « polite »).
- Changer de page ou toucher « Poids actuel » remet le résumé à la pesée la plus récente.
- Lecteur d’écran, chaque point : « Pesée du 3 février 2026, 17,8 kg »

### H3 · PREMIÈRE PAGE

- Poids actuel · 24,5 kg · +0,3 kg vs 25 août
- ‹ grisé (« Pesées précédentes, aucune ») · juil. 2025 – sept. 2025 · 6 pesées · début du suivi · ›
- Graduations : kg · 4 · 6 · 8 · 10 — mois : août sept.
- La dernière page (la plus ancienne) peut avoir moins de 12 pesées ; la courbe occupe toute la largeur.
- Glisser encore vers la droite : la courbe résiste (rebond léger), rien ne change.

### U1 · PARAMÈTRES › MES DONNÉES

- Section choisie : « Mes données » (1re ligne) — le réglage change la façon dont les données de poids sont lues et saisies.
- Unité de poids · Pour afficher et saisir les pesées
- kg · kilogrammes | lb · livres (segmenté, un seul choix)
- Par défaut : kg. Les pesées restent stockées en kg ; seul l’affichage change, sans perte.
- Export CSV : colonne « Poids (lb) » ou « Poids (kg) » selon ce réglage ; export JSON toujours en kg.
- Lecteur d’écran : groupe « Unité de poids », boutons radio « Kilogrammes, kg » / « Livres, lb »

### U2 · CARNET ET FEUILLE EN LIVRES

- Milo · Labrador · 16 mois
- Suivi de poids · 54,0 lb · +0,7 lb vs 25 août · Voir l’historique ›
- Mini-courbe : 50,7 · 51,4 · 52,0 · 52,7 · 53,4 · 54,0 — 23 juin · 7 juil. · 21 juil. · 4 août · 25 août · 13 sept.
- + Ajouter une pesée
- Feuille : Ajouter une pesée · Milo · × (« Fermer »)
- Poids* · 54,0 · lb (« Poids en livres »)
- En livres. Tu peux changer d’unité dans Paramètres.
- Date de la pesée* · 24/09/2026
- Enregistrer
- Erreur : « Le poids doit être supérieur à 0 lb. » · Conversion : 1 kg = 2,20462 lb, arrondi à 0,1.
- L’historique H1–H3 passe aussi en lb (graduations, résumé, liste).
