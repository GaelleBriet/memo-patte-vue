# Suivi dans le coffre de notes : un automatisme (2026-10-11)

Demande de Gaelle : mettre à jour son coffre (`Memo-Patte/docs/`) à chaque avancée est un **réflexe**, pas une tâche qu'on pense à faire en fin de journée.

## Quand

À chaque événement ci-dessous, **dans le même tour que l'événement**, avant de répondre à Gaelle :

| Événement                                                            | Mise à jour                                                                                                                    |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Une PR est mergée, ou un pas d'un épic est livré                     | Entrée du jour en tête de `point-du-jour.md` (créée si absente, « Fait » puis « Reste ») ; bilan du pas dans `product/bilans/` |
| Un choix de cohérence ou de bonnes pratiques est tranché sans Gaelle | Entrée dans `decisions-autonomes.md` (décision, raison, alternative écartée, comment revenir dessus)                           |
| Une décision de Gaelle est reçue                                     | Journal `decisions-log.md` du dépôt et spec, par une PR de documentation                                                       |
| Un incident (CI rouge, preuve non jouée, erreur de process)          | Ligne « Ce qui a mal tourné, et ce qui change » du bilan, et une règle ici ou dans `collaboration.md` si le remède est durable |

## Une lecture « à confirmer » ne se code qu'après le bilan

Toute lecture de règle marquée « à confirmer » (ou ⏳) dans le journal des décisions autonomes figure, avec un exemple daté, une recommandation et l'alternative, dans le **bilan du même pas**. Sinon elle n'est pas codée : l'agent s'arrête sur ce cas et le décrit (décision de Gaelle, 2026-10-12, après avoir découvert cinq lectures du pas 3 qui n'étaient jamais passées par un bilan). Un relecteur vérifie à chaque pas que les « à confirmer » du journal sont dans le bilan.

## Comment

- Côté app, pas côté code : écran, geste, exemple daté (animal, dates), ce qui change pour Gaelle, puis la décision attendue.
- Un bilan dit ce qui a été **réellement joué** : nombre de carnets, commandes, résultats ; ce qui n'a pas été joué est écrit comme tel.
- Un nouveau fichier du coffre porte `Date de début:` et `maj:` dans son frontmatter ; un fichier modifié met `maj:` à jour.
- Le coffre n'est pas un dépôt à committer à la main : il se synchronise tout seul, on n'y écrit que des fichiers.
- Aucune note nominative, aucune clé, rien de personnel dans le dépôt public : ces notes vivent seulement dans le coffre.

## Pour les agents

Un agent qui livre un pas rend son rapport à Claude, qui fait les mises à jour ci-dessus ; un brief n'a pas besoin de le demander.
