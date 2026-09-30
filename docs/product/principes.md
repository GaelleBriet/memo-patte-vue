---
tags:
  - perso
  - memo-patte
  - product
---

# Principes produit (version 1, validée par Gaelle le 2026-09-28)

Les règles qui tranchent quand une spec hésite. Classées par priorité : en cas de conflit, la plus
haute gagne. Chacune dit d'où elle vient.

1. **Le carnet dit la vérité.** Il ne note jamais « donné » sans que l'utilisateur l'ait dit, ne
   présente jamais une date passée comme à venir, et montre l'inconnu comme inconnu (« non
   renseigné »). — Décisions du 2026-09-28 (traitements quotidiens).
2. **On note et on rappelle, on ne prescrit pas.** Aucun conseil de dose, de produit ou de soin :
   c'est le rôle du vétérinaire. — Vision (« pas de téléconsultation ») ; déclaration « Health apps »
   du Play Store.
3. **Un rappel ne se perd pas, et on dit honnêtement jusqu'où.** Tant que l'app est installée : fiable
   hors ligne, reconstruit après une restauration, rien ne disparaît tout seul (ni un rappel, ni un
   bandeau à renseigner). Au-delà, l'app ne peut rien garantir seule : une désinstallation efface le
   carnet et ses rappels, sauf sauvegarde. L'utilisateur doit donc savoir, sans avoir à chercher, ce
   que la sauvegarde d'Android garde déjà (le carnet sans les photos, si la sauvegarde Google du
   téléphone est active) et ce que Plus garantit en plus. La fiabilité des rappels est gratuite pour
   tous (principe 7) ; seule la survie du carnet hors du téléphone est garantie par Plus. — Différenciant n° 1 ; CLAUDE.md
   (Authentification) ; vigilance demandée par Gaelle.
4. **L'action du moment d'abord, au plus court, mais juste.** Ce qui est à faire aujourd'hui est en
   tête, et le geste courant (noter la prise du jour) est le plus court possible. Un tap de plus vaut
   mieux qu'une erreur ou une ambiguïté (principe 1 d'abord). On n'annonce un nombre de taps que s'il
   est tenu et vérifié sur l'app. — Différenciant n° 3, persona P1 ; remarque de Gaelle.
5. **Rattraper sans bloquer.** Un oubli se renseigne facilement, rien n'oblige à le faire tout de
   suite (« plus tard » reste possible), et tout ce qui est noté se corrige. — Décisions du
   2026-09-28 (bandeau, encart facultatif, correction d'un jour).
6. **Pas de bruit.** Une notification correspond à une action utile ; au-delà, elle fait couper les
   notifications et tue le principe 3. — Décision du 2026-09-15 (pas de doublon de notification).
7. **Le local est gratuit, les données ne sont jamais otages.** Tout ce qui marche sur le téléphone
   est gratuit et sans limite d'animaux ; seul le cloud est payant ; export libre en JSON et CSV. —
   Différenciant n° 4.
8. **Quand deux profils divergent, P1 gagne.** — Personas, décision du 2026-09-28.

## Conséquences à reporter

- CLAUDE.md et [`06-mvp-scope.md`](06-mvp-scope.md) promettent « 2 taps maximum » : à reformuler selon le
  principe 4 (le Vision Board est validé depuis le 2026-09-28), et à ne jamais écrire sur la fiche Play
  Store sans mesure sur l'app. (Reformulé le 2026-09-30.)
- Principe 3 : le test de l'Auto Backup Android sur appareil (#82) n'est toujours pas fait ; tant qu'il
  ne l'est pas, on ne peut pas affirmer ce qu'Android restaure.

## Exemples de conflit tranchés par l'ordre

- « Toutes données » en un tap (4) contre le carnet qui ne dit « donné » que si on le dit (1) : un tap
  reste permis parce que c'est l'utilisateur qui l'affirme ; une case cochée d'avance qui
  s'enregistrerait sans validation explicite ne l'est pas. Un écran de choix précoché reste permis s'il
  se termine par une validation qui annonce tout (« Valider : 4 données, 1 oubliée », parcours 5).
- Un rappel « 15 min avant » séduisant (4) contre une alarme qui peut arriver en retard (3) : on ne
  promet pas une précision que le téléphone ne tient pas ; « 15 min avant » n'est proposé qu'avec les
  rappels précis (parcours 3, Q3).
