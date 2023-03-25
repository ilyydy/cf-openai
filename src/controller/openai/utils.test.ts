import { describe, expect, it, beforeAll, afterAll } from 'vitest'

import * as utils from './utils'

describe('src/controller/openai/utils.ts', () => {
  beforeAll(async () => {})

  afterAll(async () => {})

  it('get api key with mask', async () => {
    const key = 'sf-abcdef123xx6hls5dgs'
    expect(utils.getApiKeyWithMask(key)).toBe('sf-abc****5dgs')
  })

  it('estimate token count', async () => {
    const tests = [
      ['Hello, how is the weather tomorrow?', 8],
      ['你好，明天天气怎么样', 19],
      [
        'The GPT family of models process text using tokens, which are common sequences of characters found in text. The models understand the statistical relationships between these tokens, and excel at producing the next token in a sequence of tokens.',
        44,
      ],
      [
        'It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way — in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.',
        145,
      ],
      [
        '中国，以华夏文明为源泉、中华文化为基础，是世界上历史最悠久的国家之一。中国各族人民共同创造了光辉灿烂的文化，具有光荣的革命传统。中国是以汉族为主体民族的多民族国家，通用汉语、汉字，汉族与少数民族统称为“中华民族”，又自称“炎黄子孙”、“龙的传人”。',
        246,
      ],
      [
        `话说天下大势，分久必合，合久必分。周末七国分争，并入于秦。及秦灭之后，楚、汉分争，又并入于汉。汉朝自高祖斩白蛇而起义，一统天下，后来光武中兴，传至献帝，遂分为三国。推其致乱之由，殆始于桓、灵二帝。桓帝禁锢善类，崇信宦官。及桓帝崩，灵帝即位，大将军窦武、太傅陈蕃共相辅佐。时有宦官曹节等弄权，窦武、陈蕃谋诛之，机事不密，反为所害，中涓自此愈横。`,
        374,
      ],
    ] as const

    const maxDiff = 0.15
    for (const [text, accurateVal] of tests) {
      const estimateVal = utils.estimateTokenCount(text)
      const diff = Math.abs(1 - estimateVal / accurateVal)
      if (diff > maxDiff) {
        throw new Error(
          `${text.slice(
            0,
            20
          )} has diff ${diff}, estimateVal ${estimateVal}, accurateVal ${accurateVal}`
        )
      }
    }
  })
})
