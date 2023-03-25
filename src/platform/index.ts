import { WeChat } from './wechat'

import type { PlatformType } from './types'

export const platformMap = {
  wechat: WeChat,
} satisfies { [key in PlatformType]: PlatformClass }


export type PlatformClass = typeof WeChat
export type PlatformInstance = WeChat
