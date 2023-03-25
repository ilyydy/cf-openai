import { describe, expect, it, beforeAll, afterAll } from 'vitest'

import * as utils from './utils'
import { CONST } from './global'

describe('src/utils', () => {
  beforeAll(async () => {})

  afterAll(async () => {})

  it('sha1 should ok', async () => {
    const text = 'hello123'
    const digest = '4233137d1c510f2e55ba5cb220b864b11033f156'

    const result = await utils.shaDigest(CONST.SHA.SHA1, text)
    expect(result).toBe(digest)
  })

  it('mergeFromEnv should ok', async () => {
    const env = {
      a: 'aa',
      b: '2',
      c: '3,4',
      d: 'true',
      e: JSON.stringify({ e: 'ok' }),
    } as any
    const obj = {
      a: 'a',
      b: 1,
      c: [1, 2],
      d: false,
      e: {},
      f: 1,
    }
    const expectOjb = {
      a: 'aa',
      b: 2,
      c: ['3', '4'],
      d: true,
      e: { e: 'ok' },
      f: 1,
    }

    utils.mergeFromEnv(env, obj)
    expect(obj).toStrictEqual(expectOjb)
  })
})
