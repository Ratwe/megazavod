import { useCallback, useEffect, useMemo, useState } from 'react'
import { createStoryRepository, type StoryBundle } from './repository'

const CACHE_KEY = 'zavod-story-public-cache-v1'

export function useStory() {
  const repository = useMemo(createStoryRepository, [])
  const [bundle, setBundle] = useState<StoryBundle | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const next = await repository.load()
      setBundle(next); setError(null)
      if (repository.mode === 'shared') localStorage.setItem(CACHE_KEY, JSON.stringify(next))
      return next
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Сюжетный сервер недоступен'
      setError(message)
      const cached = localStorage.getItem(CACHE_KEY)
      if (cached) {
        try {
          const next = JSON.parse(cached) as StoryBundle
          next.episode.mode = 'offline-cache'
          setBundle(next)
          return next
        } catch { /* corrupted cache is ignored */ }
      }
      throw reason
    }
  }, [repository])

  useEffect(() => {
    refresh().catch(() => undefined)
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') refresh().catch(() => undefined) }, 20_000)
    const visible = () => { if (document.visibilityState === 'visible') refresh().catch(() => undefined) }
    document.addEventListener('visibilitychange', visible)
    return () => { clearInterval(timer); document.removeEventListener('visibilitychange', visible) }
  }, [refresh])

  const mutate = useCallback(async (action: () => Promise<StoryBundle>) => {
    if (bundle?.episode.mode === 'offline-cache') throw new Error('Нет связи: сохранённый снимок доступен только для чтения')
    setBusy(true)
    try { const next = await action(); setBundle(next); setError(null); return next } catch (reason) { setError(reason instanceof Error ? reason.message : 'Не удалось сохранить действие'); throw reason } finally { setBusy(false) }
  }, [bundle?.episode.mode])

  const contribute = useCallback((workId: string, eventId: string) => mutate(() => repository.contribute(workId, eventId)), [mutate, repository])
  const vote = useCallback((voteId: string, optionId: string) => mutate(() => repository.vote(voteId, optionId)), [mutate, repository])
  const resolveDemoCouncil = useMemo(() => repository.resolveDemoCouncil ? () => mutate(() => repository.resolveDemoCouncil!()) : null, [mutate, repository])
  const markRead = useCallback(async (sequence: number) => {
    const player = await repository.markChronicleRead(sequence)
    setBundle(current => current ? { ...current, player, recap: { ...current.recap, whileAway: [] } } : current)
  }, [repository])
  const setLocation = useCallback((location: string) => repository.setLocation(location).then(player => setBundle(current => current ? { ...current, player } : current)).catch(() => undefined), [repository])
  const setDisplayName = useCallback((name: string) => repository.setDisplayName(name), [repository])

  return {
    repository, bundle, error, busy, refresh,
    contribute, vote, resolveDemoCouncil, markRead, setLocation, setDisplayName,
  }
}

