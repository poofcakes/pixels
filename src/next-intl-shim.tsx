import { createContext, useCallback, useContext, type ReactNode } from 'react'

type Messages = Record<string, unknown>
type TranslationValues = Record<string, string | number | boolean | null | undefined>

const MessagesContext = createContext<Messages>({})

export function NextIntlClientProvider({
  children,
  messages,
}: {
  children: ReactNode
  messages: Messages
}) {
  return <MessagesContext.Provider value={messages}>{children}</MessagesContext.Provider>
}

function getMessage(messages: Messages, namespace: string, key: string): string {
  const path = namespace ? `${namespace}.${key}` : key
  const value = path.split('.').reduce<unknown>((cursor, part) => {
    if (!cursor || typeof cursor !== 'object') return undefined
    return (cursor as Record<string, unknown>)[part]
  }, messages)

  return typeof value === 'string' ? value : path
}

function formatMessage(message: string, values?: TranslationValues): string {
  if (!values) return message

  return message.replace(/\{(\w+)\}/g, (match, key) => {
    const value = values[key]
    return value === undefined || value === null ? match : String(value)
  })
}

export function useTranslations(namespace = '') {
  const messages = useContext(MessagesContext)

  return useCallback(
    (key: string, values?: TranslationValues) =>
      formatMessage(getMessage(messages, namespace, key), values),
    [messages, namespace],
  )
}
