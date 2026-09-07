**Objectif**
Écran final, remplace le placeholder. Conforme à la maquette **v2** : `docs/design/accueil-v2/accueil.md` et capture `docs/design/accueil-v2/MémoPatte v2 - Accueil.png`.

**Critères d'acceptation**
- [ ] Header pétrole plein `#01383E` : titre « MémoPatte » + sous-titre « Foyer de {prénom} », icône paramètres à droite — **plus de salutation ni de date** (changement v2)
- [ ] Chips animaux (composant 7.2), à cheval sur le header et le contenu
- [ ] Section « À faire » : **une seule carte** contenant une ligne par rappel (filet de séparation), barre d'urgence verticale de 3 px, badge d'échéance relative à droite
- [ ] Compteur de portée à droite du titre : `3 rappels` / `Milo · 2 rappels` / `Milo` seul si aucun rappel
- [ ] Bandeau « 1 rappel en retard » (pluriel géré) si au moins un rappel en retard
- [ ] Nom de l'animal affiché sur chaque ligne en vue globale, **masqué** quand un animal est sélectionné
- [ ] Libellés d'échéance repris tels quels : `En retard · 2 j`, `Aujourd'hui`, `Demain`, `Dans N jours`
- [ ] État vide = ligne « Tout est à jour » + sous-texte nominatif + lien texte « Ajouter un vaccin ou un traitement » (la grande carte illustrée de la v1 disparaît)
- [ ] 5 états couverts (A1→A5 de la maquette) : tous animaux + rappels / animal sélectionné + rappels / animal sélectionné sans rappel / tous animaux sans rappel / premier lancement sans animal
- [ ] Premier lancement (A5) : écran plein sans header, illustration de marque, « Bienvenue sur MémoPatte » + « Le carnet de santé de tes animaux, toujours à jour. » + bouton « Créer mon premier animal »
- [ ] Bottom navigation (7.1)

**Notes techniques**
- Dépend de 3.3, 4.3, 5.3, 7.1, 7.2, 7.3
- Chaque état a un texte précis dans `accueil-v2/accueil.md` — les respecter tels quels, pas de reformulation libre
- Tokens couleur (hex + oklch) et typographies (`Space Grotesk` titres / `Inter` texte) listés dans la même spécification
- ⚠️ Le thème Vuetify actuel (`src/core/theme/vuetify.ts`, `primary: #0F766E`) n'est pas aligné sur la palette v2 ; l'alignement du design system n'est ticketé nulle part

**Hors scope de ce ticket**
- Sections Toilettage/RDV visibles sur l'ancienne maquette PetCare mais explicitement exclues (decisions-log 13/08 et 15/08)

---
Ticket **7.4**
