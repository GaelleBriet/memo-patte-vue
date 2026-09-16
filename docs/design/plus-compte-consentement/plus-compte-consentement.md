---
tags:
  - perso
  - memo-patte
  - plus
  - compte
  - consentement
---

# MémoPatte Plus, connexion, suppression du compte, consentement, Paramètres complétés

Maquettes de Claude Design (2026-09-15), captures `MémoPatte v2 - *-selection.png`. Les versions interactives (`(standalone).html`) sont dans le coffre de notes de Gaelle : elles font foi pour les textes exacts et les états interactifs. Aucune description détaillée n'a été livrée avec ce lot : les implémentations relèvent textes et mesures dans les HTML et les captures, et listent dans leur PR ce qu'elles déduisent.

Tickets : #45 (écran Plus + rappel doux), #6 (connexion / inscription), #87 (suppression du compte), #67 (consentement), #48 / #49 (Paramètres complétés).

## Plus (P1 à P5, rappels doux R1 à R3)

- Écran poussé « MémoPatte Plus » : icône, titre « Garde tes carnets en sécurité, partout », sous-titre « Le local reste gratuit et sans limite. Plus ajoute la sauvegarde cloud. », quatre bénéfices (sauvegarde garantie dans le cloud, le même carnet sur tous tes appareils, tes photos sauvegardées aussi, export PDF complet), carte « Déjà inclus gratuitement, sans compte », comparatif « Ce qu'Android fait déjà, ce que Plus garantit », puis **trois offres**, dans cet ordre : Plus annuel 9,99 € (mise en avant, badge « Meilleure offre »), Mensuel 1,49 €, À vie 29,99 € (« Paiement unique, pour toujours. »). Le relevé de textes des planches (2026-09-16) fait foi sur les libellés et sur cet ordre, qui corrige la première version de cette description.
- P3 feuille Google Play simulée, P4 « Bienvenue dans Plus » (carnet sauvegardé), P5 « Achat non abouti » (« Aucun paiement n'a été effectué. Réessaie quand tu veux, rien n'a changé pour toi. », Réessayer / Plus tard)
- Rappel doux : un par déclencheur, un seul à la fois, « Ne plus me le proposer » l'écarte pour toujours

## Connexion (C1 à C5)

- Texte : « Un compte MémoPatte sert à garder tes carnets en sécurité dans le cloud et à les retrouver sur tous tes appareils. »
- « Continuer avec Google », séparateur « ou », e-mail, mot de passe (« Oublié ? »), « Se connecter » / « Créer mon compte », bascule « Pas encore de compte ? Créer un compte » / « Déjà un compte ? Se connecter »
- Erreurs : « Un compte existe déjà avec cette adresse e-mail. », « Mot de passe incorrect. Réessaie. », mot de passe trop court, « La connexion avec Google a échoué. Réessaie. », « Pas de connexion internet. Vérifie ton réseau et réessaie. »
- C4 « Connexion en cours… », C5 « Mot de passe oublié » → « E-mail envoyé » + « Retour à la connexion »

## Suppression du compte (D1 à D6)

- D1 « Ce qui sera supprimé » (ton compte MémoPatte, ta sauvegarde cloud, tes photos sauvegardées, tes données d'usage associées à ce compte) / « Ce qui reste » (les données locales de ce téléphone) / abonnement Google Play résilié séparément (« Gérer mon abonnement »), Continuer / Annuler
- D2 « Confirme que c'est bien toi » (mot de passe ou « Se reconnecter avec Google »), D3 dialog « Supprimer définitivement ton compte ? » (Annuler / Supprimer en rouge), D4 « Suppression de ton compte… », D5 « Compte supprimé » + « Effacer aussi les données de ce téléphone » (confirmation séparée), D6 « La suppression a échoué » (rien n'est supprimé)

## Consentement (A1, A2)

- A1 écran « Avant de commencer » au premier lancement : ce qui est mesuré (écrans consultés, actions comme « vaccin ajouté »), jamais le contenu du carnet ni le nom des animaux, hébergé en Europe, modifiable dans Paramètres → Confidentialité ; boutons « Refuser » et « Accepter » de même taille
- Livré le 2026-09-16 (#67) avec les **deux boutons au même style** (contour pétrole, même taille) et non contour + plein comme la capture : décision de Gaelle, alignée sur « refuser est aussi facile qu'accepter » et sur la prudence CNIL
- A2 Paramètres → Confidentialité : « Politique de confidentialité », interrupteur « Statistiques d'usage anonymes »

## Paramètres (S1 à S9)

- Sections complètes : MémoPatte Plus (statut ; « Découvrir MémoPatte Plus », « Restaurer mon achat », « Je suis déjà abonné » si gratuit), Compte (e-mail, « Se déconnecter », « Supprimer mon compte »), Mes données (export, import, « Export PDF » avec badge Plus), Confidentialité, À propos
- S9 Plus expiré : bannière « Ta sauvegarde cloud est en pause. Tes carnets restent sur ton téléphone. » + « Réactiver Plus »

## Points à trancher avec Gaelle (relevés à la lecture, 2026-09-15)

1. **Écran de bienvenue après le consentement (A1)** : la maquette le montre sur fond pétrole avec « Commencer », alors que l'écran de bienvenue livré (A5, `accueil-v2`) est sur fond crème avec l'illustration et « Créer mon premier animal ». Proposition : garder A5 tel quel et n'ajouter que l'écran de consentement avant.
2. **« Gérer mon abonnement »** : décidé le 2026-09-15 pour le mensuel comme pour l'annuel.
3. Défauts de rendu de la maquette (textes qui se chevauchent dans les listes « Déjà inclus » et « Ce qui sera supprimé », titres coupés) : non reproduits.
