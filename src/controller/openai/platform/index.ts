import { WeChatHandler } from './wechat'
import { WeWorkHandler } from './wework'

import  type { PlatformType } from '../../../platform/types'

export const handlerMap = {
  wechat: WeChatHandler,
  wework: WeWorkHandler,
} satisfies { [key in PlatformType]: HandlerClass }

export type HandlerClass = typeof WeChatHandler | typeof WeWorkHandler
export type HandlerInstance = WeChatHandler | WeWorkHandler
