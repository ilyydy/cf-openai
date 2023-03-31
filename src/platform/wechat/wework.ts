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
import type { MyRequest, MyResponse, WeWorkConfig } from '../../types'
import type { PlatformType, Platform, HandleRecvData } from '../types'
import type { RecvPlainData, RecvPlainMsg, RecvEncryptMsg } from './weworkType'

const MODULE = 'src/platform/wechat/wework.ts'

export const CONFIG: WeWorkConfig = {
  // 处理微信请求的最大毫秒数
  WEWORK_HANDLE_MS_TIME: 4000,
  // 允许访问的 id 列表
  WEWORK_ID_LIST: [],
}

export const defaultCtx = {
  platform: 'wework' as const,
  appid: '', // 企业 corpid
  secret: '', // 应用 secret
  token: '', // 应用 token
  encodingAESKey: '', // 应用 encodingAESKey
  recvData: {} as RecvPlainData,
  userId: '', // 收到消息的 FromUserName
  isEncrypt: true,
  adminUserIdList: [] as string[],
}

export type WeWorkCtx = typeof defaultCtx

export class WeWork implements Platform<'wework', RecvPlainData> {
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
   * 处理来自企业微信的请求
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html
   * @param handleRecvData 处理企业微信发来的 xml 明文消息，返回企业微信需要的 xml 明文消息
   * @param genTimeoutResponse 控制超时时如何回复
   */
  async handleRequest(
    handleRecvData: HandleRecvData<RecvPlainData>,
    genTimeoutResponse: () => Promise<MyResponse> | MyResponse = () =>
      genMyResponse(this.genSendTextXmlMsg('正在处理中'))
  ) {
    // 期望微信最多等 15 秒
    const timeoutPromise = (async () => {
      await sleep(CONFIG.WEWORK_HANDLE_MS_TIME)
      return genTimeoutResponse()
    })()

    return Promise.race([this._handleRequest(handleRecvData), timeoutPromise])
  }

  async _handleRequest(handleRecvData: HandleRecvData<RecvPlainData>) {
    const initErr = CommonUtil.init({ CONFIG, instance: this })
    if (initErr) {
      return genMyResponse(initErr)
    }

    const env = this.request.env as unknown as Record<string, string>
    const prefix = `${this.ctx.platform.toUpperCase()}_${this.id}`
    this.ctx.adminUserIdList = env[`${prefix}_ADMIN_USER_ID_LIST`]?.split(',') ?? []

    if (!this.ctx.encodingAESKey) {
      // 企业微信必须配置
      this.logger.error(`${MODULE} encodingAESKey 未配置`)
      return genMyResponse('服务异常')
    }

    // 配置过的才允许访问
    if (!CONFIG.WEWORK_ID_LIST.includes(this.id)) {
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
   * @see https://developer.work.weixin.qq.com/document/path/90238#%E9%AA%8C%E8%AF%81url%E6%9C%89%E6%95%88%E6%80%A7
   * 处理企业微信的接入验证请求
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
      'msg_signature',
      this.ctx.token,
      echostr
    )
    if (!checkSignatureRes.success) {
      return genMyResponse(checkSignatureRes.msg)
    }

    const decryptRes = this.commonUtil.decryptContent(echostr)
    this.logger.debug(`${MODULE} echostr 解密结果 ${JSON.stringify(decryptRes)}`)
    if (!decryptRes.success) {
      return genMyResponse(decryptRes.msg)
    }
    if (decryptRes.data.appid !== this.ctx.appid) {
      return genMyErrResponse(errCodeMap.INVALID_APPID)
    }

    return genMyResponse(decryptRes.data.plainContent)
  }

  async handlePost(handleRecvData: HandleRecvData<RecvPlainData>) {
    // 企业微信信息请求体应该是 xml 文本
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
    const { recvPlainData } = parseRes.data
    this.ctx.recvData = recvPlainData
    this.ctx.userId = recvPlainData.FromUserName

    return handleRecvData(recvPlainData)
  }

  genSendTextXmlMsg(content: string, options = { timestamp: Math.floor(Date.now() / 1000) }) {
    const { FromUserName, ToUserName, AgentID } = this.ctx.recvData

    const msg = `<xml>
<ToUserName><![CDATA[${FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${ToUserName}]]></FromUserName>
<CreateTime>${options.timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
<AgentID><![CDATA[${AgentID}]]></AgentID>
</xml>`

    return msg
  }

  async genSendEncryptXmlMsg(xmlMsg: string) {
    return this.commonUtil.genSendEncryptXmlMsg(xmlMsg, this.ctx.appid, this.ctx.token)
  }
}
