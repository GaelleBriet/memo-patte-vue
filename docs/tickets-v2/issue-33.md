**Objectif**
Navigation globale persistante de l'app — absente du placeholder actuel (`src/features/home/HomeView.vue`). Forme définie par la maquette v2 (`docs/design/accueil-v2/accueil.md`, section 6).

**Critères d'acceptation**
- [ ] Bottom navigation persistante avec 2 onglets uniquement : Accueil (`home`) et Carnet (`pets`), icône + libellé
- [ ] **Barre pleine largeur** posée sur le bas de l'écran, fond crème clair, filet supérieur — la pilule flottante sombre de la maquette v1 est abandonnée
- [ ] Onglet actif en pétrole `#01383E` avec libellé en gras, onglet inactif en gris chaud
- [ ] Padding bas suffisant pour la zone de gestes Android (22 px dans la maquette)
- [ ] Pas d'onglets Documents/Finances, même désactivés (decision-log 15/08 : seuls les onglets qui mènent à quelque chose apparaissent)
- [ ] Remplace le placeholder actuel de HomeView.vue

**Notes techniques**
- Vue Router + Vuetify (bottom navigation)

**Hors scope de ce ticket**
- Onglets Documents/Finances, même grisés — explicitement écarté par decisions-log.md (15/08)

---
Ticket **7.1**
