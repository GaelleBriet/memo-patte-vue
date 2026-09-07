**Objectif**
Identité visuelle finale de l'app installée. Sources fournies dans `docs/design/logos/` (voir `docs/design/logos/logos.md`).

**Critères d'acceptation**
- [ ] Icône adaptative Android configurée à partir des couches livrées : `background.png`, `foreground.png`, `monochrome.png` (icône thématisée Android 13+)
- [ ] Icône « à plat » (`icone.png`) disponible pour les usages non adaptatifs
- [ ] Splash screen configuré (Capacitor) : fond pétrole `#01383E` + illustration de marque centrée
- [ ] Nom affiché sous l'icône : « MémoPatte »
- [ ] Rendu vérifié sur téléphone réel avec au moins deux formes de masque (cercle et squircle)

**Notes techniques**
Quatre défauts des fichiers sources à corriger avant intégration (détail et raisons dans `docs/design/logos/logos.md`) :
- [ ] `foreground.png` et `monochrome.png` ne sont **pas carrés** (1312 × 1199) — recadrer sur un canevas carré, sinon Android déforme ou rogne
- [ ] L'illustration déborde de la **zone de sécurité** : seuls les 66 % centraux d'une icône adaptative sont garantis visibles, les coussinets extérieurs de la patte seront rognés
- [ ] `background.png` est un **squircle détouré sur blanc** — la couche background doit être un aplat pétrole plein bord, sinon des coins blancs apparaissent après masquage
- [ ] `foreground.png` garde un **halo blanc de détourage**, visible sur fond sombre

Autre point : l'illustration retenue est la variante « patte contenant le chien et le chat », la même que sur l'écran de premier lancement (état A5 de `docs/design/accueil-v2/accueil.md`).

**Hors scope de ce ticket**
- (aucun point notable)

---
Ticket **11.1**
