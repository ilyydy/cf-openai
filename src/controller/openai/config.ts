import type { OpenAiConfig } from '../../types'

export const commandName = {
  help: '/help',
  setOpenAiType: '/setOpenAiType',
  bindKey: '/bindKey',
  unbindKey: '/unbindKey',
  bindAzureKey: '/bindAzureKey',
  unbindAzureKey: '/unbindAzureKey',
  testKey: '/testKey',
  setChatType: '/setChatType',
  newChat: '/newChat',
  retry: '/retry',
  retryLastMessage: '..',
  retryLastMessage2: '。。',
  usage: '/usage',
  bindSessionKey: '/bindSessionKey',
  unbindSessionKey: '/unbindSessionKey',
  freeUsage: '/freeUsage',
  version: '/version',
  setEnv: '/setEnv',
  system: '/system',
  faq: '/faq',
  adminAuth: '/adminAuth',
  testAlarm: '/testAlarm',
  feedback: '/feedback',
}

export const CONFIG: OpenAiConfig = {
  // OpenAI 的模型名称
  CHAT_MODEL: 'gpt-3.5-turbo',
  // OpenAI 的通用API前缀
  OPEN_AI_API_PREFIX: 'https://api.openai.com/v1',
  // OpenAI API key 长度范围
  OPEN_AI_API_KEY_MAX_LEN: 51,
  OPEN_AI_API_KEY_MIN_LEN: 51,
  // 游客的默认 openai key
  GUEST_KEY: '',
  // admin 用户的默认 openai key
  ADMIN_KEY: '',
  // OpenAI 的用量地址
  OPEN_AI_USAGE: 'https://api.openai.com/dashboard/billing/usage',
  // OpenAI 的免费用量地址
  OPEN_AI_FREE_USAGE: 'https://api.openai.com/dashboard/billing/credit_grants',
  // OpenAI API chat 额外参数
  OPEN_AI_API_CHAT_EXTRA_PARAMS: {},
  // OpenAI API 请求超时，毫秒
  OPEN_AI_API_TIMEOUT_MS: 30000,
  // OpenAI API key 使用间隔，单位秒，用于限流
  OPEN_AI_API_KEY_OCCUPYING_DURATION: 0,
  // 单次请求 OpenAI 最大 token 数
  MAX_CHAT_TOKEN_NUM: 4000,
  // OpenAI 回复的最小 token 数
  MIN_CHAT_RESPONSE_TOKEN_NUM: 500,
  // 串聊最大历史记录长度
  MAX_HISTORY_LENGTH: 20,
  // 提问/回答的保存时长，分钟
  ANSWER_EXPIRES_MINUTES: 3,
  // 全局默认初始化消息，不能使用 Date.now() 获取当前时间，实际会为 0，cloudflare 的限制
  SYSTEM_INIT_MESSAGE: `You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible. Knowledge cutoff: 2021-09-01. Current is 2023`,
  // 用户关注应用时发出的欢迎信息
  WELCOME_MESSAGE: `欢迎使用，可输入 ${commandName.help} 查看当前可用命令`,

  AZURE_API_PREFIX: 'https://RESOURCENAME.openai.azure.com/openai',
  AZURE_CHAT_API_VERSION: '2023-03-15-preview',
  AZURE_LIST_MODEL_API_VERSION: '2022-12-01',
  AZURE_GUEST_KEY: '',
  AZURE_ADMIN_KEY: '',
}
