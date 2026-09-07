**Objectif**
Écran de détail conforme à la maquette **v2** : `docs/design/carnet-v2/carnet.md` et capture `docs/design/carnet-v2/MémoPatte v2 - Carnet.png`.

**Critères d'acceptation**
- [ ] Header pétrole plein `#01383E` : bouton retour, avatar rond 56 px (photo ou dégradé), nom, `race · âge`, icône `edit` à droite
- [ ] Chips animaux à cheval sur le hero et le contenu (même composant partagé que l'accueil, cf. 7.2) — sur le Carnet la sélection **change l'animal consulté**, il y a toujours un animal actif
- [ ] Bandeau de stats en **3 colonnes séparées par des filets verticaux, sans cadre** (changement v2 : ce ne sont plus 3 cartes) : Poids / Rappels / Traitements
- [ ] La colonne Rappels passe en corail dès qu'il y a un retard, c'est le seul accent coloré du bandeau
- [ ] Sections Vaccins / Traitements en cours / Suivi de poids : **une carte par section**, lignes séparées par des filets, et la ligne d'ajout devient **la dernière ligne de la carte** (« Ajouter un vaccin » / « Ajouter un traitement » / « Ajouter une pesée »)
- [ ] États vides par section (C2) : `Aucun vaccin enregistré`, `Aucun traitement en cours`, `Aucune pesée enregistrée` — la section garde son titre et sa ligne d'ajout
- [ ] Suivi de poids : poids actuel + delta, lien « Voir l'historique », courbe simple (polyline + points + valeur au-dessus de chaque point, sans axes ni grille)
- [ ] Bottom navigation Accueil/Carnet, onglet Carnet actif

**Notes techniques**
- Dépend de 3.1 et du composant chips de 7.2
- Contenu Vaccins/Traitements/Poids alimenté au fur et à mesure des épics 4/5/6 — structurer pour les accueillir sans réécriture
- La planche C3 montre les photos réelles dans le header et dans les chips : prévoir l'emplacement dès maintenant (le champ photo existe déjà dans le ticket 3.2)
- Il n'y a pas d'état « aucun animal » sur cet écran : ce cas est traité par l'état A5 de l'accueil

**Hors scope de ce ticket**
- Pas d'export PDF, pas de section Documents/Finances (contrainte explicite de la spécification)

---
Ticket **3.4**
