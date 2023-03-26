import { XMLParser } from 'fast-xml-parser'
import crypto from 'crypto'

import type { webcrypto } from 'crypto'

import {
  getTextDecoder,
  getTextEncoder,
  concatUint8Array,
  base64ToUint8Array,
  uint8ArrayToBase64,
} from '../src/utils'

async function shaDigest(algorithm: string, input: string) {
  const buffer = await crypto.subtle.digest(
    algorithm,
    new TextEncoder().encode(input)
  )

  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

class Client {
  private _aesKeyInfo: {
    key: webcrypto.CryptoKey // 已经导入的 CryptoKey 格式密钥
    iv: Uint8Array // 初始向量大小为16字节，取AESKey前16字节
  } | null = null

  xmlParser = new XMLParser({
    processEntities: false,
  })

  constructor(
    readonly toUserName: string,
    readonly appid: string,
    readonly token: string,
    readonly encodingAESKey: string,
    readonly targetUrl: string
  ) {}

  async sendTextMsg({
    msg,
    fromUserName,
    encrypt,
  }: {
    msg: string
    fromUserName: string
    encrypt: boolean
  }) {
    const timestamp = `${Math.floor(Date.now() / 1000)}`
    const nonce = `${Math.floor(Math.random() * 10 ** 10)}`
    const msgId = nonce
    const xml = `<xml><ToUserName><![CDATA[${this.toUserName}]]></ToUserName>
<FromUserName><![CDATA[${fromUserName}]]></FromUserName>
<CreateTime>${timestamp}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${msg}]]></Content>
<MsgId>${msgId}</MsgId>
</xml>`

    const signature = await this.getSignature(timestamp, nonce)
    const targetUrl = new URL(this.targetUrl)
    targetUrl.searchParams.set('signature', signature)
    targetUrl.searchParams.set('timestamp', timestamp)
    targetUrl.searchParams.set('nonce', nonce)
    targetUrl.searchParams.set('openid', fromUserName)
    if (!encrypt) {
      const resp = await fetch(targetUrl, { body: xml, method: 'POST' })
      const text = await resp.text()
      console.log('收到明文回复 ', text)
      return text
    }

    const encryptContent = await this.encryptContent(xml)
    const msg_signature = await this.getSignature(
      timestamp,
      nonce,
      encryptContent
    )
    const encryptXml = `<xml><ToUserName><![CDATA[${this.toUserName}]]></ToUserName><Encrypt><![CDATA[${encryptContent}]]></Encrypt></xml>`
    targetUrl.searchParams.set('msg_signature', msg_signature)
    targetUrl.searchParams.set('encrypt_type', 'aes')
    const resp = await fetch(targetUrl, { body: encryptXml, method: 'POST' })
    const encryptText = await resp.text()
    console.log('收到加密回复 ', encryptText)

    const text = await this.parseRecvXmlMsg(encryptText)
    console.log('解密收到回复 ', text)
    return text
  }

  async getSignature(...args: string[]) {
    const tmpArr = [this.token, ...args]
    tmpArr.sort()
    const tmpStr = tmpArr.join('')
    console.log(tmpStr)
    return shaDigest('SHA-1', tmpStr)
  }

  /**
   * 导入 AES 解密微信 xml 消息中 <Encrypt> 块内容
   * @see https://developer.work.weixin.qq.com/document/path/96211
   */
  async importWeChatAesKey() {
    const keyInUint8Array = base64ToUint8Array(this.encodingAESKey + '=')

    const key = await crypto.subtle.importKey(
      'raw',
      keyInUint8Array,
      // 只能在 node 使用
      // Buffer.from(encodingAESKey + '=', 'base64'),
      { name: 'AES-CBC' },
      true,
      ['decrypt', 'encrypt']
    )
    return {
      key,
      keyInUint8Array,
      iv: keyInUint8Array.slice(0, 16),
    }
  }

  async getAesKeyInfo() {
    if (!this._aesKeyInfo) {
      const r = await this.importWeChatAesKey()
      this._aesKeyInfo = r
    }
    return this._aesKeyInfo
  }

  /**
   * AES 加密明文为微信 xml 消息中 <Encrypt> 块内容
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Message_encryption_and_decryption_instructions.html
   * @see https://developer.work.weixin.qq.com/document/path/96211
   * @see https://github.com/keel/aes-cross/tree/master/info-cn
   * @param plainContent utf8 明文
   */
  async encryptContent(plainContent: string) {
    // 加密后的结果 = 16个字节的随机字符串 + 4个字节的msg长度(网络字节序) + 明文msg + receiveid + 填充

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
    const appidUint8Array = getTextEncoder().encode(this.appid)

    // 补位
    const blockSize = 32
    const msgLength =
      random16.length +
      contentUint8Array.length +
      msgUint8Array.length +
      appidUint8Array.length

    // 计算需要填充的位数
    const amountToPad = blockSize - (msgLength % blockSize)
    const padUint8Array = new Uint8Array(amountToPad)
    padUint8Array.fill(amountToPad)

    const concatenatedArray = concatUint8Array([
      random16,
      msgUint8Array,
      contentUint8Array,
      appidUint8Array,
      padUint8Array,
    ])

    const { iv, key } = await this.getAesKeyInfo()
    const arrBuffer = await crypto.subtle.encrypt(
      { name: 'AES-CBC', iv },
      key,
      concatenatedArray
    )

    return uint8ArrayToBase64(new Uint8Array(arrBuffer))
  }

  /**
   * AES 解密微信 xml 消息中 <Encrypt> 块内容
   * @see https://developers.weixin.qq.com/doc/offiaccount/Message_Management/Message_encryption_and_decryption_instructions.html
   * @see https://developer.work.weixin.qq.com/document/path/96211
   * @see https://github.com/keel/aes-cross/tree/master/info-cn
   * @param encryptContent 从 xml <Encrypt> 块中取出的内容，加密处理后的Base64编码
   */
  async decryptContent(encryptContent: string) {
    const { iv, key } = await this.getAesKeyInfo()

    const arrBuffer = await crypto.subtle.decrypt(
      { name: 'AES-CBC', iv },
      key,
      base64ToUint8Array(encryptContent) // base64 到 Uint8Array
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

    return { plainXmlMsg, appid }
  }

  /**
   * 解析微信 xml 消息
   * @param xmlMsg 微信 xml 消息
   */
  async parseRecvXmlMsg(xmlMsg: string) {
    const root = this.xmlParser.parse(xmlMsg) as { xml: Record<string, string> }
    const xmlObj = root.xml
    const {
      Encrypt: encrypt,
      MsgSignature: msgSignature,
      TimeStamp: timestamp,
      Nonce: nonce,
    } = xmlObj

    const mySignature = await this.getSignature(
      `${timestamp}`,
      `${nonce}`,
      encrypt
    )
    if (mySignature !== msgSignature) {
      throw new Error(
        `消息签名不对 mySignature ${mySignature} msgSignature ${msgSignature}`
      )
    }

    const { appid, plainXmlMsg } = await this.decryptContent(encrypt)
    if (appid !== this.appid) {
      throw new Error(`appid 不对 appid ${appid} this.appid ${this.appid}`)
    }

    return plainXmlMsg
  }
}

async function test() {
  const toUserName = 'user1'
  const id = 'id1'
  const appid = 'appid1'
  const token = 'token1'
  const encodingAESKey = '0GSZBonm7NPFCQeS2VveeOBZOHDOLHQtAP5Ai96fTwT'
  const targetUrl = `http://localhost:8787/openai/wechat/${id}`
  const client = new Client(toUserName, appid, token, encodingAESKey, targetUrl)

  const fromUserName = 'user2'
  const testApiKey = ''

  const msg = '/help'
  // const msg = `/bindKey ${testApiKey}`
  // const msg = '/system'
  // const msg = '/faq'
  // const msg = '/unbindKey'
  // const msg = '/testKey'
  // const msg = '/usage'
  // const msg = '/freeUsage'
  // const msg = 'can you connect network'
  const encrypt = true

  const recv = await client.sendTextMsg({ msg, fromUserName, encrypt })
}

// test()
