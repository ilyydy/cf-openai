export interface GlobalConfig {
  // 调试模式
  DEBUG_MODE: boolean
  // echo 模式
  ECHO_MODE: boolean
  // 告警地址
  ALARM_URL: string
  // 当前版本创建时间
  // BUILD_TIMESTAMP: number
  // 当前版本 commit id
  // BUILD_VERSION: string
}

export interface WeChatConfig {
  // admin 用户名单
  WECHAT_ADMIN_USER_ID_LIST: string[],
  // 游客的默认 openai key
  WECHAT_GUEST_OPENAI_KEY: string,
  // admin 用户的默认 openai key
  WECHAT_ADMIN_OPENAI_KEY: string,
  // 处理微信请求的最大毫秒数
  WECHAT_HANDLE_MS_TIME: number
  // 允许访问的 id 列表
  WECHAT_ID_LIST: string[]

  /**
   * 动态环境变量
   */
  // 公众号 appid
  // WECHAT_${this.id}_APPID
  // 微信后台配置的 token
  // WECHAT_${this.id}_TOKEN
  // encodingAESKey
  // WECHAT_${this.id}_AES_KEY
}

export interface OpenAiConfig {
  // OpenAI 的模型名称
  CHAT_MODEL: string
  // OpenAI 的通用API前缀
  OPEN_AI_API_PREFIX: string
  // OpenAI API key 长度 范围
  OPEN_AI_API_KEY_MIN_LEN: number
  OPEN_AI_API_KEY_MAX_LEN: number
  OPEN_AI_API_KEY_OCCUPYING_DURATION: number,
  // OpenAI 的用量地址
  OPEN_AI_USAGE: string
  // OpenAI 的免费用量地址
  OPEN_AI_FREE_USAGE: string
  // OpenAI API 额外参数
  OPEN_AI_API_EXTRA_PARAMS: Record<string, any>
  // OpenAI API 请求超时毫秒
  OPEN_AI_API_TIMEOUT_MS: number
  // 单次请求 OpenAI 最大 token 数
  MAX_CHAT_TOKEN_NUM: number
  // OpenAI 回复的最小 token 数
  MIN_CHAT_RESPONSE_TOKEN_NUM: number
  // 串聊最大历史记录长度
  MAX_HISTORY_LENGTH: number
  // 全局默认初始化消息
  SYSTEM_INIT_MESSAGE: string
}

export interface Env
  extends Partial<GlobalConfig>,
    Partial<WeChatConfig>,
    Partial<OpenAiConfig> {
  // Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
  KV: KVNamespace
  //
  // Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
  // MY_DURABLE_OBJECT: DurableObjectNamespace;
  //
  // Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
  // MY_BUCKET: R2Bucket;
  //
  // Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
  // MY_SERVICE: Fetcher;
}

export interface MyRequest<T = string | Record<string, any> | null> {
  reqId: string
  url: string
  urlObj: URL
  method: string
  headers: Record<string, string>
  body: T
  ctx: ExecutionContext
  env: Env
}

export interface MyResponse {
  body?: BodyInit | null
  init?: ResponseInit
}
