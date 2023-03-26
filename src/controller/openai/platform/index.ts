import { WeChatHandler } from './wechat'

import  type { PlatformType } from '../../../platform/types'

export const handlerMap = {
  wechat: WeChatHandler,
} satisfies { [key in PlatformType]: HandlerClass }

export type HandlerClass = typeof WeChatHandler
export type HandlerInstance = WeChatHandler
