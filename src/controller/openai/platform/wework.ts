import { genFail, genSuccess, genMyResponse } from '../../../utils'
import { CONST, CONFIG as GLOBAL_CONFIG } from '../../../global'
import { CONFIG } from '../config'
import * as kv from '../kv'
import { estimateTokenCount } from '../utils'
import { CONFIG as WE_WORK_CONFIG } from '../../../platform/wechat/wework'
import { WeChatBaseHandler } from './wechatBase'

import type { WeWork } from '../../../platform/wechat/wework'

const MODULE = 'src/openai/platform/wework.ts'

export class WeWorkHandler extends WeChatBaseHandler<WeWork> {
  async initCtx() {
    const { platform, appid, userId } = this.platform.ctx

    if (WE_WORK_CONFIG.WEWORK_ID_LIST.includes(userId)) {
      this.ctx.role.add(CONST.ROLE.ADMIN)
    }

    return super.initCtx()
  }
}
