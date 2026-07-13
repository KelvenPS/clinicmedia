import { create } from 'zustand'

interface UnsavedChangesState {
  hasUnsavedChanges: boolean
  setHasUnsavedChanges: (value: boolean) => void
}

export const useUnsavedChangesStore = create<UnsavedChangesState>((set) => ({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: (value) => set({ hasUnsavedChanges: value }),
}))
