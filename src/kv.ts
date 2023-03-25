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
    logger.error(
      `${MODULE} kv set ${key} fail ${errorToString(error as Error)}`
    )
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
    logger.error(
      `${MODULE} kv del ${key} fail ${errorToString(error as Error)}`
    )
    return genFail(`服务kv异常`)
  }
}

export async function get<T = string>(
  key: string,
  options?: Partial<KVNamespaceGetOptions<any>>
) {
  try {
    const v = await KV.get(key, options)
    return genSuccess(v as T | null)
  } catch (error) {
    logger.error(
      `${MODULE} kv get ${key} fail ${errorToString(error as Error)}`
    )
    return genFail(`服务kv异常`)
  }
}

export async function getWithMetadata<T, K>(
  key: string,
  options?: Partial<KVNamespaceGetOptions<any>>
) {
  try {
    const { value, metadata } = await KV.getWithMetadata(key, options)
    return genSuccess({ value, metadata } as { value: T | null; metadata: K })
  } catch (error) {
    logger.error(
      `${MODULE} kv getWithMetadata ${key} fail ${errorToString(
        error as Error
      )}`
    )
    return genFail(`服务kv异常`)
  }
}
