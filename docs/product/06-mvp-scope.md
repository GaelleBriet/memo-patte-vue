---
tags:
  - perso
  - memo-patte
  - mvp
---
# Périmètre du MVP

Ce fichier ne doit être rempli qu'une fois `03-pain-points.md` et
`04-differenciation.md` stabilisés. C'est le dernier document avant
toute discussion technique.

## Statut
- [x] Pain points validés par du terrain
- [x] Différenciants tranchés
- [x] Modèle de monétisation tranché
- [x] Scope MVP validé par Gaelle → seulement à ce moment le projet
      peut passer en phase technique
- [x] Mise à jour majeure du 2026-08-21 : compte obligatoire + architecture hybride (SQLite local + Supabase)
- [x] Mise à jour du 2026-09-07 : export JSON/CSV ajouté au scope v1 (portabilité des données, différenciant n°4)
- [x] Mise à jour majeure du 2026-09-07 : monétisation « gratuit = local, Plus = cloud » ; le compte devient optionnel, lié à Plus

## Dans le scope v1

### Compte utilisateur (modifié le 2026-09-07, remplace la version du 2026-08-21)
- Compte **optionnel**, créé uniquement au moment de souscrire MémoPatte Plus.
- Sans compte, l'app est complète et fonctionne entièrement en local (SQLite). Aucune fonctionnalité locale n'est conditionnée au compte.
- Filets de sécurité gratuits, sans serveur : **Auto Backup Android** (sauvegarde automatique des données de l'app sur le Drive de l'utilisateur, ≤ 25 Mo, photos exclues, restaurée à la réinstallation) et **export JSON/CSV** libre.
- Avec Plus : compte (email + mot de passe ou Google), sauvegarde cloud garantie sur Supabase, restauration à la demande sur un nouvel appareil, même carnet sur plusieurs appareils, photos sauvegardées.
- À la souscription, les données locales existantes sont envoyées intégralement vers le compte (envoi complet, pas de réconciliation).
- Message clair sur l'écran Plus : ce que fait Android tout seul, ce que Plus garantit en plus.

### Profil animal
- Créer un profil par animal : nom, espèce, race, date de naissance, poids initial, photo. 
- Espèces couvertes en v1 : chien et chat uniquement.
- Pas de limite sur le nombre d’animaux.

### Rappels (différenciant n°1)
- Vaccins : date + rappel programmable.
- Vermifuges / antiparasitaires : date + fréquence + rappel
  programmable.
- Notifications **locales** (Capacitor), fonctionnelles hors-ligne.
- Les règles et échéances qui permettent de reprogrammer les notifications sont persistées (SQLite + Supabase). Après restauration des données, l’app reconstruit automatiquement les notifications locales.

### Vue consolidée (différenciant n°2)
- Écran d'accueil listant tous les animaux avec, pour chacun, son
  prochain rappel à venir (vaccin ou vermifuge le plus proche).
- Pas besoin de rentrer dans chaque profil pour savoir "qui a quoi
  bientôt".

### Saisie rapide (différenciant n°3)
- Ajouter un poids, une date de traitement ou un rappel en 2 taps
  maximum depuis l'écran d'accueil ou le profil de l'animal.
- Historique de poids consultable (liste ou graphique simple).
- Possibilité de saisir une date antérieure au jour présent.

### Monétisation (différenciant n°4, modifié le 2026-09-07)
- Règle : **tout ce qui vit sur le téléphone est gratuit, tout ce qui passe par le cloud est dans Plus.**
- **MémoPatte (gratuit, sans compte)** : animaux illimités, vaccins, traitements, poids, rappels hors-ligne, accueil consolidé, export JSON/CSV. Pas de pub, pas de limite artificielle.
- **MémoPatte Plus** : compte + sauvegarde cloud + restauration + multi-appareil + photos sauvegardées + **export PDF** (déplacé de v2 vers Plus v1 pour donner un argument tangible en plus de la sauvegarde).
- Deux façons de payer la même chose : **7,99 €/an** ou **24,99 € à vie** (≈ 3 ans d'annuel). Prix affichés avant tout paiement, modifiables plus tard sur Play sans effet rétroactif.
- Règle d'or inchangée : aucune fonction locale ne passe jamais derrière un paywall, aucune donnée déjà saisie n'est jamais verrouillée. Qui arrête Plus garde son carnet complet en local et perd seulement la sync.

### Portabilité des données (différenciant n°4, ajouté le 2026-09-07)
- Export de l'intégralité des données de l'utilisateur (animaux, vaccins, traitements, poids, rappels) en **JSON** (fichier unique, ré-importable à terme) et en **CSV** (un fichier par table, lisible dans un tableur).
- Accessible depuis l'écran Paramètres, en 2 taps, **quel que soit l'état d'achat** : c'est la preuve concrète de la règle « jamais de verrouillage rétroactif » de `05-monetisation.md`.
- Généré localement depuis SQLite, partagé via la feuille de partage Android (aucun serveur impliqué).
- Import depuis un export JSON : filet de restauration manuel pour les utilisateurs gratuits, bon marché une fois l'export fait (même schéma). Candidat v1.1, non tranché.

## Explicitement hors scope v1

- **Partage du carnet (pet-sitter, famille)** 
- **Export PDF gratuit** : l'export PDF existe mais dans Plus (voir Monétisation) ; l'export JSON/CSV, lui, est gratuit
- **Suivi des chaleurs / stérilisation**
- **Espèces au-delà de chien/chat** (NAC, chevaux, etc.) 
- **Collaboration multi-compte / temps réel** (Plus offre le même compte sur plusieurs appareils, pas une édition simultanée à plusieurs) 
- **Téléconsultation vétérinaire, e-commerce, réseau social** 
- **Publicité, affiliation, vente de données** 
- **Fonction locale payante ou limite d'animaux** (le seul verrou payant est le cloud)
- **Statistiques ou graphiques avancés** au-delà d’un historique de poids simple

## Non tranché, à clarifier avant de coder
- Import JSON en v1 ou v1.1.
- Comportement exact si l'abonnement annuel expire (délai de grâce Play, message, données locales intactes dans tous les cas).
- Langue(s) de l’app : v1 en français uniquement (à confirmer).

## Critère de sortie de cette phase
Ce fichier doit être rempli et les cases ci-dessus cochées avant
d'entamer toute discussion de stack technique, d'architecture ou de
code.

Validé initialement par Gaelle le 2026-08-11. Mise à jour majeure du 2026-08-21 (compte obligatoire + architecture hybride) à valider.
