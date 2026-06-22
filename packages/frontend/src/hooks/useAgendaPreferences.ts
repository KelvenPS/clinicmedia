import { useState, useEffect } from 'react'

export interface AgendaPreferences {
  startHour: number
  endHour: number
  interval: number
  hideWeekends: boolean
  compactMode: boolean
  weekStartsOn: 0 | 1 // 0 = Sunday, 1 = Monday
}

const DEFAULT_PREFERENCES: AgendaPreferences = {
  startHour: 6,
  endHour: 19,
  interval: 30,
  hideWeekends: false,
  compactMode: false,
  weekStartsOn: 1,
}

export function useAgendaPreferences() {
  const [preferences, setPreferencesState] = useState<AgendaPreferences>(() => {
    try {
      const stored = localStorage.getItem('agenda_preferences')
      if (stored) {
        return { ...DEFAULT_PREFERENCES, ...JSON.parse(stored) }
      }
    } catch (err) {
      console.error('Error parsing agenda preferences:', err)
    }
    return DEFAULT_PREFERENCES
  })

  const setPreferences = (newPrefs: Partial<AgendaPreferences>) => {
    setPreferencesState((prev) => {
      const updated = { ...prev, ...newPrefs }
      localStorage.setItem('agenda_preferences', JSON.stringify(updated))
      return updated
    })
  }

  return { preferences, setPreferences }
}
