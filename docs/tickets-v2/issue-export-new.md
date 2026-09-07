**Objectif**
Exporter l'intégralité des données de l'utilisateur en JSON et en CSV depuis l'écran Paramètres, quel que soit l'état d'achat. Preuve concrète du différenciant n°4 « données jamais otages » (`docs/product/04-differenciation.md`, `05-monetisation.md`, règle d'or du 2026-09-07).

**Critères d'acceptation**
- [ ] Entrée « Exporter mes données » dans l'écran Paramètres (10.1), accessible en 2 taps depuis l'accueil (icône paramètres → ligne d'export)
- [ ] Choix du format : **JSON** (un seul fichier `memopatte-export-AAAA-MM-JJ.json`) ou **CSV** (une archive `.zip` contenant un fichier par table : `animaux.csv`, `vaccins.csv`, `traitements.csv`, `poids.csv`, `rappels.csv`)
- [ ] Contenu : toutes les données de l'utilisateur connecté, toutes espèces confondues, y compris l'historique (dates passées) et les rappels programmés ; les photos d'animaux sont exclues du CSV et référencées par nom de fichier dans le JSON (pas d'encodage base64)
- [ ] JSON versionné : champ `schemaVersion` + `exportedAt` (ISO 8601) + `appVersion`, pour permettre un import ultérieur
- [ ] CSV : encodage UTF-8 avec BOM, séparateur `;` (ouverture directe dans Excel/LibreOffice en français), dates ISO `AAAA-MM-JJ`
- [ ] Le fichier est remis via la feuille de partage Android (`@capacitor/share`) après écriture dans le cache de l'app (`@capacitor/filesystem`) — enregistrer dans Drive, envoyer par mail, etc.
- [ ] Fonctionne **hors-ligne** : l'export lit SQLite uniquement, aucun appel Supabase
- [ ] Disponible **quel que soit l'état d'achat** (avant achat, après achat, et après la fin d'un éventuel essai) — aucune condition sur `purchase`
- [ ] État vide géré : si aucun animal, l'entrée reste visible mais désactivée avec un sous-texte « Rien à exporter pour l'instant »
- [ ] Retour utilisateur : indicateur pendant la génération, message de confirmation ou d'erreur (i18n)
- [ ] Tests unitaires sur le sérialiseur (JSON et CSV) à partir d'un jeu de données fixture : 2 animaux, vaccins/traitements/poids, dates antérieures, caractères accentués et `;` dans un champ libre

**Notes techniques**
- Dépend de 10.1 (écran Paramètres) et des repositories des épics 3, 4, 5 (animals, vaccinations, treatments) et de l'épic poids
- Logique dans `features/settings/` (composable `useDataExport` + `export.service.ts`), lecture via les repositories existants uniquement, jamais de SQL direct dans le composant
- Plugins à ajouter : `@capacitor/filesystem`, `@capacitor/share` (vérifier la compatibilité Capacitor 8 avant d'installer, cf. incident `in_app_purchase` du 2026-08-14)
- Zip côté client : `fflate` (léger, sans dépendance) ; alternative si trop lourd, un CSV par table partagé en plusieurs fichiers
- Le schéma JSON d'export est un contrat : le documenter dans `docs/technical/export-format.md` à la livraison
- Ne pas confondre avec l'export **PDF** (mise en page véto), explicitement hors scope v1

**Hors scope de ce ticket**
- Import / restauration depuis un export (le compte + la sync couvrent la restauration en v1)
- Export PDF
- Export partiel (un seul animal, une période) — à envisager après retours utilisateurs

---
Ticket **10.2**
