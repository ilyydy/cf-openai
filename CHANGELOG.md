# [0.2.0](https://github.com/ilyydy/cf-openai/compare/v0.1.0...v0.2.0) (2023-04-08)


### Features

* openAI API chat 额外的全局参数 OPEN_AI_API_CHAT_EXTRA_PARAMS ([b7d174f](https://github.com/ilyydy/cf-openai/commit/b7d174fdb4187218e96cbb263972241db5e4ff34))
* 增加命令 /feedback ([6549bbc](https://github.com/ilyydy/cf-openai/commit/6549bbc792cb87a113c01ffb6a44f8eba4b71666))
* 增加命令 /testAlarm ([8928d97](https://github.com/ilyydy/cf-openai/commit/8928d97d29469de98907fe0d868f485b65f15a18))



# [0.1.0](https://github.com/ilyydy/cf-openai/compare/v0.0.2...v0.1.0) (2023-04-04)


### Bug Fixes

* 查询用量的时间问题 ([1dd152f](https://github.com/ilyydy/cf-openai/commit/1dd152ff321dcc7a342dc6d488a1bc09259b3010))


### Features

* openai session key ([f63e408](https://github.com/ilyydy/cf-openai/commit/f63e4087023ca02e8c5969f5f013a961ed41a08d))
* userId mask 处理 ([79cc400](https://github.com/ilyydy/cf-openai/commit/79cc400307db8896d71cec3d6c7175e42cd0d756))
* 企业微信接入 ([0766a49](https://github.com/ilyydy/cf-openai/commit/0766a49cf92db54cb5c3c665578ee391859e6534))
* 利用微信重试3次每次5秒机制，增长程序处理时间，减少用户手动重试 ([d3ae8e5](https://github.com/ilyydy/cf-openai/commit/d3ae8e5dc86dd43ee546d6683c506cbad5dcd501))
* 增加两个快速重试命令 ([95780b4](https://github.com/ilyydy/cf-openai/commit/95780b4ffe10c0b4dfdf22ce8a3a946117d9bb02))
* 增加全局配置 ADMIN_AUTH_TOKEN 和命令 /adminAuth，方便设置不同平台的管理员 ([002195e](https://github.com/ilyydy/cf-openai/commit/002195ed8f58ac0b710af8a389325ce9c56793cc))
* 增加配置 OPEN_AI_API_KEY_OCCUPYING_DURATION，对 openai 的 key 进行限流 ([8ba6c6b](https://github.com/ilyydy/cf-openai/commit/8ba6c6bcf7ce4cc8af4f3c10a059d3700b5ebacc))
* 请求上下文增加 startTime ([9df8c22](https://github.com/ilyydy/cf-openai/commit/9df8c228d14951308e17008f9b3db305a6dc4b92))
* 迁移 [#12](https://github.com/ilyydy/cf-openai/issues/12)，增长提问/回答的保存时间配置化，默认 3 分钟 ([b767222](https://github.com/ilyydy/cf-openai/commit/b767222ac7d6e788abe266c48940b7c042cdda4c))



## [0.0.2](https://github.com/ilyydy/cf-openai/compare/v0.0.1...v0.0.2) (2023-03-29)


### Bug Fixes

* 微信aes加解密可能失败问题 ([0ffd9dd](https://github.com/ilyydy/cf-openai/commit/0ffd9ddb61bef16babb2b3a0879c3cb266bdeea8))



## 0.0.1 (2023-03-26)


### Bug Fixes

* admin 问题 ([f14a8e7](https://github.com/ilyydy/cf-openai/commit/f14a8e7e19cd24f08565410d999439a250beb752))
* 微信加密模式不可用，代码优化 ([8bf58b7](https://github.com/ilyydy/cf-openai/commit/8bf58b78642c9ee294af8b86dc234bdc56b53cea))
* 时间常量错误 ([e277df3](https://github.com/ilyydy/cf-openai/commit/e277df3eb12359ed4688043718f1a58e584edff3))
* 角色命令修复 ([c0c101c](https://github.com/ilyydy/cf-openai/commit/c0c101c6c14d814575c16990521d8332996b7676))
* 角色问题 ([b5d592a](https://github.com/ilyydy/cf-openai/commit/b5d592ac1735a127b66f8fd39f13f99f2f6f86b0))
* 调小 API KEY 缓存时间 ([f86e83b](https://github.com/ilyydy/cf-openai/commit/f86e83b8af28f7f4f1e2c10b1cbf47890497a866))


### Features

* 减少第三方依赖 ([6235857](https://github.com/ilyydy/cf-openai/commit/62358573b9705f4ca20518efdd2df668051547f6))



