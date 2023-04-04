import { genFail, genSuccess, genMyResponse } from '../../../utils'
import { CONST, CONFIG as GLOBAL_CONFIG } from '../../../global'
import { CONFIG as OPENAI_CONFIG } from '../config'
import { CONFIG as WE_CHAT_CONFIG } from '../../../platform/wechat/wechat'
import { WeChatBaseHandler } from './wechatBase'
import * as globalKV from '../../../kv'

import type { WeChat } from '../../../platform/wechat/wechat'

const MODULE = 'src/openai/platform/wechat.ts'

export class WeChatHandler extends WeChatBaseHandler<WeChat> {
  async initCtx() {
    const { platform, appid, userId } = this.platform.ctx
    const { role } = this.ctx

    const apiKeyRes = await this.kvApiKey().getWithExpireRefresh()
    if (!apiKeyRes.success) {
      this.logger.debug(`${MODULE} 获取 api key 失败`)
      return '服务异常'
    }

    const isAdmin = WE_CHAT_CONFIG.WECHAT_ADMIN_USER_ID_LIST.includes(userId) || (await this.isGlobalAdmin())
    if (isAdmin) {
      role.add(CONST.ROLE.ADMIN)
    }
    const wechatAdminOpenAiKey = WE_CHAT_CONFIG.WECHAT_ADMIN_OPENAI_KEY
    const wechatGuestOpenAiKey = WE_CHAT_CONFIG.WECHAT_GUEST_OPENAI_KEY
    const globalAdminOpenAiKey = OPENAI_CONFIG.ADMIN_KEY
    const globalGuestOpenAiKey = OPENAI_CONFIG.GUEST_KEY

    // 先用自己的 key
    if (apiKeyRes.data) {
      this.ctx.apiKey = apiKeyRes.data
      role.delete(CONST.ROLE.GUEST)
      this.ctx.role.add(CONST.ROLE.USER)
    } else if (wechatGuestOpenAiKey) {
      this.ctx.apiKey = wechatGuestOpenAiKey
      role.add(CONST.ROLE.FREE_TRIAL)
    } else if (isAdmin && wechatAdminOpenAiKey) {
      this.ctx.apiKey = wechatAdminOpenAiKey
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

    return this.initChatType()
  }

  // key 里 appid 应该用 id，id 通过 url 确保每个平台下唯一
  // 微信因为历史原因用了 appid，id 和 appid 一一映射应该没有问题
  protected override kvUserDimensionKey = (part: string) =>
    globalKV.KeyBuilder.of(
      'openai',
      part,
      this.platform.ctx.platform,
      this.platform.ctx.appid,
      this.platform.ctx.userId
    )
}
