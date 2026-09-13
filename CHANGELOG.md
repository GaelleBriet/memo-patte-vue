# Changelog

Toutes les modifications notables de ce projet seront documentées dans ce fichier.

Le format est basé sur [Keep a Changelog](https://keepachangelog.com/fr/1.1.0/),
et ce projet adhère au [Semantic Versioning](https://semver.org/lang/fr/).

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
