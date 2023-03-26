# cf-openai

[![LICENSE](https://img.shields.io/github/license/ilyydy/cf-openai)](https://github.com/ilyydy/cf-openai/blob/main/LICENSE)
[![ci test](https://github.com/ilyydy/cf-openai/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/ilyydy/cf-openai/actions/workflows/test.yml)
[![Commitizen friendly](https://img.shields.io/badge/commitizen-friendly-brightgreen.svg)](http://commitizen.github.io/cz-cli/)

基于 Cloudflare Worker 代理访问 OpenAI API 的服务，目前支持微信公众号(同时多个)接入

## 基本要求

- 注册 OpenAI 账号，创建复制 API key
- 注册 Cloudflare 账号
- 国内服务接入还需要一个国内直接能访问的域名

## Cloudflare Worker 部署

有三种方式

### Cloudflare 界面部署

1. Cloudflare Workers 界面创建新服务，都默认就行。进入新建的 Worker ，右上角 `快速编辑`，在 [本项目 release](https://github.com/ilyydy/cf-openai/releases) 下载打包好的 js 文件,复制内容到编辑器中，保存
2. Workers 子菜单 KV 创建一个新的命名空间，名字随便取。回到第一步的 Worker 中，点选页面中间一排选项的最后一个 `设置`，选左侧 `变量`，页面下拉至 `KV 命名空间绑定`，`编辑变量` 点击后的表单中添加绑定第二部创建的命名空间，左侧变量名称必须填 `KV`
3. 上拉至顶部的 `环境变量`，根据要接入的服务阅读后面章节在界面进行配置
4. 可选，国内服务接入需要。域名 DNS 解析必须在 Cloudflare，操作文档见 [Add site to Cloudflare](https://developers.cloudflare.com/fundamentals/get-started/setup/add-site/)。也可以直接在 Cloudflare 买域名，无需再自己操作 DNS 解析。然后在 Worker 页面中间一排选项的第二个 `触发器` 中添加自定义域，将域名添加到 Worker

### Github Action 部署

1. 按照文档 [创建 Cloudflare API token](<https://developers.cloudflare.com/workers/wrangler/ci-cd/#create-a-cloudflare-api-token>)
2. KV 创建同上，文件 `wrangler.toml` 中 `kv_namespaces` `id` 填入创建的命名空间的 id 进行绑定
3. Github 上 fork 本项目，在你自己的项目仓库中 `Settings`-`Secrets and variables`-`Actions` 添加以下 Secrets
   - CF_API_TOKEN: 填入第一步创建的 Cloudflare API token
   - WRANGLER_TOML: 根据要接入的服务阅读后面章节补充文件 `wrangler.toml` 中 `[vars]` 下的各项，整个文件内容填入
4. Github Actions 页面手动运行 `Deploy` 这个 Action 完成部署
5. 域名处理同上

### 本地命令行部署

需要了解 Git、Node.Js 基本使用

1. git clone 本项目，安装依赖。其中 `wranger` 是 Cloudflare 官方命令行客户端，`npx wrangler login` 登录后即可通过命令行进行 Worker 部署
2. 可通过 [命令行创建](https://developers.cloudflare.com/workers/wrangler/commands/#create-1) `KV`，然后文件 `wrangler.toml` 中 `kv_namespaces` `id` 填入创建的命名空间的 id 进行绑定
3. 根据要接入的服务阅读后面章节补充配置文件 `wrangler.toml` 中 `[vars]` 下的各项
4. 将 `wrangler.toml` 改名为 `wrangler.prod.toml`，可使用命令 `npm run deploy` 部署到 Worker
5. 域名处理同上

## 微信公众号接入配置

1. 注册微信公众号，一般是个人订阅号，资质验证门槛低
2. 公众号管理平台-设置与开发-基本配置页面确认自己的开发者 ID(AppID)，生成令牌(Token)、消息加解密密钥(EncodingAESKey)（若开启安全模式或兼容模式才需要），此时还不需要启用服务器配置
3. Worker 配置微信公众号需要的环境变量。可以通过界面操作配置，见上面的 [Cloudflare 界面部署](#cloudflare-界面部署) 第三步。可以通过配置文件配置，见 [Github Action 部署](#github-action-部署) 第三步和 [本地命令行部署](#本地命令行部署) 第三步

   | 变量名                    | 内容描述                                   | 备注                                               |
   | ------------------------- | ------------------------------------------ | -------------------------------------------------- |
   | WECHAT_ID_LIST            | 允许访问的公众号 ID 列表，多个则以英文逗号分隔 | ID 是你自定义的，建议由 10 位以内的数字字母组成    |
   | WECHAT_${ID}_APPID        | 公众号的开发者 ID(AppID)                   | 将 ${ID} 替换成你自定义的 ID                       |
   | WECHAT_${ID}_TOKEN        | 公众号的令牌(Token)                        | 将 ${ID} 替换成你自定义的 ID                       |
   | WECHAT_${ID}_AES_KEY      | 公众号的消息加解密密钥(EncodingAESKey)     | 将 ${ID} 替换成你自定义的 ID，开启安全模式或兼容模式时才需要 |
   | WECHAT_ADMIN_USER_ID_LIST | admin 用户名单，多个则以英文逗号分隔           | 可以暂时先不配，等后面知道自己的用户 ID 后再配置   |

4. 根据域名和自定义的 ID 得出第二步中服务器配置的服务器地址(URL)并进行配置，格式为 `https://${域名}/openai/wechat/${ID}`。如域名为 `xxx.com`，自定义的 ID 为 `id123`，则服务器地址(URL)为 `https://xxx.com/openai/wechat/id123`。
5. 消息加解密方式一般选明文，启用服务器配置，验证接入成功后即可使用

## 可用命令

输入使用时可忽略大小写

| 命令         | 可用角色    | 说明                                                                                                                    |
| ------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------- |
| /help        | 游客,用户   | 获取命令帮助信息                                                                                                        |
| /bindKey     | 游客,用户   | 绑定 OpenAI api key，格式如 /bindKey xxx。如已绑定 key，则会覆盖。绑定后先用 /testKey 命令测试是否正常可用              |
| /unbindKey   | 用户        | 解绑 OpenAI api key                                                                                                     |
| /testKey     | 用户        | 调用 OpenAI 列出模型接口，测试 api key 是否正常绑定可用，不消耗用量                                                     |
| /setChatType | 用户理员    | 切换对话模式，可选'单聊'和'串聊'，默认'单聊'。'单聊'只处理当前的输入，'串聊'会带上历史聊天记录请求 OpenAI，消耗更多用量 |
| /newChat     | 用户        | 清除之前的串聊历史记录，开始新的串聊                                                                                    |
| /retry       | 用户        | 根据 msgId 获取对于回答，回答只会保留 1 分钟                                                                            |
| /usage       | 用户        | 获取本月用量信息，可能有 5 分钟左右的延迟                                                                               |
| /freeUsage   | 用户        | 获取免费用量信息，可能有 5 分钟左右的延迟                                                                               |
| /system      | 用户,管理员 | 查看当前一些系统配置信息，如当前 OpenAI 模型，当前用户 ID 等                                                            |
| /faq         | 游客,用户   | 一些常见问题                                                                                                            |

## OpenAI 配置

| 配置名                      | 默认值                                                                                                                                    | 说明                                             |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| CHAT_MODEL                  | gpt-3.5-turbo                                                                                                                             | OpenAI 的模型名称                                |
| OPEN_AI_API_PREFIX          | <https://api.openai.com/v1>                                                                                                               | OpenAI 的通用 API 前缀                           |
| OPEN_AI_USAGE               | <https://api.openai.com/dashboard/billing/usage>                                                                                          | OpenAI 的用量地址                                |
| OPEN_AI_FREE_USAGE          | <https://api.openai.com/dashboard/billing/credit_grants>                                                                                  | OpenAI 的免费用量地址                            |
| OPEN_AI_API_TIMEOUT_MS      | 30000                                                                                                                                     | OpenAI API 请求超时，毫秒                        |
| MAX_CHAT_TOKEN_NUM          | 4000                                                                                                                                      | 单次请求 OpenAI 最大 token 数                    |
| MIN_CHAT_RESPONSE_TOKEN_NUM | 500                                                                                                                                       | OpenAI 回复的最小 token 数                       |
| MAX_HISTORY_LENGTH          | 20                                                                                                                                        | 串聊最大历史记录长度                             |
| SYSTEM_INIT_MESSAGE         | You are ChatGPT, a large language model trained by OpenAI. Answer as concisely as possible. Knowledge cutoff: 2021-09-01. Current is 2023 | 发给 OpenAI 的默认第一条系统消息，可用于调整模型 |

## 已知问题

1. 微信公众号的消息加解密方式选择安全模式或兼容模式时，按照官方文档应返回加密格式的消息，但实测发现只能返回明文格式的消息，未确认是个别账号问题，还是普遍问题。[代码都用明文格式返回](https://github.com/ilyydy/cf-openai/blob/v0.0.1/src/platform/wechat.ts#L144)
