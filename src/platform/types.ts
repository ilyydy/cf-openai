import type { MyRequest, MyResponse } from '../types'
import type { Logger } from '../utils'
import type { RecvPlainData as WeChatRecvPlainData } from './wechat/wechatType'
import type { RecvPlainData as WeWorkRecvPlainData } from './wechat/weworkType'

export type PlatformType = 'wechat' | 'wework'

export type RecvMsg = WeChatRecvPlainData | WeWorkRecvPlainData

export type HandleRecvData<T> = (recvMsg: T) => Promise<MyResponse> | MyResponse

export interface Platform<
  T extends PlatformType = PlatformType,
  K extends RecvMsg = RecvMsg
> {
  readonly ctx: {
    platform: T
    appid: string
    userId: string
  }

  readonly request: MyRequest
  readonly id: string
  logger: Logger

  handleRequest(handleRecvMsg: HandleRecvData<K>): Promise<MyResponse>
}
