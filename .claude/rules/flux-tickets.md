# Flux de travail par tickets GitHub

- Les tickets sont les issues du dépôt, groupées par épic (0 Fondations → 12 Analytics). Commencer par les tickets en tête d’épic qui ne dépendent d’aucun écran
- Tickets en parallèle : un agent par ticket, chacun dans un worktree git isolé sur sa branche dédiée (`feat/…`, `fix/…`, `chore/…`, `docs/…`) créée depuis `main` à jour
- Les tickets d’un même lot ne touchent pas les mêmes fichiers ; un seul touche `package.json` / `pnpm-lock.yaml`
- Chaque agent reçoit un brief : les critères d’acceptation du ticket, les fichiers qu’il possède, les fichiers interdits, les commandes de vérification (`pnpm lint && pnpm type-check && pnpm exec vitest run && pnpm build-only`), les règles git
- Un second agent relit le diff de la branche contre les critères du ticket et CLAUDE.md ; les constats Critical / Important repartent chez l’implémenteur, puis re-revue ciblée du fix ; les mineurs sont notés dans la PR
- La PR s’ouvre **après revue propre, sans attendre que Gaelle la demande** (voir CLAUDE.md, section Git). Son corps : Quoi / Vérifié / Points à garder en tête ; toute décision prise faute de précision dans le ticket y est listée, mais elle a d’abord été posée en question à Gaelle. Une branche dont une question reste sans réponse attend, sans PR
- Après le lot : retirer les worktrees temporaires (branches conservées), donner à Gaelle la liste des PR et l’ordre de merge conseillé
