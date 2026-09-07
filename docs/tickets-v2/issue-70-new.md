**Objectif**
Aligner le design system (thème Vuetify, polices, icônes) sur les maquettes v2, pour que les écrans qui les consomment (#36, #17) s'appuient sur des tokens partagés plutôt que sur des valeurs codées en dur par écran.

**Critères d'acceptation**
- [ ] Palette Vuetify (`src/core/theme/vuetify.ts`) mise à jour : `primary` en pétrole `#01383E` (remplace `#0F766E`), fond/surface en crème clair, et les 3 couleurs sémantiques d'urgence (retard / aujourd'hui / bientôt) déclarées comme couleurs du thème plutôt que redéfinies écran par écran
- [ ] Tokens repris tels quels des tables couleur de `docs/design/accueil-v2/accueil.md` et `docs/design/carnet-v2/carnet.md` (valeurs oklch de la maquette → hex déjà calculés dans ces fichiers)
- [ ] Polices `Space Grotesk` (titres) et `Inter` (texte courant) chargées et déclarées dans le thème / `src/styles/settings.scss`, remplaçant la police par défaut de Vuetify
- [ ] Décision explicite sur le jeu d'icônes : la maquette utilise Material Symbols Outlined, le projet est configuré en `mdi` — trancher entre migrer vers Material Symbols ou retraduire les icônes de la maquette (`vaccines`, `medication`, `pest_control`, `error`, `schedule`, `today`, `check`, `settings`, `edit`, `arrow_back`, `home`, `pets`, `add`, `monitor_weight`) vers leurs équivalents `mdi`, et documenter le choix dans `decisions-log.md`
- [ ] Rayons et hauteurs récurrents de la maquette (carte 22px, ligne de liste ≥76px, chip 42px) disponibles comme variables SCSS réutilisables plutôt que dupliqués dans chaque composant
- [ ] Aucune régression sur les écrans déjà livrés (à ce stade, seul le placeholder de `HomeView.vue` existe)

**Notes techniques**
- Bloquant pour #36 (7.4, écran d'accueil) et #17 (3.4, écran Carnet), qui reprennent ces tokens
- Ticket transverse (core/theme + styles/), pas rattaché à une feature — même logique que 0.1/0.2 (setup Supabase)
- Le choix d'icônes a un impact direct sur la fidélité pixel visée par #36/#17 : à trancher avant d'attaquer ces deux tickets, pas après

**Hors scope de ce ticket**
- Dark mode (non demandé, hors scope v1)
- Refonte de composants déjà écrits (aucun composant d'écran n'existe encore à ce stade)

---
Ticket **0.3**
