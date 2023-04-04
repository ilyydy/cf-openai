import { KV, CONST } from './global'
import { genFail, genSuccess, errorToString, logger } from './utils'

const MODULE = 'src/kv.ts'

const { TIME } = CONST

export async function set<T = string>(
  key: string,
  value: T,
  options: KVNamespacePutOptions = { expirationTtl: TIME.ONE_DAY }
) {
  try {
    logger.debug(`${MODULE} set ${key}`)
    const v = await KV.put(key, value as unknown as string, options)
    return genSuccess(v)
  } catch (error) {
    logger.error(`${MODULE} kv set ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export async function setWithStringify<T = any>(
  key: string,
  value: T,
  options: KVNamespacePutOptions = { expirationTtl: TIME.ONE_DAY }
) {
  return set(key, JSON.stringify(value), options)
}

export async function setAuto<T = any>(
  key: string,
  value: T,
  options: KVNamespacePutOptions = { expirationTtl: TIME.ONE_DAY }
) {
  if (
    typeof value === 'string' ||
    value instanceof ArrayBuffer ||
    value instanceof DataView ||
    value instanceof ReadableStream
  ) {
    return set(key, value, options)
  }
  return setWithStringify(key, value, options)
}

export async function del(key: string) {
  try {
    logger.debug(`${MODULE} del ${key}`)
    const v = await KV.delete(key)
    return genSuccess(v)
  } catch (error) {
    logger.error(`${MODULE} kv del ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export async function get<T = string>(key: string, options?: Partial<KVNamespaceGetOptions<any>>) {
  try {
    logger.debug(`${MODULE} get ${key}`)
    const v = await KV.get(key, options)
    return genSuccess(v as T | null)
  } catch (error) {
    logger.error(`${MODULE} kv get ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export async function getWithMetadata<T, K>(key: string, options?: Partial<KVNamespaceGetOptions<any>>) {
  try {
    logger.debug(`${MODULE} getWithMetadata ${key}`)
    const { value, metadata } = await KV.getWithMetadata(key, options)
    return genSuccess({ value, metadata } as KVNamespaceGetWithMetadataResult<T, K>)
  } catch (error) {
    logger.error(`${MODULE} kv getWithMetadata ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export const EXPIRE_TIME_KEY = 'expireTime'

export async function setWithExpireMetaData<T = string>(
  key: string,
  value: T,
  options?: { ttl?: number; expireTimeKey?: string }
) {
  const { expireTimeKey = EXPIRE_TIME_KEY, ttl = TIME.ONE_MONTH } = options || {}
  const metadata = { [expireTimeKey]: Date.now() + ttl * 1000 }
  return setAuto(key, value, { metadata, expirationTtl: ttl })
}

export interface RefreshOptions {
  expireTimeKey?: string
  threshold?: number
  ttl?: number
}

/**
 * get 同时根据 metadata 中的过期时间自动重新 set
 * 需要保证 metadata 用 [expireTimeKey] 作为键存储毫秒时间戳
 */
export async function getWithExpireRefresh<T>(
  key: string,
  options?: Partial<KVNamespaceGetOptions<any>> & RefreshOptions
) {
  const { expireTimeKey = EXPIRE_TIME_KEY, threshold = TIME.ONE_DAY, ttl = TIME.ONE_MONTH } = options || {}

  try {
    logger.debug(`${MODULE} getWithExpireRefresh ${key}`)
    const { value, metadata } = await KV.getWithMetadata<{ [idx: string]: number }>(key, options)
    if (!metadata || !metadata[expireTimeKey]) {
      logger.info(`${MODULE} getWithExpireRefresh key ${key} metadata ${JSON.stringify(metadata)}`)
      return genSuccess(value as T | null)
    }

    if (value !== null && metadata[expireTimeKey] - Date.now() <= threshold * 1000) {
      await set(key, value, {
        expirationTtl: ttl,
        metadata: { [expireTimeKey]: Date.now() + ttl * 1000 },
      })
    }

    return genSuccess(value as T | null)
  } catch (error) {
    logger.error(`${MODULE} kv getWithExpireRefresh ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export function getAdminKey(userId: string) {
  return `admin:${userId}`
}

export async function setAdmin(userId: string) {
  return setWithExpireMetaData(getAdminKey(userId), '1')
}

export async function isAdmin(userId: string) {
  const r = await getWithExpireRefresh<string>(getAdminKey(userId))
  if (r.success) {
    return genSuccess(!!r.data)
  }

  return r
}

export function createObj<Value = string, Metadata = null>(...parts: string[]) {
  const key = parts.join(':')
  return {
    // prettier-ignore
    get: (get<Value>).bind(null, key),
    // prettier-ignore
    getJson: (get<Value>).bind(null, key, { type: 'json' }),
    // prettier-ignore
    getWithMetadata: (getWithMetadata<Value, Metadata>).bind(null, key),
    // prettier-ignore
    set: (set<Value>).bind(null, key),
    // prettier-ignore
    setWithStringify: (setWithStringify<Value>).bind(null, key),
    // prettier-ignore
    setAuto: (setAuto<Value>).bind(null, key),
    // prettier-ignore
    getWithExpireRefresh: (getWithExpireRefresh<Value>).bind(null, key),
    // prettier-ignore
    setWithExpireMetaData: (setWithExpireMetaData<Value>).bind(null, key),
    del: del.bind(null, key),
  }
}

export class KeyBuilder {
  constructor(readonly key: string) { }

  child(...parts: string[]) {
    return KeyBuilder.of(this.key, ...parts);
  }

  static of(...parts: string[]) {
    return new KeyBuilder(parts.join(':'))
  }
}
