import { set, get, del, setWithStringify, getWithExpireRefresh, setWithExpireMetaData, createObj } from '../../kv'
import { genSuccess } from '../../utils'

function getApiKeyOccupiedKey(apiKey: string) {
  return `openai:apiKeyOccupied:${apiKey}`
}

export async function getApiKeyWaitDuration(apiKey: string) {
  const r = await get<string>(getApiKeyOccupiedKey(apiKey))
  if (!r.success) {
    return r
  }

  const durationMs = r.data ? Number.parseInt(r.data) - Date.now() : 0
  return genSuccess(durationMs)
}

export async function setApiKeyOccupied(apiKey: string, durationMs: number) {
  const key = getApiKeyOccupiedKey(apiKey)
  if (durationMs <= 0) {
    return del(key)
  }
  return set(key, `${durationMs}`, { expirationTtl: Math.max(durationMs / 1000, 60) })
}
