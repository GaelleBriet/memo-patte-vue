# Design — index

Les maquettes de la v1 (`v1-specs/`) l'emportent sur les archives partout où elles diffèrent
(textes, « 2 taps », poids initial…) ; les archives restent pour l'historique des écrans.

| Dossier | Contenu | Statut |
|---|---|---|
| `v1-specs/` | Maquettes de la v1 en pages HTML autonomes : traitements et rappels (V1 à V9), vaccins, animaux et accueil (V10 à V18), Paramètres, compte et Plus (V19 à V27, D1 à D6), « Décaler les doses suivantes » (V28 à V32) (`README.md`) | **référence de la v1**, validée le 2026-09-30 |
| `logos/` | Icône, couches adaptatives Android, notes de correction (`logos.md`) | référence (#50, #54), lu par `scripts/build-icon-resources.py` |
| `archives/avant-v1/` | Spécifications et captures d'avant la v1 : accueil, Carnet, formulaire animal, barre du bas, pesée, poids et courbes, rappels faits, notifications et Paramètres, Plus, compte et consentement | historique, remplacé par `v1-specs/` |

Les bundles HTML interactifs des maquettes (`* (standalone).html.md`) restent
hors dépôt (> 1 Mo, générés) ; ils vivent dans le dossier local de Gaelle. Seules
exceptions : les pages de `v1-specs/`, entrées dans le dépôt à partir du 2026-09-30.
Les maquettes v1 ont été archivées hors dépôt le 2026-08-26.

Écrans non maquettés avant `v1-specs/` : Paramètres (#48), écran Plus (#45),
connexion (#6), formulaires (#15, #20, #25, #30). Ils reprennent les tokens
des deux spécifications v2 (palette pétrole `#01383E` sur crème, Space
Grotesk + Inter, cartes 22 px).
