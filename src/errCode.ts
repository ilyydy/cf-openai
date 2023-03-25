export const errCodeMap = {
  INVALID_METHOD: { httpCode: 400, msg: '请求不合法' },
  INVALID_PARAMS: { httpCode: 400, msg: '提交的数据不合法' },
  INVALID_PLATFORM: { httpCode: 400, msg: '平台不合法' },
  INVALID_PLATFORM_ID: { httpCode: 400, msg: '平台ID不合法' },
  INVALID_SIGNATURE: { httpCode: 400, msg: '签名不合法' },
} as const

export type ErrCodeKey = keyof typeof errCodeMap
export type ErrCode = typeof errCodeMap[ErrCodeKey]
