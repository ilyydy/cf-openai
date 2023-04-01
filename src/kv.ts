import { KV, CONST } from './global'
import { genFail, genSuccess, errorToString, logger } from './utils'

const MODULE = 'src/kv.ts'

const { TIME } = CONST

export async function set(
  key: string,
  value: string | ArrayBuffer | ArrayBufferView | ReadableStream<any>,
  options: KVNamespacePutOptions = { expirationTtl: TIME.ONE_DAY }
) {
  try {
    const v = await KV.put(key, value, options)
    return genSuccess(v)
  } catch (error) {
    logger.error(`${MODULE} kv set ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export async function setWithStringify(
  key: string,
  value: any,
  options: KVNamespacePutOptions = { expirationTtl: TIME.ONE_DAY }
) {
  return set(key, JSON.stringify(value), options)
}

export async function del(key: string) {
  try {
    const v = await KV.delete(key)
    return genSuccess(v)
  } catch (error) {
    logger.error(`${MODULE} kv del ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export async function get<T = string>(key: string, options?: Partial<KVNamespaceGetOptions<any>>) {
  try {
    const v = await KV.get(key, options)
    return genSuccess(v as T | null)
  } catch (error) {
    logger.error(`${MODULE} kv get ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export async function getWithMetadata<T, K>(key: string, options?: Partial<KVNamespaceGetOptions<any>>) {
  try {
    const { value, metadata } = await KV.getWithMetadata(key, options)
    return genSuccess({ value, metadata } as { value: T | null; metadata: K })
  } catch (error) {
    logger.error(`${MODULE} kv getWithMetadata ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}

export const EXPIRE_TIME_KEY = 'expireTime'

export async function setWithExpireMetaData(
  key: string,
  value: string | ArrayBuffer | ArrayBufferView | ReadableStream<any>,
  options = { ttl: TIME.ONE_MONTH, expireTimeKey: EXPIRE_TIME_KEY }
) {
  const metadata = { [options.expireTimeKey]: Date.now() + options.ttl * 1000 }
  return set(key, value, { metadata, expirationTtl: options.ttl })
}

export interface RefreshOptions {
  expireTimeKey: string
  threshold: number
  ttl: number
}

/**
 * get 同时根据 metadata 中的过期时间自动重新 set
 * 需要保证 metadata 用 [expireTimeKey] 作为键存储毫秒时间戳
 */
export async function getWithRefresh<T>(
  key: string,
  options: Partial<KVNamespaceGetOptions<any>> & RefreshOptions = {
    expireTimeKey: EXPIRE_TIME_KEY,
    threshold: TIME.ONE_DAY,
    ttl: TIME.ONE_MONTH,
  }
) {
  try {
    const { value, metadata } = await KV.getWithMetadata<{ [idx: string]: number }>(key, options)
    if (!metadata || !metadata[options.expireTimeKey]) {
      logger.error(`${MODULE} getWithRefresh metadata 不符合预期`)
      return genSuccess(value as T | null)
    }

    if (value !== null && metadata[options.expireTimeKey] - Date.now() <= options.threshold * 1000) {
      await set(key, value, {
        expirationTtl: options.ttl,
        metadata: { [options.expireTimeKey]: Date.now() + options.ttl * 1000 },
      })
    }

    return genSuccess(value as T | null)
  } catch (error) {
    logger.error(`${MODULE} kv getWithRefresh ${key} fail ${errorToString(error as Error)}`)
    return genFail(`服务kv异常`)
  }
}
