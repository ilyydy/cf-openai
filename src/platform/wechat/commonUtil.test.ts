import { describe, expect, it, beforeAll, afterAll } from 'vitest'

import { CommonUtil } from './commonUtil'
import { logger } from '../../utils'

describe('src/platform/wechat.ts', () => {
  let commonUtil: CommonUtil

  const id = '1'
  const token = 'spamtest'
  const expectAppid = 'wx2c2769f8efd9abc2'
  const timestamp = '1409735669'
  const nonce = '1320562132'
  const echostr = 'shr5ch'
  const msgSignature = '5d197aaffba7e9b25a30732f161a50dee96bd5fa'
  const signature = '16120ec1b8dbb870f510d87ce6bc2463eae6ca1a'
  const url = `https://example.com/openai/wechat/${id}?echostr=${echostr}&signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&msg_signature=${msgSignature}`
  const urlObj = new URL(url)
  const { searchParams } = urlObj
  const encodingAESKey = 'abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG'

  const encryptContent =
    'hyzAe4OzmOMbd6TvGdIOO6uBmdJoD0Fk53REIHvxYtJlE2B655HuD0m8KUePWB3+LrPXo87wzQ1QLvbeUgmBM4x6F8PGHQHFVAFmOD2LdJF9FrXpbUAh0B5GIItb52sn896wVsMSHGuPE328HnRGBcrS7C41IzDWyWNlZkyyXwon8T332jisa+h6tEDYsVticbSnyU8dKOIbgU6ux5VTjg3yt+WGzjlpKn6NPhRjpA912xMezR4kw6KWwMrCVKSVCZciVGCgavjIQ6X8tCOp3yZbGpy0VxpAe+77TszTfRd5RJSVO/HTnifJpXgCSUdUue1v6h0EIBYYI1BD1DlD+C0CR8e6OewpusjZ4uBl9FyJvnhvQl+q5rv1ixrcpCumEPo5MJSgM9ehVsNPfUM669WuMyVWQLCzpu9GhglF2PE='

  const encryptMsg = `<xml><ToUserName><![CDATA[gh_10f6c3c3ac5a]]></ToUserName><Encrypt><![CDATA[${encryptContent}]]></Encrypt></xml>`

  const expectPlainMsg = `<xml><ToUserName><![CDATA[gh_10f6c3c3ac5a]]></ToUserName>
<FromUserName><![CDATA[oyORnuP8q7ou2gfYjqLzSIWZf0rs]]></FromUserName>
<CreateTime>1409735668</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[abcdteT]]></Content>
<MsgId>6054768590064713728</MsgId>
</xml>`

  const recvPlainMsg = {
    ToUserName: 'gh_10f6c3c3ac5a',
    FromUserName: 'oyORnuP8q7ou2gfYjqLzSIWZf0rs',
    CreateTime: 1409735668,
    MsgType: 'text',
    Content: 'abcdteT',
    MsgId: '6054768590064713728',
  } as const

  beforeAll(() => {
    commonUtil = new CommonUtil(logger)
    commonUtil.setKey(encodingAESKey)
  })

  // afterAll(async () => {})

  it('decrypt wechat encrypt content', () => {
    const decryptRes = commonUtil.decryptContent(encryptContent)
    if (!decryptRes.success) {
      throw new Error(`decrypt fail ${decryptRes.msg}`)
    }

    const { plainContent: plainXmlMsg, appid } = decryptRes.data
    expect(plainXmlMsg).toBe(expectPlainMsg)
    expect(appid).toBe(expectAppid)
  })

  it('encrypt wechat plain content', () => {
    const encryptRes = commonUtil.encryptContent(expectPlainMsg, expectAppid)
    if (!encryptRes.success) {
      throw new Error(`encrypt fail ${encryptRes.msg}`)
    }

    const decryptRes = commonUtil.decryptContent(encryptRes.data)
    if (!decryptRes.success) {
      throw new Error(`decrypt fail ${decryptRes.msg}`)
    }

    const { plainContent, appid } = decryptRes.data
    expect(plainContent).toBe(expectPlainMsg)
    expect(appid).toBe(expectAppid)
  })

  it('parse wechat plain xml text msg', async () => {
    const msgRes = await commonUtil.parseRecvXmlMsg(expectPlainMsg, searchParams, expectAppid, token)
    if (!msgRes.success) {
      throw new Error(`parse wechat plain xml text msg fail ${msgRes.msg}`)
    }

    expect(msgRes.data.isEncrypt).toBe(false)
    expect(msgRes.data.recvPlainData).toStrictEqual(recvPlainMsg)
  })

  it('parse wechat encrypt xml text msg', async () => {
    const msgRes = await commonUtil.parseRecvXmlMsg(encryptMsg, searchParams, expectAppid, token)
    if (!msgRes.success) {
      throw new Error(`parse wechat encrypt xml text msg fail ${msgRes.msg}`)
    }

    expect(msgRes.data.isEncrypt).toBe(true)
    expect(msgRes.data.recvPlainData).toStrictEqual(recvPlainMsg)
  })

  it('generate wechat encrypt xml text msg', async () => {
    const textXmlMsg = `<xml>
<ToUserName><![CDATA[${recvPlainMsg.FromUserName}]]></ToUserName>
<FromUserName><![CDATA[${recvPlainMsg.ToUserName}]]></FromUserName>
<CreateTime>${Math.floor(Date.now() / 1000)}</CreateTime>
<MsgType><![CDATA[text]]></MsgType>
<Content><![CDATA[${recvPlainMsg.Content}]]></Content>
</xml>`

    const msgRes = await commonUtil.genRespEncryptXmlMsg(textXmlMsg, expectAppid, token)
    if (!msgRes.success) {
      throw new Error(`generate wechat encrypt xml text msg fail ${msgRes.msg}`)
    }
    // console.log(msgRes.data)
    expect(msgRes.success).toBe(true)
  })
})
