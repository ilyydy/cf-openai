const MODULE = 'src/controller/openai/util.ts'

export function getApiKeyWithMask(apiKey: string) {
  return `${apiKey.slice(0, 6)}****${apiKey.slice(apiKey.length - 4)}`
}

export function getWeChatOpenIdWithMask(text: string): string {
  return `${text.slice(0, 6)}****${text.slice(text.length - 4)}`
}

/**
 * @see https://platform.openai.com/tokenizer
 * 估算字符串的 token 数量
 */
export function estimateTokenCount(str: string) {
  let count = 0

  for (const i of str) {
    if (i.charCodeAt(0) <= 255) {
      // 4 ~ 5 个英文字符算 1 个
      count += 0.2
    } else {
      // 其他如中文字符算 2 个 token
      count += 2
    }
  }

  return Math.ceil(count)
}
