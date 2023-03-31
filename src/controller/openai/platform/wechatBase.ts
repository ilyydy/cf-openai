import { genFail, genSuccess, genMyResponse } from '../../../utils'
import { CONST, CONFIG as GLOBAL_CONFIG } from '../../../global'
import { CONFIG, commandName } from '../config'
import * as kv from '../kv'
import { estimateTokenCount } from '../utils'
import { Base } from './base'

import type * as wechatType from '../../../platform/wechat/wechatType'
import type * as weworkType from '../../../platform/wechat/weworkType'
import type { WeChat } from '../../../platform/wechat/wechat'
import type { WeWork } from '../../../platform/wechat/wework'

const MODULE = 'src/openai/platform/wechatBase.ts'

export abstract class WeChatBaseHandler<
  T extends WeWork | WeChat
> extends Base<T> {
  async handleRequest() {
    return this.platform.handleRequest(this.handleRecvData.bind(this), () => {
      const { recvData } = this.platform.ctx

      const msg =
        !this.ctx.isRequestOpenAi || 'Event' in recvData || !recvData.MsgId
          ? '服务异常，请稍后重试'
          : `正在处理中，请稍后用\n${commandName.retry} ${recvData.MsgId}\n命令获取回答`
      return this.genWeChatTextXmlResponse(msg)
    })
  }

  /**
   * 处理微信发来的消息/事件，根据情况对回复消息做加密
   */
  async handleRecvData(
    recvData: wechatType.RecvPlainData | weworkType.RecvPlainData
  ) {
    const promise =
      recvData.MsgType === 'event'
        ? this._handleRecvEvent(recvData)
        : this._handleRecvMsg(recvData)

    // 确保处理完成后 cloudflare Worker 运行实例才会终止
    typeof promise !== 'string' && this.request.ctx.waitUntil(promise)
    const plainXmlMsg = await promise
    if (this.platform.ctx.isEncrypt) {
      const genRes = await this.platform.genSendEncryptXmlMsg(plainXmlMsg)
      this.logger.debug(`${MODULE} 加密回复 ${JSON.stringify(genRes)}`)
      return genRes.success
        ? genMyResponse(genRes.data)
        : genMyResponse('服务异常')
    }

    this.logger.debug(`${MODULE} 明文回复 ${plainXmlMsg}`)
    return genMyResponse(plainXmlMsg)
  }

  /**
   * 处理微信发来的消息，返回明文消息
   */
  async _handleRecvMsg(
    recvMsg: wechatType.RecvPlainMsg | weworkType.RecvPlainMsg
  ) {
    if (recvMsg.MsgType !== 'text') {
      return this.platform.genSendTextXmlMsg('只支持文字消息')
    }
    recvMsg.Content = recvMsg.Content.trim()
    const recvMsgTokenCount = estimateTokenCount(recvMsg.Content)
    if (recvMsgTokenCount >= CONFIG.MAX_CHAT_TOKEN_NUM) {
      return this.platform.genSendTextXmlMsg('输入太长，不能多于约 2000 个汉字')
    }

    const initErr = await this.initCtx()
    if (initErr) {
      return this.platform.genSendTextXmlMsg(initErr)
    }
    this.resetLogger()

    if (GLOBAL_CONFIG.ECHO_MODE) {
      return this.platform.genSendTextXmlMsg(recvMsg.Content)
    }

    const cmdRes = await this.handleCommandMessage(recvMsg.Content)
    if (cmdRes !== null) {
      return cmdRes.success
        ? this.platform.genSendTextXmlMsg(cmdRes.data)
        : this.platform.genSendTextXmlMsg(cmdRes.msg)
    }

    this.ctx.isRequestOpenAi = true
    if (!this.ctx.apiKey) {
      return this.platform.genSendTextXmlMsg(
        `未绑定 OpenAI api key，请先使用 ${commandName.bindKey} 命令进行绑定`
      )
    }

    const respMsg = await this.openAiHandle(
      recvMsg.Content,
      recvMsg.MsgId,
      recvMsgTokenCount
    )
    return this.platform.genSendTextXmlMsg(respMsg)
  }

  /**
   * 处理微信发来的事件，返回明文消息
   */
  _handleRecvEvent(
    recvPlainEvent: wechatType.RecvPlainEvent | weworkType.RecvPlainEvent
  ) {
    if (recvPlainEvent.Event === 'subscribe') {
      return this.platform.genSendTextXmlMsg(CONFIG.WELCOME_MESSAGE)
    }

    return this.platform.genSendTextXmlMsg('success')
  }

  async initCtx() {
    const { platform, appid, userId } = this.platform.ctx

    const apiKeyRes = await kv.getApiKey(platform, appid, userId)
    if (!apiKeyRes.success) {
      this.logger.debug(`${MODULE} 获取 api key 失败`)
      return '服务异常'
    }

    if (!apiKeyRes.data.value) {
      this.logger.debug(`${MODULE} 没有 api key`)
      return
    }
    this.ctx.apiKey = apiKeyRes.data.value
    // 距离还有 1 天过期时重新 set
    if (
      apiKeyRes.data.metadata.expireTime - Date.now() <=
      CONST.TIME.ONE_DAY * 1000
    ) {
      await kv.setApiKey(platform, appid, userId, this.ctx.apiKey)
    }

    this.ctx.role.delete(CONST.ROLE.GUEST)
    this.ctx.role.add(CONST.ROLE.USER)

    const chatTypeRes = await kv.getChatType(platform, appid, userId)
    if (!chatTypeRes.success) {
      this.logger.debug(`${MODULE} 获取聊天类型失败`)
      return '服务异常'
    }
    if (chatTypeRes.data.value) {
      this.ctx.chatType = chatTypeRes.data.value
      // 距离还有 1 天过期时重新 set
      if (
        chatTypeRes.data.metadata.expireTime - Date.now() <=
        CONST.TIME.ONE_DAY * 1000
      ) {
        await kv.setChatType(platform, appid, userId, this.ctx.chatType)
      }
    }
  }

  private async genWeChatTextXmlResponse(xmlMsg: string) {
    const msg = this.platform.genSendTextXmlMsg(xmlMsg)
    if (this.platform.ctx.isEncrypt) {
      const encryptRes = await this.platform.genSendEncryptXmlMsg(msg)
      if (!encryptRes.success) {
        return genMyResponse('success')
      }
      return genMyResponse(encryptRes.data)
    }
    return genMyResponse(msg)
  }
}