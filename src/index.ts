/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `wrangler dev src/index.ts` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `wrangler publish src/index.ts --name my-worker` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const startTime = Date.now()

import { handleRequest } from './router'
import { errorToString, logger } from './utils'

import type { Env } from './types'

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      const resp = await handleRequest(request, env, ctx, startTime)
      return resp
    } catch (error) {
      logger.error(`服务异常 ${errorToString(error as Error)}`)
      return new Response('服务异常', { status: 500 })
    }
  },
}
