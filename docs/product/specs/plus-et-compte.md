---
tags:
  - perso
  - memo-patte
  - product
---

# Spec fonctionnelle — MémoPatte Plus et compte (validée le 2026-09-30)

Suivi : cadrage produit. Sources : [principes](../principes.md) (3, 7), Vision Board (objectif 3),
GO Roadmap (v1 avec Plus, phase de test), parcours 1, 12, 13, 14, 15, matrice des fonctionnalités (G4,
G4 bis) ; spec [données](donnees.md) ; dépôt :
[`docs/technical/proposition-sync.md`](../../technical/proposition-sync.md), décisions du 2026-09-07,
2026-09-15, 2026-09-22 (Google), 2026-09-26 (site, compte d'abord, durées) ; tickets #40, #65, #83,
#87, #426, #427 ; page publique [`site/suppression-compte/`](../../../site/suppression-compte/). Une
règle marquée **(à valider)** renvoie à une question ouverte.

## 1. Problème

Sans Plus, un téléphone perdu peut emporter le carnet. Plus vend une garantie (« ton carnet ne disparaît
jamais ») et plusieurs appareils ; il demande un compte, donc des données personnelles, des obligations
(suppression, durées) et un parcours d'achat honnête.

## 2. Objectifs

1. Une abonnée retrouve son carnet complet, photos comprises, sur n'importe quel téléphone.
2. Elle voit à tout moment que sa sauvegarde fonctionne.
3. Rien de local n'est jamais bloqué, avant, pendant ou après Plus (principe 7).
4. Partir est aussi simple qu'arriver (compte supprimé, carnet local gardé).

**Hors objectifs** : partage du carnet entre personnes (v2, annoncé) ; fonctions locales payantes ;
publicité.

## 3. Règles

### 3.1 Offre et achat

- **PL-1** Trois offres au même contenu : mensuel 1,49 €, annuel 9,99 € (mis en avant : « Meilleure
  offre », « ≈ 44 % d'économie vs mensuel », jamais de prix au mois), à vie 29,99 € (« Soutenir une app
  indépendante ») ; prix affichés par Google Play ; conditions de l'offre cochée affichées avant l'achat
  (existant, conformité §1.4). (Décision du 2026-09-15 ; P12 Q1 ; relecture du lot C, QC-1)
- **PL-2** Contenu de Plus en v1 : sauvegarde et restauration garanties, même carnet sur plusieurs
  appareils, photos sauvegardées. **Le PDF n'en fait plus partie** (gratuit). L'écran Plus annonce
  honnêtement la suite, sans date : « Prévu ensuite dans Plus : le carnet partagé du foyer » (spec Q4).
  (P6 Q2 ; P12 Q1)
- **PL-3** L'écran Plus dit ce qui reste gratuit (« Animaux, rappels, poids et exports restent
  gratuits, sans compte ni abonnement ») et ce que la sauvegarde d'Android fait déjà, au conditionnel
  (« Si la sauvegarde de ton téléphone est active, Android garde une copie de ton carnet, sans les
  photos ni garantie. Plus le garantit. », qui remplace le texte actuel). (Existant ; P12 ; relecture
  du lot C, QC-11)
- **PL-4** Compte d'abord, puis achat : choisir une offre demande de se connecter ou de créer un compte,
  puis ouvre le paiement Google Play ; l'achat est rattaché au compte. Écran : titre « Étape 1 sur 2 » ;
  « Crée ton compte MémoPatte » ; « Ton accès Plus est lié à ton compte : tu le retrouves sur tous tes
  appareils, avec ton carnet. » (juste pour les trois offres, spec Q6) ; rappel de l'offre choisie
  (« Plus mensuel · 1,49 €/mois », « Plus annuel · 9,99 €/an » ou « Plus à vie · 29,99 € », spec Q6),
  « Paiement à l'étape suivante, dans Google Play. » ; « Continuer avec Google », « Continuer avec une
  adresse e-mail », « J'ai déjà un compte · Se connecter » ; en bas, « MémoPatte s'adresse aux 18 ans et
  plus. » et le lien « Politique de confidentialité » (le compte Google se crée depuis cet écran). Déjà
  connecté (ancien abonné, compte créé sans achat) : pas d'écran, le paiement s'ouvre directement (relecture de cohérence du 2026-09-30, validé en bloc).
  (Décision du 2026-09-26, #427 ; textes : spec Q5 ; lot C révisé, validé en bloc)
- **PL-5** Invitations vers Plus : première photo, carnet qui s'étoffe, premier export, sur le Carnet ;
  jamais au lancement, jamais en notification ; « Ne plus me le proposer ». (Existant, 2026-09-16)
- **PL-6** Achat annulé ou refusé : « Aucun paiement n'a été effectué… rien n'a changé pour toi. »
  « Restaurer mes achats » et « Gérer mon abonnement · Google Play ». (Existant)

### 3.2 Compte

- **PL-7** Connexion avec Google (Credential Manager, `signInWithIdToken`, sans lien profond) ou avec une
  adresse e-mail et un mot de passe. Le bouton « Continuer avec Google » est en haut de l'écran de
  connexion (le même que « Créer un compte »), le formulaire e-mail dessous, séparé d'un trait ; V25 quater et la charte de Google font référence. Sélecteur fermé
  sans choisir : rien. Pas de compte Google sur le téléphone : « Aucun compte Google sur ce téléphone.
  Ajoute-le dans les réglages d'Android, ou continue avec une adresse e-mail. » ; services Google
  absents : « La connexion avec Google n'est pas disponible sur ce téléphone. Continue avec une adresse
  e-mail. » (le bouton reste affiché). À la déconnexion, la mémoire du choix Google d'Android est aussi
  effacée. L'écran ouvert par « J'ai déjà MémoPatte Plus » (écran Plus, accueil de bienvenue, Paramètres ›
  Plus), par « Restaurer mes achats » ou un paiement sans compte ou à session expirée, et par la
  déconnexion est une **connexion seule** : pas de « Pas encore de compte ? Créer un compte ». La création
  de compte ne s'offre que depuis l'étape 1 de l'achat (PL-4) ; un lien `mode=sign-up` venu d'ailleurs ouvre
  la connexion. (Décisions du 2026-09-22, du 2026-10-21 et du 2026-10-23 ; #65, #1161)
- **PL-8** Inscription par e-mail (depuis l'étape 1 de l'achat seulement, PL-7) : un code à 8 chiffres (décision du 2026-10-22)
  envoyé à l'adresse, saisi dans l'app, confirme qu'elle est la bonne (« Renvoyer le code », code faux ou expiré signalé) ; avec Google, rien à
  confirmer. L'écran de création porte « Au moins 8 caractères. », « MémoPatte s'adresse aux 18 ans et
  plus. » et le lien vers la politique de confidentialité. Deux champs de mot de passe : « Mot de passe »
  puis « Confirme le mot de passe » (PL-23). (Spec Q1, 2026-09-29 ; conformité §2.3 ;
  relecture du lot C, validé en bloc)
- **PL-9** Mot de passe oublié : un code à 8 chiffres envoyé par e-mail, saisi dans l'app, puis un
  nouveau mot de passe, à saisir deux fois : « Confirme le nouveau mot de passe » (PL-23) (détail à vérifier dans la doc de Supabase) ; « Mot de passe oublié ? » depuis la
  connexion et depuis « Changer mon mot de passe ». À l'étape du code, le retour d'Android revient à la
  saisie de l'adresse, comme la flèche, adresse gardée et mots de passe saisis effacés (décision du 23 octobre, #1106). (G4 ; relecture du lot C, QC-9)
- **PL-10** Comptes par e-mail, dans Paramètres › Compte : « Changer mon mot de passe » (l'ancien, puis
  le nouveau et « Confirme le nouveau mot de passe », PL-23) et « Changer mon adresse e-mail » (le mot de passe actuel d'abord, puis la nouvelle
  adresse se confirme par un code à 8 chiffres, envoyé à elle seule ; une adresse déjà utilisée par un
  autre compte est refusée avec un message clair ; réglage Supabase à vérifier au ticket, spec Q3 ;
  **corrigé le 22 octobre : deux codes, l'un à l'adresse actuelle puis l'autre à la nouvelle, voir Q3** ;
  à l'étape d'un code, le retour d'Android revient à la saisie, comme la flèche (adresse gardée, mots de passe saisis effacés ; décision du 23 octobre, #1106). Avec
  Google, ces gestes n'apparaissent pas : c'est Google qui gère, et la rubrique dit « Compte Google »
  avec l'adresse (jamais « Connecté avec Google »). Un compte qui a un mot de passe montre toujours cette
  version par e-mail (V24), même ouvert par Google ce jour-là ; la version Google (V24 bis) est pour un
  compte créé avec Google. (Spec Q2, 2026-09-29 ; relecture du lot C, QC-11)
- **PL-23** Champs de mot de passe (décisions du 2026-10-23 ; #1164) :
  - **Confirmation** : un second champ « Confirme le nouveau mot de passe » dans « Changer mon mot de
    passe » et « Mot de passe oublié », « Confirme le mot de passe » à la création de compte. Les deux
    saisies se comparent à l'identique, sans retirer les espaces ni ignorer la casse. Tant qu'elles
    diffèrent, le bouton d'enregistrement est inactif ; l'écart se dit « Les deux mots de passe ne sont
    pas identiques. ». La confirmation n'est jamais envoyée au serveur.
  - **Icône œil** sur chaque champ de mot de passe : masqué par défaut, l'état n'est jamais mémorisé,
    noms accessibles « Afficher le mot de passe » / « Masquer le mot de passe », zone tactile de 48 px.
- **PL-11** Se déconnecter : « Ton carnet reste sur cet appareil. Seule la synchronisation s'arrête. »
  (Existant)
- **PL-12** Session expirée : icône de nuage en alerte, « Reconnecte-toi pour reprendre la sauvegarde »
  dans Paramètres › Sauvegarde. (G4 bis)
- **PL-13** Deux personnes sur un même compte : ni encouragé ni bloqué ; la FAQ explique les limites.
  (P14 Q1)

### 3.3 Sauvegarde et synchro

- **PL-14** À la souscription, tout le carnet et les photos partent vers le cloud (amorçage) ; ensuite,
  chaque changement part seul, à l'ouverture de l'app et au retour du réseau ; pas de temps réel.
  (#83 ; [`proposition-sync.md`](../../technical/proposition-sync.md))
- **PL-15** La modification la plus récente gagne, ligne par ligne ; deux lignes pour une même
  échéance de traitement (jour et heure) s'affichent comme une seule (la plus récente). (Proposition sync ; relecture, point 5)
  **Un appareil à la fois** (décision de Gaelle du 2026-10-20) : le même carnet sur tablette et téléphone
  marche quand on les utilise l'un après l'autre ; si deux appareils modifient la même ligne sans
  connexion, la plus récente remplace l'autre, sans arbitrage entre un report et la réécriture d'un
  réglage faits chacun sur un appareil. L'aide le dit (écran Plus et site) : « Utilise un appareil à la
  fois ; si deux appareils modifient le même soin sans connexion, la dernière modification gagne. »
  Les cas de conflit fin à deux appareils sont hors périmètre (#986 fermé).
- **PL-16** Restauration sur un nouvel appareil : par l'accueil de bienvenue (« J'ai déjà MémoPatte
  Plus ») ou Paramètres ; le carnet d'abord, les photos ensuite sans bloquer l'écran ; les rappels
  reprogrammés, avec l'écran « Ne rate plus aucun rappel » si l'autorisation n'a jamais été demandée
  sur ce téléphone (spec Rappels RA-21, Q4). Sur un appareil qui a déjà un carnet : « Fusionner » ou
  « Remplacer » (confirmé), le même choix et les mêmes textes que l'import (spec Données DO-7), jamais
  d'écrasement silencieux. Les deux entrées (accueil de bienvenue, Paramètres › Plus) mènent au même
  parcours : connexion, contrôle de la sauvegarde, puis V26 bis ou la restauration directe. Il y a une
  sauvegarde dès que le compte contient au moins un animal non supprimé, suivi ou non ; sinon le carnet
  du téléphone part vers le cloud. Le résumé dit « N animaux · dernière sauvegarde … » (date de
  réception de la modification la plus récente). « Remplacer » télécharge tout d'abord, puis efface et
  écrit en une fois. L'écran « Restaurer mon carnet » reste affiché avec « Restauration de ton carnet ·
  120 éléments sur 348 » ; réseau coupé : « La restauration reprendra dès le retour du réseau. Rien n'est
  perdu. » et « Plus tard ». La restauration se fait même sans Plus actif, la sauvegarde restant en pause
  jusqu'à « Réactiver Plus » (PL-19). Un changement de compte laisse le carnet local en place. V26 bis
  quitté sans choisir : rien n'est activé, l'écran revient une fois par lancement. Le texte dit « sur ce
  téléphone », comme l'import. (#40 ; décisions du 2026-10-21 ; P1 Q2 ; [`proposition-sync.md`](../../technical/proposition-sync.md) §4.3 ; relecture du lot C, QC-7)
- **PL-17** État visible : Paramètres › Sauvegarde (« Dernière sauvegarde : il y a 5 min », « En attente
  de réseau », « En pause », « Reconnecte-toi… ») et icône de nuage dans l'en-tête de l'accueil pour les
  abonnés (alerte après 7 jours sans synchronisation réussie). « En pause » est réservé à Plus arrêté ;
  une session expirée dit « Interrompue depuis hier à 18 h 20. Rien n'est perdu. » ; sous-titres de la
  rubrique dans la liste des Paramètres : spec Paramètres, PA-2 bis. (P12 Q2 ; relecture du lot C,
  validé en bloc)
- **PL-18** Un rappel peut sonner sur un appareil pas encore à jour ; accepté en v1. (P14 Q2)

### 3.4 Fin de Plus et départ

- **PL-19** Abonnement arrêté ou expiré : « Ta sauvegarde cloud est en pause. Tes carnets restent sur
  ton téléphone. » ; rien de local n'est bloqué ; Paramètres › Sauvegarde dit que les changements
  depuis la pause ne sont plus sauvegardés, jusqu'à quand la dernière sauvegarde est conservée, et
  propose « Réactiver Plus » (spec Données DO-12, Q7). Restaurer son carnet sur un autre téléphone reste
  possible dans cet état (PL-16). (Existant ; principe 7)
- **PL-20** Sans accès Plus pendant 12 mois : compte, sauvegarde et photos supprimés, avec un e-mail
  d'avertissement un mois avant ; pour un compte créé sans achat, les 12 mois partent de sa création
  (politique publiée : « après 12 mois sans accès Plus »). (Décision du 2026-09-26, #426 ; relecture de cohérence du 2026-09-30, validé en bloc)
- **PL-21** Supprimer son compte : Paramètres › Compte › « Supprimer mon compte », des écrans de l'app
  (D1 à D6), jamais la page du site ; l'écran dit ce qui est supprimé et ce qui reste, avec les textes
  de la page publique, et que l'abonnement Google Play n'est pas résilié (avec le lien) ; « Continuer »,
  confirmation d'identité (mot de passe puis « Confirmer », ou « Se reconnecter avec Google ») ;
  « Supprimer », suppression immédiate ; puis, au choix, « Effacer aussi les données de ce téléphone »,
  qui suit le parcours de DO-14 dans sa version sans Plus (« Avant d'effacer, exporte une copie de ton
  carnet. », puis les confirmations ; planches C · D5, V22 ; spec Q7). Sans l'app : par e-mail, sous 30
  jours. Ordre : PostHog et RevenueCat d'abord, le compte en dernier, pour que « Réessayer » reprenne
  toujours là où ça s'est arrêté. D3 prévient « Ton abonnement Google Play continue tant que tu ne le
  résilies pas dans Google Play. » ; l'achat n'est jamais touché et l'app redevient gratuite après la
  suppression. D6 dit « La suppression n'a pas abouti. Tes données restent sur ce téléphone ; réessaie. »,
  aussi sans réseau. D2 n'a pas « Mot de passe oublié ? » en v1 ; mot de passe faux : « Mot de passe
  incorrect. Réessaie. ». « Terminé » de D5 revient à la liste des Paramètres. Le serveur refuse si la
  dernière confirmation d'identité (mot de passe ou reconnexion Google) date de plus de 10 minutes. Avec
  Google (D2 bis), un autre compte Google que celui du carnet est refusé sans rien supprimer : « Ce
  n'est pas le compte Google de ce carnet. Choisis sophie@gmail.com. ». Les demandes par e-mail passent
  par un mode admin de la même fonction, protégé par un secret à part. Un journal ne garde que la date et
  l'origine (app ou e-mail), sans donnée personnelle. (Page publique ; #87 ; P15 ; relecture
  du lot C et du lot C révisé ; décisions du 2026-10-21)
- **PL-22** Les pages publiques ne se déclarent pas dans la Play Console avant #427, #87, #65 et #426.
  (Contexte du 2026-09-26)

## 4. Critères d'acceptation (extraits prioritaires)

1. **Étant donné** une gratuite qui choisit l'offre annuelle, **quand** elle n'a pas de compte, **alors**
   l'app lui demande d'abord de se connecter ou d'en créer un, puis ouvre le paiement Google Play.
2. **Étant donné** une abonnée qui installe l'app sur un nouveau téléphone, **quand** elle touche
   « J'ai déjà MémoPatte Plus » et se connecte, **alors** son carnet, ses photos et ses rappels
   reviennent, précédés de l'écran « Ne rate plus aucun rappel » si l'autorisation n'a jamais été
   demandée sur ce téléphone.
3. **Étant donné** un téléphone qui a déjà un carnet, **quand** l'abonnée s'y connecte, **alors**
   l'app demande « Fusionner » ou « Remplacer » et n'écrase rien sans confirmation.
4. **Étant donné** un abonnement expiré, **quand** Sophie ouvre l'app, **alors** tout son carnet reste
   utilisable et Paramètres dit que la sauvegarde est en pause.
5. **Étant donné** la suppression du compte confirmée, **quand** elle aboutit, **alors** le carnet local
   reste utilisable, et l'app rappelle que l'abonnement Google Play doit être résilié à part.
6. **Étant donné** une session expirée, **quand** Sophie ouvre l'app, **alors** l'icône de nuage est en
   alerte et Paramètres › Sauvegarde propose de se reconnecter.

## 5. Décisions de la spec

- 2026-09-29 — **Q1 : l'adresse e-mail se confirme à l'inscription par un code à 6 chiffres** (PL-8),
  comme le mot de passe oublié ; rien pour Google. Raison : l'avertissement avant la purge, la
  suppression par e-mail et la récupération du mot de passe reposent sur cette adresse. Écartée : pas de
  confirmation (une faute de frappe casse tout en silence).

- 2026-09-29 — **Q2 : changer de mot de passe et changer d'adresse e-mail, les deux dans la v1** (PL-10),
  pour les comptes par e-mail (Gaelle, option B). La nouvelle adresse se confirme par un code ; une
  adresse déjà utilisée est refusée. Écartées : le mot de passe seul, l'adresse par le contact (A) ;
  aucun des deux (C).

- 2026-09-30 — **Relecture du lot C, points validés en bloc** : « Meilleure offre » sur l'offre
  annuelle (texte actuel ; jamais « Le plus choisi » sans données) ; restauration « Fusionner /
  Remplacer » avec les cartes et textes de l'import ; « sauvegarde cloud » partout ; « Mot de passe
  oublié ? » aussi sur « Changer mon mot de passe » ; textes nouveaux acceptés, dont « Avant le
  paiement », « J'ai déjà un compte · Se connecter », « MémoPatte s'adresse aux 18 ans et plus. » et la
  sauvegarde d'Android présentée « sans les photos ni garantie ». (`technical/relecture-maquettes-lot-C.md`,
  QC-1, QC-7 à QC-9, QC-11.)

- 2026-09-30 — **Q3 : changer d'adresse e-mail redemande le mot de passe actuel**, puis un code à la
  nouvelle adresse seulement (PL-10). Raison : un téléphone déverrouillé ne doit pas suffire à détourner
  le compte ; on change souvent d'adresse parce que l'ancienne ne marche plus. Écartées : aucune
  vérification (maquette V24 ter) ; un code aux deux adresses (réglage par défaut de Supabase, bloque qui
  a perdu l'ancienne). (Relecture du lot C, QC-15.)

- 2026-10-22 — **Q3, correction : changer d'adresse e-mail demande deux codes** (PL-10) : un reçu à
  l'adresse actuelle, puis un à la nouvelle ; « Secure email change » reste activé côté Supabase. Raison :
  avec un seul code, quelqu'un qui tient un téléphone déverrouillé et connaît le mot de passe actuel
  prendrait le compte en remplaçant l'adresse ; avec deux codes, il lui faut aussi la boîte mail. Qui a
  perdu l'ancienne adresse passe par le contact (suppression par e-mail ou mode admin). Remplace le « code
  à la nouvelle adresse seulement » ci-dessus. (Revue de sécurité du 22 octobre ; journal des décisions,
  entrée du 2026-10-22.)

- 2026-09-30 — **Q4 : « Prévu ensuite dans Plus », jamais « Bientôt »** (PL-2). Raison : le carnet
  partagé est un gros chantier de v2, dont la place sera revue après la phase de test ; « bientôt »
  promet un délai à des gens qui paient un an ou à vie (principe 1). Écartée : « Bientôt dans Plus »
  (prompt et maquette V26). (Relecture du lot C, QC-17.)

- 2026-09-30 — **Q5 : textes de l'écran « compte d'abord »** (PL-4), réécrits parce que ceux de la
  maquette V25 ter n'étaient « pas très élégants ni très pros » (Gaelle) : ton sobre, une idée par
  ligne, « Étape 1 sur 2 », le paiement annoncé une seule fois, deux boutons « Continuer avec… ».
  Écartée : une version plus courte (« Un compte relie ton abonnement à toi… »), moins naturelle.

- 2026-09-30 — **Q6 : « Ton accès Plus est lié à ton compte »** (PL-4), un seul texte pour les trois
  offres ; rappel de l'offre « Plus mensuel · 1,49 €/mois », « Plus annuel · 9,99 €/an » ou « Plus à vie ·
  29,99 € ». Raison : l'offre à vie n'est pas un
  abonnement (« Pas d'abonnement, rien à renouveler ») ; la conformité sépare les deux. Écartée : deux
  textes selon l'offre. (Vérification du lot C révisé, T2.)
- 2026-09-30 — **Lot C révisé, points validés en bloc** : textes nouveaux (V19 à V27, D1 à D6) ;
  « Confirmer » sur D2 comme la page publique ; « Annuler » sur D2 bis ; « MémoPatte s'adresse aux 18 ans
  et plus. » et le lien vers la politique aussi sur « compte d'abord » ; anglais « A shared health record
  for your pets » (jamais « household ») ; restauration et textes anglais existants repris tels quels à
  l'implémentation. (`technical/relecture-maquettes-lot-C-rev1.md`.)

- 2026-09-30 — **Q7 : après la suppression du compte, effacer le téléphone passe par le parcours de
  DO-14** (PL-21), version sans Plus. Raison : le carnet du téléphone est alors la dernière copie ; on
  propose de l'exporter avant qu'elle parte (principe 3), avec le même écran que partout. Écartée : D5
  puis une seule confirmation (plus court, mais la dernière copie part sans proposition d'export).
  (Relecture de cohérence du 2026-09-30, question 4.)

## 6. Questions ouvertes

Aucune. Spec « Plus et compte » validée le 2026-09-30.
