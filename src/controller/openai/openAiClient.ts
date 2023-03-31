import { CONFIG } from './config'
import { errorToString, genFail, genSuccess, sleep } from '../../utils'

import type openai from 'openai'
import type { Logger } from '../../utils'
import * as kv from './kv';

const MODULE = 'src/controller/openai/openAiClient.ts'

export interface FreeUsage {
  total_granted: number // 美元
  total_used: number // 美元
  total_available: number // 美元
}

export interface Usage {
  total_usage: number // 美分
  daily_costs: {
    timestamp: number // 秒级
    line_items: {
      name: string // 模型名
      cost: number // 美分
    }[]
  }[]
}

export const finishReasonMap: { [key: string]: string } = {
  length: '长度限制',
}

export const defaultCompletionConfig: openai.CreateCompletionRequest = {
  model: CONFIG.CHAT_MODEL,
  max_tokens: CONFIG.MAX_CHAT_TOKEN_NUM,
}

export const defaultChatCompletionConfig: Omit<
  openai.CreateChatCompletionRequest,
  'messages'
> = {
  model: CONFIG.CHAT_MODEL,
}

export class OpenAiClient {
  constructor(readonly apiKey: string, readonly logger: Logger) { }

  async base<T = any>(params: {
    basePath?: string
    extraPath?: string
    init?: RequestInit<RequestInitCfProperties> & { timeout?: number }
  }) {
    const {
      basePath = CONFIG.OPEN_AI_API_PREFIX,
      extraPath = '',
      init = {},
    } = params

    const controller = new AbortController()
    const timer = setTimeout(
      () => controller.abort(),
      init.timeout || CONFIG.OPEN_AI_API_TIMEOUT_MS
    )
    await this.waitToHoldApiKey(this.apiKey);
    const start = Date.now()
    try {
      const resp = await fetch(`${basePath}${extraPath}`, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        ...init,
        signal: controller.signal,
      })

      const json = await resp.json<Record<string, any>>()
      this.logger.debug(
        `${MODULE} OpenAI 回复 ${Date.now() - start} ${JSON.stringify(json)}`
      )

      if ('error' in json && json.error) {
        this.logger.error(`${MODULE} OpenAI 错误 ${JSON.stringify(json.error)}`)
        return genFail(`OpenAI 错误\n> ${(json.error as Error).message}`)
      }

      return genSuccess(json as T)
    } catch (e) {
      const err = e as Error
      this.logger.error(
        `${MODULE} 请求 OpenAI 异常 ${Date.now() - start} ${errorToString(err)}`
      )
      return genFail(
        `请求 OpenAI 异常\n> ${err.name === 'AbortError' ? '请求超时' : err.message
        }`
      )
    } finally {
      clearTimeout(timer)
    }
  }

  async listModels() {
    const res = await this.base<openai.ListEnginesResponse>({
      extraPath: '/models',
      init: {
        method: 'GET',
        timeout: 3000,
      },
    })
    if (!res.success) return res

    const { data } = res.data
    return genSuccess(data)
  }

  async getUsage(startDate: string, endDate: string) {
    const res = await this.base<Usage>({
      basePath: `${CONFIG.OPEN_AI_USAGE}?end_date=${endDate}&start_date=${startDate}`,
      init: {
        method: 'GET',
        timeout: 3000,
      },
    })
    if (!res.success) return res

    return genSuccess(res.data)
  }

  async getFreeUsage() {
    const res = await this.base<FreeUsage>({
      basePath: CONFIG.OPEN_AI_FREE_USAGE,
      init: {
        method: 'GET',
        timeout: 3000,
      },
    })
    if (!res.success) return res

    return genSuccess(res.data)
  }

  async createCompletion(
    prompt: openai.CreateCompletionRequestPrompt,
    config = defaultCompletionConfig
  ) {
    const res = await this.base<openai.CreateCompletionResponse>({
      extraPath: '/completions',
      init: {
        method: 'POST',
        body: JSON.stringify({
          prompt,
          ...config,
        }),
      },
    })
    if (!res.success) return res

    const { id, usage, choices } = res.data
    const first = choices[0]
    if (first && first.text) {
      return genSuccess({
        id,
        usage,
        msg: first.text,
        finishReason: first.finish_reason ?? 'unknown',
        finishReasonZh:
          finishReasonMap[first.finish_reason as string] ?? '未知',
      })
    }

    return genFail(`OpenAI 返回异常\n> 数据为空`)
  }

  async createChatCompletion(
    messages: openai.ChatCompletionRequestMessage[],
    config = defaultChatCompletionConfig
  ) {
    const res = await this.base<openai.CreateChatCompletionResponse>({
      extraPath: '/chat/completions',
      init: {
        method: 'POST',
        body: JSON.stringify({
          messages,
          ...config,
        }),
      },
    })
    if (!res.success) return res

    const { id, usage, choices } = res.data
    const first = choices[0]
    if (first && first.message) {
      return genSuccess({
        id,
        usage: usage as openai.CreateCompletionResponseUsage,
        msg: first.message,
        finishReason: first.finish_reason || 'unknown',
        finishReasonZh:
          finishReasonMap[first.finish_reason as string] ?? '未知',
      })
    }

    return genFail(`OpenAI 返回异常\n> 数据为空`)
  }

  async waitToHoldApiKey(apiKey: string) {
    const apiKeyExpiredTimeRes = await kv.getApiKeyOccupied(apiKey);
    let waitDuration = 0;
    if (!apiKeyExpiredTimeRes.success) {
      this.logger.error(`${MODULE} 获取 apiKey '${apiKey}' 的过期时间失败`);
      return '服务异常'
    } else {
      const apiKeyExpiredTime = apiKeyExpiredTimeRes.data;
      if (!apiKeyExpiredTime) {
        this.logger.debug(`${MODULE} apiKey '${apiKey}' 未被占用，空值`);
      } else {
        waitDuration = parseInt(apiKeyExpiredTime) - Date.now();
        if (waitDuration <= 0) {
          this.logger.debug(`${MODULE} apiKey '${apiKey}' 未被占用，已过期 ${apiKeyExpiredTime}`);
          waitDuration = 0;
        } else {
          this.logger.debug(`${MODULE} apiKey '${apiKey}' 已被占用，等待 ${waitDuration}ms`);
        }
      }
    }
    await kv.setApiKeyOccupied(apiKey, CONFIG.OPEN_AI_API_KEY_OCCUPYING_DURATION + waitDuration / 1000 + 1);
    if (waitDuration > 0) {
      await sleep(waitDuration);
    }
  }
}
