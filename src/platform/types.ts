import { z } from 'zod'
import { MsgTypeMap } from './wechat'

import type { MyRequest, MyResponse } from '../types'
import type { Logger } from "../utils";
import type { WeChatCtx } from './wechat'

export type PlatformType = 'wechat'

export type WeChatMsg = { type: 'wechat'; msg: RecvPlainMsg }
export type RecvMsg = WeChatMsg

export type HandleRecvMsg<T> = (recvMsg: T) => Promise<MyResponse> | MyResponse

export interface Platform<T extends RecvMsg = RecvMsg> {
  readonly ctx: {
    platform: WeChatCtx['platform']
    appid: WeChatCtx['appid']
    userId: WeChatCtx['userId']
  }

  readonly request: MyRequest
  readonly id: string
  logger: Logger

  handleRequest(handleRecvMsg: HandleRecvMsg<T>): Promise<MyResponse>
}


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
