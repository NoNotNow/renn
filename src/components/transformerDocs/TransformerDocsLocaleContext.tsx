/**
 * Locale for in-app transformer docs (paired with {@link DocTerm}).
 * Fast refresh: this file intentionally exports both the Provider and the term helper.
 */
/* eslint-disable react-refresh/only-export-components */
import type { ReactNode } from 'react'
import { createContext, useContext } from 'react'

import type { TransformerDocsLocale } from './glossary'

const TransformerDocsLocaleContext = createContext<TransformerDocsLocale>('en')

export function TransformerDocsLocaleProvider({
  locale,
  children,
}: {
  locale: TransformerDocsLocale
  children: ReactNode
}) {
  return <TransformerDocsLocaleContext.Provider value={locale}>{children}</TransformerDocsLocaleContext.Provider>
}

export function useTransformerDocsLocale(): TransformerDocsLocale {
  return useContext(TransformerDocsLocaleContext)
}
