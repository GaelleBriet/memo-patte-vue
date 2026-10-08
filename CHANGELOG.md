# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

## [0.1.63](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.62...memo-patte-v0.1.63) (2026-10-08)


### ✨ Fonctionnalités

* **accueil:** plus aucun animal suivi ([5423171](https://github.com/GaelleBriet/memo-patte-vue/commit/5423171c82f7028637fec1a57ce2306e2254fe5c))
* **accueil:** plus aucun animal suivi ([9279daa](https://github.com/GaelleBriet/memo-patte-vue/commit/9279daa9bd3665b663cde52875cc622e45037d90)), closes [#547](https://github.com/GaelleBriet/memo-patte-vue/issues/547)
* **animals:** plus d'ajout de soin ni de « Reprendre » sur un animal qu'on ne suit plus ([7bddbda](https://github.com/GaelleBriet/memo-patte-vue/commit/7bddbda73cb3ee240bd17d82130af00d8ccb9577))
* **animals:** plus d'ajout de soin ni de « Reprendre » sur un animal qu'on ne suit plus ([017999a](https://github.com/GaelleBriet/memo-patte-vue/commit/017999ae781f88b7e62355c3ceeb44cc7c765d49)), closes [#629](https://github.com/GaelleBriet/memo-patte-vue/issues/629)
* **settings:** âge estimé d'une date de naissance approximative dans le PDF ([b2c42fe](https://github.com/GaelleBriet/memo-patte-vue/commit/b2c42fe32d8103c9c21d5212ad7976b0775a04bd))
* **settings:** contenu du PDF selon la spec Données ([ca5e4c8](https://github.com/GaelleBriet/memo-patte-vue/commit/ca5e4c8374d0d2444d5a173778f1f0e7a53b9715))
* **settings:** contenu du PDF selon la spec Données ([69c1a6c](https://github.com/GaelleBriet/memo-patte-vue/commit/69c1a6c7a9df5e1cace22d76dc3ef609b710c90a)), closes [#582](https://github.com/GaelleBriet/memo-patte-vue/issues/582)


### 🐛 Corrections

* **animals:** formulaires inactifs tant que l'animal n'est pas connu et suivi ([6dbbcac](https://github.com/GaelleBriet/memo-patte-vue/commit/6dbbcac8ffd574aa5769ab1422bc3566847ee425))
* **i18n:** « 0 prise » au singulier en français ([f6118d7](https://github.com/GaelleBriet/memo-patte-vue/commit/f6118d70911ac1158ab946f5f38e914177b931f5))
* **i18n:** pluriel de la posologie en anglais (« 1.5 drops ») ([d30ac55](https://github.com/GaelleBriet/memo-patte-vue/commit/d30ac5570b3252af73117b9bb26b407e349659e3))
* **i18n:** pluriel de la posologie en anglais (« 1.5 drops ») ([5d80e0d](https://github.com/GaelleBriet/memo-patte-vue/commit/5d80e0d6c87abde87470f12b2ac09139c7fea5f2)), closes [#636](https://github.com/GaelleBriet/memo-patte-vue/issues/636)
* **i18n:** zéro au singulier en français ([024b3fd](https://github.com/GaelleBriet/memo-patte-vue/commit/024b3fd5fb8140f3524c3c77cf216a2b4047c893)), closes [#630](https://github.com/GaelleBriet/memo-patte-vue/issues/630)
* **parametres:** indice du PDF « Un animal à la fois » quand moins de deux sont suivis ([ad39a0a](https://github.com/GaelleBriet/memo-patte-vue/commit/ad39a0a03309386f2c2f5df1be9cac6dbcf49b70))
* **parametres:** indice du PDF selon les animaux proposés par la feuille ([b8a3636](https://github.com/GaelleBriet/memo-patte-vue/commit/b8a3636733d06fc196a70a357474d1927ba44803))
* **parametres:** source ANMV, « CC BY » insécable et liens en noopener vérifiés ([a1a4f5c](https://github.com/GaelleBriet/memo-patte-vue/commit/a1a4f5cf756c525861105d26b34db8191658721d))
* **parametres:** variable de la feuille PDF renommée, sans masquer celle du template ([d18e335](https://github.com/GaelleBriet/memo-patte-vue/commit/d18e335597318984c307377700d19e8148027a7c))
* **plus:** sous-titre de l'écran Plus, exports et PDF gratuits ([8c76f3a](https://github.com/GaelleBriet/memo-patte-vue/commit/8c76f3a658c6abe298973069cfe25a8ed33b783c))
* **plus:** textes Plus alignés sur le code, PDF retiré des avantages ([030a010](https://github.com/GaelleBriet/memo-patte-vue/commit/030a0105655c0d082ac59b5ff72be525e68a761a))
* **settings:** aucune échéance dans le PDF d'un animal qu'on ne suit plus ([8cfa26b](https://github.com/GaelleBriet/memo-patte-vue/commit/8cfa26ba64205d2e6dbfddd2377728827a657924))
* **settings:** historique du PDF regroupé par jour, aucun statut pour un animal non suivi ([62c9042](https://github.com/GaelleBriet/memo-patte-vue/commit/62c9042455aef5fa32d35ede2e9fde16a9f2b8ad))
* **settings:** l'import accepte un arrêt avant le début de la période ([83d1925](https://github.com/GaelleBriet/memo-patte-vue/commit/83d1925d45b75c118385cf63ed1256ab5f0bb88a))
* **settings:** le PDF dit « Aucune prise » sous « Arrêté avant la première prise » ([3a093e8](https://github.com/GaelleBriet/memo-patte-vue/commit/3a093e84f5907dd6ac778842bf07a6963772d0be))
* **settings:** lignes du même jour du PDF lues de la plus récente ([051bf9d](https://github.com/GaelleBriet/memo-patte-vue/commit/051bf9d5e6f15d85d685d4b28259aa7dbdf1c190))
* **shared:** calendrier qui garde le jour maximum dans les fuseaux à changement d'heure à minuit ([f911400](https://github.com/GaelleBriet/memo-patte-vue/commit/f911400a163894f4f49c9b30612c04ff5f8e85b1))
* **shared:** calendrier qui garde le jour maximum dans les fuseaux à changement d'heure à minuit ([519ca13](https://github.com/GaelleBriet/memo-patte-vue/commit/519ca1300bb2e238944651312dc59e0bb10e6de3)), closes [#642](https://github.com/GaelleBriet/memo-patte-vue/issues/642)
* **treatments:** « Arrêté avant la première prise » pour un traitement arrêté avant toute dose ([f17d05a](https://github.com/GaelleBriet/memo-patte-vue/commit/f17d05a914a4aa63b7279e31ffa1ad1a260101ad))
* **treatments:** « Arrêté avant la première prise » pour une période arrêtée avant son début ([9bf2376](https://github.com/GaelleBriet/memo-patte-vue/commit/9bf2376a988984d038380aecee38ac6d7622fd25))
* **treatments:** l'historique juge « Arrêté avant la première prise » sur tout le traitement ([493cf41](https://github.com/GaelleBriet/memo-patte-vue/commit/493cf41d3964b7bd174b77af91b579aa15d77cc7))
* **vaccinations:** aucun statut sur la fiche d'un vaccin d'un animal qu'on ne suit plus ([0c0f217](https://github.com/GaelleBriet/memo-patte-vue/commit/0c0f217e1cb8545f9b5d49f0b358513804d1c837))
* **vaccinations:** ni « C'est fait » ni « Autre jour » pour un animal qu'on ne suit plus ([369ea03](https://github.com/GaelleBriet/memo-patte-vue/commit/369ea03c8006da34bac2222a45bb22baf94b5121))

## [0.1.62](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.61...memo-patte-v0.1.62) (2026-10-07)


### ✨ Fonctionnalités

* **settings:** rubrique Aide et contact, FAQ du site avec captures ([0d6a92e](https://github.com/GaelleBriet/memo-patte-vue/commit/0d6a92efec2a4907e542cc85d5e324ffca7b3f8b))

## [0.1.61](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.60...memo-patte-v0.1.61) (2026-10-07)


### ✨ Fonctionnalités

* **animals:** « Ne plus suivre », « Suivre de nouveau » et « Supprimer » un animal ([69e52f5](https://github.com/GaelleBriet/memo-patte-vue/commit/69e52f548ae89dbd461105bcd75bef93fd948bfb))
* **animals:** animaux qu'on ne suit plus — liste, carnet consultable, date du départ ([57b3626](https://github.com/GaelleBriet/memo-patte-vue/commit/57b3626f0bd7dfbd4180fe90be476d5c74df1d80))
* **animals:** animaux qu'on ne suit plus — liste, carnet consultable, date du départ ([0ecbc65](https://github.com/GaelleBriet/memo-patte-vue/commit/0ecbc65b1331ae879e7446d46423fa4404d5fa24))
* **animals:** animaux qu'on ne suit plus depuis la bienvenue du Carnet (V15 nonies) ([f1ee6bf](https://github.com/GaelleBriet/memo-patte-vue/commit/f1ee6bfde8ad0c7127688e4c7c4432ff1490c8a3))
* **animals:** date de naissance approximative et âge en semaines jusqu'à 16 semaines ([fea1b29](https://github.com/GaelleBriet/memo-patte-vue/commit/fea1b2904ca5d8cdfb147469f7a1f9a8de21e00a))
* **animals:** date de naissance approximative et âge en semaines jusqu'à 16 semaines ([f614fc6](https://github.com/GaelleBriet/memo-patte-vue/commit/f614fc63647cedc925f0722340bc74824e9280f6))
* **animals:** ne plus suivre un animal, ou le supprimer ([fc84a7b](https://github.com/GaelleBriet/memo-patte-vue/commit/fc84a7b9f85bc202ff9b598b8ec8e5c0ded9d14c))
* **animals:** photo de l'animal, badge, un toucher, « Voir la photo », « Retirer » et « Annuler » ([063dec5](https://github.com/GaelleBriet/memo-patte-vue/commit/063dec503ac2a251d0bff4b80f63507336014888)), closes [#577](https://github.com/GaelleBriet/memo-patte-vue/issues/577)
* **animals:** photo de l'animal, la voir en grand, la changer ou la retirer ([3add55b](https://github.com/GaelleBriet/memo-patte-vue/commit/3add55bff231bf78a03b04a76059e56be0596de2))
* **animals:** retirer la barre corail des lignes du Carnet ([0d2b7df](https://github.com/GaelleBriet/memo-patte-vue/commit/0d2b7df7dd95c8315c845c1c5873f86601d881ad))
* **carnet:** lignes de traitement et de vaccin lues par le moteur (B · V15) ([76d75f9](https://github.com/GaelleBriet/memo-patte-vue/commit/76d75f95fd8c76ee022b06124a87d33413f153fe))
* **carnet:** pastille d'icône en tête des lignes de vaccins et de traitements ([85d7b4b](https://github.com/GaelleBriet/memo-patte-vue/commit/85d7b4be60e79ef8816f7cbd80ce32dc1e3147ba))
* **carnet:** pastille d'icône en tête des lignes de vaccins et de traitements ([6258afd](https://github.com/GaelleBriet/memo-patte-vue/commit/6258afd8dc1738bd20cfb75995d352798d1b693c)), closes [#563](https://github.com/GaelleBriet/memo-patte-vue/issues/563)
* **home:** « À faire » lu par le moteur d'échéances (traitements) ([d279821](https://github.com/GaelleBriet/memo-patte-vue/commit/d2798210269e0024038b29ea0a54be17616abe3c))
* **home:** « À faire » lu par le moteur d'échéances (traitements) ([bd6da58](https://github.com/GaelleBriet/memo-patte-vue/commit/bd6da58258a9c78191f9d8a7b24b4a3c03afd9bb))
* **home:** dater le premier soin d'un carnet rempli avant cette version ([847bdd7](https://github.com/GaelleBriet/memo-patte-vue/commit/847bdd70550ee9e3f39c6a0e84b1a5ed657db43a))
* **home:** feuille « À faire » par échéance, sans décalage sans aval ([afdc399](https://github.com/GaelleBriet/memo-patte-vue/commit/afdc39969459b695ce4f748c091bfb98184672ef)), closes [#543](https://github.com/GaelleBriet/memo-patte-vue/issues/543) [#527](https://github.com/GaelleBriet/memo-patte-vue/issues/527)
* **home:** l'heure d'une dose en retard dite par TalkBack (Q5) ([f320d7a](https://github.com/GaelleBriet/memo-patte-vue/commit/f320d7ac0e31c939c5c08b3d94d97d4b3acff715))
* **home:** la feuille « À faire » note l'échéance de la ligne touchée, sans décalage sans aval ([16e1c48](https://github.com/GaelleBriet/memo-patte-vue/commit/16e1c4824cc53d3bac09f8dad4a65767bdd952a1))
* **home:** messages de l'accueil (rappels désactivés, protéger, copie trimestrielle) ([ddd9f0d](https://github.com/GaelleBriet/memo-patte-vue/commit/ddd9f0de975ea4f1f804b534811e7d2121a637c9))
* **home:** messages de l'accueil, un à la fois ([e79ca97](https://github.com/GaelleBriet/memo-patte-vue/commit/e79ca97c7eb2d281d20e04aa94a46fa8196c1d5a)), closes [#545](https://github.com/GaelleBriet/memo-patte-vue/issues/545)
* **home:** requête de la feuille portée par l'échéance de la ligne de « À faire » ([f620e69](https://github.com/GaelleBriet/memo-patte-vue/commit/f620e690df33f3e8377d0fbd2de42e530c8df86d))
* **home:** retenir le premier et le dernier soin enregistré, gardés à la déconnexion ([8f17582](https://github.com/GaelleBriet/memo-patte-vue/commit/8f17582d0e910c50d934267b8687aadcc9caa204))
* **home:** vaccins dans « À faire » ([aba8763](https://github.com/GaelleBriet/memo-patte-vue/commit/aba87635e17c8661318d7e353a6e4b31f90a7494))
* **home:** vaccins dans « À faire » selon la spec Accueil ([9ab956a](https://github.com/GaelleBriet/memo-patte-vue/commit/9ab956aafb477dbc05de04e83dfea928647a4a02))
* **notifications:** « C'est fait » et « Donnée quand ? » d'une notification, sur le moteur ([278807b](https://github.com/GaelleBriet/memo-patte-vue/commit/278807ba53a0da486513d33e3c1a26d89e94e34c))
* **reminders:** rappels des traitements et des vaccins sur le moteur d'échéances ([b3c413b](https://github.com/GaelleBriet/memo-patte-vue/commit/b3c413bf5dc312f0e915c9532301596af2a3db7d))
* **settings:** « Effacer les données de ce téléphone » ([d4bb7c1](https://github.com/GaelleBriet/memo-patte-vue/commit/d4bb7c18f0b8d4a5dc58280cd9ca14356d753c1e))
* **settings:** animaux qu'on ne suit plus exportables seuls depuis la feuille PDF ([541815b](https://github.com/GaelleBriet/memo-patte-vue/commit/541815b4f02dd10922921b33d65d7abc7edd8cfc))
* **settings:** effacer les données de ce téléphone ([b507339](https://github.com/GaelleBriet/memo-patte-vue/commit/b50733917974d006c4ff29a9cbe30eab17a7a857)), closes [#583](https://github.com/GaelleBriet/memo-patte-vue/issues/583)
* **settings:** export PDF de tous les animaux depuis les Paramètres ([8c5e4e6](https://github.com/GaelleBriet/memo-patte-vue/commit/8c5e4e6ea547324708249f7cb350813343e07e32))
* **settings:** export PDF de tous les animaux depuis les Paramètres ([68df515](https://github.com/GaelleBriet/memo-patte-vue/commit/68df5152b7a2936ff151bf3f81f479f27cd6ca2f)), closes [#356](https://github.com/GaelleBriet/memo-patte-vue/issues/356)
* **settings:** Paramètres › Rappels et réglages du carnet ([5740348](https://github.com/GaelleBriet/memo-patte-vue/commit/574034805e07bc1f0e8b5e3aeb8929efe0b3e6a1))
* **settings:** paramètres en rubriques, une page chacune, et PDF gratuit ([f00f261](https://github.com/GaelleBriet/memo-patte-vue/commit/f00f2612cbaeff910d2259d3ed6e4e1c168c2653))
* **settings:** Paramètres en rubriques, une page chacune, et PDF gratuit ([8cdf5f7](https://github.com/GaelleBriet/memo-patte-vue/commit/8cdf5f7fd56de6c3ca4318ba1881dcb3256941e2))
* **settings:** rappels précis accordés, l'interrupteur ouvre Android directement ([2a998a1](https://github.com/GaelleBriet/memo-patte-vue/commit/2a998a14719d2a2a72c8ba9b3d3fc42c822e8a80))
* **settings:** rubrique Paramètres › Sauvegarde (gratuit) ([f717061](https://github.com/GaelleBriet/memo-patte-vue/commit/f7170610b79db4afa0f82fcde44ce541f3438a4d))
* **settings:** rubrique Paramètres › Sauvegarde (gratuit) ([d3b7554](https://github.com/GaelleBriet/memo-patte-vue/commit/d3b755498a7e62b2fdba3f4140b1eae02e0046f1)), closes [#544](https://github.com/GaelleBriet/memo-patte-vue/issues/544)
* **settings:** tout traitement sans prise donnée figure dans le PDF ([79dfac3](https://github.com/GaelleBriet/memo-patte-vue/commit/79dfac3648e1714f70ccf93379bb5d302d2f74c8)), closes [#483](https://github.com/GaelleBriet/memo-patte-vue/issues/483)
* **settings:** un traitement arrêté sans prise dit « Arrêté avant la première prise » dans le PDF ([8feb298](https://github.com/GaelleBriet/memo-patte-vue/commit/8feb2988f7f20ff0dc3112040789d973b43db9cc))
* **settings:** un traitement sans prise donnée figure dans le PDF ([66e5f24](https://github.com/GaelleBriet/memo-patte-vue/commit/66e5f2482b465de35290b4d171a9c31d0bd70348)), closes [#483](https://github.com/GaelleBriet/memo-patte-vue/issues/483)
* **settings:** un traitement sans prise figure dans le PDF ([9929067](https://github.com/GaelleBriet/memo-patte-vue/commit/9929067799146223e741ba0d8d37b2bdcf572565))
* **shared:** badge « À renseigner » au contour turquoise dans DueStatusChip ([776ba04](https://github.com/GaelleBriet/memo-patte-vue/commit/776ba04a9e6c3d097b3ec4e1572aa9b71a28221f))
* **shared:** badges « À renseigner » et « Prévu le » au contour turquoise ([f727c07](https://github.com/GaelleBriet/memo-patte-vue/commit/f727c07390c78e2463c33d31b91e540adad786b9))
* **site:** section « Rappels » de la page Aide (FR, EN) ([993af2e](https://github.com/GaelleBriet/memo-patte-vue/commit/993af2ee978014fb89ec35bb2fa36cc398ac2af4))
* **toast:** onExpired, appelé quand un toast se ferme sans son action ([8ba050e](https://github.com/GaelleBriet/memo-patte-vue/commit/8ba050edd1651557c15dd64e68baafaa263673f9))
* **treatments:** année de la date de fin d'une période sur deux années ([b5e64df](https://github.com/GaelleBriet/memo-patte-vue/commit/b5e64df11afea46a13749848d9c6c89fa9187069))
* **treatments:** champ « Rappel », « Peut arriver en retard » et suggestion des rappels précis ([757a43a](https://github.com/GaelleBriet/memo-patte-vue/commit/757a43a049aa064e16b80e8d203e849cb385b9f8))
* **treatments:** ligne du Carnet sur la planche B · V15 ([f8a2db2](https://github.com/GaelleBriet/memo-patte-vue/commit/f8a2db2e07d7cc9545def6f3b3485fbb2e8ca991))
* **treatments:** prochaine dose ou période après le rythme, dans le Carnet ([d482a25](https://github.com/GaelleBriet/memo-patte-vue/commit/d482a25007c84d810ff24eece8bb30fc4d77221a))
* **vaccinations:** « Premier vaccin » sur la feuille d'un vaccin jamais fait ([2cb8e8c](https://github.com/GaelleBriet/memo-patte-vue/commit/2cb8e8c4854d8da3803eda19c03d0f75c5c78093))
* **vaccinations:** fiche et feuille « Fait » d'un vaccin, prévu compris ([317f44d](https://github.com/GaelleBriet/memo-patte-vue/commit/317f44d2f96cdf57ccf205014f5184e44ed62eaa))
* **vaccinations:** fiche et feuille « Fait » d'un vaccin, prévu compris ([ee7f848](https://github.com/GaelleBriet/memo-patte-vue/commit/ee7f848a55d2162c0419eccc7b1be8ae9c42d4c4))
* **vaccinations:** formulaire avec vaccin prévu et raccourcis du prochain rappel ([347a27d](https://github.com/GaelleBriet/memo-patte-vue/commit/347a27db48d899990a40e16d5aa587b3fc8e898e))
* **vaccinations:** historique d'un vaccin, ajouter ou retirer une injection passée ([d1e19a5](https://github.com/GaelleBriet/memo-patte-vue/commit/d1e19a5bea567eb9b58e929411eba1a545392370))
* **vaccinations:** historique d’un vaccin, injection passée et suppression annulable ([9960f4a](https://github.com/GaelleBriet/memo-patte-vue/commit/9960f4a964fb95b71c6a19157f2a70a2cfc14b65))
* **vaccinations:** ligne du Carnet alignée sur les traitements ([7fd5e89](https://github.com/GaelleBriet/memo-patte-vue/commit/7fd5e892ff4a8f703f183c4af25f738c67f33e42))
* **vaccinations:** proposer des noms de vaccins pendant la frappe ([51b7857](https://github.com/GaelleBriet/memo-patte-vue/commit/51b7857a59c7ae157f4a6e978ff4b04508e47fe2)), closes [#283](https://github.com/GaelleBriet/memo-patte-vue/issues/283)
* **vaccinations:** propositions de noms de vaccins pendant la frappe ([a2328af](https://github.com/GaelleBriet/memo-patte-vue/commit/a2328af5fd3f6d3be7e7c71a78c9c5e8af75dbda))
* **vaccinations:** une injection passée qui dépasse le rappel en cours demande le suivant ([3b6ba84](https://github.com/GaelleBriet/memo-patte-vue/commit/3b6ba84609b0a86009ea9deffa2effe2fe93b8d4))
* **vaccinations:** vaccin « Prévu » et raccourcis du prochain rappel ([49f8682](https://github.com/GaelleBriet/memo-patte-vue/commit/49f8682a48c34fe3ced5446c77ab1ffdca0f4b44))
* **vaccinations:** vaccin prévu sans injection et raccourci « Dans 1 mois » (socle) ([bb06035](https://github.com/GaelleBriet/memo-patte-vue/commit/bb0603519046011ba24b498bfaf2d85795a2d81f))


### 🐛 Corrections

* **animals:** « Le carnet de cet animal a été supprimé. » sur l'écran du départ ([5761c56](https://github.com/GaelleBriet/memo-patte-vue/commit/5761c56873957278a322a6b99f36817a69a16ec2))
* **animals:** aide de « Date approximative » sous le champ date, au-dessus de la case (planche V13) ([95ec96b](https://github.com/GaelleBriet/memo-patte-vue/commit/95ec96bb8d658110d1b8e61a1a1f5c478018a35d))
* **animals:** changer la photo depuis le Carnet garde la date approximative ([00f4adb](https://github.com/GaelleBriet/memo-patte-vue/commit/00f4adb46a410224ff376499f3e5dfb3b58e83b4))
* **animals:** effacer au démarrage les photos qu'aucun animal ne porte plus ([69c4b6f](https://github.com/GaelleBriet/memo-patte-vue/commit/69c4b6f1c73057933b3f847faf15f91bc3414a65))
* **animals:** effacer au démarrage les photos qu'aucun animal ne porte plus ([11fa088](https://github.com/GaelleBriet/memo-patte-vue/commit/11fa0885a01ef92e86eda03beda17f8335ade98f)), closes [#593](https://github.com/GaelleBriet/memo-patte-vue/issues/593)
* **animals:** épargner les photos écrites depuis moins d'une minute ([8bf61cd](https://github.com/GaelleBriet/memo-patte-vue/commit/8bf61cd38584655f864bbeed9564102532e50016))
* **animals:** l'écran du départ d'un animal suivi renvoie à son carnet ([1c41c8a](https://github.com/GaelleBriet/memo-patte-vue/commit/1c41c8a50948ad618344248eedbe2a69d6daf6d7))
* **animals:** retour à l'accueil après « Ne plus suivre » (V15 bis) ([6eeca44](https://github.com/GaelleBriet/memo-patte-vue/commit/6eeca44889347ed38739cd0fbbb5c0ead98c2742))
* **animals:** sous-titre du Carnet sur deux lignes au plus, comme la maquette V13 bis ([169b294](https://github.com/GaelleBriet/memo-patte-vue/commit/169b294b5e3066eeef31bcfd82d68c108564e4bb))
* **animals:** suites de la revue de [#578](https://github.com/GaelleBriet/memo-patte-vue/issues/578) ([d44edb0](https://github.com/GaelleBriet/memo-patte-vue/commit/d44edb0597981265bfb45de2b07ce4e934122982))
* **animals:** suites de la revue de [#579](https://github.com/GaelleBriet/memo-patte-vue/issues/579) ([7354588](https://github.com/GaelleBriet/memo-patte-vue/commit/7354588480b2800f3f703f34c795429c399ae417))
* **animals:** une photo choisie pendant « Photo retirée » ferme le toast ([983ae81](https://github.com/GaelleBriet/memo-patte-vue/commit/983ae81409bd6a1723b766892c99d27b4bbd872a))
* **carnet:** garder un mot long à côté de la pastille, icône du vaccin dans la logique ([c3522c5](https://github.com/GaelleBriet/memo-patte-vue/commit/c3522c526d35ab7356cabe40a98547fd7ae7086b))
* **carnet:** lignes grisées d'un animal non suivi et des traitements terminés (V15 ter) ([6a00064](https://github.com/GaelleBriet/memo-patte-vue/commit/6a00064b9b8422ac160a1bc14776a3b4597643b7))
* **home, carnet:** finitions vues au test du lot 7 ([e643870](https://github.com/GaelleBriet/memo-patte-vue/commit/e64387025373232e78dc86cb7ce9b934b0eec1c1)), closes [#585](https://github.com/GaelleBriet/memo-patte-vue/issues/585)
* **home, carnet:** finitions vues au test du lot 7 sur l'émulateur ([743902f](https://github.com/GaelleBriet/memo-patte-vue/commit/743902fe1a9bfe26b6703e7a10e3fba980bf1b57))
* **home:** « À faire », chips et compteur limités aux animaux suivis (AN-9) ([a8cb32a](https://github.com/GaelleBriet/memo-patte-vue/commit/a8cb32a612cbed9cb7b127f63428459910c7fcaa))
* **home:** « Fait aujourd'hui » de la feuille « À faire » n'écrit jamais de prise en plus ([77fee83](https://github.com/GaelleBriet/memo-patte-vue/commit/77fee837a197450e5f9e1e808a92d591983ea8fc))
* **home:** « Fait aujourd'hui » ouvre la fiche au lieu de noter une prise en plus ([#569](https://github.com/GaelleBriet/memo-patte-vue/issues/569)) ([5e03b7a](https://github.com/GaelleBriet/memo-patte-vue/commit/5e03b7ab7b6b417f98a5fcf3f4a4657f49463cf3))
* **home:** « Fait aujourd'hui » sur une dose notée oubliée le dit ([668e547](https://github.com/GaelleBriet/memo-patte-vue/commit/668e54774800737fcbc50776b3de348451ec7165))
* **home:** « N doses non renseignées » ne repousse plus le badge sous le titre ([01d81d8](https://github.com/GaelleBriet/memo-patte-vue/commit/01d81d83c4a053596828803f206b0c9feb4a0338))
* **home:** insécable avant les deux-points du lien d'aide du bandeau ([d69ed45](https://github.com/GaelleBriet/memo-patte-vue/commit/d69ed4552c5ba4b9abc9b5cbf50438093dfd86ae))
* **home:** la feuille « À faire » ne vise plus une prise en plus ([#569](https://github.com/GaelleBriet/memo-patte-vue/issues/569)) ([051c89c](https://github.com/GaelleBriet/memo-patte-vue/commit/051c89cbcfe77112a53cf1bfcf291540166ecdbe))
* **i18n:** « à » / « at » insécables entre une date et son heure ([92cfbc6](https://github.com/GaelleBriet/memo-patte-vue/commit/92cfbc65ca152cf9b153522a596900db65f14dc2))
* **i18n:** anglais pour un téléphone ni en français ni en anglais ([044bac1](https://github.com/GaelleBriet/memo-patte-vue/commit/044bac1c3fcda1337667eb807701bb7d451d6da2)), closes [#584](https://github.com/GaelleBriet/memo-patte-vue/issues/584)
* **i18n:** écrire « 1er » pour le premier jour du mois ([e37105d](https://github.com/GaelleBriet/memo-patte-vue/commit/e37105dcb140cc02df1b5b2a2a0978973f2fbe3a))
* **i18n:** écrire « 1er » pour le premier jour du mois ([85dae1c](https://github.com/GaelleBriet/memo-patte-vue/commit/85dae1cd0f29ed2722c10f04e6f1c744caf64244)), closes [#481](https://github.com/GaelleBriet/memo-patte-vue/issues/481)
* **i18n:** les dates ne se coupent plus en fin de ligne ([fd16e3b](https://github.com/GaelleBriet/memo-patte-vue/commit/fd16e3b459a1c1c760b24e100d5a8ae30910bb6e)), closes [#588](https://github.com/GaelleBriet/memo-patte-vue/issues/588)
* **i18n:** ouvrir en anglais un téléphone ni en français ni en anglais ([fdaa724](https://github.com/GaelleBriet/memo-patte-vue/commit/fdaa724c2109e655d7e88cb1ab8abd3218e20838))
* **i18n:** une date ne se coupe jamais en fin de ligne ([6cc5982](https://github.com/GaelleBriet/memo-patte-vue/commit/6cc598222af95be5cf525bf59cbbf9a26a254d4f))
* **notifications:** ancienne clé d'un jour passé sur « Donnée quand ? », suites de la revue ([e4b47a8](https://github.com/GaelleBriet/memo-patte-vue/commit/e4b47a82382ba3f79cd74456db6281f1aa9d76b5))
* **photos:** ne supprimer photos/ que s'il existe, sans rejet natif journalisé ([5b7bb2a](https://github.com/GaelleBriet/memo-patte-vue/commit/5b7bb2afd1444eb68adf76b7a65f6fcfb4ac7983))
* **settings:** « — » sans date dans le PDF, relecture tolérante du moteur dans shared ([76ab3e7](https://github.com/GaelleBriet/memo-patte-vue/commit/76ab3e7254f81e303a8f8c9f984521cc9b670f79))
* **settings:** « Désactivés · tes rappels peuvent arriver en retard » au lieu de « Moins précis » ([d60233d](https://github.com/GaelleBriet/memo-patte-vue/commit/d60233dbbbba55d710cd1a9a87fed005d88d5fa3))
* **settings:** annuler les notifications dans la file des rappels avant l'effacement ([912d82e](https://github.com/GaelleBriet/memo-patte-vue/commit/912d82e5c8fd2ecec827f864b081319859ae18d8))
* **settings:** après « Plus tard », « Pas encore activés » et « Activer les rappels » ([0b76df6](https://github.com/GaelleBriet/memo-patte-vue/commit/0b76df628d3acbb5a60564a19e2e2c8eb8a58c7a))
* **settings:** déconnexion sans page Compte vide au retour, cartes arrondies de 22 px ([277b702](https://github.com/GaelleBriet/memo-patte-vue/commit/277b70220141e45a30423ee5d04db5583cebd224))
* **settings:** feuille PDF des Paramètres conforme à V23 bis ([94a98f3](https://github.com/GaelleBriet/memo-patte-vue/commit/94a98f3bb60c7ef68979c6417cfb0ab69046f1d2))
* **settings:** feuille PDF sans fichier vide, listes lues du store, alias de teinte ([37eb639](https://github.com/GaelleBriet/memo-patte-vue/commit/37eb639b946fc918d7ac1e874167a680d96dcaa8))
* **settings:** insécable avant les deux-points du texte de la sauvegarde d’Android ([8108f51](https://github.com/GaelleBriet/memo-patte-vue/commit/8108f51de6b39f727cf1a025b774cd879de4a66c))
* **settings:** le PDF et le CSV lisent la prochaine échéance par le moteur ([ebec33f](https://github.com/GaelleBriet/memo-patte-vue/commit/ebec33f192ba8e11f05ff190ee057568c57b24f1))
* **settings:** le PDF et le CSV lisent la prochaine échéance par le moteur ([4dee890](https://github.com/GaelleBriet/memo-patte-vue/commit/4dee890c9c077a0f3e6aa130126e788bf53307eb)), closes [#549](https://github.com/GaelleBriet/memo-patte-vue/issues/549)
* **settings:** parties du PDF typées non vides, pages de suite du second animal testées ([44124cd](https://github.com/GaelleBriet/memo-patte-vue/commit/44124cdc9770a95e59679da7d38f8a69d3e01969))
* **settings:** pas de « Tous les animaux » avec un seul animal suivi ([cd4d3a1](https://github.com/GaelleBriet/memo-patte-vue/commit/cd4d3a1f541d13e67dfe50def2894c07e62ab38f))
* **site:** aide, texte validé pour le retrait des rappels précis ([deb09ca](https://github.com/GaelleBriet/memo-patte-vue/commit/deb09cadfcff1f01f7df31aea4aa9e9662a11e93))
* **traitements:** compter sans effet un report sorti de sa période fermée ([110cb97](https://github.com/GaelleBriet/memo-patte-vue/commit/110cb97f1462a1e5262bc857b4cdd7aa91887548)), closes [#482](https://github.com/GaelleBriet/memo-patte-vue/issues/482)
* **treatments:** « Annuler » passe par la même file d'écriture que les gestes ([bbd7c9b](https://github.com/GaelleBriet/memo-patte-vue/commit/bbd7c9b96462be60927d3af611ae0a7255eb0836))
* **treatments:** « peut arriver en retard » à la place de « moins précis » ([fb63c60](https://github.com/GaelleBriet/memo-patte-vue/commit/fb63c601f547faa8ebfbc7f2a8ff70ac7a793707))
* **treatments:** écritures de prises robustes aux écritures concurrentes ([b142725](https://github.com/GaelleBriet/memo-patte-vue/commit/b1427255d5f528bb9e349eca0d1c849045fe202e))
* **treatments:** l'écran se relit quand « Annuler » échoue ([2a24146](https://github.com/GaelleBriet/memo-patte-vue/commit/2a24146dc3349791e9df071f711fa50ed5164b49))
* **treatments:** la fiche ouverte depuis « À faire » ramène à l'accueil ([#569](https://github.com/GaelleBriet/memo-patte-vue/issues/569)) ([87abfa9](https://github.com/GaelleBriet/memo-patte-vue/commit/87abfa9071d1dcf3b37483eebbde21a7c9f925fb))
* **treatments:** la flèche de la fiche dit « Retour à l'accueil » quand elle y ramène ([#569](https://github.com/GaelleBriet/memo-patte-vue/issues/569)) ([85894a7](https://github.com/GaelleBriet/memo-patte-vue/commit/85894a76fd9e34444b08b7c649381db45b2ef078))
* **treatments:** le formulaire d'un traitement passe par la file d'écriture des gestes ([677759a](https://github.com/GaelleBriet/memo-patte-vue/commit/677759aafbc72ee0a351608bb4b47ca8ec798679))
* **treatments:** pas de bandeau « À renseigner » avant le chargement des animaux ([11c2bf3](https://github.com/GaelleBriet/memo-patte-vue/commit/11c2bf33c49b0d263d7f4d3aee63815ed37de191))
* **treatments:** retirer un report resté sans effet dans une période fermée ([9286753](https://github.com/GaelleBriet/memo-patte-vue/commit/928675343cf09a65b9100b1521d2300bc7c0ea43))
* **treatments:** un lot de prises refuse une ligne changée entre sa lecture et son écriture ([cd86dca](https://github.com/GaelleBriet/memo-patte-vue/commit/cd86dca2b3060a5d0c99ffd533d353ee834e1735))
* **treatments:** une garde d'écriture concurrente lève une ConcurrentWriteError ([6a29923](https://github.com/GaelleBriet/memo-patte-vue/commit/6a299238e32e4811482d2aaec1f33e8ff7acdc10))
* **vaccinations:** « Annuler » la suppression d’un vaccin dit l’échec s’il n’a rien rétabli ([1b199d9](https://github.com/GaelleBriet/memo-patte-vue/commit/1b199d9fc4a7f3c3f3f8bd2ac9d15c7613174de7))
* **vaccinations:** « Aujourd'hui » sur la ligne du Carnet le jour du rappel ([67e850b](https://github.com/GaelleBriet/memo-patte-vue/commit/67e850bfb09eeeb49f30045ccea148e98ca2f19e))
* **vaccinations:** « Aujourd'hui » sur la ligne du Carnet le jour du rappel ([06232ee](https://github.com/GaelleBriet/memo-patte-vue/commit/06232ee0a81c22883bc5f7104613d75d43b76a89))
* **vaccinations:** clés i18n de la ligne du haut écrites en entier ([e6ad046](https://github.com/GaelleBriet/memo-patte-vue/commit/e6ad046e420c1bd37fd611c47fd07a70ebce14c9))
* **vaccinations:** date d'injection future jugée par rapport au jour du formulaire ([9896f34](https://github.com/GaelleBriet/memo-patte-vue/commit/9896f345922c0b00926339e0d6fc06822e4b635b))
* **vaccinations:** date d'injection future jugée par rapport au jour du formulaire ([db3d3f1](https://github.com/GaelleBriet/memo-patte-vue/commit/db3d3f174b40b0ff93798138ebda29497b2628fb))
* **vaccinations:** jeton de bordure des raccourcis non cochés ([ef27e32](https://github.com/GaelleBriet/memo-patte-vue/commit/ef27e32ea7e77a27e98c456670b0310b700486b5))
* **vaccinations:** jour du rendez-vous selon V11 ter et noms accessibles de la fiche ([8739d7c](https://github.com/GaelleBriet/memo-patte-vue/commit/8739d7ce2b4ec93865d59a44fe15e22e251a7bec))
* **vaccinations:** panleucopenia et propositions lues par TalkBack ([62a3ab8](https://github.com/GaelleBriet/memo-patte-vue/commit/62a3ab8e95502a0001abe49f8bf54f790888e671))


### ⚡ Performance

* **shared:** un formateur de nombres par langue et par style ([7d20c08](https://github.com/GaelleBriet/memo-patte-vue/commit/7d20c0871c57bcb1085f1da45899fab3197a17c0))

## [0.1.60](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.59...memo-patte-v0.1.60) (2026-10-06)


### ✨ Fonctionnalités

* **notifications:** « Rappels précis » — manifeste, autorisation et revérification ([c2e7307](https://github.com/GaelleBriet/memo-patte-vue/commit/c2e7307ebc4d26510df9c74c8e3062ae534924d7))
* **notifications:** rappels précis — manifeste, accès lu et revérifié, écran d'explication ([d358138](https://github.com/GaelleBriet/memo-patte-vue/commit/d3581380584635d14e92ba8a706c3a71d85d17ca))
* **reminders:** plan des rappels v2 en module pur ([24be498](https://github.com/GaelleBriet/memo-patte-vue/commit/24be498b37bec0ed2706a68abb18e3a9036db4cb))
* **reminders:** plan des rappels v2 en module pur ([99b1ec3](https://github.com/GaelleBriet/memo-patte-vue/commit/99b1ec3aeb8d898ec0896a4d2db897ca8ebb4307))
* **treatments:** « C'est fait » demande l'aval avant de décaler la suite ([9c6c477](https://github.com/GaelleBriet/memo-patte-vue/commit/9c6c4779d17fd1880f841dc9cc60b916086b6a70))
* **treatments:** « C'est fait » demande l'aval avant de décaler la suite ([e01b865](https://github.com/GaelleBriet/memo-patte-vue/commit/e01b865dd03e9f9b1908427e85ccd8dc78499e76))
* **treatments:** annoncer les doses passées qu'une correction de date fait apparaître ([dc686cd](https://github.com/GaelleBriet/memo-patte-vue/commit/dc686cd5b9adbd70d46ac77455511a274b65286c))
* **treatments:** annoncer les doses passées qu'une correction de date fait apparaître ([5245a99](https://github.com/GaelleBriet/memo-patte-vue/commit/5245a994b28257620365cc3282747ee48c374508))


### 🐛 Corrections

* **notifications:** texte secondaire du jeton commun, retrait de l'accès écrit dans RA-23 ([06a35fe](https://github.com/GaelleBriet/memo-patte-vue/commit/06a35fe5b658b8755887e1fc109d40903abcd4b2))
* **reminders:** dernière dose d'une période lue dans le moteur (lastDueDay) ([59cd950](https://github.com/GaelleBriet/memo-patte-vue/commit/59cd950ea84d0afb1f6fd6ca10ed45ada05932a8))
* **reminders:** relance de la dernière dose envoyée après la date de fin ([e3d69dc](https://github.com/GaelleBriet/memo-patte-vue/commit/e3d69dc2e9d14eb60968f553f99dbf8e5522ba87))
* **treatments:** finitions de l'annonce des doses passées ([d7e5dec](https://github.com/GaelleBriet/memo-patte-vue/commit/d7e5dec2daccb07dc50a39cc9e78e44746cfaac4))
* **treatments:** l'aide sous la case ne cite que des dates à venir ([daf4bc7](https://github.com/GaelleBriet/memo-patte-vue/commit/daf4bc710f665790d442b3cdac81387865566caa))
* **treatments:** la case d'une prise apparaît aussi quand la date de fin ferait perdre une dose ([761404d](https://github.com/GaelleBriet/memo-patte-vue/commit/761404d4c2352d1a1d3a1919972ed60141bb547e))

## [0.1.59](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.58...memo-patte-v0.1.59) (2026-10-05)


### ✨ Fonctionnalités

* **settings:** l'import accepte la prise en plus ([ed7a64d](https://github.com/GaelleBriet/memo-patte-vue/commit/ed7a64db05896ea3b0c6b04dfe258fec97f12f32))
* **treatments:** « Décaler aussi les doses suivantes » et la ligne de décalage ([469e7c6](https://github.com/GaelleBriet/memo-patte-vue/commit/469e7c6d5a54a4917deb3226da0ea2a956a4cbcc))
* **treatments:** « Décaler aussi les doses suivantes » et la ligne de décalage ([2513f1a](https://github.com/GaelleBriet/memo-patte-vue/commit/2513f1a27f2ffe57ec3b5342969dcfe75a0dfc7c)), closes [#505](https://github.com/GaelleBriet/memo-patte-vue/issues/505)
* **treatments:** le moteur lit la prise en plus ([f6361e3](https://github.com/GaelleBriet/memo-patte-vue/commit/f6361e3bfc27ffd79b93bb7527c3eb290a1b330d))
* **treatments:** le moteur sait décocher « Décaler aussi les doses suivantes » ([0a8415e](https://github.com/GaelleBriet/memo-patte-vue/commit/0a8415e98a94c0c195f4f2fbeb35c58c6eb38dd3))
* **treatments:** prise en plus (dose donnée un intervalle ou plus en avance) ([0eb8adf](https://github.com/GaelleBriet/memo-patte-vue/commit/0eb8adf108c02e090e7681a2a208e313581319af))
* **treatments:** prise en plus dans l'historique, son menu et ses écritures ([deb1b84](https://github.com/GaelleBriet/memo-patte-vue/commit/deb1b8411034aac7d5f47ac06cea4c6634d6c1ee))


### 🐛 Corrections

* **home, weight:** photo de l'animal dans « Ajouter une pesée » et « Pour quel animal ? » ([f80cb78](https://github.com/GaelleBriet/memo-patte-vue/commit/f80cb78d88d2b47ce1ead4c9ec92375112dc4d53))
* **home, weight:** photo de l'animal dans les feuilles pesée et « Pour quel animal ? » ([becdd96](https://github.com/GaelleBriet/memo-patte-vue/commit/becdd965d27efe4f9bdddedabe7630eecec762ca)), closes [#529](https://github.com/GaelleBriet/memo-patte-vue/issues/529)
* **settings:** le PDF marque la prise en plus par sa ligne, pas par sa date ([795ab38](https://github.com/GaelleBriet/memo-patte-vue/commit/795ab384989a70432e54a72f620fd018a940253f))
* **treatments:** « C'est fait » en retard face à la date de fin ([fbd1fc1](https://github.com/GaelleBriet/memo-patte-vue/commit/fbd1fc1b5cc0f57d9fc726de258082f31d325ac4))
* **treatments:** « C'est fait » en un tap garde la dernière dose avant la date de fin ([e04aad5](https://github.com/GaelleBriet/memo-patte-vue/commit/e04aad5b99ce1f06bf30cf871aa0b5bc0e2363e4)), closes [#506](https://github.com/GaelleBriet/memo-patte-vue/issues/506)
* **treatments:** date de fin, la dose suivante décide et le toast dit la dose qui saute ([219c008](https://github.com/GaelleBriet/memo-patte-vue/commit/219c0088c4727c5bc567810c78844803f2b99754)), closes [#506](https://github.com/GaelleBriet/memo-patte-vue/issues/506)
* **treatments:** décalage bloqué par un report hors rythme, et dose gardée dite ([58d252d](https://github.com/GaelleBriet/memo-patte-vue/commit/58d252dc9077f5f504c1a5af39c3ea6924f0b164)), closes [#506](https://github.com/GaelleBriet/memo-patte-vue/issues/506)
* **treatments:** la ligne de décalage n'annonce plus de prochaine dose après la fin ([9e5a5dc](https://github.com/GaelleBriet/memo-patte-vue/commit/9e5a5dc6129e1129aad85a4bf9bfb7d1da70fb56)), closes [#506](https://github.com/GaelleBriet/memo-patte-vue/issues/506)
* **treatments:** le décalage d'une dose avancée est rangé sous son échéance d'origine ([ebd4a53](https://github.com/GaelleBriet/memo-patte-vue/commit/ebd4a53064ad5e577596bb41c2c8636b4456c703))
* **treatments:** le décalage d'une dose avancée s'écrit sous son échéance d'origine ([5f986f2](https://github.com/GaelleBriet/memo-patte-vue/commit/5f986f25698ce127876af2fe31498bedbce8f19d))
* **treatments:** le moteur ne lit plus la prise en plus, corrections de revue ([3dd78b1](https://github.com/GaelleBriet/memo-patte-vue/commit/3dd78b16da230d4c2758d893a95bd8d4f51a051d))
* **treatments:** le report seul suit vers l'échéance la plus proche de son arrivée (I2) ([f67912b](https://github.com/GaelleBriet/memo-patte-vue/commit/f67912b6372710f5ed7e39ebd158c72d86961f47))
* **treatments:** le toast cherche le décalage d'une dose avancée sous son échéance d'origine ([75afde3](https://github.com/GaelleBriet/memo-patte-vue/commit/75afde3fc816db04084f9a545d2fb57bf68ebb23))
* **treatments:** refuser le geste qui ferait passer un report seul après la dose suivante ([0bcb6ce](https://github.com/GaelleBriet/memo-patte-vue/commit/0bcb6ce6bce6a1fa0d1031902480f459036608bd))
* **treatments:** suites de la revue de [#505](https://github.com/GaelleBriet/memo-patte-vue/issues/505) ([00bc981](https://github.com/GaelleBriet/memo-patte-vue/commit/00bc9812aebeecf8fa26ea62542f02ae4c46d764))
* **treatments:** textes validés pour le report qui suit et ses refus ([771557a](https://github.com/GaelleBriet/memo-patte-vue/commit/771557ad8ea17ab5a76a4c59bb2d6798364b2766))
* **treatments:** un décalage resté seul sur le jour d'arrivée d'une dose avancée garde son échéance ([2f307d4](https://github.com/GaelleBriet/memo-patte-vue/commit/2f307d45715d57628f3beb5f7d2c05154fdae3cb))
* **treatments:** un report seul ne passe jamais la dose suivante (Q2 a) ([2c779df](https://github.com/GaelleBriet/memo-patte-vue/commit/2c779df5b5362ef172a9a9d07d99fd1ec6c405d2))
* **treatments:** une prise en plus ne change jamais le calendrier ([449229b](https://github.com/GaelleBriet/memo-patte-vue/commit/449229bd2b942b345f68af7d91925947891c6963))
* **treatments:** une prise en plus ne fait pas perdre une dose due ([dee4d26](https://github.com/GaelleBriet/memo-patte-vue/commit/dee4d2699e01ea343e3dd620e1a34ace1b2b1c60))

## [0.1.58](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.57...memo-patte-v0.1.58) (2026-10-04)


### 🐛 Corrections

* **treatments:** le moteur lit les lignes de décalage au lieu de deviner ([3f4ba21](https://github.com/GaelleBriet/memo-patte-vue/commit/3f4ba216dd230b8b208b2a0bfc878b6b2fbd7a1f))
* **treatments:** une correction ne supprime les décalages que si la grille change ([5d49f7d](https://github.com/GaelleBriet/memo-patte-vue/commit/5d49f7d5b2e6149e9c66f4ce98b3756645ce1bcd))

## [0.1.57](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.56...memo-patte-v0.1.57) (2026-10-04)


### ✨ Fonctionnalités

* **db:** appareils, jour de référence et export v4 dans les repositories ([1851256](https://github.com/GaelleBriet/memo-patte-vue/commit/18512564a1a6a0a7c54c8c4b1852a4b59d5a51e8))
* **db:** migration v11 et identifiant d'appareil tiré au hasard ([86cd2b9](https://github.com/GaelleBriet/memo-patte-vue/commit/86cd2b921d5415e3486885a1aff8d853d52086cf))
* **db:** schéma v11 — prise en plus, ligne de décalage, jour de référence, appareils ([a8b3f43](https://github.com/GaelleBriet/memo-patte-vue/commit/a8b3f43a24207bcadec12a478d0b232515e4979d))
* **device:** nom lisible de l'appareil, fabricant suivi du modèle ([0125e51](https://github.com/GaelleBriet/memo-patte-vue/commit/0125e512a6ec80e8211d956218bd9688a08a5793))
* **sync:** miroirs Supabase v11, colonnes d'appareil et table device ([03409f4](https://github.com/GaelleBriet/memo-patte-vue/commit/03409f4c59ca704f77bcd9d9027d7dfdfa350024))
* **treatments:** arrêter, terminer, reprendre et supprimer un traitement ([e90a241](https://github.com/GaelleBriet/memo-patte-vue/commit/e90a241c017f1c95ba0e3e242292b52d6d2cd472))
* **treatments:** doses non renseignées — bandeau, « Choisir les jours », encart ([d93cdef](https://github.com/GaelleBriet/memo-patte-vue/commit/d93cdef5ac46c7e736515e86a48f3629faf8433e))
* **treatments:** le Carnet lit ses traitements par le moteur d'échéances ([921a6c5](https://github.com/GaelleBriet/memo-patte-vue/commit/921a6c5bab69e34157a85ad305ed9fd0c7f0ad76))


### 🐛 Corrections

* **device:** identifiant relu validé, modèle de données et tests d'appareil complétés ([0e2761e](https://github.com/GaelleBriet/memo-patte-vue/commit/0e2761e5710025e751d26a0639229ea920629d40))
* **import:** accepte un instant sans secondes avec zod 4.6 ([5bc6b9f](https://github.com/GaelleBriet/memo-patte-vue/commit/5bc6b9f7827003acd215df92d219513e32c65209))
* **import:** accepte un instant sans secondes avec zod 4.6 ([1d15311](https://github.com/GaelleBriet/memo-patte-vue/commit/1d153119acc10e6eaaccf4ce417f6369029dda3b))
* **shared:** faire défiler une feuille du bas plus haute que l'écran ([8ef3cd5](https://github.com/GaelleBriet/memo-patte-vue/commit/8ef3cd55afac6931343eca70c5c7444eebf17580))
* **shared:** faire défiler une feuille du bas plus haute que l'écran ([1c9a809](https://github.com/GaelleBriet/memo-patte-vue/commit/1c9a809ca0356708c7c2037256d2018f99db928e)), closes [#515](https://github.com/GaelleBriet/memo-patte-vue/issues/515)
* **treatments:** arrêt gardé, fin datée et compteur complet ([b12e945](https://github.com/GaelleBriet/memo-patte-vue/commit/b12e94509e51f83900b3a4bf54da004d4498bfdc))
* **treatments:** clé du cache sur chaque ligne ; arrêt fait ailleurs reconnu après l'échec du lot ([20bf3f1](https://github.com/GaelleBriet/memo-patte-vue/commit/20bf3f117451c80f484cb3192d1f9d2aaf0ee916))
* **treatments:** la feuille « À faire » arrête avec le dialogue des doses à renseigner ([880b2aa](https://github.com/GaelleBriet/memo-patte-vue/commit/880b2aad428a9c3104a644d7b549c870bfa731b9))
* **treatments:** le focus va à la fin du traitement quand « Arrêter » disparaît ([3280676](https://github.com/GaelleBriet/memo-patte-vue/commit/3280676f06021eb526397b47d20c92e315bffc4c))
* **treatments:** règle de focus de la carte après l'import des jetons ([7cb1893](https://github.com/GaelleBriet/memo-patte-vue/commit/7cb1893d21f5da1625ad0b74613ab1c6ed546f6c))


### ⚡ Performance

* **treatments:** le Carnet ne recalcule que le traitement touché ([07d8998](https://github.com/GaelleBriet/memo-patte-vue/commit/07d8998ffa125f6e044349a5b1df8e9a1e16d03b))

## [0.1.56](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.55...memo-patte-v0.1.56) (2026-10-02)


### ⚡ Performance

* **shared:** ne calculer la journée complète et les déplacements que si la suite peut repartir ([6ebf537](https://github.com/GaelleBriet/memo-patte-vue/commit/6ebf5370ae422110dc72b9f792468f2e15b223fb))
* **shared:** noter des doses en lot en temps linéaire ([786768b](https://github.com/GaelleBriet/memo-patte-vue/commit/786768b9f41f205ecce559f773e932a39b0a4e48))

## [0.1.55](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.54...memo-patte-v0.1.55) (2026-10-02)


### ✨ Fonctionnalités

* **treatments:** fiche v2 — dose du moment, noter une prise, historique ([911503d](https://github.com/GaelleBriet/memo-patte-vue/commit/911503d771f9669c8173060d740433340e16267f))
* **treatments:** formulaire v2 — créer, modifier, reprendre ([cf6845d](https://github.com/GaelleBriet/memo-patte-vue/commit/cf6845d8576a2b043ef88ee5d7b71d6f5913601f))


### 🐛 Corrections

* **treatments:** dire à partir de quand une reprise est possible ([644b2dd](https://github.com/GaelleBriet/memo-patte-vue/commit/644b2dd99a236e5bf10fe861f969f4c9990e3645))

## [0.1.54](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.53...memo-patte-v0.1.54) (2026-10-02)


### ✨ Fonctionnalités

* **shared:** reconnaître un calendrier trop long par son type ([4f2f5cc](https://github.com/GaelleBriet/memo-patte-vue/commit/4f2f5cc7012b6e015b1d6238974fff8a34a9fd3f))


### 🐛 Corrections

* **shared:** changer le rythme le jour d'une dose sans prise garde la dose du jour ([bb75ab8](https://github.com/GaelleBriet/memo-patte-vue/commit/bb75ab89267e223cf14ac98748119333fa536ceb))
* **shared:** moteur d'échéances — redater sans décaler la suite, dose du jour gardée, prochaine dose prévue ([fff74f7](https://github.com/GaelleBriet/memo-patte-vue/commit/fff74f7cb6fe2a00a3b6cbdc64478fd7bce54ecb))
* **shared:** noter une dose non renseignée ne fait plus dériver le jour du mois ([f04a33d](https://github.com/GaelleBriet/memo-patte-vue/commit/f04a33d66255a9b812a03b00ce0a9aae080744b3))
* **shared:** redater une prise d'une période close ou arrêtée depuis ([aa6380e](https://github.com/GaelleBriet/memo-patte-vue/commit/aa6380e209290e1764d2a03ec5a27b1e714ab61a))
* **shared:** redater une prise qui n'a pas fixé la suite garde sa prochaine échéance écrite ([83cce97](https://github.com/GaelleBriet/memo-patte-vue/commit/83cce979192dd378064956fd4485b8d183e2c964))
* **shared:** redater une prise qui n'a pas fixé la suite ne la déplace plus ([626f2e0](https://github.com/GaelleBriet/memo-patte-vue/commit/626f2e0fac409793a6436a13a79d32d341e22def))
* **shared:** sans changer la fréquence ni les heures, la prochaine dose reste celle prévue ([20d8fae](https://github.com/GaelleBriet/memo-patte-vue/commit/20d8fae021c7d02c6c6bf496348132e323e04d22))
* **shared:** une date de fin ne fait plus sauter la dose suivante d'une prise en retard ([abf8c58](https://github.com/GaelleBriet/memo-patte-vue/commit/abf8c582014dbe623ae3f3ec8b93bfad3d8e48ad))
* **shared:** une dose notée à son échéance garde le jour de référence du mois ([4f5e36e](https://github.com/GaelleBriet/memo-patte-vue/commit/4f5e36e27b30ce61b7f5969797502222aaaa49f1))
* **shared:** une journée entamée garde l'ancien calcul quand rien ne change ([71b5221](https://github.com/GaelleBriet/memo-patte-vue/commit/71b522156961e9f2247945dc5728e84834f4d0d8))

## [0.1.53](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.52...memo-patte-v0.1.53) (2026-10-02)


### 🐛 Corrections

* **android:** lancer MainActivity en singleTop ([20d3d8c](https://github.com/GaelleBriet/memo-patte-vue/commit/20d3d8c87703519570bae09d9bcbcfbc147a8fd1))

## [0.1.52](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.51...memo-patte-v0.1.52) (2026-10-02)


### ✨ Fonctionnalités

* **treatments:** socle du lot 3 — lecture par le moteur, traitement sans prise, type médicament ([4d02a71](https://github.com/GaelleBriet/memo-patte-vue/commit/4d02a71b731d5f67d704297b82f42d45f2336c7d))

## [0.1.51](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.50...memo-patte-v0.1.51) (2026-10-02)


### 🐛 Corrections

* **analytics:** retirer « anonymes » du libellé des statistiques d'usage ([27eb940](https://github.com/GaelleBriet/memo-patte-vue/commit/27eb94025e30a654f1f67392467cccdf5126d636))
* **analytics:** retirer « anonymes » du libellé des statistiques d'usage ([6e13314](https://github.com/GaelleBriet/memo-patte-vue/commit/6e13314b7d1e76a678a423ef1c98ffcc77ed628d)), closes [#425](https://github.com/GaelleBriet/memo-patte-vue/issues/425)

## [0.1.50](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.49...memo-patte-v0.1.50) (2026-10-01)


### ✨ Fonctionnalités

* **shared:** moteur d'échéances des traitements ([82763b5](https://github.com/GaelleBriet/memo-patte-vue/commit/82763b5ad66351f349a2aeba45b75cffa54efcb8))
* **shared:** un déplacement dont la dose d'arrivée est notée ne se supprime ni ne se redate ([709aa21](https://github.com/GaelleBriet/memo-patte-vue/commit/709aa2152b37d2e789fe53d1f042d5f61517fb20))


### 🐛 Corrections

* **shared:** une ligne de déplacement verrouillée n'est jamais dépassée ni sans effet ([eb74be5](https://github.com/GaelleBriet/memo-patte-vue/commit/eb74be537a3ff121196baa3abf840efc74e81ee2))
* **shared:** une seule ligne de déplacement par journée d'origine ([8eca5cf](https://github.com/GaelleBriet/memo-patte-vue/commit/8eca5cfc98190f31ec56bf84771c38c9f1831967))

## [0.1.49](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.48...memo-patte-v0.1.49) (2026-10-01)


### ✨ Fonctionnalités

* **dev:** carnet de démo avec périodes, heures, oubli et report ([8626b20](https://github.com/GaelleBriet/memo-patte-vue/commit/8626b201a040429136d01976abdd50bd554697af))
* **settings:** export et import au format v3 ([a3a359b](https://github.com/GaelleBriet/memo-patte-vue/commit/a3a359bdae2991ee0753924e766cee234df4aea4))
* **settings:** export et import v3, carnet de démo ([3666bfd](https://github.com/GaelleBriet/memo-patte-vue/commit/3666bfd0026af78becf96f5158e1faa93f965fa0))
* **settings:** repository des réglages du carnet ([8041810](https://github.com/GaelleBriet/memo-patte-vue/commit/804181072504b576430be3661446b11acf300494))
* **sync:** date de la dernière synchronisation réussie ([613eb40](https://github.com/GaelleBriet/memo-patte-vue/commit/613eb401c42e3701fcb0a5a548020aac4f58f589))
* **sync:** miroirs supabase au schéma local v10 ([2b07472](https://github.com/GaelleBriet/memo-patte-vue/commit/2b074724683b45248bfc2ed843db2ae3647b51e1))
* **sync:** miroirs Supabase au schéma v10 et ports de synchro ([59de40a](https://github.com/GaelleBriet/memo-patte-vue/commit/59de40a26313787ca5986a6e0caf28ad6a3321ae))
* **sync:** ports de synchro des périodes de traitement et des réglages du carnet ([911ea52](https://github.com/GaelleBriet/memo-patte-vue/commit/911ea525ade60ed310774d641bb7ac047eec6ab5))
* **treatments:** périodes et prises (schéma v10) ([a91a570](https://github.com/GaelleBriet/memo-patte-vue/commit/a91a570cc4176792a7b0977af85abd5ab1fcdf96))
* **treatments:** périodes et prises (schéma v10) ([d74e8d9](https://github.com/GaelleBriet/memo-patte-vue/commit/d74e8d9d8734499badd17a858a2fc368c4a995e8))


### 🐛 Corrections

* **db:** la v10 ne joue plus de DELETE, refusé par le plugin Android ([515819b](https://github.com/GaelleBriet/memo-patte-vue/commit/515819b2355ad41d8f24ea1475cbe71061974942))
* **settings:** import plus strict sur les traitements, instants et photos ([13cba2f](https://github.com/GaelleBriet/memo-patte-vue/commit/13cba2ff2d55fd12a82b380c4dde25da98cdbb31))
* **settings:** texte validé du refus d'un ancien export ([c8dc20d](https://github.com/GaelleBriet/memo-patte-vue/commit/c8dc20d46bfc60def9d7fd196b43b84b37a9f408))
* **sync:** droits de plus_entitlements réduits à la lecture, pgtap sur les huit miroirs ([156f5a3](https://github.com/GaelleBriet/memo-patte-vue/commit/156f5a33bd909d297c570d725f2a75f819893996))
* **treatments:** « modifier » ne date que les lignes qui changent ([2b707c4](https://github.com/GaelleBriet/memo-patte-vue/commit/2b707c441d3178d6efb50dc2380b408622e93b48))
* **treatments:** une prise donnée vise son propre jour ([7bd72c9](https://github.com/GaelleBriet/memo-patte-vue/commit/7bd72c9fdc8e4f859979fefec9c37078d568b68d))


### ⚡ Performance

* **settings:** export d'un gros carnet sans tri ni recopie répétés ([9e1ea59](https://github.com/GaelleBriet/memo-patte-vue/commit/9e1ea594afe1414762d5cad0232f3eeafddb5edc))

## [0.1.48](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.47...memo-patte-v0.1.48) (2026-09-30)


### ✨ Fonctionnalités

* **notifications:** « C'est fait » sur la notification d'un rappel ([464f77d](https://github.com/GaelleBriet/memo-patte-vue/commit/464f77d24c6ef1ab1a77e0bf2f9fec1df32f32f0))
* **settings:** « Ouvrir » l'export tout juste enregistré ([f380436](https://github.com/GaelleBriet/memo-patte-vue/commit/f380436addcf4c5d84ff8cec686a565ce99e5a42))


### 🐛 Corrections

* **settings:** pas de bouton « Ouvrir » après un export JSON ([6582a67](https://github.com/GaelleBriet/memo-patte-vue/commit/6582a671601a24ff3e27de5d69f8aa5398d501a9))

## [0.1.47](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.46...memo-patte-v0.1.47) (2026-09-28)


### ✨ Fonctionnalités

* **settings:** unité de poids kg ou lb suivie par toute l'app ([#352](https://github.com/GaelleBriet/memo-patte-vue/issues/352)) ([57fa9a4](https://github.com/GaelleBriet/memo-patte-vue/commit/57fa9a4a4df5b1095a41f1c29fcf61b9b95aa823))

## [0.1.46](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.45...memo-patte-v0.1.46) (2026-09-27)


### 🐛 Corrections

* emoji retirés du PDF, noms limités à 80 caractères en base et dans les formulaires ([812353b](https://github.com/GaelleBriet/memo-patte-vue/commit/812353b603d8ede6ff6aec1f5fdf8cb809fc02e4))

## [0.1.45](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.44...memo-patte-v0.1.45) (2026-09-27)


### 🐛 Corrections

* **animals:** pastille Plus du bouton PDF non rognée par Vuetify 4.2 ([9c0b422](https://github.com/GaelleBriet/memo-patte-vue/commit/9c0b422d2d7ff5166c2eae63dc4bd2cf80eafc1e))
* **animals:** pastille Plus du bouton PDF non rognée par Vuetify 4.2 ([65712df](https://github.com/GaelleBriet/memo-patte-vue/commit/65712df6aaacdbd6c8b053fec203df78cf8abc65))

## [0.1.44](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.43...memo-patte-v0.1.44) (2026-09-26)


### ✨ Fonctionnalités

* **site:** page 404 au lieu de l'accueil pour une adresse inconnue ([4984cf0](https://github.com/GaelleBriet/memo-patte-vue/commit/4984cf01646cedcab00308dfbf48588744e9c3a4))
* **site:** page 404 pour une adresse inconnue ([d89c96d](https://github.com/GaelleBriet/memo-patte-vue/commit/d89c96dfb28f213d5d54f20d28d23d7a8b86ebc9))

## [0.1.43](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.42...memo-patte-v0.1.43) (2026-09-26)


### ✨ Fonctionnalités

* **site:** politique de confidentialité et page de suppression de compte ([fa13bd8](https://github.com/GaelleBriet/memo-patte-vue/commit/fa13bd8c1bf305dd05f4047bc27f865409f69027))


### 🐛 Corrections

* **site:** journaux techniques de Supabase exclus de l'effacement immédiat ([bbb1344](https://github.com/GaelleBriet/memo-patte-vue/commit/bbb13441497c792d6a3910eabf48f02f5f3eb750))
* **site:** revue de la politique et de la page de suppression ([7ec9404](https://github.com/GaelleBriet/memo-patte-vue/commit/7ec9404cdf244a2afdbd65ff1a0bc74fefed79fe))

## [0.1.42](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.41...memo-patte-v0.1.42) (2026-09-26)


### ✨ Fonctionnalités

* **site:** page d'attente de memopatte.gaelle-briet.fr ([cd5772d](https://github.com/GaelleBriet/memo-patte-vue/commit/cd5772d5422696043ae7c9be8f5be61de670a7fe))
* **site:** page d'attente de memopatte.gaelle-briet.fr, en français et en anglais ([23f198c](https://github.com/GaelleBriet/memo-patte-vue/commit/23f198c2fbe0b06c4f9aed3ab40760676b81e22d))

## [0.1.41](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.40...memo-patte-v0.1.41) (2026-09-25)


### ✨ Fonctionnalités

* **settings:** export JSON v2 avec l'historique, import v1 et v2, CSV par événement ([#382](https://github.com/GaelleBriet/memo-patte-vue/issues/382)) ([df24d99](https://github.com/GaelleBriet/memo-patte-vue/commit/df24d99eb04cfd096c80d36792272fb987b3f274))
* **settings:** export v2 avec l'historique, import v1 et v2, PDF regroupé ([#382](https://github.com/GaelleBriet/memo-patte-vue/issues/382)) ([69710c1](https://github.com/GaelleBriet/memo-patte-vue/commit/69710c19e4b882ceb2df5d892f178baf4ebbe593))
* **settings:** le PDF liste les injections et regroupe les prises ([#382](https://github.com/GaelleBriet/memo-patte-vue/issues/382)) ([0a4be00](https://github.com/GaelleBriet/memo-patte-vue/commit/0a4be009e659cf3441da34506b88542482223493))
* **supabase:** miroirs des injections et des prises ([#383](https://github.com/GaelleBriet/memo-patte-vue/issues/383)) ([2fd5287](https://github.com/GaelleBriet/memo-patte-vue/commit/2fd5287e75e20f10fddaafa7ced227eb81c5f99b))
* **sync:** clearPullCursors, pour repartir d'un pull complet ([#383](https://github.com/GaelleBriet/memo-patte-vue/issues/383)) ([552c397](https://github.com/GaelleBriet/memo-patte-vue/commit/552c397de303e881baff4f4214c6410b41dc142c))
* **sync:** synchro des injections et des prises ([#383](https://github.com/GaelleBriet/memo-patte-vue/issues/383)) ([bd1de65](https://github.com/GaelleBriet/memo-patte-vue/commit/bd1de65d1f143dbd896e22ab9883b102f497c20f))
* **sync:** synchro des injections et des prises, curseur de pull par table ([#383](https://github.com/GaelleBriet/memo-patte-vue/issues/383)) ([aa81328](https://github.com/GaelleBriet/memo-patte-vue/commit/aa8132859da77d83b7d5e7059eed3bcb5ff2febf))
* **sync:** un curseur de pull par entité ([#383](https://github.com/GaelleBriet/memo-patte-vue/issues/383)) ([6c6c283](https://github.com/GaelleBriet/memo-patte-vue/commit/6c6c283dda688848be9198d94afefd5b2fa28b99))
* **treatments:** réconciliation des prises à fréquence périmée, événements listés ([#382](https://github.com/GaelleBriet/memo-patte-vue/issues/382)) ([41e108d](https://github.com/GaelleBriet/memo-patte-vue/commit/41e108d1532ad07dbec6c383b321ff3c2b37c2af))


### 🐛 Corrections

* **db:** la v7 pose sa version dans sa transaction, comme la v6 ([#383](https://github.com/GaelleBriet/memo-patte-vue/issues/383)) ([98e5b70](https://github.com/GaelleBriet/memo-patte-vue/commit/98e5b70b33f44cb4e7e467f5b6c643cdd010d925))
* **settings:** ligne d'identité du PDF à la ligne, dans la largeur du nom ([#401](https://github.com/GaelleBriet/memo-patte-vue/issues/401)) ([903438f](https://github.com/GaelleBriet/memo-patte-vue/commit/903438f2121a57df576ee3433c34eef9da1dbdff))
* **settings:** noms longs à la ligne dans le PDF, « Arrêté le » d'un traitement arrêté ([#401](https://github.com/GaelleBriet/memo-patte-vue/issues/401)) ([88c2293](https://github.com/GaelleBriet/memo-patte-vue/commit/88c22932d4fe0f34148e92ee20af606c12348fa4))
* **settings:** noms longs à la ligne dans le PDF, « Arrêté le » d'un traitement arrêté ([#401](https://github.com/GaelleBriet/memo-patte-vue/issues/401)) ([e3d88f3](https://github.com/GaelleBriet/memo-patte-vue/commit/e3d88f39b3294e9b251ac1bdc2cf44fb7518f3d0))
* **settings:** un export v2 dont un vaccin ou un traitement n'a aucun événement est refusé ([#382](https://github.com/GaelleBriet/memo-patte-vue/issues/382)) ([c1ef808](https://github.com/GaelleBriet/memo-patte-vue/commit/c1ef808b235e87d5d20d848b927880be14d8fa9c))
* **sync:** un pull interrompu reconstruit quand même les rappels ([#383](https://github.com/GaelleBriet/memo-patte-vue/issues/383)) ([7ca929c](https://github.com/GaelleBriet/memo-patte-vue/commit/7ca929c4272be50c6bbdbabc11fee8184c45654d))

## [0.1.40](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.39...memo-patte-v0.1.40) (2026-09-25)


### ✨ Fonctionnalités

* **carnet:** détail d'un vaccin et d'un traitement, historique, traitements terminés ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([6a27610](https://github.com/GaelleBriet/memo-patte-vue/commit/6a276105f0175853e113fbf423f0cb422ad51c21))
* **carnet:** détail d'un vaccin et d'un traitement, traitements terminés, reprise ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([ba05c24](https://github.com/GaelleBriet/memo-patte-vue/commit/ba05c243a4346bfe7653db306e5921c0e94cbf35))
* **carnet:** historique des injections et des prises lu, corrigé, repris ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([cb40cf7](https://github.com/GaelleBriet/memo-patte-vue/commit/cb40cf74adaf7b46b39ca8aeb5cd193847619692))
* **carnet:** supprimer, rétablir et redater une injection ou une prise ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([705173a](https://github.com/GaelleBriet/memo-patte-vue/commit/705173a337a3d2f3bfb238ba2f4c2e575e1590af))
* **carnet:** textes et règles de l'historique, délai d'une échéance ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([da7c1aa](https://github.com/GaelleBriet/memo-patte-vue/commit/da7c1aac883f4c67c7cdf4870fb2e6c9c7f39d65))
* **shared:** menu ⋮, ligne d'historique, carte d'échéance et calendrier de date ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([a1cfe22](https://github.com/GaelleBriet/memo-patte-vue/commit/a1cfe2217c389c351f086091fb25c9df942aeeb8))
* **treatments:** le toast dit la prochaine dose gardée quand un report n'a pas suivi ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([ccd82bc](https://github.com/GaelleBriet/memo-patte-vue/commit/ccd82bcc49c2c21b7ffa72b4bfee9b8b521a97d6))
* **weight:** « +0,3 kg depuis le 25 août », variation seule dans le bandeau ([#385](https://github.com/GaelleBriet/memo-patte-vue/issues/385)) ([5825571](https://github.com/GaelleBriet/memo-patte-vue/commit/5825571da831b7f1f9a920922c92a3855b02da16))
* **weight:** corriger ou supprimer une pesée depuis l'Historique ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([adaf64c](https://github.com/GaelleBriet/memo-patte-vue/commit/adaf64cff35a8f39a09d7fb8177c9bf414cf1943))
* **weight:** la courbe de l’Historique garde sa page quand une pesée change ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([5d9e791](https://github.com/GaelleBriet/memo-patte-vue/commit/5d9e791a6205ce6fec0174e2486d14f10eaa1a12))
* **weight:** la feuille pesée corrige et supprime une pesée, « Annuler » la remet ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([8c9cf76](https://github.com/GaelleBriet/memo-patte-vue/commit/8c9cf76d4832a704ea5b1bc4b331b46007a1ed28))
* **weight:** le repository sait remettre une pesée supprimée ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([39186ce](https://github.com/GaelleBriet/memo-patte-vue/commit/39186cea369669da45267dfd870021424e83a4d0))
* **weight:** le store remet une pesée supprimée ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([9986b2e](https://github.com/GaelleBriet/memo-patte-vue/commit/9986b2e71cca750a212914297f81ad06a62b6963))
* **weight:** pré-remplir le formulaire d’une pesée à corriger, poids sans arrondi ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([eb5ce0e](https://github.com/GaelleBriet/memo-patte-vue/commit/eb5ce0e439bf3a16be935a4421d9652b3f26aea0))
* **weight:** toucher une pesée de l’Historique ouvre sa correction ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([91c6bd5](https://github.com/GaelleBriet/memo-patte-vue/commit/91c6bd5fd4cb567555c1557c071519cd206de05a))
* **weight:** variation « depuis le 25 août », chiffre seul dans le bandeau ([#385](https://github.com/GaelleBriet/memo-patte-vue/issues/385)) ([cbbf0f8](https://github.com/GaelleBriet/memo-patte-vue/commit/cbbf0f8ad00d60f1dae985ef68175cf704839286))
* **weight:** variation de poids datée de la pesée de référence ([#385](https://github.com/GaelleBriet/memo-patte-vue/issues/385)) ([59b3f6a](https://github.com/GaelleBriet/memo-patte-vue/commit/59b3f6a38d01c400a76f4e3ae054e010473ee3b4))


### 🐛 Corrections

* **carnet:** le filet entre les lignes-boutons des sections revient ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([9fa8815](https://github.com/GaelleBriet/memo-patte-vue/commit/9fa8815531918cc1265595cac441083f9d144bed))
* **carnet:** libellé vocal de « C'est fait », toasts et textes anglais de l'historique ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([c5263e5](https://github.com/GaelleBriet/memo-patte-vue/commit/c5263e5d73a975f6330f6a2147515bed312ab7ab))
* **carnet:** lignes d'historique à la hauteur de la maquette, zone de tap d'« Arrêter » ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([8facc2e](https://github.com/GaelleBriet/memo-patte-vue/commit/8facc2e00b7046b32e040e680cd48837e7ab9789))
* **carnet:** prises précédentes en poids normal sous la dernière (F8) ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([5d9f8c0](https://github.com/GaelleBriet/memo-patte-vue/commit/5d9f8c072cbac6addb07063e6456b19f3137e6c3))
* **carnet:** une annulation qui n'a rien supprimé est dite en échec ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([a905c25](https://github.com/GaelleBriet/memo-patte-vue/commit/a905c25f4e4b2105f93adde8e39c72a85dbc1f28))
* **i18n:** « le » et « since » restent collés à la date de la variation ([#385](https://github.com/GaelleBriet/memo-patte-vue/issues/385)) ([3ed3d2a](https://github.com/GaelleBriet/memo-patte-vue/commit/3ed3d2a3dd04787d24c5682e2113a09c65f1ded9))
* **settings:** la courbe du PDF rend l'état du trait qu'elle a trouvé ([#386](https://github.com/GaelleBriet/memo-patte-vue/issues/386)) ([51be06e](https://github.com/GaelleBriet/memo-patte-vue/commit/51be06e38af76fdfd79b79a5d97def78f01d91ae))
* **settings:** le PDF du carnet passe à la page suivante au lieu de déborder ([#386](https://github.com/GaelleBriet/memo-patte-vue/issues/386)) ([9b05623](https://github.com/GaelleBriet/memo-patte-vue/commit/9b056234573d0d8651a931a9c89e56dd5a37eec8))
* **settings:** le PDF du carnet passe à la page suivante au lieu de déborder ([#386](https://github.com/GaelleBriet/memo-patte-vue/issues/386)) ([1102c61](https://github.com/GaelleBriet/memo-patte-vue/commit/1102c61711cda8fe57ed651886e479e7b8f337f8))
* **settings:** plus d'erreur au démarrage quand le dossier des exports n'existe pas ([5dd6e69](https://github.com/GaelleBriet/memo-patte-vue/commit/5dd6e693704b63f633a07643cd6158a537579c7b)), closes [#398](https://github.com/GaelleBriet/memo-patte-vue/issues/398)
* **settings:** plus d'erreur au démarrage quand le dossier des exports n'existe pas ([#398](https://github.com/GaelleBriet/memo-patte-vue/issues/398)) ([df0c716](https://github.com/GaelleBriet/memo-patte-vue/commit/df0c716feefd3085f38a271693cee1da53c01a45))
* **shared:** le focus va à la première action une fois le menu ⋮ affiché ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([4fdd969](https://github.com/GaelleBriet/memo-patte-vue/commit/4fdd96950df000fa2ad2a385518a6dba5bd9b7e9))
* **shared:** le menu ⋮ se lit comme un menu, focus sur sa première action puis sur ⋮ ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([6c6e818](https://github.com/GaelleBriet/memo-patte-vue/commit/6c6e818731329dc9aa8b89c3e7518139c63f97ba))
* **shared:** le retour Android ferme le menu ⋮ avant l'écran ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([b5e64d1](https://github.com/GaelleBriet/memo-patte-vue/commit/b5e64d1b7c0e5e3f6dfb51eebf0e83cdc10e0ec5))
* **treatments:** « report gardé » ne vaut que pour la prise restée la dernière ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([20f750f](https://github.com/GaelleBriet/memo-patte-vue/commit/20f750f1c5c2223942ebce5bbe172ce948e113ef))
* **treatments:** un report qui ne reste pas après la nouvelle date est recalculé ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([c97b33e](https://github.com/GaelleBriet/memo-patte-vue/commit/c97b33e04ea6d20fc70021021fc9fefb921aa647))
* **treatments:** une prise redatée garde un report manuel et prend la fréquence du plan ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([36009cc](https://github.com/GaelleBriet/memo-patte-vue/commit/36009ccaa8667e2042dcb3ce2a6161c8209079f7))
* **vaccinations:** déplacée après son « autre date », l'injection redemande son rappel ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([3c80234](https://github.com/GaelleBriet/memo-patte-vue/commit/3c80234540768fd42002e677151366f070fe9776))
* **vaccinations:** le rappel choisi avec le déplacement est validé, après l'injection ([#381](https://github.com/GaelleBriet/memo-patte-vue/issues/381)) ([33ca7b8](https://github.com/GaelleBriet/memo-patte-vue/commit/33ca7b820883316e255cc0d5077fa169ca1d124f))
* **weight:** feuille pesée sans spinner à la suppression, pesée remise signalée ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([bb96fe2](https://github.com/GaelleBriet/memo-patte-vue/commit/bb96fe2a0d7a4dc66b3541e93d1dc4e2697b0e85))
* **weight:** la ligne de pesée lit sa variation, reprend le focus après « Annuler » ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([e38dc10](https://github.com/GaelleBriet/memo-patte-vue/commit/e38dc1038a6e1a5d37b739a641efba59261bf75d))
* **weight:** la puce « Poids actuel » ne tient que la ligne « Pesée du … » ([#385](https://github.com/GaelleBriet/memo-patte-vue/issues/385)) ([79d15f4](https://github.com/GaelleBriet/memo-patte-vue/commit/79d15f48a4ce840d0b1bdede3f13d4b06e50b2da))
* **weight:** messages d’échec de la feuille pesée en clés i18n statiques ([#402](https://github.com/GaelleBriet/memo-patte-vue/issues/402)) ([1b1b973](https://github.com/GaelleBriet/memo-patte-vue/commit/1b1b9731cecdacf9a5683285e4c3aa9a794abdb6))

## [0.1.39](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.38...memo-patte-v0.1.39) (2026-09-24)


### ✨ Fonctionnalités

* **home:** feuilles d'un rappel F2 à F6 depuis « À faire », fenêtre jusqu'à J+29 ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([95a883c](https://github.com/GaelleBriet/memo-patte-vue/commit/95a883ca43b9c761febe17eedad30ed8710e2f6d))
* **home:** retour de « Modifier » sur la feuille du rappel, rouverte à jour ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([46054f3](https://github.com/GaelleBriet/memo-patte-vue/commit/46054f3a297f336b3cdad69927c8e386cb973701))
* **rappels:** l'année s'affiche quand l'échéance n'est pas de l'année en cours ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([9ba206d](https://github.com/GaelleBriet/memo-patte-vue/commit/9ba206d210ba2a531e5de3c659538db170502235))
* **reminders:** marquer un rappel comme fait depuis l'accueil ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([d58da95](https://github.com/GaelleBriet/memo-patte-vue/commit/d58da9545e953d892ccb1e97c10498a082497940))
* **reminders:** services de la prise, de l'injection et de l'arrêt, avec leur annulation ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([a8c8dca](https://github.com/GaelleBriet/memo-patte-vue/commit/a8c8dca99ae6d720b5959aaf63b126f5f5418cbe))
* **shared:** action du toast et dialogue de confirmation partagé ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([e353bc6](https://github.com/GaelleBriet/memo-patte-vue/commit/e353bc60eb8ba21e6f6a76b869de494e5076ee48))
* **shared:** calendrier, mois et année au toucher du titre ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([62ef822](https://github.com/GaelleBriet/memo-patte-vue/commit/62ef822cb1c7c3d245ff279fdef46a25a40daae4))
* **treatments:** « Modifier » change le plan et la prochaine dose de la prise de tête ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([615c76f](https://github.com/GaelleBriet/memo-patte-vue/commit/615c76f2bd46709c888736ee7e529bea2e03b885))
* **treatments:** un traitement arrêté sort des rappels, de « À faire » et des exports ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([71502ba](https://github.com/GaelleBriet/memo-patte-vue/commit/71502bab8005548b80ce361a8279b5f5592b9c73))
* **vaccinations:** « C'est un rappel de … ? » ouvre la feuille « Fait » du vaccin existant ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([a6e6265](https://github.com/GaelleBriet/memo-patte-vue/commit/a6e62659a4f6de9cb0df7be98bfcafaff4c6b570))


### 🐛 Corrections

* **settings:** un traitement arrêté le reste après export puis import ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([3aa723c](https://github.com/GaelleBriet/memo-patte-vue/commit/3aa723c60cdb4a63436b57cf8c5acc6a1218e054))
* **shared:** le focus revient au bouton d'origine quand on annule un dialogue ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([146ece7](https://github.com/GaelleBriet/memo-patte-vue/commit/146ece76863d8a66865cee94d0b78965cf03eaa1))
* **shared:** titre du calendrier nommé avec le mois, retour Android vers les jours ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([cbb5ecf](https://github.com/GaelleBriet/memo-patte-vue/commit/cbb5ecff02376939125efe1cbe820beea6239039))
* **treatments:** la prochaine dose ne précède jamais la dernière prise dans « Modifier » ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([d241b90](https://github.com/GaelleBriet/memo-patte-vue/commit/d241b90cfb943e6d533606013639076d48ebf07e))
* **vaccinations:** « Fait aujourd'hui » annonce aussi le choix du prochain rappel ([#380](https://github.com/GaelleBriet/memo-patte-vue/issues/380)) ([2a2cb0a](https://github.com/GaelleBriet/memo-patte-vue/commit/2a2cb0a778e85f6ea134f49aedc20a7c5fe08d3c))

## [0.1.38](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.37...memo-patte-v0.1.38) (2026-09-24)


### ✨ Fonctionnalités

* **db:** migration v6, historique des vaccins et des traitements ([#379](https://github.com/GaelleBriet/memo-patte-vue/issues/379)) ([8f43305](https://github.com/GaelleBriet/memo-patte-vue/commit/8f43305f0a0380f50d1a653304aaa4e4b2bfe944))
* **db:** migration v6, historique des vaccins et des traitements ([#379](https://github.com/GaelleBriet/memo-patte-vue/issues/379)) ([4711098](https://github.com/GaelleBriet/memo-patte-vue/commit/4711098d99718e10ec66bfb5240c6286e1af2430))
* **weight:** découpage de l'historique en pages de 12 pesées ([#351](https://github.com/GaelleBriet/memo-patte-vue/issues/351)) ([f505e64](https://github.com/GaelleBriet/memo-patte-vue/commit/f505e64d3aeb2419271f08810423f853826caa14))
* **weight:** Historique du poids par pages de 12 pesées ([#351](https://github.com/GaelleBriet/memo-patte-vue/issues/351)) ([96a9263](https://github.com/GaelleBriet/memo-patte-vue/commit/96a92639b0c8cf2b976399d009e54be1f27c5b04))
* **weight:** historique par pages, glisser pour remonter le temps ([#351](https://github.com/GaelleBriet/memo-patte-vue/issues/351)) ([1595f3f](https://github.com/GaelleBriet/memo-patte-vue/commit/1595f3feb4e56cfa1a583c20f12262693dd4357e))
* **weight:** période d'un seul mois écrite « mars 2026 » ([#351](https://github.com/GaelleBriet/memo-patte-vue/issues/351)) ([f3088c0](https://github.com/GaelleBriet/memo-patte-vue/commit/f3088c09334887e045154790cc6fe3affa703112))


### 🐛 Corrections

* **db:** version 6 posée dans la transaction de la migration ([#379](https://github.com/GaelleBriet/memo-patte-vue/issues/379)) ([2b93e41](https://github.com/GaelleBriet/memo-patte-vue/commit/2b93e4119fcc313171ca93b68a7e9ec6cbe6602a))
* **settings:** l'événement de même date revenu avec son parent reprend les valeurs du fichier ([#379](https://github.com/GaelleBriet/memo-patte-vue/issues/379)) ([2300fcb](https://github.com/GaelleBriet/memo-patte-vue/commit/2300fcb8db766965bed448fb29d0f76770995d7b))
* **settings:** l'import v1 rattache sa ligne à l'événement local de même date ([#379](https://github.com/GaelleBriet/memo-patte-vue/issues/379)) ([f8d6d61](https://github.com/GaelleBriet/memo-patte-vue/commit/f8d6d61276693b207aa62abbe7591768560fb3f5))
* **settings:** un événement supprimé avec son parent revient avec lui à l'import v1 ([#379](https://github.com/GaelleBriet/memo-patte-vue/issues/379)) ([c638223](https://github.com/GaelleBriet/memo-patte-vue/commit/c638223a1b5bdf266e741588131ddb97be314e27))
* **shared:** sous-titre d'un écran poussé collé au titre, comme la maquette H1 ([754b851](https://github.com/GaelleBriet/memo-patte-vue/commit/754b85118d8ae9b47ffd5c25909312484ccaab00))

## [0.1.37](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.36...memo-patte-v0.1.37) (2026-09-23)


### ✨ Fonctionnalités

* **home:** « À faire » ne montre que les retards et les 30 prochains jours ([cdcfe73](https://github.com/GaelleBriet/memo-patte-vue/commit/cdcfe73fd46fee394356d6ac82d9ac83aca83ffd))
* **home:** « Prochain rappel » remplace « Aucun rappel à venir », date d'un seul tenant ([8dc04e5](https://github.com/GaelleBriet/memo-patte-vue/commit/8dc04e566ae087d6f875ebf154a749a055696a6a))
* **home:** la liste « À faire » montre les retards et les 30 prochains jours ([8e54cfa](https://github.com/GaelleBriet/memo-patte-vue/commit/8e54cfafdf053917c3c010961706aac9fa585bf6))
* **settings:** courbe de poids du PDF sur l'axe du temps, comme le Carnet ([a616888](https://github.com/GaelleBriet/memo-patte-vue/commit/a616888c17eb99aad5a0582f615afd7ac39ff1cb))
* **settings:** courbe de poids du PDF sur l'axe du temps, rendu du Carnet ([9e7fc84](https://github.com/GaelleBriet/memo-patte-vue/commit/9e7fc84ea53acec2d13736f0461f1e323374dc1b)), closes [#350](https://github.com/GaelleBriet/memo-patte-vue/issues/350)
* **shared:** la courbe du Carnet mesure ses textes avec la chasse reçue ([447a2a7](https://github.com/GaelleBriet/memo-patte-vue/commit/447a2a7468b0b509324002d4f243ab1356a355b9)), closes [#350](https://github.com/GaelleBriet/memo-patte-vue/issues/350)
* **shared:** le toast se pose au-dessus de toute barre fixe du bas ([0b8dac7](https://github.com/GaelleBriet/memo-patte-vue/commit/0b8dac7ea1602c88643f483e626b644675224c7e))
* **shared:** toasts au style pétrole de la maquette B3 ([d88dc7d](https://github.com/GaelleBriet/memo-patte-vue/commit/d88dc7d983124ba34e8efac5c47fca763fedfaf1))
* **shared:** toasts au style pétrole de la maquette, placement et tonalités ([82095da](https://github.com/GaelleBriet/memo-patte-vue/commit/82095da07aae6f8e9fea57b26df089383898754f))
* **shared:** tonalité du toast (réussite, information, échec) ([ace06c3](https://github.com/GaelleBriet/memo-patte-vue/commit/ace06c31e614b0b11eef5c8c73cbd204d3e743dc))


### 🐛 Corrections

* **a11y:** annoncer chaque toast, même au message identique ([8fb27c7](https://github.com/GaelleBriet/memo-patte-vue/commit/8fb27c7df9fa9cbe46b5bb9611968de8d93a4e47))
* **settings:** état graphique rétabli après la courbe du PDF, pastille verrouillée ([ef60a6d](https://github.com/GaelleBriet/memo-patte-vue/commit/ef60a6da7a6e3ce66eb3cbff185c5febb02a3d74)), closes [#350](https://github.com/GaelleBriet/memo-patte-vue/issues/350)
* **settings:** largeur entière pour la courbe du PDF, obstacle inutile retiré ([3b91090](https://github.com/GaelleBriet/memo-patte-vue/commit/3b9109099907f2906c3fbc151807978a726dc2e5)), closes [#350](https://github.com/GaelleBriet/memo-patte-vue/issues/350)
* **settings:** traits de la courbe du PDF en gris de bordure, sans écart sous le titre ([6988a36](https://github.com/GaelleBriet/memo-patte-vue/commit/6988a36bc15599387a0c9c49e8977ade3e7471d9)), closes [#350](https://github.com/GaelleBriet/memo-patte-vue/issues/350)
* **shared:** aucune étiquette de la courbe ne touche la ligne de base ([18c808d](https://github.com/GaelleBriet/memo-patte-vue/commit/18c808d8dfb98a047f6ea8b4e267437c73416047)), closes [#350](https://github.com/GaelleBriet/memo-patte-vue/issues/350)
* **shared:** ombre du toast d'échec à sa teinte, annonce et barres mieux couvertes ([cd27555](https://github.com/GaelleBriet/memo-patte-vue/commit/cd27555c908e96de3d8b575f9c9f1805f8f4e451))
* **shared:** relancer le minuteur du toast à chaque appel ([becff6a](https://github.com/GaelleBriet/memo-patte-vue/commit/becff6a544452a957f39451712b0c423d44ebfb1))
* **weight:** mois du Carnet contre la ligne de base, place rendue à la courbe ([86f46b5](https://github.com/GaelleBriet/memo-patte-vue/commit/86f46b5a86aabb86ee378587781b73d2e502c9c5)), closes [#373](https://github.com/GaelleBriet/memo-patte-vue/issues/373)
* **weight:** retirer la bande vide sous la ligne de base de la courbe du Carnet ([39da461](https://github.com/GaelleBriet/memo-patte-vue/commit/39da461f05040c142282af6e64940999a5a99526))

## [0.1.36](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.35...memo-patte-v0.1.36) (2026-09-23)


### ✨ Fonctionnalités

* **android:** accès au stockage limité à Android 10 et moins pour l'export ([5f7b295](https://github.com/GaelleBriet/memo-patte-vue/commit/5f7b29545d234d55b44af8931cad31247245217e))
* **purchase:** écran Plus revu et pastille Plus sur l'export PDF ([a56452f](https://github.com/GaelleBriet/memo-patte-vue/commit/a56452f029750aa546042fcc2da66833367f6268))
* **purchase:** écran Plus revu et pastille Plus sur l'export PDF ([457013f](https://github.com/GaelleBriet/memo-patte-vue/commit/457013f8ff9f23c14666b559b834d88676a7f0b1))
* **settings:** enregistrer un export sur le téléphone en plus du partage ([c4a96d7](https://github.com/GaelleBriet/memo-patte-vue/commit/c4a96d721d55d1218605b14a93463aa924ab0c12))
* **settings:** enregistrer un export sur le téléphone en plus du partage ([8e90cf3](https://github.com/GaelleBriet/memo-patte-vue/commit/8e90cf3b344fe76046a8396b07597cfe62bd5a47)), closes [#343](https://github.com/GaelleBriet/memo-patte-vue/issues/343)
* **settings:** icônes JSON et CSV de la maquette ([c3b6f48](https://github.com/GaelleBriet/memo-patte-vue/commit/c3b6f48a39f8145243acd1dc0160b72be2ce1d44))
* **settings:** noms d'export datés à la minute, carnet PDF nommé comme affiché ([582e0d9](https://github.com/GaelleBriet/memo-patte-vue/commit/582e0d9e8ed009052ad83fe0a2e3584dee3d99ab))
* **shared:** calcul de la courbe de poids sur l'axe du temps ([751e9f5](https://github.com/GaelleBriet/memo-patte-vue/commit/751e9f58386e158edff35322c4664455b7119d4b)), closes [#340](https://github.com/GaelleBriet/memo-patte-vue/issues/340)
* **weight:** courbe de poids sur l'axe du temps, pistes C (Carnet) et D (Historique) ([d90da37](https://github.com/GaelleBriet/memo-patte-vue/commit/d90da378b9fd29e9b9080b34dd1c2657a2da7626))
* **weight:** courbe du Carnet (piste C) et de l'Historique (piste D) ([f72b5ac](https://github.com/GaelleBriet/memo-patte-vue/commit/f72b5ac630ac090ef17d21c25d6f15c0e2acd79d)), closes [#340](https://github.com/GaelleBriet/memo-patte-vue/issues/340)


### 🐛 Corrections

* **android:** contrôle du manifest sur chaque déclaration d'une permission ([fda2e28](https://github.com/GaelleBriet/memo-patte-vue/commit/fda2e281628d8adfb3841797f36df2cbd47dae74))
* **home:** le seul animal du foyer devient l'animal courant de l'accueil ([103eb42](https://github.com/GaelleBriet/memo-patte-vue/commit/103eb42d1446c09c997b423f18e425dd7125a6c6))
* **home:** le seul animal du foyer devient l'animal courant de l'accueil ([accbdc9](https://github.com/GaelleBriet/memo-patte-vue/commit/accbdc961fbbce2c4b46597d4e71e89533803383))
* **home:** retire le texte « à jour » d'un foyer à un animal, devenu inatteignable ([99b02ee](https://github.com/GaelleBriet/memo-patte-vue/commit/99b02eedbcbef47e10aafcfadda87550f8bd8b52))
* **purchase:** suites de la revue de l'écran Plus et textes tranchés ([813f1d1](https://github.com/GaelleBriet/memo-patte-vue/commit/813f1d1b4b9819506ea9664dede47aa73505bc76))
* **settings:** seul « fichier introuvable » rend un nom d'export libre ([2a5243e](https://github.com/GaelleBriet/memo-patte-vue/commit/2a5243ee374f7354953d16a6c1498537122ccff1))
* **settings:** une seule tentative d'écriture, fichier entamé effacé ([99a8568](https://github.com/GaelleBriet/memo-patte-vue/commit/99a8568d802ac1a13554b7caca6ac081d30a2d9f))
* **weight:** « min » à côté de son point du côté où il tient, aucune étiquette hors du graphique ([5239bb5](https://github.com/GaelleBriet/memo-patte-vue/commit/5239bb5148734f97208e8f6e4c2166fda77a58a7)), closes [#340](https://github.com/GaelleBriet/memo-patte-vue/issues/340)
* **weight:** aucune étiquette de la courbe ne se chevauche ni ne déborde ([71d5f4b](https://github.com/GaelleBriet/memo-patte-vue/commit/71d5f4b65ea83739a33879f8f8380dd77e7cebbe)), closes [#340](https://github.com/GaelleBriet/memo-patte-vue/issues/340)
* **weight:** libellés traduits et police agrandie mesurés, traits des mois gardés ([e9da807](https://github.com/GaelleBriet/memo-patte-vue/commit/e9da807d88669c5f9dcd8aa295e2e9ed9b05be29)), closes [#340](https://github.com/GaelleBriet/memo-patte-vue/issues/340)

## [0.1.35](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.34...memo-patte-v0.1.35) (2026-09-22)


### ✨ Fonctionnalités

* **sync:** cycle push/pull, détection réseau et déclencheurs ([#39](https://github.com/GaelleBriet/memo-patte-vue/issues/39)) ([5666b19](https://github.com/GaelleBriet/memo-patte-vue/commit/5666b194578fd25eec034885d328361459431dce))
* **sync:** cycle push/pull, détection réseau et déclencheurs ([#39](https://github.com/GaelleBriet/memo-patte-vue/issues/39)) ([e838d09](https://github.com/GaelleBriet/memo-patte-vue/commit/e838d09d68c89b4d3728add80293ebc4afafdeb8))
* **sync:** implémente le port de synchro dans les quatre repositories ([dbc68c9](https://github.com/GaelleBriet/memo-patte-vue/commit/dbc68c94089915e81ebe95409d8a9977e5c843d6))
* **sync:** port SyncableTable et upsert Supabase gardé contre la régression ([d1baf15](https://github.com/GaelleBriet/memo-patte-vue/commit/d1baf15828c7a92df7bb9b9650ad6996d715b9c4))


### 🐛 Corrections

* **contexte:** corrige la mise en forme mangled par prettier sur l'entrée [#39](https://github.com/GaelleBriet/memo-patte-vue/issues/39) ([eaa8b09](https://github.com/GaelleBriet/memo-patte-vue/commit/eaa8b090be8acefeff7b270de1c7a82bf7139928))

## [0.1.34](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.33...memo-patte-v0.1.34) (2026-09-21)


### 🐛 Corrections

* **ci:** contourner supabase link, cassé avec les tokens à permissions fines ([03a4d5e](https://github.com/GaelleBriet/memo-patte-vue/commit/03a4d5eb61bd0446e7291f31a06a0025dc31ba82))
* **ci:** contourner supabase link, cassé avec les tokens à permissions fines ([56d081a](https://github.com/GaelleBriet/memo-patte-vue/commit/56d081a8fa512c389146b184f16b68150f8ef41f))

## [0.1.33](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.32...memo-patte-v0.1.33) (2026-09-21)


### ✨ Fonctionnalités

* **ui:** bottom nav en capsule flottante ([317cd34](https://github.com/GaelleBriet/memo-patte-vue/commit/317cd341bf25617c474e5d8ac8e7877644d033dc))
* **ui:** refonte de la bottom nav en capsule flottante ([339741f](https://github.com/GaelleBriet/memo-patte-vue/commit/339741fc5b696b3593f7bbf4f38f4df4854635f9)), closes [#327](https://github.com/GaelleBriet/memo-patte-vue/issues/327)

## [0.1.32](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.31...memo-patte-v0.1.32) (2026-09-21)


### ✨ Fonctionnalités

* **sync:** fondation de la file d'attente locale (Lot A) ([dc118b9](https://github.com/GaelleBriet/memo-patte-vue/commit/dc118b922f2a71888642d5b2b0a361c22e767618))
* **sync:** migration v5, table sync_outbox/sync_state et triggers d'alimentation ([5cf2df9](https://github.com/GaelleBriet/memo-patte-vue/commit/5cf2df9bb1cde4c2b15c5cfc8bfc18f59c70cfba))
* **sync:** repository sync_outbox/sync_state ([ad45e54](https://github.com/GaelleBriet/memo-patte-vue/commit/ad45e547182aeb4e6d795684d975988bd2994893))


### 🐛 Corrections

* **a11y:** remonter deux textes de l'écran Plus au minimum 12 px ([b4bafa9](https://github.com/GaelleBriet/memo-patte-vue/commit/b4bafa9bce19f4c75c94a24a34195de3fac408b9))
* **a11y:** repasse accessibilité — écrans ajoutés depuis le 15/09 ([2c8a575](https://github.com/GaelleBriet/memo-patte-vue/commit/2c8a5757948ca0665005039cde678eec867dfdef))
* **sync:** mettre à jour les tables attendues par clear-all-tables et les fixtures dev ([04918e4](https://github.com/GaelleBriet/memo-patte-vue/commit/04918e40cd85dd616705108566eecd4f2d559c27))

## [0.1.31](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.30...memo-patte-v0.1.31) (2026-09-19)


### 🐛 Corrections

* **sync:** garde-fous d'écriture atomique pour le push, le pull et la file ([177df38](https://github.com/GaelleBriet/memo-patte-vue/commit/177df383c723dd56eae8321a718b410f8ba98a9b))

## [0.1.30](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.29...memo-patte-v0.1.30) (2026-09-19)


### ✨ Fonctionnalités

* **settings:** authorize automated merging of Claude's own PRs in me… ([1beba43](https://github.com/GaelleBriet/memo-patte-vue/commit/1beba435007a5dbabdc7b4dc5601133ec46f063a))
* **settings:** authorize automated merging of Claude's own PRs in memo-patte-vue ([487f43c](https://github.com/GaelleBriet/memo-patte-vue/commit/487f43c98dba4cdc343541df95ea25aa8a1b2aae))

## [0.1.29](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.28...memo-patte-v0.1.29) (2026-09-18)


### ✨ Fonctionnalités

* **analytics:** événements métier et tests ([c4316b9](https://github.com/GaelleBriet/memo-patte-vue/commit/c4316b966d53a3bba006a501d98009ed19e9f1af))
* **analytics:** pageview et événements métier, identify/reset au compte ([88be656](https://github.com/GaelleBriet/memo-patte-vue/commit/88be656b8572293d5b0daa29a8d8436e21c0c5c3))
* **settings:** déconnexion du compte Plus ([e1032fd](https://github.com/GaelleBriet/memo-patte-vue/commit/e1032fd7ee761e5eb9fc466adf5ad1b8078bdd8d))
* **settings:** déconnexion du compte Plus ([6069247](https://github.com/GaelleBriet/memo-patte-vue/commit/606924759579cc4ef756e52d8395787f0b74a490))
* **settings:** export PDF du carnet d'un animal (Plus) ([3ab49af](https://github.com/GaelleBriet/memo-patte-vue/commit/3ab49aff07896af3412d49054756fe7a6eb5d094))
* **settings:** export PDF du carnet d'un animal (Plus) ([9c4bddc](https://github.com/GaelleBriet/memo-patte-vue/commit/9c4bddcd9bb7a16c96f7fcc8d843a6013273eeda))


### 🐛 Corrections

* **analytics:** masquer animalName dans les URL envoyées à PostHog ([7bdb8e6](https://github.com/GaelleBriet/memo-patte-vue/commit/7bdb8e65009bd8c9b0fbdc2232b85d02ecd00492))
* **auth:** ignorer un double-clic sur la confirmation de déconnexion ([b08b8d8](https://github.com/GaelleBriet/memo-patte-vue/commit/b08b8d8ab671018758392fd8a1e2fd36a3a1bbf9))
* **settings:** photo, tableau+courbe et chargement paresseux du PDF ([cec5138](https://github.com/GaelleBriet/memo-patte-vue/commit/cec5138bdd342b528545948a1a9c1e67538ee329))
* **ui:** garder les états de survol derrière [@media](https://github.com/media) (hover: hover) ([35604fd](https://github.com/GaelleBriet/memo-patte-vue/commit/35604fdd6df83639f050d07b2705380731b9e632))
* **ui:** garder les états de survol derrière [@media](https://github.com/media) (hover: hover) ([82eddc3](https://github.com/GaelleBriet/memo-patte-vue/commit/82eddc3d6e2217c7254469befab38511a8fcb448))

## [0.1.28](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.27...memo-patte-v0.1.28) (2026-09-16)


### ✨ Fonctionnalités

* **purchase:** rattacher l'achat au compte Supabase à la connexion ([3d4e88e](https://github.com/GaelleBriet/memo-patte-vue/commit/3d4e88e8586b09bedc6a13c82d0a973698665f7b))


### 🐛 Corrections

* collisions d'identifiant de rappel et rattachement de l'achat au compte ([400e344](https://github.com/GaelleBriet/memo-patte-vue/commit/400e34456a6833e52167922e5b9d64a14c85445b))
* **import:** figer le rattachement à l'animal et rendre l'échéance explicite ([79e24f3](https://github.com/GaelleBriet/memo-patte-vue/commit/79e24f3cae1bf0f8f4ae92a168cc2a96fbd70043))
* **import:** un motif d'erreur dédié au fichier qui déplace une entrée ([938a899](https://github.com/GaelleBriet/memo-patte-vue/commit/938a899a65aa0bdb67764d38dfbb2a30ca5ed9d1))
* **notifications:** résoudre les collisions d'identifiant au lieu de les signaler ([a4c4316](https://github.com/GaelleBriet/memo-patte-vue/commit/a4c4316439a5932fa7d9eaaf0b760ba9f3949553))
* **purchase:** ne solder le souvenir d'abonnement qu'au changement de compte ([7e64cc7](https://github.com/GaelleBriet/memo-patte-vue/commit/7e64cc7b993d666b0089d49f5433ed3c81261033))
* **settings:** refuser un import qui déplace une entrée, et extraire le plan d'import ([195875b](https://github.com/GaelleBriet/memo-patte-vue/commit/195875b899964149b3082a71b52d2c571f6d3753))


### ⚡ Performance

* **photos:** sonder l'existence d'une photo par stat, sans lire le fichier ([5e1b59d](https://github.com/GaelleBriet/memo-patte-vue/commit/5e1b59d220d99e5c751e42de19a59272a995812e))

## [0.1.27](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.26...memo-patte-v0.1.27) (2026-09-16)


### ✨ Fonctionnalités

* **analytics:** PostHog sans effet sans accord et écran de consentement ([a4255d7](https://github.com/GaelleBriet/memo-patte-vue/commit/a4255d7789336d26b9085bd53a387dd9830c7f45))
* **auth:** écran de connexion et d'inscription ([f2b5f5b](https://github.com/GaelleBriet/memo-patte-vue/commit/f2b5f5b79d0cbbe9f807b11fb83648cdd8b54010))
* **auth:** écran de connexion et d'inscription ([3f97a44](https://github.com/GaelleBriet/memo-patte-vue/commit/3f97a441f3e178dd6ca8bdfac23c42844581816e))
* **auth:** session persistante et drapeau « compte Plus sur l'appareil » ([04b0bc0](https://github.com/GaelleBriet/memo-patte-vue/commit/04b0bc05449cea1acb59ac555b19ad0acec11e1a))
* **auth:** session persistante et drapeau compte Plus ([0a6d38c](https://github.com/GaelleBriet/memo-patte-vue/commit/0a6d38c8caf9f661676d29f6d02cab62eaf586c2))
* **purchase:** « Te voilà de retour dans Plus. » après une restauration ([568f01f](https://github.com/GaelleBriet/memo-patte-vue/commit/568f01fa5ca18a01f2de3f152d1554cf3d326253))
* **purchase:** écran MémoPatte Plus ([9249ad7](https://github.com/GaelleBriet/memo-patte-vue/commit/9249ad757999dc279d7966b852ff0332b4a831d4))
* **purchase:** écran MémoPatte Plus, offres et prix venant de l'offering ([849e251](https://github.com/GaelleBriet/memo-patte-vue/commit/849e25123c7f73db5a720ce5b547edca039cbebb)), closes [#45](https://github.com/GaelleBriet/memo-patte-vue/issues/45)
* **purchase:** le souvenir d'un abonnement échu s'efface au bout de 30 jours ([731d090](https://github.com/GaelleBriet/memo-patte-vue/commit/731d0904b4dec19ccc673cf1a7b44f723c3e9454))
* **purchase:** nommer le plan d'un abonnement échu et écrire une échéance en chiffres ([e05e57b](https://github.com/GaelleBriet/memo-patte-vue/commit/e05e57bd251d6acd71d6fb1a74fcb32bf4c61ed3))
* **purchase:** rappel doux vers MémoPatte Plus en tête du Carnet ([49de573](https://github.com/GaelleBriet/memo-patte-vue/commit/49de573ba09bad37bfdd6131aac2a6e952679f4b))
* **purchase:** rappel doux vers MémoPatte Plus en tête du Carnet ([42ef2c6](https://github.com/GaelleBriet/memo-patte-vue/commit/42ef2c6015ffac8a2a949bd6ed705812e67024a7))
* **purchase:** service billing RevenueCat et statut Plus ([7f6f95b](https://github.com/GaelleBriet/memo-patte-vue/commit/7f6f95b64bcddf3ea317b0274a250735031e13e4))
* **purchase:** service billing RevenueCat et statut Plus persisté ([15c9db9](https://github.com/GaelleBriet/memo-patte-vue/commit/15c9db959216c773c8155f067758e9568fad5b26))
* **purchase:** textes exacts du relevé P1-P5 et constats de revue ([0fabcf5](https://github.com/GaelleBriet/memo-patte-vue/commit/0fabcf54ded947a54f9a442a88aa996edb947d47)), closes [#45](https://github.com/GaelleBriet/memo-patte-vue/issues/45)
* **settings:** section MémoPatte Plus, restauration d'achat et bandeau Plus en pause ([9ecd31c](https://github.com/GaelleBriet/memo-patte-vue/commit/9ecd31c747ccfa3af342239cad6526bee2ea0921))
* **settings:** section MémoPatte Plus, restauration de l'achat et gestion de l'abonnement ([49020d5](https://github.com/GaelleBriet/memo-patte-vue/commit/49020d52b340df4606f265c68bbec1379d5db6a0))
* **theme:** enregistrer l'icône mark_email_unread ([2ed8e10](https://github.com/GaelleBriet/memo-patte-vue/commit/2ed8e10af1ffbfa234c0f6aedefcef773f97748e))


### 🐛 Corrections

* **analytics:** effacer les clés PostHog au retrait même quand le SDK a chargé ([40156e5](https://github.com/GaelleBriet/memo-patte-vue/commit/40156e5bb2a9e94abfa784a7cf29265f321c75ac)), closes [#289](https://github.com/GaelleBriet/memo-patte-vue/issues/289)
* **analytics:** même style pour refuser et accepter sur l'écran de consentement ([dca114a](https://github.com/GaelleBriet/memo-patte-vue/commit/dca114aacd461cbcbd90b2c07f76c0ded23709a8))
* **animals:** chips dans l'ordre de création, et non par nom ([7cfae49](https://github.com/GaelleBriet/memo-patte-vue/commit/7cfae49cfac0927eba073771318b28a603709f0d))
* **animals:** effacer la copie de la photo à la suppression d'un animal ([c4e8139](https://github.com/GaelleBriet/memo-patte-vue/commit/c4e81391358a1ef6df55fd93d2e689675b68fdb9))
* **animals:** effacer la copie de la photo quand l'animal est supprimé ([7e683b4](https://github.com/GaelleBriet/memo-patte-vue/commit/7e683b4be79c09e195586221943ce2ebf1fcf156)), closes [#268](https://github.com/GaelleBriet/memo-patte-vue/issues/268)
* **animals:** vaccins triés par urgence, sous-titre et états vides du Carnet ([e8e3764](https://github.com/GaelleBriet/memo-patte-vue/commit/e8e3764e56dcc1cbf4fdc9e4349b93e833585cdf))
* **auth:** dire « E-mail ou mot de passe incorrect » et nommer le refus du serveur ([70ee762](https://github.com/GaelleBriet/memo-patte-vue/commit/70ee762d818655700ba8fb1a1a9163b3ac05bf15))
* **auth:** effacement complet de la session et rafraîchissement refusé relu ([d67f56b](https://github.com/GaelleBriet/memo-patte-vue/commit/d67f56b5d84abd8335821886265b3f0ce7477800))
* **auth:** garder l'achat Plus et la préférence de rappel à la déconnexion ([eba939a](https://github.com/GaelleBriet/memo-patte-vue/commit/eba939a0ce53e6908350e67351c126476006bb9f)), closes [#287](https://github.com/GaelleBriet/memo-patte-vue/issues/287)
* **auth:** masquer le parcours compte sans configuration Supabase ([a910ed7](https://github.com/GaelleBriet/memo-patte-vue/commit/a910ed77ea920fbc26acf0c7b991480ca9b5ae24)), closes [#291](https://github.com/GaelleBriet/memo-patte-vue/issues/291)
* **auth:** ne plus agir sur un écran quitté, et rendre la connexion joignable ([0f5dbf4](https://github.com/GaelleBriet/memo-patte-vue/commit/0f5dbf4986109225aa1ff5004ab7c3af563888b9))
* **auth:** ne plus lire une trace d'erreur comme un booléen à la déconnexion ([c60306f](https://github.com/GaelleBriet/memo-patte-vue/commit/c60306f4fb42c3aa382788ad3adfa14ab69a7012)), closes [#287](https://github.com/GaelleBriet/memo-patte-vue/issues/287) [#288](https://github.com/GaelleBriet/memo-patte-vue/issues/288)
* **auth:** révoquer le jeton à la déconnexion et effacer l'état d'appareil ([7f32cd1](https://github.com/GaelleBriet/memo-patte-vue/commit/7f32cd1af4834ebced2089dd0e9a6ebaa13b2f43)), closes [#287](https://github.com/GaelleBriet/memo-patte-vue/issues/287)
* **form:** astérisque collée au libellé, unité et icône date visibles ([cf83eda](https://github.com/GaelleBriet/memo-patte-vue/commit/cf83eda030524526b038f80d64f5e565b4017fc8))
* **forms:** signaler une fiche illisible et bloquer l'enregistrement ([8a745b3](https://github.com/GaelleBriet/memo-patte-vue/commit/8a745b352a6406bb1ee652a084805e0e6c56bbde)), closes [#255](https://github.com/GaelleBriet/memo-patte-vue/issues/255)
* **home:** icône Paramètres sur la ligne du titre, tuiles et titre resserrés ([330738e](https://github.com/GaelleBriet/memo-patte-vue/commit/330738eb062c38ec6f3eac159245b0a438d566c7))
* **i18n:** insécables avant la ponctuation double en français ([a8ea470](https://github.com/GaelleBriet/memo-patte-vue/commit/a8ea47033f3484d3f4d93032f92c370ce78baf53))
* **i18n:** ne plus préfixer le nom du vaccin dans les rappels ([4b5b0bd](https://github.com/GaelleBriet/memo-patte-vue/commit/4b5b0bd5e525870d2b0b7aa46561d80d58802c0b))
* **i18n:** relecture d'ensemble de l'anglais ([4cb139f](https://github.com/GaelleBriet/memo-patte-vue/commit/4cb139fb107b1dd42dd4953af66aa5a98c87cc78))
* **i18n:** relecture d'ensemble des textes anglais et glossaire FR→EN ([35dafe1](https://github.com/GaelleBriet/memo-patte-vue/commit/35dafe1de19de3dc98dcea6b1479d3d9da70e67e))
* **logs:** résumer les erreurs Supabase au lieu de les journaliser entières ([a67a4c8](https://github.com/GaelleBriet/memo-patte-vue/commit/a67a4c86406ac73960a9bd64047927056eda450c)), closes [#288](https://github.com/GaelleBriet/memo-patte-vue/issues/288)
* **notifications:** annuler l'obsolète avant de programmer, jamais les deux à la fois ([7e900e1](https://github.com/GaelleBriet/memo-patte-vue/commit/7e900e1fac767bcecdbd1388c4d5b0dc026fa70b))
* **notifications:** désarmer les rappels quand la permission est retirée ([e16616a](https://github.com/GaelleBriet/memo-patte-vue/commit/e16616a5bc3796eadd9a7c8ae0d56b7db7a65aa0))
* **notifications:** fiabilité de la reconstruction des rappels ([6f9fcd1](https://github.com/GaelleBriet/memo-patte-vue/commit/6f9fcd1e37a7f94248cec20943238b98b5fd0411))
* **notifications:** programmer par lots avant d'annuler, un échec ne vide plus les rappels ([921ea4c](https://github.com/GaelleBriet/memo-patte-vue/commit/921ea4c8d0b01108af2bd495f1f32982ca4eecd7))
* **notifications:** réserver la première échéance de chaque entrée sous le plafond ([0f61509](https://github.com/GaelleBriet/memo-patte-vue/commit/0f61509da72dd92b4f77565e7b1979c6909633ee))
* **notifications:** une ligne de traitement invalide ne casse plus tous les rappels ([ecc62c9](https://github.com/GaelleBriet/memo-patte-vue/commit/ecc62c9bd96d55c12bb295774705096177f71ecf))
* **purchase:** bandeau « en pause » aligné sur la maquette et statut Plus cliquable ([cb0512e](https://github.com/GaelleBriet/memo-patte-vue/commit/cb0512e0991d210bd44a5ce6d60eefc709e21825))
* **purchase:** carte du rappel doux sans chrome de bouton, croix hors du flux ([9959655](https://github.com/GaelleBriet/memo-patte-vue/commit/99596551fa28a463b20224e2e10e68097d777cb6))
* **purchase:** échéance passée lue « aucun », disponibilité exposée, revérification tardive ignorée ([e08546a](https://github.com/GaelleBriet/memo-patte-vue/commit/e08546a88afa90d6ad093e656dc72d1538b1b005))
* **purchase:** finitions de l'écran Plus et des Paramètres ([3ef3ad1](https://github.com/GaelleBriet/memo-patte-vue/commit/3ef3ad1a394e161989ac1f69441697b40f2d00f5))
* **purchase:** l'offre annuelle en tête des trois offres ([da8e9e7](https://github.com/GaelleBriet/memo-patte-vue/commit/da8e9e72c2d13b8949aa789af935bfa8e50624da)), closes [#45](https://github.com/GaelleBriet/memo-patte-vue/issues/45)
* **purchase:** rappel doux tenu en session, nombre d'animaux lu du Carnet ([9ef30d1](https://github.com/GaelleBriet/memo-patte-vue/commit/9ef30d159378fcfa9db299e58d03f5a2035409da))
* **rappels:** annuler les rappels programmés quand la permission n'est plus accordée ([8b1579b](https://github.com/GaelleBriet/memo-patte-vue/commit/8b1579be470d68c9922ad7b754e093d647a6d224)), closes [#265](https://github.com/GaelleBriet/memo-patte-vue/issues/265)
* robustesse des formulaires, de l'export partagé, du routeur et des bornes de poids ([7593290](https://github.com/GaelleBriet/memo-patte-vue/commit/75932906eda6b09af6f7e94bfc1dd8672ce187c7))
* **router:** ramener à l'accueil toute adresse inconnue ([1b92640](https://github.com/GaelleBriet/memo-patte-vue/commit/1b92640c15facb26f29cc43d9de52af6c8110884)), closes [#257](https://github.com/GaelleBriet/memo-patte-vue/issues/257)
* **securite:** révocation de session, traces, clés PostHog, dépendances et entrée compte ([38982c6](https://github.com/GaelleBriet/memo-patte-vue/commit/38982c6aa70d9007c4cabf3f6632cee4bb9898af))
* **settings:** dire pourquoi un import est refusé quand un poids sort des bornes ([0e4d7bc](https://github.com/GaelleBriet/memo-patte-vue/commit/0e4d7bc004f01bf3d2f555276d661932f5bcd498)), closes [#258](https://github.com/GaelleBriet/memo-patte-vue/issues/258)
* **settings:** effacer l'export du cache après partage et restreindre le FileProvider ([4d2b205](https://github.com/GaelleBriet/memo-patte-vue/commit/4d2b2054ee64b06aa2e5b4538728f749ac54ac0d)), closes [#256](https://github.com/GaelleBriet/memo-patte-vue/issues/256)
* **settings:** garder l'export partagé jusqu'au lancement suivant ([10aa66b](https://github.com/GaelleBriet/memo-patte-vue/commit/10aa66b6aa43da164a6ec7e1403bf909812b3624)), closes [#256](https://github.com/GaelleBriet/memo-patte-vue/issues/256)
* **settings:** garder les règles du switch dans le bloc scopé, sortir les lignes dans styles/ ([3fe9cbf](https://github.com/GaelleBriet/memo-patte-vue/commit/3fe9cbf54b821160d283ee57f8edeb73b3ec2c02))
* **supabase:** remettre le contrôle de configuration dans le client ([7b1af87](https://github.com/GaelleBriet/memo-patte-vue/commit/7b1af8711b2276f4b016e081ac2dfbbd8d2d21d1)), closes [#291](https://github.com/GaelleBriet/memo-patte-vue/issues/291)
* **treatments:** « Créer » comme les deux autres formulaires, exemple de fréquence ([9b5b7a9](https://github.com/GaelleBriet/memo-patte-vue/commit/9b5b7a91db03d9a4116dffd36958b580dc40cdb0))
* **treatments:** dire le plafond de fréquence au lieu de la croire absente ([02e2ad8](https://github.com/GaelleBriet/memo-patte-vue/commit/02e2ad86264dbe0ea217d6b473301b04d5eb3868))
* **ui:** barre du bas réservée aux écrans racine et teinte de la feuille d'animaux ([31402b4](https://github.com/GaelleBriet/memo-patte-vue/commit/31402b4361169a27577a2d8721bcd10dce33203c))
* **ui:** conformité aux maquettes sur l'accueil, le carnet et les formulaires ([89f559e](https://github.com/GaelleBriet/memo-patte-vue/commit/89f559e21a7071462990d6bb791befb7a439b69e))
* **ui:** flèche de retour sur la ligne du titre des écrans poussés ([33d467c](https://github.com/GaelleBriet/memo-patte-vue/commit/33d467c2dee930a0815caa4890362df520b8dcdd))
* **ui:** masquer la barre du bas sur les écrans poussés ([d3d82d7](https://github.com/GaelleBriet/memo-patte-vue/commit/d3d82d7b05e42ea92948ec9b2bd81c34242714f9))
* **ui:** ne plus couper un titre de ligne en plein milieu d'un mot ([bfdc07c](https://github.com/GaelleBriet/memo-patte-vue/commit/bfdc07c351ad61bbb38fc38da7d6309138f77123))
* **ui:** partager toute la largeur entre les deux onglets de la barre du bas ([4e0ec4f](https://github.com/GaelleBriet/memo-patte-vue/commit/4e0ec4fc612a6b69a6947651789a416be78bef0d))
* **ui:** porter au Carnet la ligne qui ne coupe plus les mots ([325bcbf](https://github.com/GaelleBriet/memo-patte-vue/commit/325bcbf2b51dab3dce16a1ff21aaef757321c019))
* **vaccinations:** mois de validité localisé et « valide jusqu'à » ([0160cdf](https://github.com/GaelleBriet/memo-patte-vue/commit/0160cdff0add0f63c78f54c075f0e2310d461a3a))
* **validation:** borner le poids à 200 kg à la saisie comme à l'import ([abe304d](https://github.com/GaelleBriet/memo-patte-vue/commit/abe304d483d69fe8b08f35d9061de230228d2d70)), closes [#258](https://github.com/GaelleBriet/memo-patte-vue/issues/258)
* **weight:** rendre au pied du suivi de poids sa zone de gestes ([f90ca7f](https://github.com/GaelleBriet/memo-patte-vue/commit/f90ca7fff3ad52d0653d14773bce97dca02d3ac0))


### ⚡ Performance

* **notifications:** annuler les rappels d'une entrée en un seul appel natif ([e0f07ac](https://github.com/GaelleBriet/memo-patte-vue/commit/e0f07acf77624f1bf0a31a966490b28264a44a1b))

## [0.1.26](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.25...memo-patte-v0.1.26) (2026-09-15)


### ✨ Fonctionnalités

* **home:** importer un export depuis l'écran de bienvenue ([ed3b202](https://github.com/GaelleBriet/memo-patte-vue/commit/ed3b202b49e0ae270ee834c36cabcbb781e867f0))
* **home:** importer un export depuis l'écran de bienvenue ([a502202](https://github.com/GaelleBriet/memo-patte-vue/commit/a5022026b70dbecd2094a4cdd93454e7247c5973))
* **notifications:** écran d'explication au lancement quand le carnet a des échéances ([70f6177](https://github.com/GaelleBriet/memo-patte-vue/commit/70f6177f57065fca2bd269eb2be752e206219789))
* **notifications:** proposer l'explication au lancement si des échéances arrivent ([ab4cfcd](https://github.com/GaelleBriet/memo-patte-vue/commit/ab4cfcdd3296167e184b02791925b7e6b29c05ec))
* **repositories:** versions, suppression globale et restauration pour l'import ([16d21a7](https://github.com/GaelleBriet/memo-patte-vue/commit/16d21a7b99c904794d83b370457e4e64ed1ad536))
* **settings:** écran Paramètres et export des données en JSON et CSV ([a4f30b3](https://github.com/GaelleBriet/memo-patte-vue/commit/a4f30b3e1d85a44800f99f86c45070de4973e7f3))
* **settings:** écran Paramètres et export des données en JSON et CSV ([26918a6](https://github.com/GaelleBriet/memo-patte-vue/commit/26918a6a53763f5c80818bb929274f898794bb60)), closes [#80](https://github.com/GaelleBriet/memo-patte-vue/issues/80) [#48](https://github.com/GaelleBriet/memo-patte-vue/issues/48)
* **settings:** importer un export JSON MémoPatte (fusionner ou remplacer) ([09920d5](https://github.com/GaelleBriet/memo-patte-vue/commit/09920d59ce2d4ee991319d2b69d68ba5ce9b4246))
* **settings:** importer un export JSON MémoPatte, en fusion ou en remplacement ([d29044b](https://github.com/GaelleBriet/memo-patte-vue/commit/d29044b60755cddc20dc22a85963a97a172a3a21)), closes [#84](https://github.com/GaelleBriet/memo-patte-vue/issues/84)


### 🐛 Corrections

* **a11y:** annonces du toast, état des chips et focus sur le champ refusé ([36c90e4](https://github.com/GaelleBriet/memo-patte-vue/commit/36c90e403f75a6bab116dab9adb58e549ab63c11))
* **carnet:** quitter les formulaires par replace pour que le retour ne les rouvre pas ([d61d590](https://github.com/GaelleBriet/memo-patte-vue/commit/d61d5903bb40959fccf2036c0cf8fc957589d0c0)), closes [#226](https://github.com/GaelleBriet/memo-patte-vue/issues/226)
* **carnet:** revenir sur l'animal concerné après un enregistrement ([0e5037c](https://github.com/GaelleBriet/memo-patte-vue/commit/0e5037c8ada3c32e2c7eca884319f5de447e1501))
* **carnet:** revenir sur l'animal du formulaire après un vaccin, un traitement ou un ajout ([ef387e3](https://github.com/GaelleBriet/memo-patte-vue/commit/ef387e318f3ca3dabae282c863fcf8eac32eb088)), closes [#226](https://github.com/GaelleBriet/memo-patte-vue/issues/226)
* **notifications:** canal « Rappels » dédié et coupure du canal traitée comme désactivée ([e7e7cb8](https://github.com/GaelleBriet/memo-patte-vue/commit/e7e7cb8c4c568d006c692dc02f591874569faa83)), closes [#225](https://github.com/GaelleBriet/memo-patte-vue/issues/225)
* **notifications:** canal Android « Rappels » et détection d'un canal coupé ([abcb091](https://github.com/GaelleBriet/memo-patte-vue/commit/abcb091ed8210e9e09e5591ba810278cd8b747b0))
* **notifications:** limiter l'explication au lancement à l'appareil ([eb1a22f](https://github.com/GaelleBriet/memo-patte-vue/commit/eb1a22f0f3df9751d2f894418da6d8f6483a3cea))
* **notifications:** passer par le canal « Rappels » dans scheduleReminders ([6cb3cf6](https://github.com/GaelleBriet/memo-patte-vue/commit/6cb3cf699dbc667e7683bc465d3e0c2f0aa97d9f))
* **settings:** dates d'import, validation stricte, carnet restauré et explication des rappels ([f2df70b](https://github.com/GaelleBriet/memo-patte-vue/commit/f2df70bb814f5181fbbb2f274aced8fe7a97ae65))
* **settings:** neutraliser les formules de tableur dans le CSV exporté ([d419459](https://github.com/GaelleBriet/memo-patte-vue/commit/d419459ae1bb52be20049972c7d7cf7f90dc9143))
* **settings:** signaler l'échec de lecture des animaux et écarter le spinner d'export ([416c377](https://github.com/GaelleBriet/memo-patte-vue/commit/416c3776a342b84cb94a50a9f12803821ee0c647))
* **shared:** chips en boutons radio quand un animal est toujours choisi ([1d04858](https://github.com/GaelleBriet/memo-patte-vue/commit/1d04858c6a7bc48794b26622bdf70705d541c7ad))
* **shared:** zones de tap de 48 px sans changement de rendu ([915d8c5](https://github.com/GaelleBriet/memo-patte-vue/commit/915d8c520a0da0f00ded2710abe9b04d87e5db9c))
* **theme:** textes secondaires au contraste AA et bordures de contrôle assombries ([a24b716](https://github.com/GaelleBriet/memo-patte-vue/commit/a24b716f0bbbd4c5e48615e5b9a37504b0068d37))
* **ui:** aucun texte sous 12 px, valeurs de la courbe comprises ([67e4450](https://github.com/GaelleBriet/memo-patte-vue/commit/67e4450ad375911867f813ed173ad257bf3e0611))
* **ui:** textes agrandis par la police système sans débordement ([fa89f05](https://github.com/GaelleBriet/memo-patte-vue/commit/fa89f05911d680f0397908ee165cd03532581cbd))

## [0.1.25](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.24...memo-patte-v0.1.25) (2026-09-15)


### ✨ Fonctionnalités

* **notifications:** rappels des vaccins et traitements (J-3, jour J, relance J+3) ([89b5188](https://github.com/GaelleBriet/memo-patte-vue/commit/89b51880c38b8edf6db9d4873c1d1dc0f3009d5e))
* **notifications:** synchroniser les rappels dès que la permission est accordée ([4ede26d](https://github.com/GaelleBriet/memo-patte-vue/commit/4ede26d3949321a9886927d531d9e97592b8205d))


### 🐛 Corrections

* **notifications:** première échéance toujours programmée et correctifs de re-revue ([f1df3be](https://github.com/GaelleBriet/memo-patte-vue/commit/f1df3bee6b11d6212f7b405f52671f82510d9bfb))

## [0.1.24](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.23...memo-patte-v0.1.24) (2026-09-15)


### ✨ Fonctionnalités

* **notifications:** écran d'explication avant la permission et bandeau « rappels désactivés » ([4076778](https://github.com/GaelleBriet/memo-patte-vue/commit/4076778c6046fb43024f4173bd5ee5fbdffa719a))
* **notifications:** écran d'explication avant la popup système et bandeau « rappels désactivés » ([b1b8088](https://github.com/GaelleBriet/memo-patte-vue/commit/b1b808830cc2240eab13fe2a5223d06302134916)), closes [#11](https://github.com/GaelleBriet/memo-patte-vue/issues/11) [#12](https://github.com/GaelleBriet/memo-patte-vue/issues/12)
* **notifications:** état de la permission, demande après explication et abonnement à l'accord ([3e5421c](https://github.com/GaelleBriet/memo-patte-vue/commit/3e5421c9a80040104798e081852704a7eba28a34))


### 🐛 Corrections

* **notifications:** ne rien programmer sans permission et ignorer une lecture dépassée ([1c10118](https://github.com/GaelleBriet/memo-patte-vue/commit/1c101189b25892a28729b92e4d4997edaac5b66b))
* **notifications:** pas de puce « … de » sans prénom et spec App sans erreur non gérée ([08783a3](https://github.com/GaelleBriet/memo-patte-vue/commit/08783a31d86e3e29a477e65a7b4faaf19ac1a710))

## [0.1.23](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.22...memo-patte-v0.1.23) (2026-09-15)


### ✨ Fonctionnalités

* **i18n:** interface en anglais selon la langue du système ([3311597](https://github.com/GaelleBriet/memo-patte-vue/commit/33115973931b1d22b14256f3a2d2ee002fd50f4b))
* **i18n:** interface en anglais selon la langue du système ([77f7c69](https://github.com/GaelleBriet/memo-patte-vue/commit/77f7c6948e5a114202ded9f4aec263ef7156f30a))


### 🐛 Corrections

* **app:** le bouton retour Android ferme la feuille ouverte au lieu de quitter l'écran ([1312be9](https://github.com/GaelleBriet/memo-patte-vue/commit/1312be99dc3f9c76bf609b24d430a057a67a9abf))
* **app:** le retour Android ferme la feuille ouverte au lieu de quitter l'écran ([4081035](https://github.com/GaelleBriet/memo-patte-vue/commit/4081035169661a7322e369cdc3e4e20d9decff0c))
* **i18n:** nom du vaccin tel que saisi dans les rappels en anglais ([76c8333](https://github.com/GaelleBriet/memo-patte-vue/commit/76c8333733aec2690fbb53b9147b63c98b676841))

## [0.1.22](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.21...memo-patte-v0.1.22) (2026-09-15)


### ✨ Fonctionnalités

* **animals:** gérer la photo par appui long sur l'avatar du Carnet ([47b96ec](https://github.com/GaelleBriet/memo-patte-vue/commit/47b96eccf0acfbf0c1935812ffc5cb9fd57e2fd2))
* **animals:** photo de profil via le Photo Picker Android ([9faf42f](https://github.com/GaelleBriet/memo-patte-vue/commit/9faf42fadfb9e1b59122be8c33fc06dfa0293b22))
* **animals:** photo de profil via le Photo Picker Android ([12a405c](https://github.com/GaelleBriet/memo-patte-vue/commit/12a405cc992bdffb440302256b1dd9d68ac0c6b1)), closes [#101](https://github.com/GaelleBriet/memo-patte-vue/issues/101)


### 🐛 Corrections

* **animals:** forcer le sélecteur de photo en sélection unique ([6af9dc2](https://github.com/GaelleBriet/memo-patte-vue/commit/6af9dc24ca76d40a02cfad9094b72e04a522181c))
* **animals:** libellé « Gérer la photo de {name} » sur l'avatar du Carnet ([fe9ba5c](https://github.com/GaelleBriet/memo-patte-vue/commit/fe9ba5c1cf9cfb03f512788529f70a24348ffa6a))
* **animals:** ouvrir la feuille photo au clavier et lui rendre le focus de l'avatar ([9416831](https://github.com/GaelleBriet/memo-patte-vue/commit/9416831b33b5638da0a1d12b1320eb9eeb900d14))
* **animals:** photo absente après restauration, double tap et copie en cache ([d8530fb](https://github.com/GaelleBriet/memo-patte-vue/commit/d8530fb5d8e256fa12947eccaf5f56e8ced06283))
* **i18n:** garder le texte vide autorisé, comme alt="" décoratif ([9d3897a](https://github.com/GaelleBriet/memo-patte-vue/commit/9d3897a0f80384a684cd8a4a9029513a21fa03af))
* **i18n:** tolérer chiffres et ponctuation seuls, fermer les motifs de clés dynamiques ([d5f6d13](https://github.com/GaelleBriet/memo-patte-vue/commit/d5f6d13c277ca4feb813dae09f2b2db95f60cfd7))

## [0.1.21](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.20...memo-patte-v0.1.21) (2026-09-15)


### 🐛 Corrections

* **lint:** imports relatifs et dossier seul entre features interdits, spec de lint accéléré ([19308e0](https://github.com/GaelleBriet/memo-patte-vue/commit/19308e0f044f61b73d5d9b744df16e0c1327c76a))

## [0.1.20](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.19...memo-patte-v0.1.20) (2026-09-14)


### 🐛 Corrections

* **theme:** une seule teinte de retard, bandeau de l'accueil compris ([7dfc1c4](https://github.com/GaelleBriet/memo-patte-vue/commit/7dfc1c4a2c474790f50034664f4846d37287ddea))
* **weight:** feuille pesée sans animal, seule l'erreur d'animal s'affiche ([30f6e81](https://github.com/GaelleBriet/memo-patte-vue/commit/30f6e814b1388c12a31bd7e9b8b4d1d3b7a7dd1f))
* **weight:** feuille pesée sans animal, seule l'erreur du sélecteur s'affiche ([8e6ddea](https://github.com/GaelleBriet/memo-patte-vue/commit/8e6ddead40a2fde6fa7ac7cfb7d349730a3d7efc)), closes [#192](https://github.com/GaelleBriet/memo-patte-vue/issues/192)

## [0.1.19](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.18...memo-patte-v0.1.19) (2026-09-14)


### 🐛 Corrections

* **a11y:** nom accessible et retour du focus sur les feuilles modales ([89d3afd](https://github.com/GaelleBriet/memo-patte-vue/commit/89d3afd9a2d36595ba2a08527d4a0884b8269a89))
* **forms:** date maximale recalculée au changement de jour ([74cc988](https://github.com/GaelleBriet/memo-patte-vue/commit/74cc9885a099bd73cd3d3b34bbe068e444fd1c0f))
* **forms:** date maximale recalculée au retour au premier plan ([033a816](https://github.com/GaelleBriet/memo-patte-vue/commit/033a8163aa423416e8a12f2b4dc007fafb45df8e)), closes [#190](https://github.com/GaelleBriet/memo-patte-vue/issues/190)
* **home:** l'Accueil vide ne défile plus ([ae4e7e1](https://github.com/GaelleBriet/memo-patte-vue/commit/ae4e7e12e668fe752fc49210e1e78176377af86c))
* **home:** la bienvenue remplit l'écran sans défiler de 24 px ([5f2d666](https://github.com/GaelleBriet/memo-patte-vue/commit/5f2d66603cb4c728110e78e06070172206e0e4f8))
* **shared:** nommer les feuilles modales par leur titre et rendre le focus à leur bouton d'ouverture ([e62700a](https://github.com/GaelleBriet/memo-patte-vue/commit/e62700aaa48ef2578702a1561b6a65dbef0a26e7)), closes [#181](https://github.com/GaelleBriet/memo-patte-vue/issues/181)
* **shared:** pas de repère banner dans la feuille modale, déclencheur capturé dès le montage ([6d63ced](https://github.com/GaelleBriet/memo-patte-vue/commit/6d63cedaeae7042882d9ffd4a282dec6500eeef8))

## [0.1.18](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.17...memo-patte-v0.1.18) (2026-09-14)


### 🐛 Corrections

* **app:** rafraîchir l'accueil et le Carnet au retour au premier plan ([2e25322](https://github.com/GaelleBriet/memo-patte-vue/commit/2e25322fa3be901d6dd6ced8ffb076ab276a7521)), closes [#168](https://github.com/GaelleBriet/memo-patte-vue/issues/168)
* **app:** rafraîchir les écrans au retour au premier plan ([3c89a01](https://github.com/GaelleBriet/memo-patte-vue/commit/3c89a014ca2d13a899d161a95fb8ceaa8e574df4))
* **carnet:** réafficher la liste après une écriture qui suit un chargement en échec ([071aec2](https://github.com/GaelleBriet/memo-patte-vue/commit/071aec2b4b11cbbcb7b9ee296d4464918f5bbac9))
* **carnet:** relire vaccins, traitements et pesées au retour sans vider l'affichage ([9baad53](https://github.com/GaelleBriet/memo-patte-vue/commit/9baad530757b5747b788a0544b6f6e0134a369a5))
* **ci:** keep-alive Supabase qui exécute une requête Postgres ([7f3e138](https://github.com/GaelleBriet/memo-patte-vue/commit/7f3e1384384abfc8c5aea0155e110c50479d17f9))
* **ci:** keep-alive Supabase qui exécute une requête Postgres ([f7af078](https://github.com/GaelleBriet/memo-patte-vue/commit/f7af078567dbd146d3ba2e88767f82f164dc5c52))
* **db:** ne pas rouvrir une connexion retrouvée déjà ouverte ([d738318](https://github.com/GaelleBriet/memo-patte-vue/commit/d738318aef483456163ab4a57f59e65583eb2b88)), closes [#196](https://github.com/GaelleBriet/memo-patte-vue/issues/196)
* **db:** rouvrir la base après un rechargement de la WebView ([b463879](https://github.com/GaelleBriet/memo-patte-vue/commit/b463879957a7c59ec077da89a1544bbfd8aa8f6f))
* **db:** rouvrir la base après un rechargement de la WebView ([6d77009](https://github.com/GaelleBriet/memo-patte-vue/commit/6d77009d1fdbcd0a76f765ce9651ae817a1d411c)), closes [#196](https://github.com/GaelleBriet/memo-patte-vue/issues/196)
* **shared:** bordure rouge sur un champ de formulaire en erreur ([185d2dc](https://github.com/GaelleBriet/memo-patte-vue/commit/185d2dc6d48e9fd0834249e9e17a836d3d987a79))
* **shared:** bordure rouge sur un champ de formulaire en erreur ([2791d18](https://github.com/GaelleBriet/memo-patte-vue/commit/2791d18c7681c026951e6fa8ec5d876e248ea705)), closes [#184](https://github.com/GaelleBriet/memo-patte-vue/issues/184)
* **shared:** borner l'écran poussé à la zone utile de v-main ([9b3d074](https://github.com/GaelleBriet/memo-patte-vue/commit/9b3d0745db4bf7fc099b3274f9266d2f87c93f2f)), closes [#185](https://github.com/GaelleBriet/memo-patte-vue/issues/185)
* **shared:** écran poussé partagé borné à la zone utile de v-main ([fb9294d](https://github.com/GaelleBriet/memo-patte-vue/commit/fb9294dd7accfc8357f3d4fd68fc0cec7deaa3e4))
* **shared:** garder le champ focalisé sous la top bar d'un écran poussé ([25fee4b](https://github.com/GaelleBriet/memo-patte-vue/commit/25fee4b2e90b6a71c8b456e86a28091214a9fc6e)), closes [#185](https://github.com/GaelleBriet/memo-patte-vue/issues/185)
* **shared:** pas de bordure rouge sur un champ désactivé en erreur ([5af70b9](https://github.com/GaelleBriet/memo-patte-vue/commit/5af70b9f96f64fd71885c3da79e74e814e0620ff)), closes [#184](https://github.com/GaelleBriet/memo-patte-vue/issues/184)
* **stores:** ignorer la réponse d'un chargement dépassé par un autre animal ([430118e](https://github.com/GaelleBriet/memo-patte-vue/commit/430118e5078baa3b119aa382895b77370d525edd))

## [0.1.17](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.16...memo-patte-v0.1.17) (2026-09-13)


### ✨ Fonctionnalités

* **home:** choisir l'animal visé par une action rapide ([3303270](https://github.com/GaelleBriet/memo-patte-vue/commit/330327012497144c1c006613b1def9518a7d8fef))
* **home:** feuille « Pour quel animal ? » des actions rapides ([395263c](https://github.com/GaelleBriet/memo-patte-vue/commit/395263c78eb41218d29779ba314b49edfac90e04))
* **home:** section Actions rapides ([059a9f1](https://github.com/GaelleBriet/memo-patte-vue/commit/059a9f1b3cf91035bd3a616a02b41ef881869aaf))
* **home:** section Actions rapides sur l'accueil ([da9e45f](https://github.com/GaelleBriet/memo-patte-vue/commit/da9e45f50bba4a3cbe50f615ff4d21ff69f38851))
* **shared:** composable de validation qui revalide après le premier envoi ([33b1e45](https://github.com/GaelleBriet/memo-patte-vue/commit/33b1e45db7555743362ee6a90f20d230bc6fa88c))
* **weight:** dire qu'un animal est introuvable sur le suivi de poids ([bdf07ce](https://github.com/GaelleBriet/memo-patte-vue/commit/bdf07ce7434443d895e1866dd4fd43b72010a479))
* **weight:** écran « Suivi de poids » ([#31](https://github.com/GaelleBriet/memo-patte-vue/issues/31)) ([1217bb1](https://github.com/GaelleBriet/memo-patte-vue/commit/1217bb1a5d3f2baf14768f6677b22d7707ad9e4e))
* **weight:** écran « Suivi de poids » ([#31](https://github.com/GaelleBriet/memo-patte-vue/issues/31)) ([eeda0ef](https://github.com/GaelleBriet/memo-patte-vue/commit/eeda0ef17d89b0992bdbccd13ba20c753d4b55d4))
* **weight:** indicateur de chargement et bouton Réessayer sur le suivi de poids ([0db9b1c](https://github.com/GaelleBriet/memo-patte-vue/commit/0db9b1cff4909be4d2c08c98b6b8d1b4946508d0))
* **weight:** lien « Voir l'historique » dans la carte poids du Carnet ([f47f3c9](https://github.com/GaelleBriet/memo-patte-vue/commit/f47f3c950bfaeef803e0714dede0899cf68f9279))
* **weight:** module pur de l'historique de poids ([26aa740](https://github.com/GaelleBriet/memo-patte-vue/commit/26aa740846bb88da0c1911b989a419d7b09cda24))


### 🐛 Corrections

* **animals:** effacer l'erreur d'un champ dès qu'il est corrigé ([57db844](https://github.com/GaelleBriet/memo-patte-vue/commit/57db844d005273c47f0dbe35a9a87728be3642cb))
* **home:** ignorer une sélection absente du foyer pour les actions rapides ([44196bb](https://github.com/GaelleBriet/memo-patte-vue/commit/44196bb13b84d429223bdb3f9bab0c65b9be56b9))
* **home:** tuiles d'action rapide en boutons natifs ([52f7048](https://github.com/GaelleBriet/memo-patte-vue/commit/52f7048fd8fd24baf300b5a01370f5441f072eb8))
* **shared:** anneau de chip en bordure, focus clavier de nouveau visible ([861fd4f](https://github.com/GaelleBriet/memo-patte-vue/commit/861fd4f0b29462166b5da8c2d9ad6ccea2848b2d))
* **shared:** anneau, filet d'avatar et espacement des chips animaux ([859ecd1](https://github.com/GaelleBriet/memo-patte-vue/commit/859ecd154911b2f5505ab5c02cb82894bef3317f))
* **shared:** chips animaux conformes à la maquette, props hideAdd et inline ([b548204](https://github.com/GaelleBriet/memo-patte-vue/commit/b548204ef8e4957816b86bf3cbe94ac58e223e0e))
* **shared:** erreurs de formulaire effacées à la correction, option cochée lisible ([cd23a72](https://github.com/GaelleBriet/memo-patte-vue/commit/cd23a72b93d7c86f540faa731389b88bf4d2d9d8))
* **shared:** icône d'erreur remplie sous les champs, comme la maquette ([fceb5ca](https://github.com/GaelleBriet/memo-patte-vue/commit/fceb5cad2f33883c7d14573e6163b83921a159b1))
* **shared:** ni contour ni voile de focus sur les chips animaux ([a1595af](https://github.com/GaelleBriet/memo-patte-vue/commit/a1595aff07fa49f1fc4b416c759d75bf1a37270a))
* **shared:** onglet actif de la barre du bas sans fond gris ([7fdf6f6](https://github.com/GaelleBriet/memo-patte-vue/commit/7fdf6f66a4083488f33b4965944ce6d685423b76))
* **shared:** retirer le voile gris des onglets de la barre du bas ([3d00906](https://github.com/GaelleBriet/memo-patte-vue/commit/3d00906fd55280ce7efdcf63f2c9caa6220af9bb)), closes [#169](https://github.com/GaelleBriet/memo-patte-vue/issues/169)
* **shared:** texte et coche blanc cassé sur l'option cochée du sélecteur à boutons ([587fa48](https://github.com/GaelleBriet/memo-patte-vue/commit/587fa480af1acf0d60fd9b9bb6b8686432e9a859))
* **treatments:** effacer l'erreur d'un champ dès qu'il est corrigé ([684dd65](https://github.com/GaelleBriet/memo-patte-vue/commit/684dd6534d98e623e5b3579552c40c57d6b628e1))
* **vaccinations:** effacer l'erreur d'un champ dès qu'il est corrigé ([e35192a](https://github.com/GaelleBriet/memo-patte-vue/commit/e35192abee2a5eea0a49cfbd3ba0773fb86fa46e))
* **weight:** borner le suivi de poids à la fenêtre pour garder le bouton d'ajout visible ([d559631](https://github.com/GaelleBriet/memo-patte-vue/commit/d559631720d62d2ce779bea9970f9915378444bf))
* **weight:** effacer l'erreur d'un champ de la feuille pesée dès qu'il est corrigé ([0c74109](https://github.com/GaelleBriet/memo-patte-vue/commit/0c7410993fd98265462ae49a45bc5ead29350229))
* **weight:** garder les pesées affichées pendant une écriture ([6538655](https://github.com/GaelleBriet/memo-patte-vue/commit/6538655fb401221572f0edf2bafd84e9e8f4512e))
* **weight:** zone de tap de 48 px pour « Voir l'historique » ([f3848b1](https://github.com/GaelleBriet/memo-patte-vue/commit/f3848b109d0440ca2418b37e15025a2a7f714860))

## [0.1.16](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.15...memo-patte-v0.1.16) (2026-09-13)


### ✨ Fonctionnalités

* **db:** remise à zéro physique de toutes les tables pour les outils de dev ([b0c0df4](https://github.com/GaelleBriet/memo-patte-vue/commit/b0c0df45f64f327c212d85ac91f4c8d78e9df0b4))
* **dev:** jeu de fixtures Milo + Luna piloté par VITE_FIXTURES ([ee6ffe6](https://github.com/GaelleBriet/memo-patte-vue/commit/ee6ffe63c7a94b6578921f8aaf4e873ed2f5d17d))
* **dev:** scripts dev / dev:data et application des fixtures avant le montage ([7c3bf9d](https://github.com/GaelleBriet/memo-patte-vue/commit/7c3bf9d3c4fb3ae21e6116de9f56d33099151267))
* **home:** écran d'accueil conforme à la maquette v2 (5 états) ([5f19b15](https://github.com/GaelleBriet/memo-patte-vue/commit/5f19b157b619b2ff7e6560f962e75cda9c4ed19b))
* **home:** écran d'accueil conforme à la maquette v2 (5 états) ([8a948f0](https://github.com/GaelleBriet/memo-patte-vue/commit/8a948f0940095123b05b2bc2d89a478189741574)), closes [#36](https://github.com/GaelleBriet/memo-patte-vue/issues/36)
* **home:** libellés et compteurs de l'accueil ([8420ead](https://github.com/GaelleBriet/memo-patte-vue/commit/8420eadff113de2df6ec8192711bfc3f93a07aba))
* **home:** service et store des rappels de l'accueil ([618903e](https://github.com/GaelleBriet/memo-patte-vue/commit/618903e360f33179a7676d1b3e7afcbbf5ece741))
* **rappels:** lister vaccins et traitements de tous les animaux ([fe57828](https://github.com/GaelleBriet/memo-patte-vue/commit/fe578289a3fae566605f0c3aee425649f1a88dd1))
* **shared:** relier chaque contrôle de formulaire à son message d'erreur ([620ef9a](https://github.com/GaelleBriet/memo-patte-vue/commit/620ef9aa36afd79218def91ef20467db61b8d618))
* **treatments:** choisir l'unité de fréquence par boutons sur sa propre ligne ([f56676e](https://github.com/GaelleBriet/memo-patte-vue/commit/f56676edb5693f2d7f6bbd46a3bfc28dccecb0e0))
* **treatments:** écran d'ajout et d'édition d'un traitement ([0075863](https://github.com/GaelleBriet/memo-patte-vue/commit/0075863266c5fe1c5a9feea5927ccf452ff6c521))
* **treatments:** formulaire d'ajout et d'édition d'un traitement ([d53afb4](https://github.com/GaelleBriet/memo-patte-vue/commit/d53afb4dc02feb949c3f97e4bfc9eab16eda9583))
* **treatments:** ligne « ajouter un traitement » dans la carte du carnet ([f34b82b](https://github.com/GaelleBriet/memo-patte-vue/commit/f34b82b2ee141d1585fd1fda38b9586934d9ff73))
* **treatments:** logique du formulaire traitement et aperçu de la prochaine dose ([6bfb57a](https://github.com/GaelleBriet/memo-patte-vue/commit/6bfb57a728e3d0999b8b77561e3ada9a281b201d))
* **weight:** feuille modale de saisie rapide d'une pesée ([eff3d74](https://github.com/GaelleBriet/memo-patte-vue/commit/eff3d7435c3800bfc3c82df66e09552d718dfba4))
* **weight:** ligne « Ajouter une pesée » dans la carte du Carnet ([4efd5a1](https://github.com/GaelleBriet/memo-patte-vue/commit/4efd5a12a8ee464f3d650692b3c5415ab9c33427))
* **weight:** saisie rapide d'une pesée (feuille modale) ([d0c14da](https://github.com/GaelleBriet/memo-patte-vue/commit/d0c14dad89a48e4426a1509c29a42d3eb83ee396))
* **weight:** validation du formulaire de pesée ([eb411cd](https://github.com/GaelleBriet/memo-patte-vue/commit/eb411cd430684c9c1fc5f91c5e742d9e4f13d3eb))


### 🐛 Corrections

* **build:** contrôler le dist sur des marqueurs techniques, pas des noms de démo ([04c9802](https://github.com/GaelleBriet/memo-patte-vue/commit/04c9802ca8eefe84f4582a78a0d051ceb814fa8f))
* **dev:** rythme annuel propre pour le CHPPi de démo ([5301298](https://github.com/GaelleBriet/memo-patte-vue/commit/5301298a21e3da29a0cd131b7fccaf349d374909))
* **home:** ne plus afficher de header pétrole vide pendant le chargement ([78077a3](https://github.com/GaelleBriet/memo-patte-vue/commit/78077a3c5be1b79a368cdf57484de32a38cfb80a))
* **home:** ouvrir l'accueil sur tous les animaux à chaque arrivée ([8e2f7ce](https://github.com/GaelleBriet/memo-patte-vue/commit/8e2f7ce89e9603c4001666494f045941ecb05b54))
* **home:** ouvrir le Carnet depuis « Ajouter un vaccin ou un traitement » ([575e366](https://github.com/GaelleBriet/memo-patte-vue/commit/575e3665e65a41aebfdda4e261edafe5aad12bec))
* **shared:** garder la hauteur de la top bar d'un formulaire sans sous-titre ([cde6b83](https://github.com/GaelleBriet/memo-patte-vue/commit/cde6b83eabeed1cf945354c4680056b05a93403c))
* **treatments:** accorder « tous les » / « toutes les » à l'unité de fréquence ([c520096](https://github.com/GaelleBriet/memo-patte-vue/commit/c52009697db2b1824bad9fe0ce30b831fa300142))
* **weight:** borne de date recalculée à chaque ouverture de la feuille ([54bd4a8](https://github.com/GaelleBriet/memo-patte-vue/commit/54bd4a8e2ba7e4e7d82c79e51f1dbcb969c59121))
* **weight:** focus sur le poids à l'ouverture quand l'animal est connu ([68f624a](https://github.com/GaelleBriet/memo-patte-vue/commit/68f624abca0bd696c57a98f6b24a34b8198891db))
* **weight:** le voile ne ferme pas la feuille pendant l'enregistrement ([83add45](https://github.com/GaelleBriet/memo-patte-vue/commit/83add45e690c9425e20a0aea16c83e79f2f25f67))
* **weight:** suffixe kg visible, bordures focus et erreur, erreur animal effacée au choix ([cd26d32](https://github.com/GaelleBriet/memo-patte-vue/commit/cd26d329c2fc640a2094f71f8e8a6f6f4e12e765))
* **weight:** zone de tap de 44 px pour la poignée de la feuille ([0c137f9](https://github.com/GaelleBriet/memo-patte-vue/commit/0c137f9f7060e6b1296f9ac7e51332ee6270c505))

## [0.1.15](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.14...memo-patte-v0.1.15) (2026-09-09)


### 🐛 Corrections

* **carnet:** états de chargement et d'erreur, jamais d'écran blanc ([3bf7470](https://github.com/GaelleBriet/memo-patte-vue/commit/3bf74703f5762c3396e1c74f4874fce6d678a513))

## [0.1.14](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.13...memo-patte-v0.1.14) (2026-09-09)


### ✨ Fonctionnalités

* **animals:** écran Carnet, profil détaillé de l'animal consulté ([0c9ba7a](https://github.com/GaelleBriet/memo-patte-vue/commit/0c9ba7a691c72f940abeb6b1b339866dfd588d19))
* **animals:** écran Carnet, profil détaillé de l'animal consulté ([#17](https://github.com/GaelleBriet/memo-patte-vue/issues/17)) ([278d393](https://github.com/GaelleBriet/memo-patte-vue/commit/278d3939d4f463c48e1cbdf0359b0af6ecb3d19b))
* **carnet:** ligne d'erreur discrète quand une section ne peut pas charger ([143bb2d](https://github.com/GaelleBriet/memo-patte-vue/commit/143bb2d36da291b6ddd49f3f402941823d363658))
* **carnet:** sections Vaccins, Traitements en cours et Suivi de poids ([497a886](https://github.com/GaelleBriet/memo-patte-vue/commit/497a88617553fdd1928a7f3d3398cbc73de2bf30))
* **shared:** modules purs âge, format kg, courbe de poids et résumé de pesées ([402f837](https://github.com/GaelleBriet/memo-patte-vue/commit/402f8373bc7d814bb65f60fe590bde25e80e656b))
* **theme:** icône show_chart, tokens et libellés du Carnet ([99195a6](https://github.com/GaelleBriet/memo-patte-vue/commit/99195a672bb85604119dd1d26de575dc12d627ee))


### 🐛 Corrections

* **animals:** la colonne Rappels compte les retards dès qu'il y en a, sinon les rappels à venir ([6d9e53d](https://github.com/GaelleBriet/memo-patte-vue/commit/6d9e53d7bb6dbab381e0bb4727034316f2cd0f64))
* **animals:** marquer aussi les traitements à la suppression d'un animal ([#102](https://github.com/GaelleBriet/memo-patte-vue/issues/102)) ([34345b3](https://github.com/GaelleBriet/memo-patte-vue/commit/34345b35deddd4aaf9263a04586e8a6a2294fb9c))

## [0.1.13](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.12...memo-patte-v0.1.13) (2026-09-09)


### ✨ Fonctionnalités

* **animals:** écran d'édition d'un profil animal ([752e916](https://github.com/GaelleBriet/memo-patte-vue/commit/752e916f90a152d1b713bfb8044cff971e7e0017))
* **animals:** écran d'édition d'un profil animal sur /animals/:id/edit ([62d3c56](https://github.com/GaelleBriet/memo-patte-vue/commit/62d3c56f48900708e90f849251b9bd53112acd27))
* **animals:** pré-remplissage du formulaire depuis un animal et getter byId ([8175ab7](https://github.com/GaelleBriet/memo-patte-vue/commit/8175ab7fac12af20d7baa1bfcedfc9f2521b847c))
* **home:** agrégation des prochaines échéances ([85ee3f1](https://github.com/GaelleBriet/memo-patte-vue/commit/85ee3f17e8ece04d515b7aca2e5e1a7bcb7cb350))
* **home:** agrégation des prochaines échéances ([a456ea8](https://github.com/GaelleBriet/memo-patte-vue/commit/a456ea8214abe5f20729b0beb3268e900d2e84fe))

## [0.1.12](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.11...memo-patte-v0.1.12) (2026-09-09)


### ✨ Fonctionnalités

* **vaccinations:** câbler le repository des vaccins dans main.ts ([0eae21d](https://github.com/GaelleBriet/memo-patte-vue/commit/0eae21d327871b71b01420ab4acf3dfe73914864))
* **vaccinations:** écran de création et d'édition d'un vaccin ([1ad7377](https://github.com/GaelleBriet/memo-patte-vue/commit/1ad73773ba7c9c5ca7cdc1b2dbeb67ddaa9b0845))
* **vaccinations:** formulaire d'ajout et d'édition d'un vaccin ([692adf2](https://github.com/GaelleBriet/memo-patte-vue/commit/692adf2faf911cba0e24cc2a441bba62119be7f8))
* **vaccinations:** routes de création et d'édition d'un vaccin ([c41efe9](https://github.com/GaelleBriet/memo-patte-vue/commit/c41efe94b8603a288ba8b3fda36f234c46e09890))
* **vaccinations:** store Pinia des vaccins (liste par animal, écritures, provider) ([1b91e40](https://github.com/GaelleBriet/memo-patte-vue/commit/1b91e40708c99ad78595a1c8f0ce2a8d7b450d37))

## [0.1.11](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.10...memo-patte-v0.1.11) (2026-09-09)


### ✨ Fonctionnalités

* **animals:** écran de création d'un profil animal ([f652efd](https://github.com/GaelleBriet/memo-patte-vue/commit/f652efd35f2d6e108e2535a63344d85dc613c256))
* **animals:** écran de création d'un profil animal ([9b6faca](https://github.com/GaelleBriet/memo-patte-vue/commit/9b6faca01c92cdd6de362727a55b5ecbab0e9227))
* **animals:** ouvrir le formulaire depuis la chip « + » du Carnet ([740a650](https://github.com/GaelleBriet/memo-patte-vue/commit/740a65065460d30211401796cd6e390d20525ad7))
* **animals:** valider les champs du formulaire animal avec animalInputSchema ([24c1983](https://github.com/GaelleBriet/memo-patte-vue/commit/24c19830ad0484de48963bfcae2af5d7e09c1560))
* **theme:** ajouter l'icône calendar_month au registre Material Symbols ([d461bd5](https://github.com/GaelleBriet/memo-patte-vue/commit/d461bd5eb555711a6e737075b6060d1844cb7b5d))

## [0.1.10](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.9...memo-patte-v0.1.10) (2026-09-08)


### ✨ Fonctionnalités

* **home:** composant partagé sélecteur d'animaux en chips ([be924ba](https://github.com/GaelleBriet/memo-patte-vue/commit/be924ba2825d709aa7f4f21c91c59d96de218182))
* **home:** coquille de navigation (bottom nav, 2 onglets) ([a1720cf](https://github.com/GaelleBriet/memo-patte-vue/commit/a1720cf865d83a766fe1095f172646c4c63fcb98))
* **home:** coquille de navigation avec bottom nav 2 onglets ([5b45f40](https://github.com/GaelleBriet/memo-patte-vue/commit/5b45f40273166fd1f52ab96e79cc0f592c177a55)), closes [#33](https://github.com/GaelleBriet/memo-patte-vue/issues/33)
* **shared:** sélecteur d'animaux en chips réutilisable ([49bbb41](https://github.com/GaelleBriet/memo-patte-vue/commit/49bbb4108d8f0fefe706c8c3cf304acbfe13500b)), closes [#34](https://github.com/GaelleBriet/memo-patte-vue/issues/34)
* **vaccinations:** figer le rattachement d'un vaccin à son animal ([8446733](https://github.com/GaelleBriet/memo-patte-vue/commit/8446733a31cc5483a722db7c9c5e8fc6cd248c4b)), closes [#19](https://github.com/GaelleBriet/memo-patte-vue/issues/19)


### 🐛 Corrections

* **shared:** corriger la géométrie et l'accessibilité du sélecteur d'animaux ([978df00](https://github.com/GaelleBriet/memo-patte-vue/commit/978df008892150870c2e1ddcfc891a8e3954c5fe)), closes [#34](https://github.com/GaelleBriet/memo-patte-vue/issues/34)
* **shared:** rendre le décalage du sélecteur d'animaux insensible au conteneur ([fa7c54c](https://github.com/GaelleBriet/memo-patte-vue/commit/fa7c54c96274c9170cfd90f9caae8a5c1de02912)), closes [#34](https://github.com/GaelleBriet/memo-patte-vue/issues/34)

## [0.1.9](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.8...memo-patte-v0.1.9) (2026-09-07)


### ✨ Fonctionnalités

* **animals:** schéma Zod et repository Animal ([475e38c](https://github.com/GaelleBriet/memo-patte-vue/commit/475e38c8db4a6060bfd6d1f0def8b38b924c5ee2))
* **animals:** suppression logique via deleted_at ([86b95f8](https://github.com/GaelleBriet/memo-patte-vue/commit/86b95f8181260cc124e09641f9118683f1723a44))


### 🐛 Corrections

* **db:** ne pas mettre en cache une ouverture de base échouée ([4ceafe1](https://github.com/GaelleBriet/memo-patte-vue/commit/4ceafe1bf6fee06c650820e0dca93ca97a1b4d75))
* **lint:** limiter l'exemption des tests à *.repository.spec.ts ([2f47d2a](https://github.com/GaelleBriet/memo-patte-vue/commit/2f47d2acbdb4c4eafab02d02aefa988d6fa98321))
* **notifications:** id de rappel strictement positif ([273fa96](https://github.com/GaelleBriet/memo-patte-vue/commit/273fa968cd4f7aadbdfbf0dfa460ba02ae4edbf8))

## [0.1.8](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.7...memo-patte-v0.1.8) (2026-09-07)


### ✨ Fonctionnalités

* **android:** règles Auto Backup, photos et session exclues, doc à jour ([585a595](https://github.com/GaelleBriet/memo-patte-vue/commit/585a595df7ea60ffbc233880fdb2c85cf9e480b9))

## [0.1.7](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.6...memo-patte-v0.1.7) (2026-08-25)


### ✨ Fonctionnalités

* **eslint:** add vue-i18n linting rules and plugin for improved internationalization support ([4cfd402](https://github.com/GaelleBriet/memo-patte-vue/commit/4cfd402e1f921bf787d38d0d0f6eb29cacbeef0d))
* **i18n, supabase:** enhance type safety and add lint rules to restrict direct client use ([dd91614](https://github.com/GaelleBriet/memo-patte-vue/commit/dd916145d82cb26b9d28edeeb1218c7c16663af0))
* **i18n:** migrate French translations to JSON format and update import path ([002f517](https://github.com/GaelleBriet/memo-patte-vue/commit/002f517feba7e8c6f38066eac5ee285ec7a5d775))
* **i18n:** update locale directory to use JSON files for translations ([0dede56](https://github.com/GaelleBriet/memo-patte-vue/commit/0dede56bd0148d5474e4bd2d80b7ecc79ede1fd4))

## [0.1.6](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.5...memo-patte-v0.1.6) (2026-08-24)


### ✨ Fonctionnalités

* **supabase:** initialize Supabase client and enforce repository-only access with lint rules ([5d31575](https://github.com/GaelleBriet/memo-patte-vue/commit/5d31575ca55096cdf097c38b1e1310ca625aa20b))
* **tsconfig:** enable importing .ts extensions and update related config ([b3e622f](https://github.com/GaelleBriet/memo-patte-vue/commit/b3e622f2089047bc2ed252dad790e5e1be4a5313))

## [0.1.5](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.4...memo-patte-v0.1.5) (2026-08-24)


### 🐛 Corrections

* **supabase:** update keep-alive workflow to ping Supabase auth settings ([1648c1e](https://github.com/GaelleBriet/memo-patte-vue/commit/1648c1e0f75fc6addd2d41d365647fae69c3eb05))
* **supabase:** update keep-alive workflow to ping Supabase auth settings ([92fe32e](https://github.com/GaelleBriet/memo-patte-vue/commit/92fe32eb8b66c751cbfe2d58b37cebf676a3e69a))

## [0.1.4](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.3...memo-patte-v0.1.4) (2026-08-24)


### 🐛 Corrections

* **supabase:** remove redundant Authorization header in keep-alive wo… ([0859c28](https://github.com/GaelleBriet/memo-patte-vue/commit/0859c2835625122356af64c603ace503517a5cee))
* **supabase:** remove redundant Authorization header in keep-alive workflow ([aa4bb8a](https://github.com/GaelleBriet/memo-patte-vue/commit/aa4bb8add9a899c25d2db5db11df548f18090d47))

## [0.1.3](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.2...memo-patte-v0.1.3) (2026-08-24)


### ✨ Fonctionnalités

* **env:** add Supabase environment variables to type definitions and example ([8245d3e](https://github.com/GaelleBriet/memo-patte-vue/commit/8245d3e3a9286afdf08e20ab60b32fc286516ce1))
* **env:** update Supabase keys in environment files for consistency ([391b509](https://github.com/GaelleBriet/memo-patte-vue/commit/391b509aa53026bad6f606dae04e0d0ddaeeddcf))
* **supabase:** add keep-alive workflow to prevent automatic pause ([9a2f10c](https://github.com/GaelleBriet/memo-patte-vue/commit/9a2f10c056fae9731a2ad331659b6c9a86c3292f))


### 🐛 Corrections

* **vuetify:** update secondary color for improved design consistency ([c322cc5](https://github.com/GaelleBriet/memo-patte-vue/commit/c322cc5bf6c43b5b9bc17c4ca57dde8ff155a393))

## [0.1.2](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.1...memo-patte-v0.1.2) (2026-08-24)


### ✨ Fonctionnalités

* **android:** initialize Android project structure and add basic configurations ([a91367a](https://github.com/GaelleBriet/memo-patte-vue/commit/a91367acda9fda23432688d03809c73d1aa8d341))
* **i18n:** add French localization support ([844a9f5](https://github.com/GaelleBriet/memo-patte-vue/commit/844a9f5cc0952bf3018ba75a14552e00c881b44e))
* **i18n:** integrate localization support and update language settings ([bb08863](https://github.com/GaelleBriet/memo-patte-vue/commit/bb088637e90fc6dcd20784d8cd3ef0694ddd18fe))

## [0.1.1](https://github.com/GaelleBriet/memo-patte-vue/compare/memo-patte-v0.1.0...memo-patte-v0.1.1) (2026-08-23)


### ✨ Fonctionnalités

* update ESLint configuration with project-specific rules and expanded ignores ([f1a0428](https://github.com/GaelleBriet/memo-patte-vue/commit/f1a0428149e2337ce092a03afa660ccf11eef5ea))


### 🐛 Corrections

* correct pre-push hook and align scripts ([76c4aef](https://github.com/GaelleBriet/memo-patte-vue/commit/76c4aef3aec1e5faf22b57831bdcd7d95a53b18f))
* remove redundant typecheck script from package.json ([67eb448](https://github.com/GaelleBriet/memo-patte-vue/commit/67eb4485c8059ac9595d698da92bbf0861619397))

## [0.1.0] - Non publié

### Ajouté

- Initialisation du projet Vue 3 + Capacitor (Android)
- Architecture offline-first (SQLite local + Supabase)
- Compte obligatoire pour la protection des données
