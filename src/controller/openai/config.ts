import type { OpenAiConfig } from '../../types'

export const CONFIG: OpenAiConfig = {
  // OpenAI 的模型名称
  CHAT_MODEL: 'gpt-3.5-turbo',
  // OpenAI 的通用API前缀
  OPEN_AI_API_PREFIX: 'https://api.openai.com/v1',
  // OpenAI API key 长度范围
  OPEN_AI_API_KEY_MAX_LEN: 51,
  OPEN_AI_API_KEY_MIN_LEN: 51,
  // OpenAI 的用量地址
  OPEN_AI_USAGE: 'https://api.openai.com/dashboard/billing/usage',
  // OpenAI 的免费用量地址
  OPEN_AI_FREE_USAGE: 'https://api.openai.com/dashboard/billing/credit_grants',
  // OpenAI API 额外参数 TODO
  OPEN_AI_API_EXTRA_PARAMS: {},
  // OpenAI API 请求超时，毫秒
  OPEN_AI_API_TIMEOUT_MS: 30000,
  // 单次请求 OpenAI 最大 token 数
  MAX_CHAT_TOKEN_NUM: 4000,
  // OpenAI 回复的最小 token 数
  MIN_CHAT_RESPONSE_TOKEN_NUM: 500,
  // 串聊最大历史记录长度
  MAX_HISTORY_LENGTH: 20,
  // 全局默认初始化消息，不能使用 Date.now() 获取当前时间，实际会为 0，cloudflare 的限制
  SYSTEM_INIT_MESSAGE: `You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible. Knowledge cutoff: 2021-09-01. Current is 2023`,
}
