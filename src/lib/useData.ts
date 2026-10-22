import { useEffect, useState, createContext, useContext } from 'react'

/** Tiny data hook. During prerender the cache is pre-filled so pages render real
 * content into static HTML; on the client the same cache is read from window.__DATA__. */
export type DataCache = Record<string, unknown>
export const DataContext = createContext<DataCache>({})

export function useData<T>(key: string, fn: () => Promise<T>) {
  const cache = useContext(DataContext)
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>(() =>
    key in cache ? { data: cache[key] as T, loading: false } : { loading: true },
  )
  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    if (key in cache && nonce === 0) {
      setState({ data: cache[key] as T, loading: false })
      return
    }
    let live = true
    setState((s) => ({ data: s.data, loading: true }))
    fn().then(
      (data) => { if (live) { cache[key] = data; setState({ data, loading: false }) } },
      (error) => live && setState({ error, loading: false }),
    )
    return () => { live = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, nonce])
  return { ...state, retry: () => setNonce((n) => n + 1) }
}
