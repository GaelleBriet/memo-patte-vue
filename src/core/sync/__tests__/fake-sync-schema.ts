interface ForeignKey {
  column: string
  parent: string
}

/** Clés étrangères des tables miroir (`supabase/migrations/`), toutes rattachées au même `user_id`. */
export const MIRROR_FOREIGN_KEYS: Record<string, ForeignKey[]> = {
  vaccination: [{ column: 'animal_id', parent: 'animal' }],
  vaccination_injection: [
    { column: 'vaccination_id', parent: 'vaccination' },
    { column: 'animal_id', parent: 'animal' },
  ],
  treatment: [{ column: 'animal_id', parent: 'animal' }],
  treatment_period: [
    { column: 'treatment_id', parent: 'treatment' },
    { column: 'animal_id', parent: 'animal' },
  ],
  treatment_dose: [
    { column: 'period_id', parent: 'treatment_period' },
    { column: 'treatment_id', parent: 'treatment' },
    { column: 'animal_id', parent: 'animal' },
  ],
  weight_entry: [{ column: 'animal_id', parent: 'animal' }],
}

/** Toutes les colonnes `timestamptz` des miroirs (`supabase/migrations/`). */
export const TIMESTAMP_COLUMNS = [
  'created_at',
  'updated_at',
  'settings_written_at',
  'grid_written_at',
  'deleted_at',
  'installed_at',
  'server_updated_at',
]
