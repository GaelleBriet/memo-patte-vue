---
tags:
  - perso
  - memo-patte
  - notifications
  - parametres
---

# Notifications, rappels désactivés et Paramètres (#11, #12, #48)

Maquettes de référence : `MémoPatte v2 - Notifications-selection.png` (P1 à P4), `MémoPatte v2 - Rappels désactivés-selection.png` (R1 à R3), `MémoPatte v2 - Paramètres-selection.png` (S1 à S8) (versions interactives dans le coffre de notes de Gaelle).

## 1. Priming notifications (P1–P4)

**Structure** — écran plein 380×812 (pas une feuille : arrive dans le fil de saisie). Fond `#F9F3E9`. P1/P2 : icône ronde 96px bg `oklch(89% 0.045 202)` / glyphe `notifications_active` 44px `#01383E` ; titre Space Grotesk 700 24px ; sous-titre Inter 14.5px `#68625C` secondaire ; 3 bullets `check_circle` 19px petrol + texte 13.5px 600 ; bouton plein petrol pilule 52px ; lien texte secondaire 44px tap. P2 : scrim `rgba(20,26,26,.46)` + dialog **stylé OS** (blanc, radius 28, boutons texte `#0B57D0`) — délibérément hors palette MémoPatte pour signaler que c'est le système, pas l'app. P3/P4 : retour Carnet (skeleton petrol header + 3 blocs), P3 ajoute le toast déjà utilisé sur l'Accueil.

**Textes exacts** : titre « Ne rate plus aucun rappel » ; sous-titre « Active les notifications pour être prévenu à temps des vaccins et traitements de tes animaux. » ; bullets « On te prévient avant le rappel de vaccin de Milo » / « Ça marche même hors ligne » / « Seulement pour les rappels que tu enregistres » ; boutons « Activer les rappels » / « Plus tard » ; dialog système « L'application MémoPatte souhaite vous envoyer des notifications » / « Ne pas autoriser » / « Autoriser » ; toast « Rappels activés ». ⚠️ à surveiller en anglais : le 1er bullet et le texte du dialog système sont les plus longs — vérifier le retour à la ligne sur 2 lignes max.

**Nouveau** : dialog système simulé (surface blanche, boutons bleu Android `#0B57D0`, radius 28) — seul endroit de l'app qui sort volontairement de la palette MémoPatte.

## 2. Rappels désactivés sur l'Accueil (R1–R3)

**Structure** — fichier séparé (l'Accueil existant n'est pas modifié) reproduisant sa structure à l'identique + bandeau. Bandeau : marge 22px, bg `oklch(95.5% 0.006 78)`, bordure `oklch(90% 0.008 78)`, radius 14, icône `notifications_off` 19px `#68625C`, ligne 1 13px 700 `oklch(38% 0.012 70)`, ligne 2 lien 12.5px 700 petrol + `chevron_right`. Placé **avant** le titre « À faire », donc au-dessus de la bannière rouge de retard.

**Textes exacts** : « Les rappels sont désactivés » / « Activer dans les réglages ».

**Nouveau** : bandeau neutre persistant (distinct de la bannière rouge de retard, jamais de couleur d'urgence).

## 3. Paramètres (S1–S8)

**Structure** — écran poussé depuis l'icône `settings` déjà en haut à droite du header Accueil (48×48, déjà présente, il manque juste le lien — voir décisions). Top bar identique au formulaire Animal (sticky, retour + titre, pas de barre du bas). Sections = titre 19px 700 + carte `#FEFCF9`/`oklch(93.6% 0.006 78)` radius 22, lignes ≥58px (72px si icône en puce), séparateur `oklch(94.5% 0.006 78)` sauf dernière ligne. Feuilles (Export/Import/Erreur) et dialogs (Déconnexion/Remplacer) réutilisent exactement les mécaniques de la feuille Pesée (scrim 46%, radius 24, poignée) et un nouveau dialog centré (même radius/scrim, boutons texte+plein).

**Textes exacts** :

- Plus (gratuit) : « Découvrir MémoPatte Plus » / « Sauvegarde cloud, export PDF, plusieurs appareils » / « Restaurer mon achat » / « Je suis déjà abonné »
- Plus (payant) : « MémoPatte Plus » / « Plus annuel jusqu'au 14/09/2027 » ou « Plus à vie »
- Compte : e-mail / « Se déconnecter » / « Supprimer mon compte »
- Données : « Exporter mes données » / « Rien à exporter pour l'instant » / « Importer un export MémoPatte » / « Export PDF »
- Confidentialité : « Politique de confidentialité » / « Statistiques d'usage anonymes » / « Gérer mon abonnement » / « Google Play »
- À propos : « Version » / « 2.4.0 »
- Export : « Exporter tes données » / « Choisis un format. » / « JSON » « Pour réimporter dans MémoPatte » / « CSV » « Pour un tableur » / « Exporter » → « Préparation… » → « Partager via »
- Import : « Importer un export » / « Des données existent déjà sur cet appareil. » / « Fusionner » « Ajoute ce qui manque, garde tes données actuelles. » / « Remplacer » « Remplace toutes tes données actuelles. » / « Continuer »
- Confirmation remplacement : « Remplacer toutes tes données ? » / « Cette action supprimera définitivement les données actuelles de l'appareil. Elle est irréversible. » / « Annuler » « Remplacer »
- Erreurs import : « Ce fichier n'est pas un export MémoPatte. » / « Cet export vient d'une version plus récente de l'app. » / « Choisir un autre fichier »
- Déconnexion : « Se déconnecter ? » / « Tu pourras te reconnecter à tout moment avec ton compte. » / « Annuler » « Se déconnecter » ⚠️ à surveiller en anglais : « Cette action supprimera définitivement… irréversible » et « Sauvegarde cloud, export PDF, plusieurs appareils » sont les plus longues — risquent de forcer une 3ᵉ ligne dans leur carte.

**Nouveau** :

- Interrupteur (toggle) — piste 44×26, off `oklch(88% 0.01 78)`, on `#01383E`, pastille blanche.
- Badge « Plus » — pastille `oklch(91% 0.03 202)`/`#01383E`, même famille que les badges de rappel.
- Ligne CTA teintée (« Découvrir MémoPatte Plus ») — seule ligne à fond teinté dans une liste par ailleurs blanche.
- Ligne désactivée — libellé + puce grisés + sous-texte explicatif, pas de simple opacité globale.
- Dialog centré (confirmation) — nouveau composant, distinct de la feuille du bas : radius 24, scrim identique, boutons texte/plein en pied.
- Cartes de choix sélectionnables (Export/Import) — différent du sélecteur d'espèce (segmenté inline) : cartes empilées avec pastille radio.
- Feuille de partage Android simulée — grille d'icônes génériques.


## Décisions à valider

1. **Priming = écran plein, jamais une feuille.** Raison : il suit un formulaire déjà plein écran (vaccin/traitement), pas une action rapide type pesée. Écarté : feuille du bas (aurait paru comme une action mineure, pas une permission système).
2. **Dialog Android stylé « système »**, pas aux couleurs MémoPatte. Raison : signaler clairement que c'est l'OS qui parle, pas l'app — cohérent avec « précédée d'un écran d'explication » qui doit rester distinct de la popup elle-même.
3. **P3/P4 montrent un Carnet simplifié (skeleton)**, pas le vrai écran. Raison : consigne « ne pas modifier les maquettes existantes » ; recrée le seul bloc déjà utilisé comme fond dans la feuille Pesée, pour rester cohérent sans dupliquer tout le Carnet.
4. **Bandeau désactivé placé avant « À faire »**, au-dessus de la bannière rouge de retard. Raison : c'est un état permanent de l'app, pas lié aux tâches du jour — la hiérarchie visuelle (neutre en haut, urgent dans la liste) reste claire. Écarté : le mettre après la bannière de retard, qui aurait fait perdre l'urgence du retard au profit d'un message calme.
5. **Icône `settings` de l'Accueil pas reliée à Paramètres.dc.html.** Elle existe déjà (48×48, en haut à droite) mais j'ai laissé l'Accueil intact comme demandé — il ne manque qu'un `href`, à ajouter dans un prochain tour si tu valides.
6. **« Découvrir Plus / Restaurer / Déjà abonné » affichés seulement en gratuit**, masqués une fois Plus actif (redondants). Écarté : les garder toujours visibles (bruit inutile une fois abonné).
7. **« Gérer mon abonnement » affiché seulement pour Plus annuel** (abonnement Google Play), masqué pour Plus à vie (achat unique, rien à gérer côté Play).
8. **Bouton « Se déconnecter » en petrol, pas en couleur d'erreur** — ce n'est pas destructif (les données locales restent). Seul « Supprimer mon compte » est en `#B3261E`.
9. **Sheet Export/Import : fermeture (poignée, tap dehors) renvoie vers l'Accueil**, comme dans la feuille Pesée — cohérent avec le seul lien de sortie déjà utilisé par les maquettes précédentes.
10. **Choix « Fusionner » dans la feuille Import ne déclenche pas d'état supplémentaire** (pas de spinner de fusion) — seul « Remplacer » ouvre la confirmation destructive, pour ne pas alourdir une action non risquée.

## Validé par Gaelle le 2026-09-15

- Les dix décisions ci-dessus, sauf la n° 9 qui ne vaut que pour le prototype : dans l'app, fermer une feuille laisse sur les Paramètres.
- Sur P1, le titre chevauche le sous-titre : défaut de la maquette, pas un choix.
- Les sections dont la destination n'existe pas encore (MémoPatte Plus, Compte, Export PDF, Confidentialité) arrivent avec leurs tickets (#45, #6, #81, #86, #67) : pas de contrôle mort.
