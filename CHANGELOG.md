# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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
