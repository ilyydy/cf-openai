import _ from 'lodash'

import type { Env, GlobalConfig } from './types'

const MODULE = 'src/global.ts'

const GUEST = '游客'
const USER = '用户'
const ADMIN = '管理员'
export type Role = typeof GUEST | typeof USER | typeof ADMIN

const SHA1 = 'SHA-1'
const SHA256 = 'SHA-256'
export type SHA = typeof SHA1 | typeof SHA256

export const CONST = {
  ROLE: {
    GUEST,
    USER,
    ADMIN,
  },
  SHA: {
    SHA1,
    SHA256,
  },
  TIME: {
    ONE_MIN: 60,
    ONE_DAY: 3600,
    ONE_MONTH: 3600 * 30,
    ONE_YEAR: 3600 * 365,
  },
} as const

export const CONFIG: GlobalConfig = {
  // 调试模式
  DEBUG_MODE: false,
  // echo 模式
  ECHO_MODE: false,
  // 告警地址
  ALARM_URL: '',
  // 当前版本
  // BUILD_TIMESTAMP: 0,
  // 当前版本 commit id
  // BUILD_VERSION: '',
}

const store: { [key: string]: any } = {}

export function setStore(key: string, value: any) {
  return (store[key] = value)
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
