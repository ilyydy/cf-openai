/**
 * 微信/企业微信通用代码
 */

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
  base64ToUint8Array,
  uint8ArrayToBase64,
  mergeFromEnv,
} from '../../utils'
import { AES } from './aes'
import { errCodeMap } from '../../errCode'

import type { Result, Logger } from '../../utils'
import type * as wechatType from './wechatType'
import type * as weworkType from './weworkType'
import type { WeChat } from './wechat'
import type { WeWork } from './wework'
import type { WeWorkConfig, WeChatConfig } from '../../types'

const MODULE = 'src/platform/wechat/common.ts'

export const MsgTypeMap = {
  text: 'text',
  image: 'image',
  voice: 'voice',
  video: 'video',
  shortvideo: 'shortvideo',
  location: 'location',
  link: 'link',
  event: 'event',
} as const

export const EventTypeMap = {
  subscribe: 'subscribe',
  unsubscribe: 'unsubscribe',
  enter_agent: 'enter_agent',
  scan_subscribe: 'scan_subscribe',
  scan: 'scan',
} as const

export type MsgType = typeof MsgTypeMap[keyof typeof MsgTypeMap]

export class CommonUtil {
  private _aes: AES | null = null
  private encodingAESKey = ''

  constructor(readonly logger: Logger) {}

  static init({
    instance,
    CONFIG,
  }:
    | { instance: WeChat; CONFIG: WeChatConfig }
    | { instance: WeWork; CONFIG: WeWorkConfig }) {
    const { ctx, request } = instance

    mergeFromEnv(request.env, CONFIG)

    const env = request.env as unknown as Record<string, string>

    const prefix = `${ctx.platform.toUpperCase()}_${instance.id}`
    ctx.appid = env[`${prefix}_APPID`] ?? ''
    ctx.secret = env[`${prefix}_SECRET`] ?? ''
    ctx.token = env[`${prefix}_TOKEN`] ?? ''

    if (!ctx.appid || !ctx.token) {
      instance.logger.error(`${MODULE} appid token 未配置`)
      return '服务异常'
    }

    ctx.encodingAESKey = env[`${prefix}_AES_KEY`] ?? ''
    instance.commonUtil.setKey(ctx.encodingAESKey)

    instance.logger.debug(`${MODULE} config ${JSON.stringify(CONFIG)}`)
    instance.logger.debug(`${MODULE} ctx ${JSON.stringify(ctx)}`)
  }

  setKey(key: string) {
    this.encodingAESKey = key
  }

  get aes() {
    if (!this._aes) {
      const r = this.checkAnGetKeyUint8Array()
      if (!r.success) {
        throw new Error(r.msg)
      }
      this._aes = new AES(r.data)
    }

    return this._aes
  }

  checkAnGetKeyUint8Array() {
    if (this.encodingAESKey.length !== 43) {
      this.logger.error(`${MODULE} 微信密钥长度异常`)
      return genFail('微信密钥长度异常')
    }

    const keyInUint8Array = base64ToUint8Array(`${this.encodingAESKey}=`)
    if (keyInUint8Array.length !== 32) {
      this.logger.error(`${MODULE} 密钥解码长度异常`)
      return genFail('密钥解码长度异常')
    }

    return genSuccess(keyInUint8Array)
  }

  /**
   * AES 解密微信 xml 消息中 <Encrypt> 块内容
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Message_encryption_and_decryption_instructions.html
   * @see https://developer.work.weixin.qq.com/document/path/96211
   * @see https://www.npmjs.com/package/@wecom/crypto
   * @see https://github.com/keel/aes-cross/tree/master/info-cn
   * @param encryptContent 从 xml <Encrypt> 块中取出的内容，加密处理后的Base64编码
   */
  decryptContent(encryptContent: string) {
    try {
      const aes = this.aes
      const uint8Array = aes.decrypt(base64ToUint8Array(encryptContent))

      // 数据采用PKCS#7填充至32字节的倍数
      // = 16个字节的随机字符串 + 4个字节的msg长度(网络字节序) + 明文msg + receiveid + 填充

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
      const plainContent = getTextDecoder().decode(content.slice(4, msgLen + 4))
      // 剩下的为尾部的receiveid，微信为公众号 appid，企业微信为 corpid
      const appid = getTextDecoder().decode(content.slice(msgLen + 4))

      return genSuccess({ plainContent, appid })
    } catch (error) {
      this.logger.error(
        `${MODULE} 消息解密异常 ${errorToString(error as Error)}`
      )
      return genFail('消息解密异常')
    }
  }

  /**
   * AES 加密明文为微信 xml 消息中 <Encrypt> 块内容
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Message_encryption_and_decryption_instructions.html
   * @see https://developer.work.weixin.qq.com/document/path/96211
   * @see https://www.npmjs.com/package/@wecom/crypto
   * @see https://github.com/keel/aes-cross/tree/master/info-cn
   * @param plainContent utf8 明文
   * @returns 加密后的结果 = 16个字节的随机字符串 + 4个字节的msg长度(网络字节序) + 明文msg + receiveid + 填充
   */
  encryptContent(plainContent: string, appid: string) {
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
      const appidUint8Array = getTextEncoder().encode(appid)
      const concatenatedArray = concatUint8Array([
        random16,
        msgUint8Array,
        contentUint8Array,
        appidUint8Array,
      ])

      const aes = this.aes
      const result = aes.encrypt(concatenatedArray)
      return genSuccess(uint8ArrayToBase64(result))
    } catch (error) {
      this.logger.error(
        `${MODULE} 消息加密异常 ${errorToString(error as Error)}`
      )
      return genFail('消息加密异常')
    }
  }

  async checkSignature(
    searchParams: URL['searchParams'],
    signatureKey: string,
    token: string,
    encryptContent?: string
  ) {
    const keyArr = [signatureKey, 'timestamp', 'nonce']
    const arr = keyArr.map((key) => searchParams.get(key)) as string[]
    if (arr.some((i) => !i)) {
      this.logger.debug(`${MODULE} ${keyArr.join(',')} 有缺失`)
      return genFail(errCodeMap.INVALID_PARAMS.msg)
    }

    const signature = arr.shift() as string
    arr.push(token)
    if (encryptContent) {
      arr.push(encryptContent)
    }

    const tmpStr = arr.sort().join('')
    const mySignature = await shaDigest('SHA-1', tmpStr)
    if (mySignature !== signature) {
      this.logger.debug(
        `${MODULE} 消息签名不对 arr ${arr.join(',')} tmpStr ${tmpStr} mySignature ${mySignature} signature ${signature}`
      )
      return genFail(errCodeMap.INVALID_SIGNATURE.msg)
    }
    return genSuccess('')
  }

  /**
   * 解析收到的 xml 消息
   * @param xmlMsg xml 消息
   */
  async parseRecvXmlMsg<
    T = wechatType.RecvPlainData | weworkType.RecvPlainData
  >(
    xmlMsg: string,
    searchParams: URL['searchParams'],
    appid: string,
    token: string
  ) {
    const res = parseXmlMsg<{
      xml?:
        | wechatType.RecvPlainData
        | wechatType.RecvEncryptMsg
        | weworkType.RecvEncryptMsg
        | undefined
    }>(xmlMsg)
    if (!res.success) return res

    const xmlObj = res.data.xml
    if (!xmlObj) {
      this.logger.debug(`${MODULE} 消息为空 ${xmlMsg}`)
      return genFail(errCodeMap.INVALID_PARAMS.msg)
    }

    if ('Encrypt' in xmlObj) {
      const checkSignatureRes = await this.checkSignature(
        searchParams,
        'msg_signature',
        token,
        xmlObj.Encrypt
      )
      if (!checkSignatureRes.success) {
        return genFail(checkSignatureRes.msg)
      }

      const decryptRes = this.decryptContent(xmlObj.Encrypt)
      if (!decryptRes.success) {
        return genFail('解密消息失败')
      }
      const { appid: recvAppid, plainContent: plainXmlData } = decryptRes.data
      if (recvAppid !== appid) {
        this.logger.debug(
          `${MODULE} appid 不符，收到 ${recvAppid}，应为 ${appid}`
        )
        return genFail(errCodeMap.INVALID_APPID.msg)
      }
      const v = (await this.parseRecvXmlMsg<T>(
        plainXmlData,
        searchParams,
        appid,
        token
      )) as {
        success: boolean
        data: {
          isEncrypt: boolean
          recvPlainData: T
        }
        msg: string
      }

      if (v.success) {
        v.data.isEncrypt = true
      }
      return v
    }

    // 微信消息 MsgId 可能为数字或字符串，统一字符串
    if ('MsgId' in xmlObj) {
      xmlObj.MsgId = `${xmlObj.MsgId}`
    }

    return genSuccess({ recvPlainData: xmlObj as T, isEncrypt: false })
  }

  /**
   * 生成加密的 xml 返回
   * @param xmlMsg 明文的 xml 返回
   */
  async genSendEncryptXmlMsg(
    xmlMsg: string,
    appid: string,
    token: string,
    options = {
      timestamp: Math.floor(Date.now() / 1000),
      nonce: Math.floor(Math.random() * 10 ** 10),
    }
  ) {
    const encryptRes = this.encryptContent(xmlMsg, appid)
    if (!encryptRes.success) {
      return encryptRes
    }

    const encrypt = encryptRes.data
    const { timestamp, nonce } = options
    const str = [encrypt, timestamp, nonce, token].sort().join('')
    const signature = await shaDigest('SHA-1', str)

    const msg = `<xml>
<Encrypt><![CDATA[${encrypt}]]></Encrypt>
<MsgSignature><![CDATA[${signature}]]></MsgSignature>
<TimeStamp>${timestamp}</TimeStamp>
<Nonce><![CDATA[${nonce}]]></Nonce>
</xml>`

    return genSuccess(msg)
  }
}
