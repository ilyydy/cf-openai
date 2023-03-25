import { genMyErrResponse } from '../../utils'
import { handlerMap } from './platform'
import { errCodeMap } from '../../errCode'

import type { MyRequest } from '../../types'
import type { HandlerClass } from './platform'
import type { PlatformType } from '../../platform/types'

const MODULE = 'src/controller/openai/index.ts'

export async function handleRequest(
  request: MyRequest,
  platformType: string,
  id: string
) {
  const handlerClass = (
    handlerMap as { [type: string]: HandlerClass | undefined }
  )[platformType]
  if (!handlerClass) {
    return genMyErrResponse(errCodeMap.INVALID_PLATFORM)
  }

  return new handlerClass(
    request,
    platformType as PlatformType,
    id
  ).handleRequest()
}
