type Hour = string | null

/** Les heures d'une journée qui restent des échéances : couvertes par une prise, ou pas couvertes du tout. */
export const existingHours = (
  hours: readonly Hour[],
  covered: ReadonlySet<Hour>,
  coveredByTaken: ReadonlySet<Hour>,
): Hour[] => hours.filter((hour) => !covered.has(hour) || coveredByTaken.has(hour))
