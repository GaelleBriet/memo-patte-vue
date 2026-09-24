# Marquer un rappel comme fait (F1 à F11)

Maquettes de Claude Design (2026-09-24) : planches `MémoPatte v2 - Rappel fait-selection.png`, relevé illustré `MémoPatte v2 - Rappel fait-releve.png`. La version interactive (`(standalone).html`) est dans le coffre de notes de Gaelle ; le relevé ci-dessous en est extrait et fait foi pour les textes exacts, sous réserve des points à trancher.

Ticket : #364. Décisions : `docs/product/decisions-log.md`, bloc du 2026-09-23 « Cycle de vie d'un rappel ». Le modèle de données de l'historique n'est pas tranché (`docs/technical/proposition-historique-rappels.md`, branche du même nom).

Les données d'exemple (« Foyer de Sophie », animaux, dates) sont fictives : l'en-tête de l'accueil garde son texte actuel.

## Points à trancher avec Gaelle (2026-09-24)

- F10 : la maquette note la prise de vermifuge **sans ouvrir l'app** ; le bouton d'une notification du plugin `@capacitor/local-notifications` ouvre l'app (journal du 2026-09-23, point 3)
- F1 / F4 : fenêtre « aujourd'hui à J+29 » ; #344 a livré J+30 inclus
- F2 : « Date, dose ou fréquence » ; le modèle n'a pas de champ de dose
- Toasts avec « Annuler » (F3 à F8) : le toast n'a pas encore d'action (#349)
- F9 ter : « Reprendre ce traitement », recommandé par la maquette

## Relevé des textes exacts


### F1 · ACCUEIL, « À FAIRE »

- MémoPatte · Foyer de Sophie · puces Boree / Luna / + (« Ajouter un animal »)
- À faire · 2 rappels
- Antiparasitaire · Boree · En retard · 3 j · ›
- Bravecto · Vermifuge · Boree · Dans 5 jours · ›
- Toute la ligne se touche (≥ 72 dp) ; le chevron › indique qu’elle ouvre une feuille.
- Titre de ligne : nom du produit s’il est saisi, sinon le type.
- Fenêtre : rappels en retard + aujourd’hui à J+29 (30 jours, aujourd’hui compris).
- Lecteur d’écran : « Antiparasitaire, Boree, en retard de 3 jours. Ouvre les actions. » · « Bravecto, vermifuge, Boree, dans 5 jours, le 28 septembre. Ouvre les actions. »

### F2 · FEUILLE D’UN TRAITEMENT

- Bravecto · Vermifuge · Boree · tous les mois
- Prochaine dose le 28 sept.
- Fait aujourd’hui (principal, plein) → F4
- Fait à une autre date › → F3
- Modifier › · Date, dose ou fréquence (sert aussi à reporter)
- Arrêter ce traitement (texte gris, sous un séparateur) → F6
- Vaccin : même feuille sans « Arrêter » ; « Fait aujourd’hui » et « Fait à une autre date » ouvrent F5.
- Lecteur d’écran : « Fait aujourd’hui : noter la prise de Bravecto pour Boree » · « Arrêter le traitement Bravecto. Demande confirmation. »

### F3 · FAIT À UNE AUTRE DATE

- ← (« Retour aux actions ») · Fait à une autre date · Bravecto · Boree
- septembre 2026 · ‹ « Mois précédent » · › désactivé « Mois suivant, indisponible »
- L M M J V S D · jours après le 23 grisés et non sélectionnables ; aujourd’hui cerclé
- Prise du dim. 20 sept. 2026
- Prochaine dose : 20 oct. 2026 (recalculée depuis la prise)
- Bouton : Noter la prise du 20 sept. (si aujourd’hui : Noter la prise d’aujourd’hui)
- Ensuite : toast « Prise de Bravecto du 20 sept. notée pour Boree » · Annuler
- Lecteur d’écran : « 24 septembre 2026, indisponible » · « 20 septembre 2026, sélectionné »

### F4 · APRÈS « FAIT AUJOURD’HUI »

- Toast : Prise de Bravecto notée pour Boree · Annuler (4 s, annoncé par le lecteur d’écran)
- À faire · 1 rappel · Antiparasitaire · Boree · En retard · 3 j
- Bravecto quitte la liste : prochaine dose le 23 oct. 2026, soit J+30, hors fenêtre.
- Annuler : supprime la prise et remet la ligne.
- Lecteur d’écran : « Annuler la prise de Bravecto »

### F5 · FEUILLE « FAIT » D’UN VACCIN

- Carré · Vaccin · Boree
- Injection le 23 sept. 2026 · Changer (date passée ou aujourd’hui)
- Prochain rappel
- Reporte la date indiquée par ton vétérinaire.
- Dans 1 an · Dans 3 ans · Autre date · Pas de rappel (rien de présélectionné)
- Après choix : Prochain rappel le 23 sept. 2027 / le 23 sept. 2029 / le 15 mars 2027 · Changer / Aucun rappel ne sera programmé.
- Avant choix : Choisis le prochain rappel pour enregistrer. · Enregistrer (désactivé)
- Autre date ouvre un calendrier (dates futures seulement). Dates calculées depuis la date d’injection.
- Après Enregistrer : toast « Injection de Carré notée pour Boree » · Annuler
- Lecteur d’écran : groupe « Prochain rappel », boutons radio ; « Enregistrer, indisponible » tant que rien n’est choisi.

### F6 · ARRÊTER CE TRAITEMENT

- Arrêter Bravecto ?
- Plus aucun rappel pour ce traitement. Ses prises passées restent dans le carnet.
- Annuler (focus initial, contour) · Arrêter (texte corail)
- Anti-erreur : dialogue obligatoire ; « Arrêter » à droite, jamais sous le lien de la feuille ; retour ou tap hors du dialogue = Annuler.
- Après : toast « Bravecto arrêté. Il est dans Traitements terminés. » · Annuler
- Lecteur d’écran : « Annuler, garder Bravecto » · « Arrêter le traitement Bravecto »

### F7 · CARNET, DÉTAIL D’UN VACCIN

- ← · Carré · Vaccin · Boree
- Prochain rappel · 26 août 2027 · dans 11 mois
- C’est fait (→ F5) · Modifier
- Injections · 3
- 26 août 2026 · Rappel choisi : dans 1 an
- 27 juil. 2026 · Rappel choisi : autre date, 26 août 2026
- 28 juin 2026 · Rappel choisi : autre date, 27 juil. 2026
- Menu ⋮ : Changer la date · Supprimer cette injection
- Supprimer → toast « Injection du 27 juil. supprimée » · Annuler (réversible, donc sans dialogue).
- Supprimer la dernière injection : le prochain rappel reprend celui choisi à l’injection précédente.
- Lecteur d’écran : « Options pour l’injection du 27 juillet 2026 »

### F8 · CARNET, DÉTAIL D’UN TRAITEMENT

- ← · Bravecto · Vermifuge · Boree
- Tous les mois · Prochaine dose · 28 sept. 2026 · dans 5 jours
- C’est fait · Modifier
- Prises · 4 depuis mai 2026
- 28 août 2026 · Dernière prise · A fixé la dose du 28 sept. (toujours visible)
- 28 juil. 2026 · 28 juin 2026 · 30 mai 2026
- Voir les 3 prises précédentes / Masquer les prises précédentes
- Au-delà de 12 prises : regroupées par année (« 2025 · 12 prises »), chaque année dépliable.
- Menu ⋮ : Changer la date · Supprimer cette prise. Toucher à la dernière prise recalcule la prochaine dose.
- Arrêter ce traitement (texte gris, en bas) → F6

### F9 · TRAITEMENTS TERMINÉS

- Boree · Bouvier bernois · 5 mois
- Vaccins : Carré · Prochain rappel le 26 août 2027
- Traitements en cours : Bravecto · Tous les mois · prochaine dose le 28 sept. · Antiparasitaire · En retard de 3 jours · prévu le 20 sept.
- Traitements terminés · 1 · ⌄ (replié par défaut)
- Déplié : Milbemax · Arrêté le 26 mai 2026 · 2 prises ›
- Lecteur d’écran : « Traitements terminés, 1, replié / déplié »

### F9 TER · TRAITEMENT TERMINÉ

- ← · Milbemax · Vermifuge · Boree
- Arrêté le 26 mai 2026. Aucun rappel.
- Était tous les 15 jours
- Prises · 2 : 21 mai 2026 · 7 mai 2026 (⋮ : Changer la date · Supprimer cette prise)
- Tu choisiras la date de la prochaine dose. · Reprendre ce traitement
- Reprendre → Modifier, « Prochaine dose » à choisir ; retour dans « Traitements en cours », historique conservé.
- Recommandation : garder « Reprendre » — sinon on recrée le traitement et l’historique est coupé en deux.

### F10 · NOTIFICATIONS ANDROID

- MémoPatte · maintenant · Bravecto pour Boree · Vermifuge · dose prévue aujourd’hui · [C’est fait]
- MémoPatte · maintenant · Vaccin Carré pour Boree · Rappel prévu aujourd’hui · [C’est fait]
- Vermifuge : noté sans ouvrir l’app ; la notification devient « Prise de Bravecto notée pour Boree » · [Annuler], puis disparaît.
- Vaccin : ouvre MémoPatte sur F5 (injection aujourd’hui, prochain rappel à choisir).
- Toucher la notification hors bouton → feuille F2 (ou feuille du vaccin).
- Lecteur d’écran : « C’est fait : noter la prise de Bravecto pour Boree » · « C’est fait : ouvrir MémoPatte pour noter l’injection du vaccin Carré »

### F11 · TOUT EST À JOUR

- Luna sélectionnée · À faire · Luna
- Tout est à jour
- Prochain rappel : Vermifuge le 23 nov. 2026 (« le 23 nov. 2026 » insécable)
- Remplace « Aucun rappel à venir pour Luna. », qui ne reste que s’il n’existe aucun rappel.
- Ajouter un vaccin ou un traitement
