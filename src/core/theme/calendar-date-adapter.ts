import DateFnsAdapter from '@date-io/date-fns'
import { eachDayOfInterval, endOfWeek, format, startOfWeek, type Locale } from 'date-fns'

/** Adaptateur date-fns du calendrier, jours de la semaine en une lettre (L M M J V S D). */
export class CalendarDateAdapter extends DateFnsAdapter {
  constructor(options: { locale?: Locale; formats?: Record<string, string> } = {}) {
    super(options)
    this.getWeekdays = () => {
      const now = new Date()
      const locale = this.locale
      return eachDayOfInterval({
        start: startOfWeek(now, { locale }),
        end: endOfWeek(now, { locale }),
      }).map((day) => format(day, 'EEEEE', { locale }))
    }
  }
}
