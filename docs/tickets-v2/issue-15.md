**Objectif**
Formulaire de création, accessible en 2 taps max depuis l'accueil (différenciant saisie rapide).

**Critères d'acceptation**
- [ ] Champs : nom, espèce (chien/chat uniquement), race, date de naissance, poids initial, photo (optionnelle)
- [ ] Validation Zod
- [ ] Accessible en 2 taps max depuis l'écran d'accueil (chip « + »)

**Notes techniques**
- Dépend de 3.1
- Sélecteur d'espèce limité à 2 choix, pas un champ libre
- La photo alimente l'avatar du header du Carnet et l'avatar des chips (planche C3 de `docs/design/carnet-v2/carnet.md`) ; sans photo, la maquette utilise un dégradé de couleur par animal

**Hors scope de ce ticket**
- (aucun point notable)

---
Ticket **3.2**
