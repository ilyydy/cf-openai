import type { Env, GlobalConfig } from './types'

const MODULE = 'src/global.ts'

const GUEST = '游客'
const FREE_TRIAL = '试用者'
const USER = '用户'
const ADMIN = '管理员'
export type Role = typeof GUEST | typeof USER | typeof ADMIN | typeof FREE_TRIAL

const SHA1 = 'SHA-1'
const SHA256 = 'SHA-256'
export type SHA = typeof SHA1 | typeof SHA256

export const CONST = {
  ROLE: {
    GUEST,
    FREE_TRIAL,
    USER,
    ADMIN,
  },
  SHA: {
    SHA1,
    SHA256,
  },
  TIME: {
    ONE_MIN: 60,
    ONE_HOUR: 3600,
    ONE_DAY: 3600 * 24,
    ONE_MONTH: 3600 * 24 * 30,
    ONE_YEAR: 3600 * 24 * 30 * 365,
  },
} as const

export const CONFIG: GlobalConfig = {
  // 调试模式
  DEBUG_MODE: false,
  // echo 模式
  ECHO_MODE: false,
  // 告警 URL
  ALARM_URL: '',
  // 认证为 admin 的 token
  ADMIN_AUTH_TOKEN: '',
  // 当前版本
  // BUILD_TIMESTAMP: 0,
  // 当前版本 commit id
  // BUILD_VERSION: '',
}

const store: { [key: string]: any } = {}

export function setStore<T>(key: string, value: T) {
  store[key] = value
}

export function getStore<T>(key: string) {
  return store[key] as T
}

export let KV: KVNamespace

import { mergeFromEnv } from './utils'

export function init(env: Env) {
  KV = env.KV
  mergeFromEnv(env, CONFIG)
}
