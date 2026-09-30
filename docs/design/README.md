# Design — index

Les maquettes de la v1 (`v1-specs/`) l'emportent sur les dossiers plus anciens partout où elles
diffèrent (textes, « 2 taps », poids initial…) ; ces dossiers restent pour l'historique des écrans.

| Dossier | Contenu | Statut |
|---|---|---|
| `v1-specs/` | Maquettes de la v1 en trois pages HTML autonomes : traitements et rappels (V1 à V9), vaccins, animaux et accueil (V10 à V18), Paramètres, compte et Plus (V19 à V27, D1 à D6) (`README.md`) | **référence de la v1**, validée le 2026-09-30 |
| `accueil-v2/` | Spécification de l'écran d'accueil (`accueil.md`, 5 états A1→A5) + capture `MémoPatte v2 - Accueil.png` | **référence** (#36, #33, #34, #37) |
| `carnet-v2/` | Spécification de l'écran Carnet (`carnet.md`, planches C1→C3) + capture | **référence** (#17) |
| `courbes-poids/` | Historique du poids par pages (H1 à H3), unité de poids kg / lb (U1, U2) + relevé des textes (`poids-pages-unite.md`) | **référence**, points à trancher (#351, #352) |
| `rappels/` | Marquer un rappel comme fait : feuilles « Fait », détail d'un vaccin et d'un traitement, traitements terminés, notifications (F1 à F11) + relevé des textes (`rappel-fait.md`) | **référence**, points à trancher (#364) |
| `plus-revision/` | Écran Plus révisé (P1 à P1 ter), pastille Plus sur l'export PDF (A), feuilles d'export et accès au stockage (B1 à B5) + relevé des textes (`plus-revision.md`) | **référence** (#341, #342, #343) |
| `logos/` | Icône, couches adaptatives Android, notes de correction (`logos.md`) | référence (#50, #54) |

Les bundles HTML interactifs des maquettes (`* (standalone).html.md`) restent
hors dépôt (> 1 Mo, générés) ; ils vivent dans le dossier local de Gaelle. Seules
exceptions : les trois pages de `v1-specs/`, entrées dans le dépôt le 2026-09-30.
Les maquettes v1 ont été archivées hors dépôt le 2026-08-26.

Écrans non maquettés avant `v1-specs/` : Paramètres (#48), écran Plus (#45),
connexion (#6), formulaires (#15, #20, #25, #30). Ils reprennent les tokens
des deux spécifications v2 (palette pétrole `#01383E` sur crème, Space
Grotesk + Inter, cartes 22 px).
