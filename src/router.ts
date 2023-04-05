import { CONFIG, init } from './global'
import { handleRequest as openAiHandleRequest } from './controller/openai'
import { errorToString, logger, genReqId } from './utils'

import type { Env, MyRequest } from './types'

const MODULE = 'src/router.ts'

// /openai/${platform}/${id}
export const openAiPathReg = /^\/openai\/([^/]+)\/([^/]+)$/

export async function handleRequest(request: Request, env: Env, ctx: ExecutionContext, startTime: number) {
  init(env)
  logger.debug(`${MODULE} global config ${JSON.stringify(CONFIG)}`)

  const myRequest = await genMyRequest(request, env, ctx, startTime)
  const pathname = myRequest.urlObj.pathname

  if (pathname === '/') {
    return new Response(`${new Date().toISOString()} hello world`)
  }

  const regResult = openAiPathReg.exec(pathname)
  if (regResult) {
    const platform = regResult[1].trim()
    const id = regResult[2].trim()
    const { body, init } = await openAiHandleRequest(myRequest, platform, id)
    return new Response(body, init)
  }

  return new Response('NOTFOUND', { status: 404 })
}

async function genMyRequest(request: Request, env: Env, ctx: ExecutionContext, startTime: number) {
  const reqId = genReqId()

  const { url, method, headers } = request
  const myHeaders = Object.fromEntries(headers)
  const urlObj = new URL(request.url)

  const reqBodyInfo = await getReqBody(request)
  const { contentType, reqBody } = reqBodyInfo

  const { searchParams } = urlObj
  logger.debug(
    `${MODULE} ${startTime} ${method} ${url} headers ${JSON.stringify(myHeaders)} query ${JSON.stringify(
      Object.fromEntries(new Map(searchParams))
    )} contentType ${contentType} reqBody ${typeof reqBody === 'string' ? reqBody : JSON.stringify(reqBody)}`
  )

  const myRequest: MyRequest = {
    reqId,
    startTime,
    url,
    urlObj,
    method,
    headers: myHeaders,
    body: reqBody,
    ctx,
    env,
  }

  return myRequest
}

export async function getReqBody<T = Record<string, any>>(request: Request) {
  const contentType = request.headers.get('content-type') || ''
  if (contentType.includes('application/json')) {
    return {
      contentType: 'json',
      reqBody: JSON.stringify(await request.json()) as T,
    } as const
  }

  if (
    contentType.includes('application/text') ||
    contentType.includes('text/plain')
  ) {
    return { contentType: 'text', reqBody: await request.text() } as const
  }
  // if (contentType.includes('text/html')) {
  //   return { contentType: 'html', reqBody: await request.text() } as const
  // }
  if (contentType.includes('text/xml')) {
    return { contentType: 'xml', reqBody: await request.text() } as const
  }

  return { contentType: 'null', reqBody: null } as const
}
