import { WeChat } from './wechat/wechat'
import { WeWork } from './wechat/wework'

import type { PlatformType } from './types'

export const platformMap = {
  wechat: WeChat,
  wework: WeWork,
} satisfies { [key in PlatformType]: PlatformClass }


export type PlatformClass = typeof WeChat | typeof WeWork
export type PlatformInstance = WeChat | WeWork
