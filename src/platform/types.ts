import type { MyRequest, MyResponse } from '../types'
import type { Logger } from "../utils";
import type { RecvPlainMsg, WeChatCtx } from './wechat'

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
