import type openai from 'openai'

export type ChatType = '串聊' | '单聊'

export interface ChatMsg {
  msgId: string
  conversationId: string
  content: string
  tokenNum: number
}

export interface HistoryMsg {
  content: string
  role: openai.ChatCompletionRequestMessageRoleEnum
  tokenNum: number
}

export type OpenAiType = 'openai' | 'azureopenai'
