-- Mêmes limites que la migration v8 de l'app et MAX_NAME_LENGTH : l'une ne change pas sans les autres.
alter table public.animal
  add constraint animal_name_length check (char_length(name) <= 80),
  add constraint animal_breed_length check (char_length(breed) <= 80);

alter table public.vaccination
  add constraint vaccination_name_length check (char_length(name) <= 80);

alter table public.treatment
  add constraint treatment_name_length check (char_length(name) <= 80);
