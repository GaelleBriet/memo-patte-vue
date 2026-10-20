# Coût des agents (2026-10-10)

Demande de Gaelle après près de 40 $ dépensés sur le début de l'épic du moteur v2 : dépenser le moins possible, sans mettre un agent trop faible sur une tâche qui demande du jugement.

## Modèle et effort selon la tâche

| Tâche                                                                                    | Agent                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------ |
| Moteur des doses, migrations, synchro ; analyse d'un écart de l'oracle contre les règles | `implementeur-moteur` (Opus, effort élevé) |
| Écrans, rappels, export, documentation                                                   | `implementeur` (Sonnet, effort moyen)      |
| Lancer une campagne, les quatre commandes, pousser une branche                           | Sonnet                                     |
| Question de documentation de Claude Code                                                 | `claude-code-guide`, Haiku                 |

## Pratiques

- **Un seul agent à la fois**, sauf demande contraire de Gaelle.
- **Un agent n'attend jamais une campagne longue.** Le cache de prompt expire après 5 minutes d'inactivité : un agent au gros contexte qui attend des heures repaie tout son contexte à la reprise. Il lance la campagne en arrière-plan, pousse sa branche et s'arrête ; le résultat se lit par la fin du log (`Oracle : N carnets…`, lignes d'échec). Un agent neuf, au brief court (branche, écarts à analyser), ne repart que s'il y a un écart à décortiquer.
- Un agent qu'on interrompt ne se relance pas (`SendMessage` refuse) : on en lance un neuf, avec la branche et ce qui reste à faire.
- Briefs ciblés : chemins et sections précises, pas de recopie de documents. Logs lus par leur fin. Volumes de campagne fixés d'avance, pas « jusqu'à ce que ça passe ».
- Les quatre commandes complètes une fois avant la PR ; pendant le travail, un fichier ou un dossier.
- Relecteur indépendant : Sonnet (`relecteur`) pour les pas hors moteur ; `relecteur-moteur` (Opus) pour le moteur. Le sauter pour économiser est un écart aux règles : seule Gaelle le décide, et la PR le dit.
- **Une relecture, une re-relecture ciblée, puis merge** (Gaelle, 2026-10-20) : un constat de troisième passe devient un ticket, sauf s'il touche un seul téléphone et se reproduit dans l'app. Un résidu mesuré et écrit dans la PR est acceptable.
- **Deux téléphones : chantier clos** (Gaelle, 2026-10-20) : après #958, tout cas de conflit entre deux téléphones part dans un seul ticket « synchro : résidus connus », avec ses graines, à reprendre quand #83 activera la synchro. La session d'analyse du moteur accepte par défaut un résidu consigné et ne demande l'exactitude que si une personne seule sur son téléphone peut voir le défaut.
- Le réglage `subagentPromptCacheTtl` (`"5m"` ou `"1h"`, jamais un nombre ; variable `CLAUDE_CODE_SUBAGENT_PROMPT_CACHE_TTL`) existe, mais écrire un cache d'une heure coûte plus cher : non retenu, une campagne de plusieurs heures dépasse de toute façon l'heure. À reconsidérer si des agents reprennent souvent après 10 à 40 minutes.
