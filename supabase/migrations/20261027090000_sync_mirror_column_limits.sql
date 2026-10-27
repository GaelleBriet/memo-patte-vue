-- Bornes des colonnes texte des miroirs que l'app remplit toujours sous la même forme : un nom de
-- photo, des heures `HH:mm`, la grille d'avant en JSON. Aucune ligne n'est modifiée.

alter table public.animal
  add constraint animal_photo_path_length check (char_length(photo_path) <= 200);

alter table public.treatment_period
  add constraint treatment_period_times_format
    check (times ~ '^([01][0-9]|2[0-3]):[0-5][0-9](,([01][0-9]|2[0-3]):[0-5][0-9]){0,23}$'),
  add constraint treatment_period_reminder_time_format
    check (reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  -- Trois fois ce que l'app relit : une grille plus longue se lit vide, elle ne doit jamais bloquer l'envoi.
  add constraint treatment_period_grid_before_length check (char_length(grid_before) <= 64000);

alter table public.treatment_dose
  add constraint treatment_dose_due_time_format
    check (due_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  add constraint treatment_dose_previous_target_time_format
    check (previous_target_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
