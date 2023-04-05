/**
 * 企业微信消息类型
 * @see https://developer.work.weixin.qq.com/document/path/90239
 * @see https://developer.work.weixin.qq.com/document/path/90240
 * @see https://developer.work.weixin.qq.com/document/path/90241
 * @see https://developer.work.weixin.qq.com/document/path/90236
 * @see https://developer.work.weixin.qq.com/document/path/90313
 */

import { z } from 'zod'

import { MsgTypeMap, EventTypeMap } from './commonUtil'

const recvBase = {
  ToUserName: z.string(), // 企业微信CorpID
  FromUserName: z.string(), // 成员UserID
  CreateTime: z.number(), // 消息创建毫秒时间戳
  AgentID: z.string(), // 接收的应用id，可在应用的设置页面获取
}

/* ----------------- 消息 ----------------------------------- */

export const recvBaseMsgValidator = z
  .object({
    MsgId: z.string(), // 消息id，64位整型
  })
  .extend(recvBase)

export type RecvBaseMsg = z.infer<typeof recvBaseMsgValidator>

export const getRecvTextMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.text),
    Content: z.string(), // 前后可能带空字符
  })

export type RecvTextMsg = z.infer<ReturnType<typeof getRecvTextMsgValidator>>
export type RespTextMsg = Omit<RecvTextMsg, 'MsgId' | 'AgentID'>

export const getRecvImgMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.image),
    PicUrl: z.string(), // 图片链接
    MediaId: z.string(), // 图片媒体文件id，可以调用获取媒体文件接口拉取，仅三天内有效
  })

export type RecvImgMsg = z.infer<ReturnType<typeof getRecvImgMsgValidator>>
export type RespImgMsg = Omit<
  RecvImgMsg,
  'MsgId' | 'AgentID' | 'PicUrl' | 'MediaId'
> & {
  Image: { MediaId: string }[]
}

export const getRecvVoiceMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.voice),
    Format: z.string(), // 语音格式，如amr，speex等
    MediaId: z.string(), // 语音媒体文件id，可以调用获取媒体文件接口拉取数据，仅三天内有效
    Recognition: z.string().optional(), // 开通语音识别后有，语音识别结果，UTF8编码
  })

export type RecvVoiceMsg = z.infer<ReturnType<typeof getRecvVoiceMsgValidator>>
export type RespVoiceMsg = Omit<
  RecvVoiceMsg,
  'MsgId' | 'AgentID' | 'Format' | 'Recognition' | 'MediaId'
> & {
  Voice: { MediaId: string }[]
}

export const getRecvVideoMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.video),
    MediaId: z.string(), // 视频媒体文件id，可以调用获取媒体文件接口拉取数据，仅三天内有效
    ThumbMediaId: z.string(), // 视频消息缩略图的媒体id，可以调用获取媒体文件接口拉取数据，仅三天内有效
  })

export type RecvVideoMsg = z.infer<ReturnType<typeof getRecvVideoMsgValidator>>
export type RespVideoMsg = Omit<
  RecvVideoMsg,
  'MsgId' | 'AgentID' | 'ThumbMediaId' | 'MediaId'
> & {
  Video: { MediaId: string; Title?: string; Description?: string }[]
}

export const getRecvLocationMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.link),
    Title: z.string(), // 消息标题
    Description: z.string(), // 消息描述
    Url: z.string(), // 链接跳转的url
    PicUrl: z.string(), // 封面缩略图的url
  })

export type RecvLocationMsg = z.infer<
  ReturnType<typeof getRecvLocationMsgValidator>
>

export const getRecvLinkMsgValidator = () =>
  recvBaseMsgValidator.extend({
    MsgType: z.literal(MsgTypeMap.location),
    Location_X: z.number(), // 地理位置纬度
    Location_Y: z.number(), // 地理位置经度
    Scale: z.number(), // 地图缩放大小
    Label: z.string(), // 地理位置信息
    AppType: z.enum(['wxwork']).optional(), // app类型，在企业微信固定返回wxwork，在微信不返回该字段
  })

export type RecvLinkMsg = z.infer<ReturnType<typeof getRecvLinkMsgValidator>>

export const recvMsgValidatorBuildMap = {
  [MsgTypeMap.text]: getRecvTextMsgValidator,
  [MsgTypeMap.image]: getRecvImgMsgValidator,
  [MsgTypeMap.voice]: getRecvVoiceMsgValidator,
  [MsgTypeMap.video]: getRecvVideoMsgValidator,
  [MsgTypeMap.location]: getRecvLocationMsgValidator,
  [MsgTypeMap.link]: getRecvLinkMsgValidator,
} as const

export type RecvPlainMsg =
  | RecvTextMsg
  | RecvImgMsg
  | RecvVoiceMsg
  | RecvVideoMsg
  | RecvLocationMsg
  | RecvLinkMsg

export type RespNewsMsg = Omit<RecvBaseMsg, 'MsgId' | 'AgentID'> & {
  MsgType: 'news'
  ArticleCount: number // 图文消息个数
  Articles: {
    item: {
      Title: string // 标题，不超过128个字节，超过会自动截断
      Description: string // 描述，不超过512个字节，超过会自动截断
      PicUrl: string // 图文消息的图片链接，支持JPG、PNG格式，较好的效果为大图640320，小图8080
      Url: string // 点击图文消息跳转链接
    }[]
  }
}

export type RespPlainMsg =
  | RespTextMsg
  | RespImgMsg
  | RespVoiceMsg
  | RespVideoMsg
  | RespNewsMsg

/* ----------------- 消息 ----------------------------------- */

/* ----------------- 事件 ----------------------------------- */

export const recvBaseEventValidator = z
  .object({
    MsgType: z.enum([MsgTypeMap.event]),
  })
  .extend(recvBase)

export const getSubscribeEventValidator = () =>
  recvBaseEventValidator.extend({
    Event: z.enum(['subscribe']),
  })

export type SubscribeEvent = z.infer<
  ReturnType<typeof getSubscribeEventValidator>
>

export const getUnSubscribeEventValidator = () =>
  recvBaseEventValidator.extend({
    Event: z.enum(['unsubscribe']),
  })

export type UnSubscribeEvent = z.infer<
  ReturnType<typeof getUnSubscribeEventValidator>
>

export const getEnterAgentEventValidator = () =>
  recvBaseEventValidator.extend({
    Event: z.enum(['enter_agent']),
  })

export type EnterAgentEvent = z.infer<
  ReturnType<typeof getEnterAgentEventValidator>
>

export type RecvPlainEvent = SubscribeEvent | UnSubscribeEvent | EnterAgentEvent

export const recvEventValidatorBuildMap = {
  [EventTypeMap.subscribe]: getSubscribeEventValidator,
  [EventTypeMap.unsubscribe]: getUnSubscribeEventValidator,
  [EventTypeMap.enter_agent]: getEnterAgentEventValidator,
} as const

/* ----------------- 事件 ----------------------------------- */

export type RecvPlainData = RecvPlainMsg | RecvPlainEvent

export const getRecvEncryptMsgValidator = () =>
  z.object({
    ToUserName: z.string(), // 企业微信的CorpID，当为第三方套件回调事件时，CorpID的内容为suiteid
    AgentID: z.string(), // 接收的应用id，可在应用的设置页面获取
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

/**
 * URL 参数
 */
export interface Query {
  msg_signature: string // 企业微信加密签名，msg_signature结合了企业填写的token、请求中的timestamp、nonce参数、加密的消息体
  timestamp: string
  nonce: string
}

/**
 * 接入验证时的 URL 参数
 */
export interface QueryVerify extends Query {
  echostr: string // 加密的字符串。需要解密得到消息内容明文，解密后有random、msg_len、msg、receiveid四个字段，其中msg即为消息内容明文
}

/* ----------------- 推送消息 ----------------------------------- */

/**
 * touser、toparty、totag不能同时为空
 */

export interface SendBaseMsg {
  // 指定接收消息的成员，成员ID列表（多个接收者用‘|’分隔，最多支持1000个）。特殊情况：指定为"@all"，则向该企业应用的全部成员发送
  touser?: string
  // 指定接收消息的部门，部门ID列表，多个接收者用‘|’分隔，最多支持100个。当touser为"@all"时忽略本参数
  toparty?: string
  // 指定接收消息的标签，标签ID列表，多个接收者用‘|’分隔，最多支持100个。当touser为"@all"时忽略本参数
  totag?: string
  agentid: number // 企业应用的id，整型
  safe?: number // 表示是否是保密消息，0表示可对外分享，1表示不能分享且内容显示水印，默认为0
  enable_id_trans?: number // 表示是否开启id转译，0表示否，1表示是，默认0。仅第三方应用需要用到，企业自建应用可以忽略。
  enable_duplicate_check?: number // 表示是否开启重复消息检查，0表示否，1表示是，默认0
  duplicate_check_interval?: number // 表示是否重复消息检查的时间间隔，默认1800s，最大不超过4小时
}

export interface SendTextMsg extends SendBaseMsg {
  msgtype: 'text'
  agentid: number // 企业应用的id，整型
  text: {
    content: string
  } // 消息内容，最长不超过2048个字节，超过将截断（支持id转译）
}

export interface SendImgMsg extends SendBaseMsg {
  msgtype: 'image'
  image: { media_id: string } // 图片媒体文件id，可以调用上传临时素材接口获取
}

export type SendMsg = SendTextMsg | SendImgMsg

export interface SendResponse {
  errcode: number // 0 成功  -1 系统繁忙 其他异常
  errmsg: string
  invaliduser: string
  invalidparty: string
  invalidtag: string
  unlicenseduser: string
  msgid: string
  response_code: string
}

/* ----------------- 推送消息 ----------------------------------- */
