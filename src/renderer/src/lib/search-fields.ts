// The fields Search Everything's filter goes by (shared/search-fields.ts),
// as Settings has them: App sets them as the settings load and change, the
// page reads them.

import { create } from 'zustand'
import { DEFAULT_SEARCH_FIELDS, normalizeSearchFields, type SearchFields } from '../../../shared/search-fields'

export const useSearchFields = create<{ fields: SearchFields }>(() => ({ fields: DEFAULT_SEARCH_FIELDS }))

export function applySearchFields(raw: unknown): void {
  useSearchFields.setState({ fields: normalizeSearchFields(raw) })
}
