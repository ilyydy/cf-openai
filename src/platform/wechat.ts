import { Base64 } from 'js-base64'
import { z } from 'zod'
import _ from 'lodash'

import {
  genFail,
  genSuccess,
  errorToString,
  shaDigest,
  genMyResponse,
  genMyErrResponse,
  getTextDecoder,
  getTextEncoder,
  parseXmlMsg,
  concatUint8Array,
  buildLogger,
  sleep,
  mergeFromEnv,
} from '../utils'
import { errCodeMap } from '../errCode'

import type { Result, Logger } from '../utils'
import type { MyRequest, MyResponse, WeChatConfig } from '../types'
import type { PlatformType, Platform, WeChatMsg, HandleRecvMsg } from './types'

const MODULE = 'src/platform/wechat.ts'

export const CONFIG: WeChatConfig = {
  // admin 用户名单，设置时以逗号分隔
  WECHAT_ADMIN_USER_ID_LIST: [],
  // 处理微信请求的最大毫秒数
  WECHAT_HANDLE_MS_TIME: 13000,
  // 允许访问的 id 列表
  WECHAT_ID_LIST: [],
}

export const defaultCtx = {
  platform: 'wechat' as PlatformType,
  appid: '', // 公众号 appid
  token: '', // 微信后台配置的 token
  // 公众号后台-基本配置-服务器配置中的消息加解密密钥
  // 长度固定为43个字符，从a-z, A-Z, 0-9共62个字符中选取，是AESKey的Base64编码
  // 解码后即为32字节长的AESKey
  encodingAESKey: '',
  recvMsg: {} as RecvPlainMsg,
  developerId: '', // 收到消息的 ToUserName
  userId: '', // 收到消息的 FromUserName
  isEncrypt: false,
}

export type WeChatCtx = typeof defaultCtx

export class WeChat implements Platform<WeChatMsg> {
  readonly ctx = _.cloneDeep(defaultCtx)
  private _aesKeyInfo: {
    key: CryptoKey // 已经导入的 CryptoKey 格式密钥
    iv: Uint8Array // 初始向量大小为16字节，取AESKey前16字节
  } | null = null
  logger: Logger

  constructor(readonly request: MyRequest, readonly id: string) {
    this.logger = buildLogger({
      platform: this.ctx.platform,
      id,
      reqId: this.request.reqId,
    })
  }

  init() {
    mergeFromEnv(this.request.env, CONFIG)

    const env = this.request.env as unknown as Record<string, string>
    this.ctx.appid = env[`WECHAT_${this.id}_APPID`] ?? ''
    this.ctx.token = env[`WECHAT_${this.id}_TOKEN`] ?? ''

    if (!this.ctx.appid || !this.ctx.token) {
      this.logger.error(`${this.ctx.platform} ${this.id} appid token 未配置`)
      return '服务异常'
    }

    this.ctx.encodingAESKey = env[`WECHAT_${this.id}_AES_KEY`] ?? ''

    this.logger.debug(`${MODULE} webchat config ${JSON.stringify(CONFIG)}`)
  }

  /**
   * 处理来自微信的请求 TODO 事件处理
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Receiving_standard_messages.html
   * @param handleRecvMsg 处理微信发来的 xml 明文消息，返回微信需要的 xml 明文消息
   * @param genTimeoutResponse 控制超时时如何回复
   */
  async handleRequest(
    handleRecvMsg: HandleRecvMsg<WeChatMsg>,
    genTimeoutResponse: () => Promise<MyResponse> | MyResponse = () =>
      genMyResponse(this.genSendTextXmlMsg('正在处理中'))
  ) {
    // 微信最多等 15 秒
    const timeoutPromise = (async () => {
      await sleep(CONFIG.WECHAT_HANDLE_MS_TIME)
      return genTimeoutResponse()
    })()

    return Promise.race([this._handleRequest(handleRecvMsg), timeoutPromise])
  }

  async _handleRequest(handleRecvMsg: HandleRecvMsg<WeChatMsg>) {
    const initErr = this.init()
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
      // 微信信息请求体应该是 xml 文本
      if (typeof this.request.body !== 'string') {
        this.logger.debug(`${MODULE} 消息不是文本`)
        return genMyErrResponse(errCodeMap.INVALID_PARAMS)
      }

      const parseRes = await this.parseRecvXmlMsg(this.request.body)
      this.logger.debug(`${MODULE} 解析收到消息 ${JSON.stringify(parseRes)}`)
      if (!parseRes.success) {
        return genMyResponse('解析消息失败', { status: 400 })
      }
      const { recvPlainMsg, isEncrypt } = parseRes.data
      this.ctx.recvMsg = recvPlainMsg
      // TODO 微信加密回复有问题，直接明文回复
      // this.ctx.isEncrypt = isEncrypt
      this.ctx.userId = recvPlainMsg.FromUserName
      this.ctx.developerId = recvPlainMsg.ToUserName

      const response = await handleRecvMsg({
        type: this.ctx.platform,
        msg: recvPlainMsg,
      })

      return response
    }

    return genMyErrResponse(errCodeMap.INVALID_METHOD)
  }

  /**
   * @see https://developers.weixin.qq.com/doc/offiaccount/Basic_Information/Access_Overview.html
   * 处理微信的接入验证请求
   */
  async handleGet() {
    const { searchParams } = this.request.urlObj

    const signature = searchParams.get('signature')
    const timestamp = searchParams.get('timestamp')
    const echostr = searchParams.get('echostr')
    const nonce = searchParams.get('nonce')
    if (!signature || !timestamp || !echostr || !nonce) {
      this.logger.debug(`${MODULE} signature timestamp echostr nonce 有缺失`)
      return genMyErrResponse(errCodeMap.INVALID_PARAMS)
    }

    const { token } = this.ctx
    const tmpArr = [token, timestamp, nonce]
    tmpArr.sort()
    const tmpStr = tmpArr.join('')
    const mySignature = await shaDigest('SHA-1', tmpStr)
    const result = mySignature === signature

    this.logger.debug(
      `${MODULE} tmpStr ${tmpStr} mySignature ${mySignature} signature ${signature}`
    )
    if (!result) {
      return genMyErrResponse(errCodeMap.INVALID_SIGNATURE)
    }
    return genMyResponse(echostr)
  }

  /**
   * 导入 AES 解密微信 xml 消息中 <Encrypt> 块内容
   * @see https://developer.work.weixin.qq.com/document/path/96211
   */
  async importWeChatAesKey() {
    if (this.ctx.encodingAESKey.length !== 43) {
      this.logger.error(`${MODULE} 微信密钥长度异常`)
      return genFail('服务异常')
    }

    try {
      const keyInUint8Array = Base64.toUint8Array(this.ctx.encodingAESKey + '=')
      if (keyInUint8Array.length !== 32) {
        this.logger.error(`${MODULE} 微信密钥解码长度异常`)
        return genFail('服务异常')
      }

      const key = await crypto.subtle.importKey(
        'raw',
        keyInUint8Array,
        // 只能在 node 使用
        // Buffer.from(encodingAESKey + '=', 'base64'),
        { name: 'AES-CBC' },
        true,
        ['decrypt', 'encrypt']
      )
      return genSuccess({
        key,
        keyInUint8Array,
        iv: keyInUint8Array.slice(0, 16),
      })
    } catch (error) {
      this.logger.error(
        `${MODULE} 微信密钥导入异常 ${errorToString(error as Error)}`
      )
      return genFail('服务异常')
    }
  }

  async getAesKeyInfo() {
    if (!this._aesKeyInfo) {
      const r = await this.importWeChatAesKey()
      if (r.success) {
        this._aesKeyInfo = r.data
      } else {
        return r
      }
    }
    return genSuccess(this._aesKeyInfo)
  }

  /**
   * AES 解密微信 xml 消息中 <Encrypt> 块内容
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Message_encryption_and_decryption_instructions.html
   * @see https://developer.work.weixin.qq.com/document/path/96211
   * @see https://www.npmjs.com/package/@wecom/crypto
   * @see https://github.com/keel/aes-cross/tree/master/info-cn
   * @param encryptContent 从 xml <Encrypt> 块中取出的内容，加密处理后的Base64编码
   */
  async decryptContent(encryptContent: string) {
    const keyRes = await this.getAesKeyInfo()
    if (!keyRes.success) {
      return keyRes
    }
    const { iv, key } = keyRes.data

    try {
      const arrBuffer = await crypto.subtle.decrypt(
        { name: 'AES-CBC', iv },
        key,
        Base64.toUint8Array(encryptContent) // base64 到 Uint8Array
        // 只能在 node 使用
        // Buffer.from(encryptContent, 'base64')
      )

      // 数据采用PKCS#7填充至32字节的倍数
      // = 16个字节的随机字符串 + 4个字节的msg长度(网络字节序) + 明文msg + receiveid + 填充
      const uint8Array = new Uint8Array(arrBuffer)

      // 加密后数据块中填充的字节数
      let pad = uint8Array[uint8Array.length - 1]
      if (pad < 1 || pad > 32) {
        pad = 0
      }

      // 去掉头部16个随机字节和尾部填充字节
      const content = uint8Array.slice(16, uint8Array.length - pad)
      // 4字节的msg长度
      const msgLen = new DataView(content.slice(0, 4).buffer).getInt32(0)
      // 截取msg_len长度的部分即为msg
      const plainXmlMsg = getTextDecoder().decode(content.slice(4, msgLen + 4))
      // 剩下的为尾部的receiveid，即为公众号开发者ID
      const appid = getTextDecoder().decode(content.slice(msgLen + 4))

      return genSuccess({ plainXmlMsg, appid })
    } catch (error) {
      this.logger.error(
        `${MODULE} 微信消息解密异常 ${errorToString(error as Error)}`
      )
      return genFail('服务异常')
    }
  }

  /**
   * AES 加密明文为微信 xml 消息中 <Encrypt> 块内容
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Message_encryption_and_decryption_instructions.html
   * @see https://developer.work.weixin.qq.com/document/path/96211
   * @see https://www.npmjs.com/package/@wecom/crypto
   * @see https://github.com/keel/aes-cross/tree/master/info-cn
   * @param plainContent utf8 明文
   */
  async encryptContent(plainContent: string) {
    // 加密后的结果 = 16个字节的随机字符串 + 4个字节的msg长度(网络字节序) + 明文msg + receiveid + 填充
    try {
      // 16B 随机字符串
      const random16 = crypto.getRandomValues(new Uint8Array(16))
      const contentUint8Array = getTextEncoder().encode(plainContent)
      // 获取4B的内容长度的网络字节序
      const msgUint8Array = new Uint8Array(4)
      new DataView(msgUint8Array.buffer).setUint32(
        0,
        contentUint8Array.byteLength,
        false
      )
      const appidUint8Array = getTextEncoder().encode(this.ctx.appid)
      const concatenatedArray = concatUint8Array([
        random16,
        msgUint8Array,
        contentUint8Array,
        appidUint8Array,
      ])

      const keyRes = await this.getAesKeyInfo()
      if (!keyRes.success) {
        return keyRes
      }
      const { iv, key } = keyRes.data

      const arrBuffer = await crypto.subtle.encrypt(
        { name: 'AES-CBC', iv },
        key,
        concatenatedArray
      )

      return genSuccess(Base64.fromUint8Array(new Uint8Array(arrBuffer)))
    } catch (error) {
      this.logger.error(
        `${MODULE} 微信消息加密异常 ${errorToString(error as Error)}`
      )
      return genFail('服务异常')
    }
  }

  /**
   * 解析微信 xml 消息
   * @param xmlMsg 微信 xml 消息
   */
  async parseRecvXmlMsg<T = RecvPlainMsg>(xmlMsg: string) {
    const res = parseXmlMsg<{ xml: RecvPlainMsg | RecvEncryptMsg | undefined }>(
      xmlMsg
    )
    if (!res.success) return res

    const xmlObj = res.data.xml
    if (!xmlObj) {
      this.logger.debug(`${MODULE} 微信消息为空 ${xmlMsg}`)
      return genFail('微信消息为空')
    }

    if ('Encrypt' in xmlObj) {
      const { searchParams } = this.request.urlObj
      const msgSignature = searchParams.get('msg_signature')
      const nonce = searchParams.get('nonce')
      const timestamp = searchParams.get('timestamp')

      const tmpStr = [this.ctx.token, timestamp, nonce, xmlObj.Encrypt]
        .sort()
        .join('')
      const mySignature = await shaDigest('SHA-1', tmpStr)
      if (mySignature !== msgSignature) {
        this.logger.debug(
          `${MODULE} 消息签名不对 tmpStr ${tmpStr} mySignature ${mySignature} msgSignature ${
            msgSignature ?? ''
          }`
        )
        return genFail('微信消息签名不对')
      }

      const decryptRes = await this.decryptContent(xmlObj.Encrypt)
      if (!decryptRes.success) {
        return genFail('解密微信消息失败')
      }
      const { appid, plainXmlMsg } = decryptRes.data
      if (appid !== this.ctx.appid) {
        this.logger.debug(
          `${MODULE} 微信消息中 appid 不符，收到 ${appid}，应该为 ${this.ctx.appid}`
        )
        return genFail('微信消息中 appid 不符')
      }
      const v = (await this.parseRecvXmlMsg<RecvPlainMsg>(plainXmlMsg)) as {
        success: boolean
        data: {
          isEncrypt: boolean
          recvPlainMsg: RecvPlainMsg
        }
        msg: string
      }

      if (v.success) {
        v.data.isEncrypt = true
      }
      return v
    }

    // MsgId 可能为数字或字符串，统一字符串
    if (xmlObj.MsgId) {
      xmlObj.MsgId = `${xmlObj.MsgId}`
    }

    const msgType = xmlObj.MsgType
    const validatorBuilder = recvMsgValidatorBuildMap[msgType]
    if (!msgType || !validatorBuilder) {
      this.logger.debug(`${MODULE} 不合法的微信消息类型 ${msgType}`)
      return genFail('不合法的微信消息类型')
    }

    const validateRes = validatorBuilder().safeParse(xmlObj)
    if (!validateRes.success) {
      this.logger.debug(
        `${MODULE} 微信消息格式验证不通过 ${JSON.stringify(
          validateRes.error.format()
        )}`
      )
      return genFail('微信消息格式验证不通过')
    }

    return genSuccess({ recvPlainMsg: xmlObj as T, isEncrypt: false })
  }

  /**
   * 生成加密的 xml 返回
   * @param xmlMsg 明文的 xml 返回
   */
  async genSendEncryptXmlMsg(
    xmlMsg: string,
    options = {
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Math.floor(Math.random() * 10 ** 10),
    }
  ) {
    const encryptRes = await this.encryptContent(xmlMsg)
    if (!encryptRes.success) {
      return encryptRes
    }

    const encrypt = encryptRes.data
    const { timestamp, nonce } = options
    const str = [encrypt, timestamp, nonce, this.ctx.token].sort().join('')
    const signature = await shaDigest('SHA-1', str)

    const msg = `<xml>
<Encrypt><![CDATA[${encrypt}]]></Encrypt>
<MsgSignature><![CDATA[${signature}]]></MsgSignature>
<TimeStamp>${timestamp}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`

    return genSuccess(msg)
  }

  genSendTextXmlMsg(
    content: string,
    options = { timestamp: Math.floor(Date.now() / 1000) }
  ) {
    const { FromUserName, ToUserName } = this.ctx.recvMsg

    const msg = `<xml>
<ToUserName><![CDATA[${FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${ToUserName}]]></FromUserName>
<CreateTime>${options.timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${content}]]></Content>
</xml>`

    return msg
  }
}

export const MsgTypeMap = {
  text: 'text',
  image: 'image',
  voice: 'voice',
  video: 'video',
  shortvideo: 'shortvideo',
  location: 'location',
  link: 'link',
} as const

export type MsgType = typeof MsgTypeMap[keyof typeof MsgTypeMap]

export const recvBaseMsgValidator = z.object({
  ToUserName: z.string(), // 开发者微信号
  FromUserName: z.string(), // 发送方帐号（一个OpenID）
  CreateTime: z.number(), // 消息创建毫秒时间戳
  MsgId: z.string(), // 消息id，64位整型
  MsgDataId: z.string().optional(), // 消息的数据ID（消息如果来自文章时才有）
  Idx: z.number().optional(), // 多图文时第几篇文章，从1开始（消息如果来自文章时才有）
})

export type RecvBaseMsg = z.infer<typeof recvBaseMsgValidator>

export const getRecvTextMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.text),
    Content: z.string(), // 前后可能带空字符
  })

export type RecvTextMsg = z.infer<ReturnType<typeof getRecvTextMsgValidator>>
export type SendTextMsg = Omit<RecvTextMsg, 'MsgId' | 'MsgDataId' | 'Idx'>

export const getRecvImgMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.image),
    PicUrl: z.string(), // 图片链接（由系统生成）
    MediaId: z.string(), // 图片消息媒体id，可以调用获取临时素材接口拉取数据
  })

export type RecvImgMsg = z.infer<ReturnType<typeof getRecvImgMsgValidator>>
export type SendImgMsg = Omit<
  RecvImgMsg,
  'MsgId' | 'MsgDataId' | 'Idx' | 'PicUrl' | 'MediaId'
> & {
  Image: { MediaId: string }[]
}

export const getRecvVoiceMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.voice),
    Format: z.string(), // 语音格式，如amr，speex等
    MediaId: z.string(), // 语音消息媒体id，可以调用获取临时素材接口拉取数据
    Recognition: z.string().optional(), // 开通语音识别后有，语音识别结果，UTF8编码
  })

export type RecvVoiceMsg = z.infer<ReturnType<typeof getRecvVoiceMsgValidator>>
export type SendVoiceMsg = Omit<
  RecvVoiceMsg,
  'MsgId' | 'MsgDataId' | 'Idx' | 'Format' | 'Recognition' | 'MediaId'
> & {
  Voice: { MediaId: string }[]
}

export const getRecvVideoMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.video),
    Format: z.string(), // 语音格式，如amr，speex等
    MediaId: z.string(), // 视频消息媒体id，可以调用获取临时素材接口拉取数据
    ThumbMediaId: z.string(), // 视频消息缩略图的媒体id，可以调用多媒体文件下载接口拉取数据
  })

export type RecvVideoMsg = z.infer<ReturnType<typeof getRecvVideoMsgValidator>>
export type SendVideoMsg = Omit<
  RecvVideoMsg,
  'MsgId' | 'MsgDataId' | 'Idx' | 'Format' | 'ThumbMediaId' | 'MediaId'
> & {
  Video: { MediaId: string; Title?: string; Description?: string }[]
}

export const getRecvShortVideoValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.shortvideo),
    MediaId: z.string(), // 视频消息媒体id，可以调用获取临时素材接口拉取数据
    ThumbMediaId: z.string(), // 视频消息缩略图的媒体id，可以调用多媒体文件下载接口拉取数据
  })

export type RecvShortVideoMsg = z.infer<
  ReturnType<typeof getRecvShortVideoValidator>
>

export const getRecvLocationMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.location),
    Location_X: z.number(), // 地理位置纬度
    Location_Y: z.number(), // 地理位置经度
    Scale: z.number(), // 地图缩放大小
    Label: z.string(), // 地理位置信息
  })

export type RecvLocationMsg = z.infer<
  ReturnType<typeof getRecvLocationMsgValidator>
>

export const getRecvLinkMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.link),
    Title: z.string(), // 消息标题
    Description: z.string(), // 消息描述
    Url: z.string(), // 消息链接
  })

export type RecvLinkMsg = z.infer<ReturnType<typeof getRecvLinkMsgValidator>>

export const recvMsgValidatorBuildMap = {
  [MsgTypeMap.text]: getRecvTextMsgValidator,
  [MsgTypeMap.image]: getRecvImgMsgValidator,
  [MsgTypeMap.voice]: getRecvVoiceMsgValidator,
  [MsgTypeMap.video]: getRecvVideoMsgValidator,
  [MsgTypeMap.shortvideo]: getRecvShortVideoValidator,
  [MsgTypeMap.location]: getRecvLocationMsgValidator,
  [MsgTypeMap.link]: getRecvLinkMsgValidator,
} as const

export type RecvPlainMsg =
  | RecvTextMsg
  | RecvImgMsg
  | RecvVoiceMsg
  | RecvVideoMsg
  | RecvShortVideoMsg
  | RecvLocationMsg
  | RecvLinkMsg

export type SendMusicMsg = Omit<RecvBaseMsg, 'MsgId' | 'MsgDataId' | 'Idx'> & {
  MsgType: 'music'
  Music: {
    Title?: string // 音乐标题
    Description?: string // 音乐描述
    MusicURL?: string // 音乐链接
    HQMusicUrl?: string // 高质量音乐链接，WIFI环境优先使用该链接播放音乐
    ThumbMediaId: string // 缩略图的媒体id，通过素材管理中的接口上传多媒体文件，得到的id
  }[]
}

export type SendNewsMsg = Omit<RecvBaseMsg, 'MsgId' | 'MsgDataId' | 'Idx'> & {
  MsgType: 'music'
  ArticleCount: number // 图文消息个数；当用户发送文本、图片、语音、视频、图文、地理位置这六种消息时，开发者只能回复1条图文消息；其余场景最多可回复8条图文消息
  Articles: {
    // 图文消息信息，注意，如果图文数超过限制，则将只发限制内的条数
    item: {
      Title: string // 图文消息标题
      Description: string // 图文消息描述
      PicUrl: string // 图片链接，支持JPG、PNG格式，较好的效果为大图360*200，小图200*200
      HQMusicUrl: string // 点击图文消息跳转链接
    }[]
  }
}

export type SendPlainMsg =
  | SendTextMsg
  | SendImgMsg
  | SendVoiceMsg
  | SendVideoMsg
  | SendMusicMsg
  | SendNewsMsg

export const getRecvEncryptMsgValidator = () =>
  z.object({
    ToUserName: z.string(), // 开发者微信号
    Encrypt: z.string(), // aes 加密后的消息
  })

export type RecvEncryptMsg = z.infer<
  ReturnType<typeof getRecvEncryptMsgValidator>
>

export interface SendEncryptMsg {
  encrypt: string
  signature: string
  timestamp: number
  nonce: string
}

export interface Query {
  signature: string
  timestamp: string
  nonce: string
  openid: string
  encrypt_type?: string // 开启加密时才有
  msg_signature?: string // 开启加密时才有
}

export interface QueryVerify extends Query {
  echostr: string // 接入验证时才有
  openid: never
}
