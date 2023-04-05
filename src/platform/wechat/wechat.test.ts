import { describe, expect, it, beforeAll, afterAll } from 'vitest'

import { WeChat } from './wechat'
import { genMyResponse } from '../../utils'

import type { Env } from '../../types'

describe('src/platform/wechat/wechat.ts', () => {
  let webchatInstance: WeChat

  const id = '1'
  const token = 'spamtest'
  const expectAppid = 'wx2c2769f8efd9abc2'
  const timestamp = '1409735669'
  const nonce = '1320562132'
  const echostr = 'shr5ch'
  const msgSignature = '5d197aaffba7e9b25a30732f161a50dee96bd5fa'
  const signature = '16120ec1b8dbb870f510d87ce6bc2463eae6ca1a'
  const url = `https://example.com/openai/wechat/${id}?echostr=${echostr}&signature=${signature}&timestamp=${timestamp}&nonce=${nonce}&msg_signature=${msgSignature}`
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
    webchatInstance = new WeChat(
      {
        body: encryptMsg,
        ctx: {} as ExecutionContext,
        headers: {},
        method: '',
        reqId: '',
        url,
        urlObj: new URL(url),
        env: {} as Env,
      },
      id
    )

    webchatInstance.ctx.token = token
    webchatInstance.ctx.encodingAESKey = encodingAESKey
    webchatInstance.ctx.appid = expectAppid
    webchatInstance.commonUtil.setKey(encodingAESKey)
  })

  // afterAll(async () => {})

  it('http get', async () => {
    const res = await webchatInstance.handleGet()
    expect(res.body).toBe(echostr)
  })

  it('http post ok', async () => {
    const res = await webchatInstance.handlePost(() => genMyResponse('ok'))
    expect(res.body).toEqual('ok')
  })
})
