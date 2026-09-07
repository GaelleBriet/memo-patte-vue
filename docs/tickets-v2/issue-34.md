**Objectif**
Composant réutilisé à l'identique sur l'accueil et le Carnet (AnimalChipSelector, cf. CLAUDE.md liste des composants partagés). Référence : maquettes v2, `docs/design/accueil-v2/accueil.md` §2 et `docs/design/carnet-v2/carnet.md` §2.

**Critères d'acceptation**
- [ ] `shared/AnimalChipSelector.vue` : une chip par animal (avatar rond 32 px — photo de l'animal, sinon dégradé de couleur — + prénom) et chip « + » en fin de rangée (cercle, bordure pointillée)
- [ ] Positionnement à cheval sur le header pétrole et le contenu clair (contrainte conservée de la v1)
- [ ] État sélectionné très visible : fond pétrole `#01383E`, texte clair, anneau clair de 2 px
- [ ] Réutilisable entre l'accueil et le Carnet, avec deux comportements distincts :
  - accueil = **filtre** la vue, re-cliquer sur la chip active revient à « tous les animaux »
  - carnet = **change l'animal consulté**, un animal est toujours actif
- [ ] Rangée scrollable horizontalement sans barre de défilement visible

**Notes techniques**
- Composant partagé — ne pas dupliquer entre home et animals (règle CLAUDE.md)
- L'avatar reprend la photo de l'animal quand elle existe (planche C3 du Carnet v2)

**Hors scope de ce ticket**
- (aucun point notable)

---
Ticket **7.2**
