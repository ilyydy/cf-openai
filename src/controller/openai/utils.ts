const MODULE = 'src/controller/openai/util.ts'

export function getApiKeyWithMask(apiKey: string) {
  return `${apiKey.slice(0, 6)}****${apiKey.slice(apiKey.length - 4)}`
}

export function getTextWithMask(text: string) {
  const len = text.length
  if (len <= 1) {
    return text
  }
  if (len === 2) {
    return `${text[0]}****`
  }

  const maskLen = Math.min(Math.floor(len / 3), 4)
  return `${text.slice(0, maskLen)}****${text.slice(len - maskLen)}`
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
