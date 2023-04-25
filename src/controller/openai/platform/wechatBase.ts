import { genFail, genSuccess, genMyResponse, sleep } from '../../../utils'
import { CONST, CONFIG as GLOBAL_CONFIG } from '../../../global'
import { CONFIG, commandName } from '../config'
import { CONFIG as WE_CHAT_CONFIG } from '../../../platform/wechat/wechat'
import { estimateTokenCount } from '../utils'
import { Base } from './base'
import * as globalKV from '../../../kv'

import type * as wechatType from '../../../platform/wechat/wechatType'
import type * as weworkType from '../../../platform/wechat/weworkType'
import type { WeChat } from '../../../platform/wechat/wechat'
import type { WeWork } from '../../../platform/wechat/wework'

const MODULE = 'src/openai/platform/wechatBase.ts'

export abstract class WeChatBaseHandler<T extends WeWork | WeChat> extends Base<T> {
  protected platformTryTimes = 1

  abstract initCtx(): Promise<string | undefined>

  async initChatType() {
    const chatTypeRes = await this.kvChatType().getWithExpireRefresh()
    if (!chatTypeRes.success) {
      this.logger.debug(`${MODULE} 获取聊天类型失败`)
      return '服务异常'
    }
    if (chatTypeRes.data) {
      this.ctx.chatType = chatTypeRes.data
    }
  }

  async initOpenAiType() {
    const openaiTypeRes = await this.kvOpenAiType().getWithExpireRefresh()
    if (!openaiTypeRes.success) {
      this.logger.debug(`${MODULE} 获取聊天类型失败`)
      return '服务异常'
    }
    if (openaiTypeRes.data) {
      this.ctx.openaiType = openaiTypeRes.data
    }
  }

  async commonInit() {
    const r = await Promise.all([this.initChatType(), this.initOpenAiType()])
    for (const i of r) {
      if (i) return i
    }
  }

  async handleRequest() {
    return this.platform.handleRequest(this.handleRecvData.bind(this), async () => {
      const { recvData } = this.platform.ctx

      if (this.platformTryTimes === 1 || this.platformTryTimes === 2) {
        // 第 1，2 次请求 openAi 的让平台超时重试
        this.logger.debug(`${MODULE} 第${this.platformTryTimes}次超时回复`)
        await sleep(2000)
        return genMyResponse('success')
      }

      const msg =
        !this.ctx.isRequestOpenAi || 'Event' in recvData ? '服务异常，请稍后重试' : this.getRetryMessage(recvData.MsgId)
      this.logger.debug(`${MODULE} 超时兜底回复 ${msg}`)
      return this.genWeChatTextXmlResponse(msg)
    })
  }

  /**
   * 处理微信发来的消息/事件，根据情况对回复消息做加密
   */
  async handleRecvData(recvData: wechatType.RecvPlainData | weworkType.RecvPlainData) {
    const promise = recvData.MsgType === 'event' ? this._handleRecvEvent(recvData) : this._handleRecvMsg(recvData)

    // 确保处理完成后 cloudflare Worker 运行实例才会终止
    typeof promise !== 'string' && this.request.ctx.waitUntil(promise)
    const plainXmlMsg = await promise
    if (this.platform.ctx.isEncrypt) {
      const genRes = await this.platform.genRespEncryptXmlMsg(plainXmlMsg)
      this.logger.debug(`${MODULE} 加密回复 ${JSON.stringify(genRes)}`)
      return genRes.success ? genMyResponse(genRes.data) : genMyResponse('服务异常')
    }

    this.logger.debug(`${MODULE} 明文回复 ${plainXmlMsg}`)
    return genMyResponse(plainXmlMsg)
  }

  /**
   * 处理微信发来的消息，返回明文消息
   */
  async _handleRecvMsg(recvMsg: wechatType.RecvPlainMsg | weworkType.RecvPlainMsg) {
    let content = ''
    if (recvMsg.MsgType === 'text') {
      content = recvMsg.Content.trim()
    } else if (recvMsg.MsgType === 'voice') {
      if (!recvMsg.Recognition) {
        return this.platform.genRespTextXmlMsg('微信公众号未开通语音识别')
      }
      content = recvMsg.Recognition.trim()
    } else {
      return this.platform.genRespTextXmlMsg('只支持文字/语音消息')
    }

    const recvMsgTokenCount = estimateTokenCount(content)
    if (recvMsgTokenCount >= CONFIG.MAX_CHAT_TOKEN_NUM) {
      return this.platform.genRespTextXmlMsg('输入太长，不能多于约 2000 个汉字')
    }

    const initErr = await this.initCtx()
    if (initErr) {
      return this.platform.genRespTextXmlMsg(initErr)
    }
    this.resetLogger()

    if (GLOBAL_CONFIG.ECHO_MODE) {
      return this.platform.genRespTextXmlMsg(content)
    }

    const cmdRes = await this.handleCommandMessage(content)
    if (cmdRes !== null) {
      return cmdRes.success ? this.platform.genRespTextXmlMsg(cmdRes.data) : this.platform.genRespTextXmlMsg(cmdRes.msg)
    }

    this.ctx.isRequestOpenAi = true
    if (!this.ctx.apiKey) {
      return this.platform.genRespTextXmlMsg(`未绑定 OpenAI api key，请先使用 ${commandName.bindKey} 命令进行绑定`)
    }

    // 根据 msgId 看是否是平台发起的重试
    const msgId = recvMsg.MsgId
    const kvMsgTryTimes = this.kvMsgTryTimes(msgId)
    const kvAnswer = this.kvAnswer(msgId)
    const [tryTimesRes, answerRes] = await Promise.all([kvMsgTryTimes.getJson(), kvAnswer.get()])
    if (!tryTimesRes.success || !answerRes.success) {
      this.logger.info(`${MODULE} ${msgId} 获取消息记录失败 ${tryTimesRes.msg} ${answerRes.msg}`)
      return this.platform.genRespTextXmlMsg(`获取消息记录失败 ${tryTimesRes.msg} ${answerRes.msg}`)
    }

    // 有则是重试
    if (tryTimesRes.data) {
      this.platformTryTimes = tryTimesRes.data + 1
      this.logger.debug(`${MODULE} ${msgId} 第${this.platformTryTimes}次`)
      // 已有回答则直接返回
      if (answerRes.data) {
        this.logger.debug(`${MODULE} ${msgId} 已有回答直接返回`)
        return this.platform.genRespTextXmlMsg(answerRes.data)
      }
      this.request.ctx.waitUntil(kvMsgTryTimes.setWithStringify(this.platformTryTimes))

      // 否则等一下在超时之前再尝试一次
      const waitTime = WE_CHAT_CONFIG.WECHAT_HANDLE_MS_TIME - (Date.now() - this.request.startTime) - 1000
      this.logger.debug(`${MODULE} waitTime ${waitTime} 等一下再试`)
      if (waitTime > 0) {
        await sleep(waitTime)
      }
      const res = await kvAnswer.get()
      if (!res.success) {
        return this.platform.genRespTextXmlMsg(`获取回答失败 ${answerRes.msg}`)
      }
      if (res.data) {
        this.logger.debug(`${MODULE} ${msgId} 等到回答返回`)
        return this.platform.genRespTextXmlMsg(res.data)
      }

      // 第 2 次请求 openAi 的让平台超时重试
      if (this.platformTryTimes === 2) {
        await sleep(2000)
      } else {
        this.request.ctx.waitUntil(this.kvLastDelayPrompt().set(msgId))
      }
      return this.platform.genRespTextXmlMsg(this.getRetryMessage(msgId))
    }

    this.request.ctx.waitUntil(kvMsgTryTimes.setWithStringify(1))
    const respMsg = await this.openAiHandle(content, recvMsg.MsgId, recvMsgTokenCount)
    return this.platform.genRespTextXmlMsg(respMsg)
  }

  /**
   * 处理微信发来的事件，返回明文消息
   */
  _handleRecvEvent(recvPlainEvent: wechatType.RecvPlainEvent | weworkType.RecvPlainEvent) {
    if (recvPlainEvent.Event === 'subscribe') {
      return this.platform.genRespTextXmlMsg(CONFIG.WELCOME_MESSAGE)
    }

    return this.platform.genRespTextXmlMsg('success')
  }

  protected kvMsgTryTimes = (msgId: string) =>
    globalKV.createObj<number>(this.kvUserDimensionKey('tryTimes').child(msgId).key)

  private async genWeChatTextXmlResponse(xmlMsg: string) {
    const msg = this.platform.genRespTextXmlMsg(xmlMsg)
    if (this.platform.ctx.isEncrypt) {
      const encryptRes = await this.platform.genRespEncryptXmlMsg(msg)
      if (!encryptRes.success) {
        return genMyResponse('success')
      }
      return genMyResponse(encryptRes.data)
    }
    return genMyResponse(msg)
  }
}
