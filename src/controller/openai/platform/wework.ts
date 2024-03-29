import { genFail, genSuccess, genMyResponse } from '../../../utils'
import { CONST, CONFIG as GLOBAL_CONFIG } from '../../../global'
import { CONFIG as OPENAI_CONFIG } from '../config'
import { CONFIG as WE_WORK_CONFIG } from '../../../platform/wechat/wework'
import { WeChatBaseHandler } from './wechatBase'

import type { WeWork } from '../../../platform/wechat/wework'

const MODULE = 'src/openai/platform/wework.ts'

export class WeWorkHandler extends WeChatBaseHandler<WeWork> {
  async initCtx() {
    const { platform, appid, userId, adminUserIdList } = this.platform.ctx
    const { role } = this.ctx

    const initRes = await this.commonInit()
    if (initRes) return initRes

    const isOpenAi = this.ctx.openaiType === 'openai'
    const apiKeyRes = isOpenAi
      ? await this.kvApiKey().getWithExpireRefresh()
      : await this.kvAzureKey().getWithExpireRefresh()
    if (!apiKeyRes.success) {
      this.logger.debug(`${MODULE} 获取 api key 失败`)
      return '服务异常'
    }

    const isAdmin = adminUserIdList.includes(userId) || (await this.isGlobalAdmin())
    if (isAdmin) {
      role.add(CONST.ROLE.ADMIN)
    }

    const [globalAdminOpenAiKey, globalGuestOpenAiKey] = isOpenAi
      ? [OPENAI_CONFIG.ADMIN_KEY, OPENAI_CONFIG.GUEST_KEY]
      : [OPENAI_CONFIG.AZURE_ADMIN_KEY, OPENAI_CONFIG.AZURE_GUEST_KEY]

    // 先用自己的 key
    if (apiKeyRes.data) {
      this.ctx.apiKey = apiKeyRes.data
      role.delete(CONST.ROLE.GUEST)
      this.ctx.role.add(CONST.ROLE.USER)
    } else if (globalGuestOpenAiKey) {
      this.ctx.apiKey = globalGuestOpenAiKey
      role.add(CONST.ROLE.FREE_TRIAL)
    } else if (isAdmin && globalAdminOpenAiKey) {
      this.ctx.apiKey = globalAdminOpenAiKey
    }

    if (!this.ctx.apiKey) {
      this.logger.debug(`${MODULE} 没有 api key`)
      return
    }
  }
}
