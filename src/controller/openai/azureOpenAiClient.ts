import { CONFIG } from './config'
import { errorToString, genFail, genSuccess, sleep } from '../../utils'
import * as kv from './kv'

import type openai from 'openai'
import type { Logger } from '../../utils'

const MODULE = 'src/controller/openai/azureOpenAiClient.ts'

export const finishReasonMap: { [key: string]: string } = {
  length: '长度限制',
  content_filter: '内容过滤',
}

export const defaultCompletionConfig: Omit<openai.CreateCompletionRequest, 'model'> = {
  max_tokens: CONFIG.MAX_CHAT_TOKEN_NUM,
}

export const defaultChatCompletionConfig: Omit<openai.CreateChatCompletionRequest, 'messages' | 'model'> = {
  max_tokens: CONFIG.MAX_CHAT_TOKEN_NUM,
  ...CONFIG.OPEN_AI_API_CHAT_EXTRA_PARAMS,
}

export class AzureOpenAiClient {
  readonly basePath: string
  readonly resourceName: string
  readonly deployName: string
  readonly apiKey: string

  constructor(readonly key: string, readonly logger: Logger) {
    const [resourceName, deployName, apiKey] = key.split(':')
    this.resourceName = resourceName
    this.deployName = deployName
    this.apiKey = apiKey
    this.basePath = CONFIG.AZURE_API_PREFIX.replace('RESOURCENAME', resourceName)
  }

  async base<T = any>(params: {
    basePath?: string
    extraPath?: string
    init?: RequestInit<RequestInitCfProperties> & { timeout?: number }
  }) {
    const { extraPath = '', init = {} } = params

    if (CONFIG.OPEN_AI_API_KEY_OCCUPYING_DURATION > 0) {
      await this.waitToHoldApiKey(this.apiKey)
    }

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), init.timeout || CONFIG.OPEN_AI_API_TIMEOUT_MS)

    const start = Date.now()
    try {
      const resp = await fetch(`${this.basePath}${extraPath}`, {
        headers: {
          'Content-Type': 'application/json',
          'api-key': this.apiKey,
        },
        ...init,
        signal: controller.signal,
      })

      const json = await resp.json<Record<string, any>>()
      this.logger.debug(`${MODULE} AzureOpenAI 回复 ${Date.now() - start} ${JSON.stringify(json)}`)

      if ('error' in json && json.error) {
        this.logger.error(`${MODULE} AzureOpenAI 错误 ${JSON.stringify(json.error)}`)
        return genFail(`AzureOpenAI 错误\n> ${(json.error as Error).message}`)
      }

      return genSuccess(json as T)
    } catch (e) {
      const err = e as Error
      this.logger.error(`${MODULE} 请求 AzureOpenAI 异常 ${Date.now() - start} ${errorToString(err)}`)
      return genFail(`请求 AzureOpenAI 异常\n> ${err.name === 'AbortError' ? '请求超时' : err.message}`)
    } finally {
      clearTimeout(timer)
    }
  }

  async listModels() {
    const res = await this.base<openai.ListEnginesResponse>({
      extraPath: `/models?api-version=${CONFIG.AZURE_LIST_MODEL_API_VERSION}`,
      init: {
        method: 'GET',
        timeout: 3000,
      },
    })
    if (!res.success) return res

    const { data } = res.data
    return genSuccess(data)
  }

  async createCompletion(prompt: openai.CreateCompletionRequestPrompt, config = defaultCompletionConfig) {
    const res = await this.base<openai.CreateCompletionResponse>({
      extraPath: `/deployments/${this.deployName}/completions?api-version=${CONFIG.AZURE_CHAT_API_VERSION}`,
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
        finishReasonZh: finishReasonMap[first.finish_reason as string] ?? '未知',
      })
    }

    return genFail(`AzureOpenAI 返回异常\n> 数据为空`)
  }

  async createChatCompletion(messages: openai.ChatCompletionRequestMessage[], config = defaultChatCompletionConfig) {
    const res = await this.base<openai.CreateChatCompletionResponse>({
      extraPath: `/deployments/${this.deployName}/chat/completions?api-version=${CONFIG.AZURE_CHAT_API_VERSION}`,
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
        finishReasonZh: finishReasonMap[first.finish_reason as string] ?? '未知',
      })
    }

    return genFail(`AzureOpenAI 返回异常\n> 数据为空`)
  }

  /**
   * 用 kv 实现限流只能说勉强能用
   * TODO @see https://github.com/ilyydy/cf-openai/issues/14
   */
  async waitToHoldApiKey(apiKey: string) {
    const waitDurationRes = await kv.getApiKeyWaitDuration(apiKey)
    if (!waitDurationRes.success) {
      this.logger.error(`${MODULE} 获取 apiKey '${apiKey}' 的过期时间失败`)
      return '服务异常'
    }

    const waitDuration = waitDurationRes.data
    this.logger.debug(`${MODULE} apiKey '${apiKey}' waitDuration ${waitDuration}ms`)

    await kv.setApiKeyOccupied(apiKey, CONFIG.OPEN_AI_API_KEY_OCCUPYING_DURATION * 1000 + waitDuration + 1000)
    if (waitDuration > 0) {
      await sleep(waitDuration)
    }
  }
}
