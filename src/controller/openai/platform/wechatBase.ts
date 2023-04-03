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

export abstract class WeChatBaseHandler<T extends WeWork | WeChat> extends Base<T> {
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
    if (recvMsg.MsgType !== 'text') {
      return this.platform.genRespTextXmlMsg('只支持文字消息')
    }
    recvMsg.Content = recvMsg.Content.trim()
    const recvMsgTokenCount = estimateTokenCount(recvMsg.Content)
    if (recvMsgTokenCount >= CONFIG.MAX_CHAT_TOKEN_NUM) {
      return this.platform.genRespTextXmlMsg('输入太长，不能多于约 2000 个汉字')
    }

    const initErr = await this.initCtx()
    if (initErr) {
      return this.platform.genRespTextXmlMsg(initErr)
    }
    this.resetLogger()

    if (GLOBAL_CONFIG.ECHO_MODE) {
      return this.platform.genRespTextXmlMsg(recvMsg.Content)
    }

    const cmdRes = await this.handleCommandMessage(recvMsg.Content)
    if (cmdRes !== null) {
      return cmdRes.success ? this.platform.genRespTextXmlMsg(cmdRes.data) : this.platform.genRespTextXmlMsg(cmdRes.msg)
    }

    this.ctx.isRequestOpenAi = true
    if (!this.ctx.apiKey) {
      return this.platform.genRespTextXmlMsg(`未绑定 OpenAI api key，请先使用 ${commandName.bindKey} 命令进行绑定`)
    }

    const respMsg = await this.openAiHandle(recvMsg.Content, recvMsg.MsgId, recvMsgTokenCount)
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
