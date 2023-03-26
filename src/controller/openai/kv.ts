import { CONST } from '../../global'
import { set, get, getWithMetadata, del, setWithStringify } from '../../kv'

import type openai from 'openai'
import type { ChatType } from './types'

const { TIME } = CONST

export function getApiKeyKey(platform: string, appid: string, userId: string) {
  return `openai:apiKey:${platform}:${appid}:${userId}`
}

export async function setApiKey(
  platform: string,
  appid: string,
  userId: string,
  key: string
) {
  return set(getApiKeyKey(platform, appid, userId), key, {
    expirationTtl: TIME.ONE_MONTH,
    metadata: { expireTime: Date.now() + TIME.ONE_MONTH * 1000 },
  })
}

export async function delApiKey(
  platform: string,
  appid: string,
  userId: string
) {
  return del(getApiKeyKey(platform, appid, userId))
}

export interface Metadata {
  expireTime: number
}

export async function getApiKey(
  platform: string,
  appid: string,
  userId: string
) {
  return getWithMetadata<string, Metadata>(
    getApiKeyKey(platform, appid, userId),
    {
      // cacheTtl: 3600,
    }
  )
}

export function getChatTypeKey(
  platform: string,
  appid: string,
  userId: string
) {
  return `openai:chatType:${platform}:${appid}:${userId}`
}

export async function setChatType(
  platform: string,
  appid: string,
  userId: string,
  key: string
) {
  return set(getChatTypeKey(platform, appid, userId), key, {
    expirationTtl: TIME.ONE_MONTH,
    metadata: { expireTime: Date.now() + TIME.ONE_MONTH * 1000 },
  })
}

export async function delChatType(
  platform: string,
  appid: string,
  userId: string
) {
  return del(getChatTypeKey(platform, appid, userId))
}

export async function getChatType(
  platform: string,
  appid: string,
  userId: string
) {
  return getWithMetadata<ChatType, Metadata>(
    getChatTypeKey(platform, appid, userId)
  )
}

export interface Msg {
  msgId: string
  conversationId: string
  content: string
  tokenNum: number
}

export function getLastChatPromptKey(
  platform: string,
  appid: string,
  userId: string
) {
  return `openai:lastChatPrompt:${platform}:${appid}:${userId}`
}

export async function setLastChatPrompt(
  platform: string,
  appid: string,
  userId: string,
  msg: Msg
) {
  return setWithStringify(getLastChatPromptKey(platform, appid, userId), msg)
}

export async function delLastChatPrompt(
  platform: string,
  appid: string,
  userId: string
) {
  return del(getLastChatPromptKey(platform, appid, userId))
}

export async function getLastChatPrompt(
  platform: string,
  appid: string,
  userId: string
) {
  return get<Msg>(getLastChatPromptKey(platform, appid, userId), {
    type: 'json',
  })
}

export function getLastChatAnswerKey(
  platform: string,
  appid: string,
  userId: string
) {
  return `openai:lastChatAnswer:${platform}:${appid}:${userId}`
}

export async function setLastChatAnswer(
  platform: string,
  appid: string,
  userId: string,
  msg: Msg
) {
  return setWithStringify(getLastChatAnswerKey(platform, appid, userId), msg)
}

export async function delLastChatAnswer(
  platform: string,
  appid: string,
  userId: string
) {
  return del(getLastChatAnswerKey(platform, appid, userId))
}

export async function getLastChatAnswer(
  platform: string,
  appid: string,
  userId: string
) {
  return get<Msg>(getLastChatAnswerKey(platform, appid, userId), {
    type: 'json',
  })
}

export function getHistoryKey(
  platform: string,
  appid: string,
  userId: string,
  conversationId: string
) {
  return `openai:history:${platform}:${appid}:${userId}:${conversationId}`
}

export interface HistoryMsg {
  content: string
  role: openai.ChatCompletionRequestMessageRoleEnum
  tokenNum: number
}

export async function setHistory(
  platform: string,
  appid: string,
  userId: string,
  conversationId: string,
  history: HistoryMsg[]
) {
  return setWithStringify(
    getHistoryKey(platform, appid, userId, conversationId),
    history
  )
}

export async function delHistory(
  platform: string,
  appid: string,
  userId: string,
  conversationId: string
) {
  return del(getHistoryKey(platform, appid, userId, conversationId))
}

export async function getHistory(
  platform: string,
  appid: string,
  userId: string,
  conversationId: string
) {
  return get<HistoryMsg[]>(
    getHistoryKey(platform, appid, userId, conversationId),
    { type: 'json' }
  )
}

export function getPromptKey(
  platform: string,
  appid: string,
  userId: string,
  msgId: string
) {
  return `openai:prompt:${platform}:${appid}:${userId}:${msgId}`
}

export async function setPrompt(
  platform: string,
  appid: string,
  userId: string,
  msgId: string
) {
  return setWithStringify(getPromptKey(platform, appid, userId, msgId), 1, {
    expirationTtl: CONST.TIME.ONE_MIN,
  })
}

export async function getPrompt(
  platform: string,
  appid: string,
  userId: string,
  msgId: string
) {
  return get(getPromptKey(platform, appid, userId, msgId))
}

export function getAnswerKey(
  platform: string,
  appid: string,
  userId: string,
  msgId: string
) {
  return `openai:answer:${platform}:${appid}:${userId}:${msgId}`
}

export async function setAnswer(
  platform: string,
  appid: string,
  userId: string,
  msg: { msgId: string, content: string }
) {
  return set(
    getAnswerKey(platform, appid, userId, msg.msgId),
    msg.content,
    { expirationTtl: CONST.TIME.ONE_MIN }
  )
}

export async function getAnswer(
  platform: string,
  appid: string,
  userId: string,
  msgId: string
) {
  return get(getAnswerKey(platform, appid, userId, msgId))
}
