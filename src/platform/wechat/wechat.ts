import {
  genFail,
  genSuccess,
  errorToString,
  shaDigest,
  genMyResponse,
  genMyErrResponse,
  parseXmlMsg,
  buildLogger,
  sleep,
} from '../../utils'
import { errCodeMap } from '../../errCode'
import { CommonUtil } from './commonUtil'

import type { Result, Logger } from '../../utils'
import type { MyRequest, MyResponse, WeChatConfig } from '../../types'
import type { PlatformType, Platform, HandleRecvData } from '../types'
import type { RecvPlainData, RecvPlainMsg, RecvEncryptMsg } from './wechatType'

const MODULE = 'src/platform/wechat/wechat.ts'

export const CONFIG: WeChatConfig = {
  // admin 用户名单，设置时以逗号分隔
  WECHAT_ADMIN_USER_ID_LIST: [],
  // 处理微信请求的最大毫秒数
  WECHAT_HANDLE_MS_TIME: 13000,
  // 允许访问的 id 列表
  WECHAT_ID_LIST: [],
  WECHAT_ADMIN_OPENAI_KEY: '',
  WECHAT_GUEST_OPENAI_KEY: '',
}

export const defaultCtx = {
  platform: 'wechat' as const,
  appid: '', // 公众号 appid
  secret: '', // 公众号 app secret
  token: '', // 微信后台配置的 token
  // 公众号后台-基本配置-服务器配置中的消息加解密密钥
  // 长度固定为43个字符，从a-z, A-Z, 0-9共62个字符中选取，是AESKey的Base64编码
  // 解码后即为32字节长的AESKey
  encodingAESKey: '',
  recvData: {} as RecvPlainData,
  accountId: '', // 收到的消息的 ToUserName 公众号注册信息的原始ID
  userId: '', // 收到的消息的 FromUserName
  isEncrypt: false,
}

export type WeChatCtx = typeof defaultCtx

export class WeChat implements Platform<'wechat', RecvPlainData> {
  readonly ctx = { ...defaultCtx }
  logger: Logger
  commonUtil: CommonUtil

  constructor(readonly request: MyRequest, readonly id: string) {
    this.logger = buildLogger({
      platform: this.ctx.platform,
      id,
      reqId: this.request.reqId,
    })
    this.commonUtil = new CommonUtil(this.logger)
  }

  /**
   * 处理来自微信的请求
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html
   * @param handleRecvData 处理微信发来的 xml 明文消息，返回微信需要的 xml 明文消息
   * @param genTimeoutResponse 控制超时时如何回复
   */
  async handleRequest(
    handleRecvData: HandleRecvData<RecvPlainData>,
    genTimeoutResponse: () => Promise<MyResponse> | MyResponse = () =>
      genMyResponse(this.genSendTextXmlMsg('正在处理中'))
  ) {
    // 微信最多等 15 秒
    const timeoutPromise = (async () => {
      await sleep(CONFIG.WECHAT_HANDLE_MS_TIME)
      return genTimeoutResponse()
    })()

    return Promise.race([this._handleRequest(handleRecvData), timeoutPromise])
  }

  async _handleRequest(handleRecvData: HandleRecvData<RecvPlainData>) {
    const initErr = CommonUtil.init({ CONFIG, instance: this })
    if (initErr) {
      return genMyResponse(initErr)
    }

    // 配置过的才允许访问
    if (!CONFIG.WECHAT_ID_LIST.includes(this.id)) {
      this.logger.debug(`${MODULE} ${this.id} 不在允许名单内`)
      return genMyErrResponse(errCodeMap.INVALID_PLATFORM_ID)
    }

    const { method } = this.request

    // 接入验证
    if (method === 'GET') {
      return this.handleGet()
    }

    if (method === 'POST') {
      return this.handlePost(handleRecvData)
    }

    return genMyErrResponse(errCodeMap.INVALID_METHOD)
  }

  /**
   * @see https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html
   * 处理微信的接入验证请求
   */
  async handleGet() {
    const { searchParams } = this.request.urlObj

    const echostr = searchParams.get('echostr') ?? ''
    if (!echostr) {
      this.logger.debug(`${MODULE} echostr 缺失`)
      return genMyResponse(errCodeMap.INVALID_PARAMS.msg)
    }
    const checkSignatureRes = await this.commonUtil.checkSignature(
      searchParams,
      'signature',
      this.ctx.token
    )
    if (!checkSignatureRes.success) {
      return genMyResponse(checkSignatureRes.msg)
    }

    return genMyResponse(echostr)
  }

  async handlePost(handleRecvData: HandleRecvData<RecvPlainData>) {
    // 微信信息请求体应该是 xml 文本
    if (typeof this.request.body !== 'string') {
      this.logger.debug(`${MODULE} 消息不是文本`)
      return genMyErrResponse(errCodeMap.INVALID_PARAMS)
    }

    const {
      urlObj: { searchParams },
    } = this.request

    const parseRes = await this.commonUtil.parseRecvXmlMsg<RecvPlainData>(
      this.request.body,
      searchParams,
      this.ctx.appid,
      this.ctx.token
    )
    this.logger.debug(`${MODULE} 解析收到消息 ${JSON.stringify(parseRes)}`)
    if (!parseRes.success) {
      return genMyResponse('解析消息失败')
    }
    const { recvPlainData, isEncrypt } = parseRes.data
    this.ctx.recvData = recvPlainData
    this.ctx.isEncrypt = isEncrypt
    this.ctx.userId = recvPlainData.FromUserName
    this.ctx.accountId = recvPlainData.ToUserName

    return handleRecvData(recvPlainData)
  }

  genSendTextXmlMsg(
    content: string,
    options = { timestamp: Math.floor(Date.now() / 1000) }
  ) {
    const { FromUserName, ToUserName } = this.ctx.recvData

    const msg = `<xml>
<ToUserName><![CDATA[${FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${ToUserName}]]></FromUserName>
<CreateTime>${options.timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`

    return msg
  }

  async genSendEncryptXmlMsg(xmlMsg: string) {
    return this.commonUtil.genSendEncryptXmlMsg(xmlMsg, this.ctx.appid, this.ctx.token)
  }
}
