import { PlatformType } from '../../../platform/types'
import { WeChatHandler } from './wechat'

export const handlerMap = {
  wechat: WeChatHandler,
} satisfies { [key in PlatformType]: HandlerClass }

export type HandlerClass = typeof WeChatHandler
export type HandlerInstance = WeChatHandler
