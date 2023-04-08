import { genFail, genSuccess, buildLogger, errorToString, sendAlarmMsg, mergeFromEnv } from '../../../utils'
import { CONST, CONFIG as GLOBAL_CONFIG } from '../../../global'
import { CONFIG, commandName } from '../config'
import { OpenAiBrowserClient, OpenAiClient } from '../openAiClient'
import * as globalKV from '../../../kv'
import { estimateTokenCount, getApiKeyWithMask, getTextWithMask } from '../utils'
import { platformMap } from '../../../platform'

import type openai from 'openai'
import type { Role } from '../../../global'
import type { MyRequest, MyResponse } from '../../../types'
import type { Platform, PlatformType } from '../../../platform/types'
import type { ChatType, ChatMsg, HistoryMsg } from '../types'
import type { Logger } from '../../../utils'

const MODULE = 'src/openai/platform/base.ts'

export const defaultCtx = {
  apiKey: '', // 用户的 OpenAI apiKey
  role: new Set([CONST.ROLE.GUEST]) as Set<Role>,
  chatType: '单聊' as ChatType,
  conversationId: '',
  isRequestOpenAi: false, // 收到的消息是命令还是请求 OpenAI
}

export abstract class Base<T extends Platform<PlatformType>> {
  readonly ctx = { ...defaultCtx }
  readonly request: MyRequest
  readonly platform: T
  logger: Logger

  constructor(request: MyRequest, platformType: PlatformType, id: string) {
    const platform = new platformMap[platformType](request, id)
    this.platform = platform as unknown as T
    this.request = request
    this.logger = platform.logger

    mergeFromEnv(request.env, CONFIG)
    platform.logger.debug(`${MODULE} openai config ${JSON.stringify(CONFIG)}`)
  }

  abstract handleRequest(): Promise<MyResponse>

  async openAiHandle(msgContent: string, msgId: string, msgTokenCount: number) {
    const openAi = new OpenAiClient(this.ctx.apiKey, this.logger)

    const respMsg = await this.openAiChat(openAi, msgContent, msgId, msgTokenCount)
    return respMsg
  }

  /**
   * 调用 OpenAI completion 接口，目前未用到
   */
  async openAiCompletion(openai: OpenAiClient, msgContent: string) {
    const r = await openai.createCompletion(msgContent)
    if (!r.success) {
      return r.msg
    }
    let responseMsg = r.data.msg
    if (r.data.finishReason !== 'stop') {
      responseMsg = `${responseMsg}\n(因${r.data.finishReasonZh}未返回完全)`
    }
    return responseMsg
  }

  /**
   * 调用 OpenAI chat 接口
   */
  async openAiChat(openai: OpenAiClient, msgContent: string, msgId: string, msgTokenCount: number) {
    // 根据 msgId 看是否收到过，一般是平台发起的重试
    const kvPrompt = this.kvPrompt(msgId)
    await kvPrompt.set(msgContent)
    const kvAnswer = this.kvAnswer(msgId)

    if (this.ctx.chatType === '单聊') {
      const r = await openai.createChatCompletion([
        {
          role: 'system',
          content: CONFIG.SYSTEM_INIT_MESSAGE,
        },
        {
          role: 'user',
          content: msgContent,
        },
      ])
      if (!r.success) {
        this.request.ctx.waitUntil(kvAnswer.set(r.msg))
        return r.msg
      }
      const { msg: respMsg, finishReasonZh, usage } = r.data
      let responseMsgContent = respMsg.content
      if (r.data.finishReason !== 'stop') {
        responseMsgContent = `${responseMsgContent}\n(因${finishReasonZh}未返回完全)`
      }
      this.request.ctx.waitUntil(kvAnswer.set(responseMsgContent))
      return responseMsgContent
    }

    // 获取最后一次串聊输入输出
    const kvLastChatPrompt = this.kvLastChatPrompt()
    const kvLastChatAnswer = this.kvLastChatAnswer()
    const [lastChatPromptRes, lastChatAnswerRes] = await Promise.all([
      kvLastChatPrompt.getJson(),
      kvLastChatAnswer.getJson(),
    ])
    if (!lastChatPromptRes.success || !lastChatAnswerRes.success) {
      this.logger.info(`${MODULE} 获取聊天记录失败 ${lastChatPromptRes.msg} ${lastChatAnswerRes.msg}`)
      return `获取聊天记录失败 ${lastChatPromptRes.msg} ${lastChatAnswerRes.msg}`
    }

    const conversationId = lastChatPromptRes.data?.conversationId ?? this.request.reqId
    this.ctx.conversationId = conversationId

    const messagesRes = await this.buildChatMessages({
      msgContent,
      msgTokenCount,
      lastChatPrompt: lastChatPromptRes.data,
      lastChatAnswer: lastChatAnswerRes.data,
    })
    if (!messagesRes.success) {
      return messagesRes.msg
    }
    const { messages, newHistory } = messagesRes.data
    this.logger.debug(`${MODULE} messages 长度 ${messages.length} newHistory 长度 ${newHistory.length}`)

    // 更新历史
    const kvHistory = this.kvHistory()
    this.request.ctx.waitUntil(
      Promise.all([
        kvLastChatPrompt.setWithStringify({
          content: msgContent,
          conversationId,
          msgId,
          tokenNum: msgTokenCount,
        }),
        kvLastChatAnswer.del(),
        kvHistory.setWithStringify(newHistory),
      ])
    )

    const r = await openai.createChatCompletion(messages)
    if (!r.success) {
      this.request.ctx.waitUntil(kvAnswer.set(r.msg))
      return r.msg
    }
    const { msg: respMsg, finishReasonZh, usage } = r.data

    // 结合回复再更新历史
    this.request.ctx.waitUntil(this.updateHistory(msgId, newHistory, respMsg, usage))

    let responseMsgContent = respMsg.content
    if (r.data.finishReason !== 'stop') {
      responseMsgContent = `${responseMsgContent}\n(因${finishReasonZh}未返回完全)`
    }
    return responseMsgContent
  }

  /**
   * 串聊时调用，构建发送给 OpenAI 的消息
   */
  async buildChatMessages(params: {
    msgContent: string
    msgTokenCount: number
    lastChatPrompt: ChatMsg | null
    lastChatAnswer: ChatMsg | null
  }) {
    const { msgTokenCount: recvMsgTokenCount, lastChatAnswer, lastChatPrompt, msgContent } = params

    const initMsg = CONFIG.SYSTEM_INIT_MESSAGE
    const initMsgTokenCount = estimateTokenCount(initMsg)

    const newHistory: HistoryMsg[] = [
      {
        role: 'user',
        content: msgContent,
        tokenNum: recvMsgTokenCount,
      },
    ]
    const messages: openai.ChatCompletionRequestMessage[] = [
      {
        role: 'user',
        content: msgContent,
      },
    ]

    // 没有最后一次聊天记录，也就是没有历史聊天
    if (!lastChatPrompt) {
      this.logger.debug(`${MODULE} 没有最后一次聊天记录`)
      newHistory.unshift({
        role: 'system',
        content: initMsg,
        tokenNum: initMsgTokenCount,
      })
      messages.unshift({
        role: 'system',
        content: initMsg,
      })
      return genSuccess({ messages, newHistory })
    }

    let tokenNumForHistory =
      CONFIG.MAX_CHAT_TOKEN_NUM -
      CONFIG.MIN_CHAT_RESPONSE_TOKEN_NUM -
      initMsgTokenCount -
      recvMsgTokenCount -
      (lastChatAnswer?.tokenNum ?? 0) -
      lastChatPrompt.tokenNum
    this.logger.debug(`${MODULE} tokenNumForHistory ${tokenNumForHistory}`)

    // 获取历史
    const kvHistory = this.kvHistory()
    const historyRes = await kvHistory.getJson()
    if (!historyRes.success) {
      this.logger.debug(`${MODULE} 获取历史失败 ${historyRes.msg}`)
      return genFail('获取聊天记录失败')
    }
    // 实际应该不可能为空
    if (historyRes.data && historyRes.data.length > 0) {
      let history = historyRes.data
      // 第一个是 system 消息，必放
      const firstSystemMsg = history.shift() as HistoryMsg

      // 历史记录超出长度需要裁剪
      if (history.length > CONFIG.MAX_HISTORY_LENGTH) {
        history = history.splice(history.length - CONFIG.MAX_HISTORY_LENGTH)
      }

      // 逆序遍历历史，找到 token 数量限制内的历史
      let historyIdx = history.length - 1
      while (tokenNumForHistory > 0 && historyIdx >= 0) {
        const historyItem = history[historyIdx]
        const { tokenNum, role, content } = historyItem

        if (tokenNumForHistory >= tokenNum) {
          newHistory.unshift(historyItem)
          messages.unshift({
            role,
            content,
          })
          tokenNumForHistory -= tokenNum

          historyIdx -= 1
        } else {
          break
        }
      }

      newHistory.unshift(firstSystemMsg)
      messages.unshift({
        content: firstSystemMsg.content,
        role: firstSystemMsg.role,
      })
    } else {
      newHistory.unshift({
        role: 'system',
        content: initMsg,
        tokenNum: initMsgTokenCount,
      })
      messages.unshift({
        role: 'system',
        content: initMsg,
      })
    }

    return genSuccess({ messages, newHistory })
  }

  /**
   * 更新缓存中的历史聊天，用于之后的串聊
   */
  async updateHistory(
    msgId: string,
    oldHistory: HistoryMsg[],
    responseMsg: openai.ChatCompletionResponseMessage,
    usage: openai.CreateCompletionResponseUsage
  ) {
    const { conversationId } = this.ctx

    // 用 token 准确值更新
    oldHistory[oldHistory.length - 1].tokenNum = oldHistory.reduce((total, item, idx) => {
      if (idx === oldHistory.length - 1) {
        return total - item.tokenNum
      }
      return total
    }, usage.prompt_tokens)
    // 回答放入历史
    oldHistory.push({ ...responseMsg, tokenNum: usage.completion_tokens })
    const kvHistory = this.kvHistory()
    const kvAnswer = this.kvAnswer(msgId)
    const promiseList = [kvHistory.setWithStringify(oldHistory), kvAnswer.set(responseMsg.content)]

    const kvLastChatPrompt = this.kvLastChatPrompt()
    const kvLastChatAnswer = this.kvLastChatAnswer()
    const lastChatPromptRes = await kvLastChatPrompt.getJson()
    if (lastChatPromptRes.success) {
      // kv 存的还是这次提问，没有被其他提问覆盖
      if (lastChatPromptRes.data?.msgId === msgId) {
        promiseList.push(
          kvLastChatAnswer.setWithStringify({
            content: responseMsg.content,
            conversationId,
            msgId,
            tokenNum: usage.completion_tokens,
          })
        )
      } else {
        this.logger.info(`${MODULE} kv 存的提问已由 ${msgId} 变为 ${lastChatPromptRes.data?.msgId ?? ''}`)
      }
    }

    await Promise.all(promiseList)
  }

  /**
   * 需要在 platform 有 userId 之后调用
   */
  async isGlobalAdmin() {
    const r = await globalKV.isAdmin(this.platform.ctx.userId)
    if (r.success && r.data) return true
    return false
  }

  async getSessionKey() {
    const keyRes = await this.kvSessionKey().getWithExpireRefresh()
    if (!keyRes.success) {
      this.logger.debug(`${MODULE} 获取 session 失败`)
      return genFail('服务异常')
    }
    if (keyRes.data) {
      return genSuccess(keyRes.data)
    }
    return genFail('未绑定 session key')
  }

  protected kvUserDimensionKey = (part: string) =>
    globalKV.KeyBuilder.of('openai', part, this.platform.ctx.platform, this.platform.id, this.platform.ctx.userId)

  protected kvUserDimension = <T = string>(part: string) => globalKV.createObj<T>(this.kvUserDimensionKey(part).key)
  protected kvApiKey = () => this.kvUserDimension('apiKey')
  protected kvSessionKey = () => this.kvUserDimension('sessionKey')
  protected kvChatType = () => this.kvUserDimension<ChatType>('chatType')
  protected kvLastChatPrompt = () => this.kvUserDimension<ChatMsg>('lastChatPrompt')
  protected kvLastChatAnswer = () => this.kvUserDimension<ChatMsg>('lastChatAnswer')
  protected kvLastDelayPrompt = () => this.kvUserDimension('lastDelayPrompt')
  protected kvHistory = () =>
    globalKV.createObj<HistoryMsg[]>(this.kvUserDimensionKey('history').child(this.ctx.conversationId).key)
  protected kvPrompt = (msgId: string) => {
    const obj = globalKV.createObj(this.kvUserDimensionKey('prompt').child(msgId).key)

    return {
      set: (content: string) => obj.set(content, { expirationTtl: CONFIG.ANSWER_EXPIRES_MINUTES * CONST.TIME.ONE_MIN }),
      get: obj.get,
      del: obj.del,
    }
  }
  protected kvAnswer = (msgId: string) => {
    const obj = globalKV.createObj(this.kvUserDimensionKey('answer').child(msgId).key)

    return {
      set: (content: string) => obj.set(content, { expirationTtl: CONFIG.ANSWER_EXPIRES_MINUTES * CONST.TIME.ONE_MIN }),
      get: obj.get,
      del: obj.del,
    }
  }

  protected commands = {
    // TODO admin 更多能力
    // TODO 角色能力配置化？
    [commandName.help]: {
      description: '获取命令帮助信息',
      roles: [CONST.ROLE.GUEST, CONST.ROLE.USER],
      fn: this.getHelpMsg.bind(this),
    },
    [commandName.bindKey]: {
      description: `绑定 OpenAI api key，格式如 /bindKey xxx。如已绑定 key，则会覆盖。刚绑定后的 1 分钟由于不同节点需要时间数据同步，可能出现提示未绑定，请稍等再试。可以先用 ${commandName.testKey} 命令测试是否正常可用`,
      roles: [CONST.ROLE.GUEST, CONST.ROLE.USER],
      fn: this.bindKey.bind(this),
    },
    [commandName.unbindKey]: {
      description: '解绑 OpenAI api key',
      roles: [CONST.ROLE.USER],
      fn: this.unbindKey.bind(this),
    },
    [commandName.testKey]: {
      description: '调用 OpenAI 列出模型接口，测试 api key 是否正常绑定可用，不消耗用量',
      roles: [CONST.ROLE.USER],
      fn: this.testKey.bind(this),
    },
    [commandName.setChatType]: {
      description: `切换对话模式，可选'单聊'和'串聊'，默认'单聊'。'单聊'只处理当前的输入，'串聊'会带上历史聊天记录请求 OpenAI，消耗更多用量`,
      roles: [CONST.ROLE.USER, CONST.ROLE.FREE_TRIAL],
      fn: this.setChatType.bind(this),
    },
    [commandName.newChat]: {
      description: '清除之前的串聊历史记录，开始新的串聊',
      roles: [CONST.ROLE.USER, CONST.ROLE.FREE_TRIAL],
      fn: this.createNewChat.bind(this),
    },
    [commandName.retry]: {
      description: `根据 msgId 获取对应回答，回答只会保留 ${CONFIG.ANSWER_EXPIRES_MINUTES} 分钟`,
      roles: [CONST.ROLE.USER, CONST.ROLE.FREE_TRIAL],
      fn: this.retry.bind(this),
    },
    [commandName.retryLastMessage]: {
      description: '重试上一个延迟的回答',
      roles: [CONST.ROLE.USER, CONST.ROLE.FREE_TRIAL],
      fn: this.retryLastMessage.bind(this),
    },
    [commandName.retryLastMessage2]: {
      description: '重试上一个延迟的回答',
      roles: [CONST.ROLE.USER, CONST.ROLE.FREE_TRIAL],
      fn: this.retryLastMessage.bind(this),
    },
    [commandName.bindSessionKey]: {
      description:
        '绑定 OpenAI session key，可查看用量页面对 https://api.openai.com/dashboard/billing/credit_grants 的请求头获得',
      roles: [CONST.ROLE.GUEST, CONST.ROLE.USER],
      fn: this.bindSessionKey.bind(this),
    },
    [commandName.unbindSessionKey]: {
      description: '解绑 OpenAI session key',
      roles: [CONST.ROLE.USER],
      fn: this.unbindKey.bind(this),
    },
    [commandName.usage]: {
      description: `获取本月用量信息，可能有 5 分钟左右的延迟，需要先用命令 ${commandName.bindSessionKey} 进行绑定`,
      roles: [CONST.ROLE.USER],
      fn: this.getUsage.bind(this),
    },
    [commandName.freeUsage]: {
      description: `获取免费用量信息，可能有 5 分钟左右的延迟，需要先用命令 ${commandName.bindSessionKey} 进行绑定`,
      roles: [CONST.ROLE.USER],
      fn: this.getFreeUsage.bind(this),
    },
    // TODO
    // [commandName.version]: {
    //   description: '获取当前版本号, 判断是否需要更新',
    //   roles: [CONST.ROLE.ADMIN],
    //   fn: commandFetchUpdate,
    // },
    // [commandName.setEnv]: {
    //   description: '设置用户配置，命令完整格式为 /setEnv KEY=VALUE',
    //   roles: [CONST.ROLE.USER, CONST.ROLE.ADMIN],
    //   fn: commandUpdateUserConfig,
    // },
    [commandName.system]: {
      description: '查看当前一些系统配置信息',
      roles: [CONST.ROLE.USER, CONST.ROLE.ADMIN],
      fn: this.commandSystem.bind(this),
    },
    [commandName.faq]: {
      description: '一些常见问题',
      roles: [CONST.ROLE.GUEST, CONST.ROLE.USER],
      fn: getFaqMsg,
    },
    [commandName.adminAuth]: {
      description: '通过 token 认证成为 admin',
      roles: [CONST.ROLE.GUEST, CONST.ROLE.USER],
      fn: this.adminAuth.bind(this),
      hidden: true, // 隐藏命令
    },
    [commandName.testAlarm]: {
      description: '测试发送告警消息',
      roles: [CONST.ROLE.ADMIN],
      fn: this.testAlarm.bind(this),
    },
    [commandName.feedback]: {
      description: '向开发者提出建议和反馈问题',
      roles: [CONST.ROLE.GUEST, CONST.ROLE.USER],
      fn: this.feedback.bind(this),
      hidden: !GLOBAL_CONFIG.FEEDBACK_URL,
    },
  }

  protected getHelpMsg(subcommand: string) {
    const { role } = this.ctx

    const cmdList: { name: string; description: string }[] = []
    if (subcommand) {
      const obj = this.commands[subcommand]
      const roles = obj.roles as Role[]
      if (!obj || roles.every((i) => !role.has(i)) || obj.hidden) {
        return genFail(`命令 ${subcommand} 不存在`)
      }
      cmdList.push({ name: subcommand, description: obj.description })
    } else {
      Object.entries(this.commands).forEach(([name, obj]) => {
        const roles = obj.roles as Role[]
        if (roles.some((i) => role.has(i)) && !obj.hidden) {
          cmdList.push({ name, description: obj.description })
        }
      })
    }

    const msg =
      '当前支持以下命令:\n' + cmdList.map(({ name, description }) => `⭐【${name}】: ${description}`).join('\n')
    return genSuccess(msg)
  }

  protected async bindKey(key: string) {
    if (
      typeof key !== 'string' ||
      key.trim().length > CONFIG.OPEN_AI_API_KEY_MAX_LEN ||
      key.trim().length < CONFIG.OPEN_AI_API_KEY_MIN_LEN
    ) {
      return genFail(`绑定失败 key 格式不合法`)
    }
    const r = await this.kvApiKey().setWithExpireMetaData(key.trim())
    if (!r.success) {
      return genFail(`绑定失败 ${r.msg}`)
    }
    return genSuccess('绑定成功')
  }

  protected async unbindKey(params: any) {
    const r = await this.kvApiKey().del()
    if (!r.success) {
      return genFail(`解绑失败 ${r.msg}`)
    }
    return genSuccess('解绑成功')
  }

  protected async testKey(params: any) {
    const openAi = new OpenAiClient(this.ctx.apiKey, this.logger)
    const r = await openAi.listModels()
    if (!r.success) {
      return genFail(`测试失败 ${r.msg}`)
    }
    return genSuccess('测试成功')
  }

  protected async setChatType(params: string) {
    if (params !== '单聊' && params !== '串聊') {
      return genFail(`输入不合法，应输入'单聊'或'串聊'，请重新输入`)
    }

    const r = await this.kvChatType().setWithExpireMetaData(params)
    if (!r.success) {
      return genFail(`切换失败 ${r.msg}`)
    }

    return genSuccess(`切换为'${params}'成功`)
  }

  protected async createNewChat(params: any) {
    const r = await this.kvLastChatPrompt().del()
    if (!r.success) {
      return genFail(`建立新串聊失败 ${r.msg}`)
    }
    this.ctx.conversationId = ''
    return genSuccess('建立新串聊成功')
  }

  protected async retry(msgId: string) {
    if (!msgId || !msgId.trim()) {
      return genFail('msgId 为空')
    }

    const kvPrompt = this.kvPrompt(msgId)
    const kvAnswer = this.kvAnswer(msgId)
    const [promptRes, answerRes] = await Promise.all([kvPrompt.get(), kvAnswer.get()])
    if (!promptRes.success || !answerRes.success) {
      return genFail(`获取聊天记录失败 ${promptRes.msg} ${answerRes.msg}`)
    }
    if (promptRes.data) {
      // 已有回答则直接返回
      if (answerRes.data) {
        return genSuccess(answerRes.data)
      }
      // 否则提示用户稍等重试
      return genSuccess(this.getRetryMessage(msgId))
    }

    return genSuccess('该 msgId 无记录，可能已过期')
  }

  protected async retryLastMessage(params: any) {
    const res = await this.kvLastDelayPrompt().get()
    if (!res.success) {
      return genFail('获取记录失败')
    }
    const msgId = res.data
    if (!msgId) {
      return genSuccess('无最后一次延迟记录')
    }
    this.logger.debug(`${MODULE} 最后一次延迟记录 ${msgId}`)
    return this.retry(msgId)
  }

  protected async bindSessionKey(key: string) {
    if (typeof key !== 'string' || key.length < 40 || key.length > 60) {
      return genFail(`绑定失败 session key 格式不合法`)
    }
    const r = await this.kvSessionKey().setWithExpireMetaData(key.trim())
    if (!r.success) {
      return genFail(`绑定失败 ${r.msg}`)
    }
    return genSuccess('绑定成功')
  }

  protected async unbindSessionKey(params: any) {
    const r = await this.kvSessionKey().del()
    if (!r.success) {
      return genFail(`解绑失败 ${r.msg}`)
    }
    return genSuccess('解绑成功')
  }

  protected async getUsage(params: any) {
    const now = new Date()
    const startDate = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}-01`
    const year = now.getUTCMonth() === 11 ? now.getUTCFullYear() + 1 : now.getUTCFullYear()
    const month = now.getUTCMonth() === 11 ? '01' : `${now.getUTCMonth() + 2}`
    const endDate = `${year}-${month.padStart(2, '0')}-01`

    const keyRes = await this.getSessionKey()
    if (!keyRes.success) {
      return keyRes
    }
    const openAi = new OpenAiBrowserClient(keyRes.data, this.logger)
    const r = await openAi.getUsage(startDate, endDate)
    if (!r.success) {
      return genFail(`获取失败 ${r.msg}`)
    }
    const msg = `${startDate} ~ ${endDate}(UTC时间)已用: $${r.data.total_usage / 100}`
    return genSuccess(msg)
  }

  protected async getFreeUsage(params: any) {
    const keyRes = await this.getSessionKey()
    if (!keyRes.success) {
      return keyRes
    }
    const openAi = new OpenAiBrowserClient(keyRes.data, this.logger)
    const r = await openAi.getFreeUsage()
    if (!r.success) {
      return genFail(`获取失败 ${r.msg}`)
    }
    const msg = `免费用量已用: $${r.data.total_used}，剩余: $${r.data.total_available}，总共: $${r.data.total_granted}`
    return genSuccess(msg)
  }

  protected async commandSystem(params: any) {
    const { platform, userId, appid } = this.platform.ctx
    const { apiKey, conversationId, chatType, role } = this.ctx
    const isAdmin = role.has(CONST.ROLE.ADMIN)

    const sessionKeyRes = await this.kvSessionKey().getWithExpireRefresh()
    const sessionKey = sessionKeyRes.success
      ? sessionKeyRes.data
        ? getTextWithMask(sessionKeyRes.data)
        : '未绑定'
      : '获取失败'

    const msgList = [
      '当前系统信息如下: ',
      `⭐OpenAI 模型: ${CONFIG.CHAT_MODEL}`,
      `⭐OpenAI api key: ${getApiKeyWithMask(apiKey)}`,
      `⭐OpenAI session key: ${sessionKey}`,
      `⭐OpenAI 对话模式: ${chatType}`,
      `⭐当前用户: ${isAdmin ? userId : getTextWithMask(userId)}`,
    ]

    if (GLOBAL_CONFIG.DEBUG_MODE) {
      msgList.push(`⭐OpenAI 参数: ${JSON.stringify(CONFIG.OPEN_AI_API_EXTRA_PARAMS)}`)
      msgList.push(`⭐初始化文本: ${CONFIG.SYSTEM_INIT_MESSAGE}`)
      msgList.push(`⭐当前 reqId: ${this.request.reqId}`)
      if (conversationId) {
        msgList.push(`⭐当前 conversationId: ${conversationId}`)
      }
      // TODO 更多信息
      // TODO admin
    }

    if (isAdmin) {
      const token = GLOBAL_CONFIG.ADMIN_AUTH_TOKEN ? `${GLOBAL_CONFIG.ADMIN_AUTH_TOKEN.slice(0, 4)}****` : '无'
      msgList.push(`⭐当前 ADMIN_AUTH_TOKEN: ${token}`)
    }

    const msg = msgList.join('\n')
    return genSuccess(msg)
  }

  // TODO 限频/拉黑等安全防控
  protected async adminAuth(token: string) {
    if (!GLOBAL_CONFIG.ADMIN_AUTH_TOKEN) {
      return genFail('')
    }
    if (token !== GLOBAL_CONFIG.ADMIN_AUTH_TOKEN) {
      return genFail('失败')
    }

    const setRes = await globalKV.setAdmin(this.platform.ctx.userId)
    if (!setRes.success) {
      return genFail(setRes.msg)
    }

    return genSuccess('成功')
  }

  protected async testAlarm(msg: string) {
    if (!GLOBAL_CONFIG.ALARM_URL) {
      return genFail('未配置告警地址')
    }

    const res = await sendAlarmMsg(msg, GLOBAL_CONFIG.ALARM_URL)
    if (!res.success) {
      return res
    }

    return genSuccess('成功')
  }

  protected async feedback(msg: string) {
    if (!GLOBAL_CONFIG.FEEDBACK_URL) {
      return genFail('开发者未开启此功能')
    }

    const res = await sendAlarmMsg(`【用户反馈 ${this.platform.ctx.userId}】 ${msg}`, GLOBAL_CONFIG.FEEDBACK_URL)
    if (!res.success) {
      return res
    }

    return genSuccess('已收到，谢谢反馈')
  }

  protected async handleCommandMessage(message: string) {
    for (const [command, commandObj] of Object.entries(this.commands)) {
      const roles = commandObj.roles as Role[]
      if (roles.every((i) => !this.ctx.role.has(i))) continue
      if (
        message.toLowerCase() === command.toLowerCase() ||
        message.toLowerCase().startsWith(`${command.toLowerCase()} `)
      ) {
        const params = message.slice(command.length).trim()
        this.logger.info(`${MODULE} 执行命令 ${command} 参数 ${params}`)

        try {
          const r = await commandObj.fn(params)
          this.logger.debug(`${MODULE} 命令执行结果 ${JSON.stringify(r)}`)
          return r
        } catch (error) {
          this.logger.error(`${MODULE} 命令执行错误 ${errorToString(error as Error)}`)
          return genFail('服务异常：执行命令是失败')
        }
      }
    }

    return null
  }

  protected getRetryMessage(msgId: string) {
    return `正在处理中，请稍后输入 ${commandName.retryLastMessage} 或以下命令获取回答\n${commandName.retry} ${msgId}`
  }

  protected resetLogger() {
    const logger = buildLogger({
      platform: this.platform.ctx.platform,
      id: this.platform.id,
      reqId: this.request.reqId,
      userId: this.platform.ctx.userId,
      role: Array.from(this.ctx.role).join(','),
      chatType: this.ctx.chatType,
    })
    this.platform.logger = logger
    this.logger = logger
    return logger
  }
}

export const faqList = [
  '只能发纯文本消息',
  '输入命令可忽略大小写',
  'OpenAI 赠送的免费用量于 2023年6月1日(UTC时间) 过期',
  `一些平台会限制回复用户消息的最大等待时间，如微信限制 15 秒内必须回复否则提示公众号服务故障，而 OpenAI 可能需要更长时间处理，这种情况会先返回提示消息，在后台继续处理`,
  `串聊会带上历史消息，一方面会消耗更多用量，另一方面容易达到 OpenAI 消息总长上限，应常用使用命令 ${commandName.newChat} 清除历史`,
  '串聊避免短时间连续提问，会影响历史消息连贯性',
  '串聊历史记录不使用则最长保留一天，OpenAI api key 不使用最长保留一个月',
  'Cloudflare 不同节点数据同步最长需要 1 分钟，因此可能出现绑定 key、切换聊天类型等操作后未立即生效的情况',
]

export function getFaqMsg() {
  return genSuccess(faqList.map((str, idx) => `${idx + 1}. ${str}`).join('\n'))
}
