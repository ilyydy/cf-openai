import { XMLParser } from 'fast-xml-parser'

import { CONFIG } from './global'

import type { ErrCode } from './errCode'
import type { SHA } from './global'
import type { Env } from './types'

const MODULE = 'src/utils.ts'

/**
 * 重试方法
 */
export async function retry<T>(fn: () => T | Promise<T>, maxAttemptCount: number, retryInterval = 100) {
  let err: Error = new Error('retry fail')
  for (let i = 0; i < maxAttemptCount; i++) {
    try {
      return await fn()
    } catch (error) {
      if (i === maxAttemptCount - 1) {
        err = error as Error
        break
      }
      await new Promise((resolve) => setTimeout(resolve, retryInterval))
    }
  }
  throw err
}

export async function catchWithDefault<T, K>(defaultValue: K, fn: () => T | Promise<T>) {
  try {
    const res = fn()
    if (res instanceof Promise) {
      return await res
    }
    return res
  } catch (e) {
    return defaultValue
  }
}

export function genSuccess<T>(data: T, msg = '') {
  return { success: true as const, data, msg }
}

export function genFail<T = undefined>(msg: string, data?: T) {
  return { success: false, data, msg } as {
    success: false
    msg: string
    data: T extends undefined ? undefined : T
  }
}

export type Result<SuccessData, FailData = undefined> =
  | ReturnType<typeof genSuccess<SuccessData>>
  | ReturnType<typeof genFail<FailData>>

export const logger = {
  debug: (msg: string) => {
    if (CONFIG.DEBUG_MODE) {
      const _msg = `${new Date(Date.now() + 8 * 3600000).toISOString()} DEBUG ${msg}`
      console.log(_msg)
      sendAlarmMsg(_msg, CONFIG.ALARM_URL).catch((error) => {
        console.error(`${MODULE} sendAlarmMsg fail ${errorToString(error as Error)}`)
      })
    }
  },
  info: (msg: string) => {
    const _msg = `${new Date(Date.now() + 8 * 3600000).toISOString()} INFO ${msg}`
    console.log(_msg)
    if (CONFIG.DEBUG_MODE) {
      sendAlarmMsg(_msg, CONFIG.ALARM_URL).catch((error) => {
        console.error(`${MODULE} sendAlarmMsg fail ${errorToString(error as Error)}`)
      })
    }
  },
  error: (msg: string) => {
    const _msg = `${new Date(Date.now() + 8 * 3600000).toISOString()} ERROR ${msg}`
    console.log(_msg)
    sendAlarmMsg(_msg, CONFIG.ALARM_URL).catch((error) => {
      console.error(`${MODULE} sendAlarmMsg fail ${errorToString(error as Error)}`)
    })
  },
}

export function errorToString(e: Error) {
  return JSON.stringify({
    name: e.name,
    message: e.message,
    stack: e.stack,
  })
}

export interface LogExtraInfo {
  platform?: string
  id?: string
  userId?: string
  role?: string
  openaiType?: string
  chatType?: string
  conversationId?: string
  reqId?: string
}

export function wrapLogMsg(msg: string, extraInfo: LogExtraInfo = {}) {
  const arr: string[] = []

  if (extraInfo.platform) {
    arr.push(`[platform ${extraInfo.platform}]`)
  }

  if (extraInfo.id) {
    arr.push(`[id ${extraInfo.id}]`)
  }

  if (extraInfo.userId) {
    arr.push(`[userId ${extraInfo.userId}]`)
  }

  if (extraInfo.role) {
    arr.push(`[role ${extraInfo.role}]`)
  }

  if (extraInfo.openaiType) {
    arr.push(`[openaiType ${extraInfo.openaiType}]`)
  }

  if (extraInfo.chatType) {
    arr.push(`[chatType ${extraInfo.chatType}]`)
  }

  if (extraInfo.conversationId) {
    arr.push(`[conversationId ${extraInfo.conversationId}]`)
  }

  if (extraInfo.reqId) {
    arr.push(`[reqId ${extraInfo.reqId}]`)
  }

  arr.push(msg)
  return arr.join(' ')
}

export function buildLogger(extraInfo: LogExtraInfo) {
  return {
    debug: (msg: string) => logger.debug(`${wrapLogMsg(msg, extraInfo)}`),
    info: (msg: string) => logger.info(`${wrapLogMsg(msg, extraInfo)}`),
    error: (msg: string) => logger.error(`${wrapLogMsg(msg, extraInfo)}`),
  }
}

export type Logger = typeof logger

/**
 * 发送告警信息，目前支持企业微信群机器人和自定义地址
 * TODO 支持其他
 * @see https://developer.work.weixin.qq.com/document/path/91770
 */
export async function sendAlarmMsg(msg: string, url: string) {
  try {
    let body = {
      msg,
    } as Record<string, any>

    if (CONFIG.ALARM_URL.startsWith('https://qyapi.weixin.qq.com/cgi-bin/webhook/send')) {
      // 企业微信
      body = {
        msgtype: 'text',
        text: { content: msg },
      }
    }

    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }).then((res) => res.json())
    logger.debug(`${MODULE} resp ${JSON.stringify(resp)}`)
    return genSuccess('')
  } catch (e) {
    const err = e as Error
    logger.error(`${MODULE} 告警发送失败 ${errorToString(err)}`)
    return genFail(`告警发送失败`)
  }
}

/**
 * @returns hex 字符串
 */
export async function shaDigest(algorithm: SHA, input: string) {
  const buffer = await crypto.subtle.digest(algorithm, new TextEncoder().encode(input))

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

export async function sleep(ms: number) {
  return new Promise<void>((resolve) =>
    setTimeout(() => {
      resolve()
    }, ms)
  )
}

export function genReqId() {
  return `${Date.now()}-${Math.floor(Math.random() * 100000)}`
}

export function genMyErrResponse(errCode: ErrCode) {
  return genMyResponse(errCode.msg, { status: errCode.httpCode })
}

export function genMyResponse(body?: BodyInit | null, init?: ResponseInit) {
  return { body, init }
}

export function concatUint8Array(arrays: Uint8Array[]) {
  const totalLength = arrays.reduce((acc, value) => acc + value.length, 0)

  const result = new Uint8Array(totalLength)

  // for each array - copy it over result
  // next array is copied right after the previous one
  let length = 0
  for (const array of arrays) {
    result.set(array, length)
    length += array.length
  }

  return result
}

export function base64ToUint8Array(str: string) {
  return Uint8Array.from(atob(str), (c) => c.charCodeAt(0))
}

export function uint8ArrayToBase64(uint8Array: Uint8Array) {
  return btoa(String.fromCharCode.apply(null, uint8Array as unknown as number[]))
}

let textDecoder: TextDecoder
let textEncoder: TextEncoder

export function getTextDecoder() {
  if (!textDecoder) {
    textDecoder = new TextDecoder()
  }
  return textDecoder
}

export function getTextEncoder() {
  if (!textEncoder) {
    textEncoder = new TextEncoder()
  }
  return textEncoder
}

export function parseXmlMsg<T = any>(xmlMsg: string) {
  const parser = new XMLParser({
    processEntities: false,
  })

  try {
    return genSuccess(parser.parse(xmlMsg) as T)
  } catch (error) {
    logger.debug(`${MODULE} 解析xml消息异常 ${errorToString(error as Error)}`)
    return genFail('解析xml消息异常')
  }
}

export function mergeFromEnv<T extends Record<string, any>>(env: Env, obj: T) {
  const _obj = obj as Record<string, any>
  const _env = env as unknown as Record<string, string | undefined>

  for (const [key, defaultValue] of Object.entries(_obj)) {
    let valueInEnv = _env[key]
    if (valueInEnv === undefined) continue
    valueInEnv = valueInEnv.trim()

    switch (typeof defaultValue) {
      case 'number': {
        const num = Number.parseInt(valueInEnv)
        if (Number.isFinite(num)) {
          _obj[key] = num
        } else {
          logger.error(`${MODULE} key ${key} invalid num ${valueInEnv}`)
        }
        break
      }
      case 'boolean':
        if (!['false', 'true'].includes(valueInEnv)) {
          logger.error(`${MODULE} key ${key} invalid bool ${valueInEnv}`)
        } else {
          _obj[key] = valueInEnv === 'true' ? true : false
        }
        break
      case 'string':
        _obj[key] = valueInEnv
        break
      case 'object':
        if (Array.isArray(defaultValue)) {
          _obj[key] = valueInEnv.split(',')
        } else {
          try {
            const v = JSON.parse(valueInEnv) as Record<string, any>
            _obj[key] = v
          } catch (e) {
            logger.error(`${MODULE} key ${key} invalid obj ${valueInEnv}`)
          }
        }
        break
    }
  }
}
