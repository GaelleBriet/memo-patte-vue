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

## Dans le scope v1

### Compte utilisateur (ajouté / modifié le 2026-08-21) 
- Compte **obligatoire**. 
- Objectif principal : garantir qu’aucune donnée de santé animale ne soit jamais perdue (désinstallation, reset téléphone, changement d’appareil). 
- L’app reste offline-first : elle fonctionne pleinement sans réseau grâce à SQLite local. 
- Synchronisation automatique vers Supabase dès que le réseau est disponible. 
- Message clair à l’utilisateur :
>  Un compte est nécessaire pour que tes carnets de santé ne soient
> jamais perdus, même si tu changes de téléphone. 

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

### Monétisation (différenciant n°4)
- Achat unique in-app, prix affiché clairement avant l’achat, débloque l’app en entier.
- Le compte n’est pas lié à l’achat : l’achat débloque les fonctionnalités, le compte protège les données.

### Portabilité des données (différenciant n°4, ajouté le 2026-09-07)
- Export de l'intégralité des données de l'utilisateur (animaux, vaccins, traitements, poids, rappels) en **JSON** (fichier unique, ré-importable à terme) et en **CSV** (un fichier par table, lisible dans un tableur).
- Accessible depuis l'écran Paramètres, en 2 taps, **quel que soit l'état d'achat** : c'est la preuve concrète de la règle « jamais de verrouillage rétroactif » de `05-monetisation.md`.
- Généré localement depuis SQLite, partagé via la feuille de partage Android (aucun serveur impliqué).
- Import depuis un export : pas en v1 (le compte + la sync couvrent la restauration).

## Explicitement hors scope v1

- **Partage du carnet (pet-sitter, famille)** 
- **Export PDF** (mise en page pour le vétérinaire) — à ne pas confondre avec l'export JSON/CSV, qui est dans le scope
- **Suivi des chaleurs / stérilisation**
- **Espèces au-delà de chien/chat** (NAC, chevaux, etc.) 
- **Sync multi-appareil en temps réel / collaboration multi-compte** (la synchronisation actuelle est un backup + restauration, pas une collaboration live) 
- **Téléconsultation vétérinaire, e-commerce, réseau social** 
- **Abonnement, freemium, publicité, affiliation** 
- **Statistiques ou graphiques avancés** au-delà d’un historique de poids simple

## Non tranché, à clarifier avant de coder
- Moment exact de la demande de compte (immédiat au premier lancement vs après création du premier animal).
- Montant exact du prix de l’achat unique (fourchette 7,99 € – 14 €).
- Langue(s) de l’app : v1 en français uniquement (à confirmer).

## Critère de sortie de cette phase
Ce fichier doit être rempli et les cases ci-dessus cochées avant
d'entamer toute discussion de stack technique, d'architecture ou de
code.

Validé initialement par Gaelle le 2026-08-11. Mise à jour majeure du 2026-08-21 (compte obligatoire + architecture hybride) à valider.
