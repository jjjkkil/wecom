# OpenClaw 企业微信（WeCom）Channel 插件

<p align="center">
  <img src="https://img.shields.io/badge/Original%20Project-YanHaidao-orange?style=for-the-badge&logo=github" alt="Original Project" />
  <img src="https://img.shields.io/badge/License-ISC-blue?style=for-the-badge" alt="License" />
</p>

> [!WARNING]
> **原创声明**：本项目涉及的“多账号隔离与矩阵路由架构”、“Bot+Agent双模融合架构”、“长任务超时接力逻辑”及“全自动媒体流转接”等核心设计均为作者 **YanHaidao** 独立思考与实践的原创成果。
> 欢迎技术交流与合规引用，但**严禁任何不经授权的“功能像素级抄袭”或删除原作者署名的代码搬运行为**。

<p align="center">
  <strong>🚀 企业级多模式 AI 助手接入方案（统一运行时架构）</strong>
</p>

<p align="center">
  <strong>🚀 深度适配企业微信原生文档（WeCom Doc）：将对话沉淀为企业数字资产 [v2.3.14 重磅]</strong>
</p>

<p align="center">
  <a href="#sec-1">💡 核心价值</a> •
  <a href="#sec-2">📊 模式对比</a> •
  <a href="#sec-changelog">📋 最近更新</a> •
  <a href="#sec-3">一、快速开始</a> •
  <a href="#sec-4">二、配置说明</a> •
  <a href="#sec-5">三、企业微信接入</a> •
  <a href="#sec-6">四、高级功能</a> •
  <a href="#sec-7">五、详细行为说明</a> •
  <a href="#sec-9">六、社区与维护</a>
</p>

---

<a id="sec-1"></a>
## 💡 核心价值：为什么选择本插件？

### 🎉 重大特性一览
1. **防断连黑科技** (v2.3.11 升级)：针对 DeepSeek R1 等长时间 <think> 的推理模型，Bot WS 已升级为 **即时占位 + 持续保活 ACK** 机制。收到用户消息后立即展示 `streamPlaceholderContent`，并在首个真实回复块到来前持续保活，显著降低 WebSocket `invalid req_id` 与消息卡死现象。
2. **无需域名，极低门槛**：全面支持基于 WebSocket 的长连接（Bot WS）模式接入企业微信机器人，**彻底打通无公网 IP、无备案域名的内网服务器**与企微的实时对话桥梁！
3. **主动发消息，能力全覆盖**：基于 Agent 模式，全面支持**主动触达**，轻松实现早报定时任务、服务器异常报警、自动每日总结。
4. **向导自动路由自动适配** (v2.3.10 新增)：在终端执行 `openclaw channels add` 时，若是单企微账号接入，将**静默触发自动 Agent 路由绑定**，丝滑跳过全局冗杂的路由分配步骤。

### 🔧 全新统一运行时架构 (Unified Runtime)
插件现已采用全新解耦架构：
- **`Bot` / `Agent`** 是能力层 (Capability)。
- **`WS` / `Webhook` / `Callback` / `API`** 是传输层 (Transport)。
- 同一账号下，Bot 可以在长连接（WS）和主动回调（Webhook）之间通过 `primaryTransport` 自由无缝切换。
- HTTP Callback 路径一律由系统基于 `accountId` 全自动派生，告别繁乱的手工 URL 配置。

### 🎭 独创架构：Bot + Agent 双模融合 (Original Design by YanHaidao)

传统的企微插件通常只能在 "只能聊天的机器人 (Bot)" 和 "只能推送的自建应用 (Agent)" 之间二选一。
本插件采用 **双模并行架构**，同时压榨两种模式的极限能力：

*   **Bot 通道 (智能体)**：负责 **实时对话**。提供毫秒级流式响应（打字机效果），零延迟交互。
*   **Agent 通道 (自建应用)**：负责 **能力兜底**。当需要发送图片/文件、进行全员广播、或 Bot 对话超时（>6分钟）时，无缝切换到 Agent 通道接管。

### 🚀 企业级：多账号（Multi-account）矩阵隔离 (Original Design)

本插件支持 **无限扩展的账号矩阵**，这是本插件区别于普通插件的核心壁垒：

*   **千人千面 (Dynamic Agents)**：内置自动会话隔离机制，百人同时私聊或群聊自动分摊至专属独立助理，告别上下文串扰。
*   **账号级隔离 (Isolation)**：不同 `accountId` 之间的收发链路、运行时实例与动态 Agent 默认隔离；若多个账号共用同一个静态 Agent，建议额外配合 `session.dmScope = "per-account-channel-peer"`，避免私聊上下文共用。
*   **矩阵绑定 (Binding)**：支持一个 OpenClaw 实例同时挂载多个企业/多个应用，通过 `bindings` 灵活分发流量。
*   **智能路由 (Routing)**：基于入站 `accountId` 自动分拣回复路径，Bot 无法回复时仅回退到**同账号组内**的 Agent，实现闭环的高可用。

### 功能特性全景

#### 🗣 **沉浸式交互 (Immersive Interaction)**
*   **原生流式 (Stream)**：基于 HTTP 分块传输，拒绝 "转圈等待"，体验如 ChatGPT 网页版般丝滑。
*   **交互式卡片 (Card)**：支持 Button/Menu 交互回传，可构建审批、查询等复杂业务流 (Agent模式)。

#### 📎 **全模态支持 (Multi-Modal)**
*   **发什么都能看**：支持接收图片、文件 (PDF/Doc/Zip)、语音 (自动转文字)、视频。
*   **要什么都能给**：AI 生成的图表、代码文件、语音回复，均可自动上传并推送到企微。

#### 📝 **深度适配企业微信“协作文档” (WeCom Doc)**
> *基于“协作的本质是信息流动”第一性原理打造，打破只能聊天的开源怪圈，让 AI 真正握住公司级文档库大权。*
> *特别感谢 [@proyy](https://github.com/proyy) 提供的企业微信文档管理解决方案。*
*   **文档全生命周期**：支持从项目模板自动化创建全新文档、跨越部门重命名/克隆操作。
*   **表格数据精细手术**：告别全量粗暴覆写，支持基于 Range 选区的单元格级精准更新（如：对特定表格内的状态进行实时覆盖）。
*   **安全确权与跨界分析**：不仅能读取、分析现有庞大报表数据，更可用指令动态缩放协作成员的读写安全锁钥。

#### 📢 **企业级触达 (Enterprise Reach)**
*   **精准广播**：支持向 **部门 (Party)**、**标签 (Tag)** 或 **外部群** 批量推送消息。
*   **Cronjob 集成**：通过简单的 JSON 配置实现早报推送、日报提醒、服务器报警。

#### 🛡 **生产级稳定 (Production Ready)**
*   **容灾切换**：Bot 模式 6 分钟超时自动熔断，切换 Agent 私信送达，防止长任务回答丢失。
*   **Token 自动运维**：内置 AccessToken 守护进程，自动缓存、提前刷新、过期重试。

---


<a id="sec-2"></a>
## 📊 模式能力对比

| 能力维度 | 🤖 Bot 模式 | 🧩 Agent 模式 | ✨ **本插件 (双模)** |
|:---|:---|:---|:---|
| **部署网络要求** | ✅ **无需公网IP/域名 (WS)** | ❌ 必须公网IP/域名回调 | **✅ 全环境适用** |
| **接收消息 (单聊)** | ✅ 文本/图片/语音/文件 | ✅ 文本/图片/语音/视频/位置/链接 | **✅ 全能互补** (覆盖所有类型) |
| **接收消息 (群聊)** | ✅ 文本/引用 | ❌ 不支持 (群聊无回调) | **✅ 文本/引用** |
| **回复消息类型** | ❌ 仅文本/图片/Markdown | ✅ **全模态** (文本/图片/视频/文件等) | **✅ 智能路由** (自动判定切换) |
| **交互卡片 (A2UI)**| ❌ 不支持 | ✅ **支持** (Button/Select等) | **✅ 支持** |
| **AI 流式响应** | ✅ **支持** (丝滑打字机) | ❌ 不支持 (全部生成完一次发送) | **✅ 完美支持** |
| **主动触达 (Cron)**| ❌ 仅被动回复/有限推送 | ✅ **全量推送** (指定人/部门/标签) | **✅ 企业级触达** |
| **📝 文档/表格管理** | ❌ 不支持 | ⚠️ 需自行开发对接 | **✅ 原生深度适配** (建档/改数据/读表/权限) |

---

<a id="sec-changelog"></a>

## 📋 最近更新

> 项目保持高频迭代，核心改进一览：

#### v2.3.14（2026-03-14）

- 📝 **[重磅功能]** 深度适配企业微信原生「协作文档」，支持通过自然语言自动建文档/表格、单元格级精准修改、跨表数据分析与权限管控。Thanks [@proyy](https://github.com/proyy)。
- 🛑 **[核心修复]** 彻底修复并发场景下"正在思考..."无限刷屏死循环（`errcode=846608`），引入按会话追踪清理机制。
- 📡 **[合规修复]** `enter_chat` 等事件不再违规调用流式回复接口，终结 `invalid req_id (846605)` 报错。
- 🛡 WS 长连接增加 120 秒硬性超时熔断，防止极端情况下占位符永不停止。
- 🤫 Agent 模式 `enter_agent` / `subscribe` 不再触发大模型生成欢迎语，静默处理，零 Token 消耗。

**升级指引：**
```bash
openclaw plugins update wecom
```

#### v2.3.13（2026-03-13）

- 🛠 **[重要修复]** `Bot WS` 现在会把“引用 + 提问”中的引用内容一起带入 Agent 上下文，不再只保留用户当前这句提问。
- 🌊 **[重要修复]** `Bot WS` 流式回复改为按“累计全文刷新”发送，修复企业微信客户端里长回答断断续续、像被拆成多段的问题。
- 🧩 `Bot WS` 这次显式对齐企业微信 `stream.id` 的刷新语义：后续更新会覆盖为当前完整内容，而不是只发送最新增量片段。
- ✅ 新增 `bot-ws` 引用上下文与累计流式发送回归测试，避免后续重构回退。

#### v2.3.12（2026-03-12）

- 🛠 **[重要修复]** Bot WS 流式回复超 6 分钟后的 `846608 stream message update expired` 现在被识别为终态错误，不再导致进程退出。
- 🛠 **[重要修复]** SDK 5 秒回执超时 (`Reply ack timeout`) 也被识别为终态错误，超时后立即停止占位保活，不再产生 `unhandledRejection`。
- 🚀 Bot WS 模式下主动文本消息优先走 WS 长连接；Agent 仅兜底文件/媒体或未启用 WS 的场景。
- 🧯 `sdk-adapter` 为 WebSocket frame 异步处理补上显式兜底捕获，漏网异常记录为 runtime issue 而非崩溃。
- ⏱ 回复窗口过期时占位符保活立即停止。
- 🛠 **[重要修复]** Bot WS 模式下接收图片/文件现在使用消息体独立 `aeskey` 解密，修复之前保存密文导致 `Failed to optimize image` 的问题。
- 🛠 **[重要修复]** 解决 Agent 模式下纯数字 UserID 被误判为部门 ID 导致的 81013 错误。在 `wecom-agent:` 作用域下，纯数字目标现在优先解析为用户。

#### v2.3.11（2026-03-11）

- `Bot WS` 升级为即时占位 + 持续保活，降低长思考时的 `invalid req_id`。
- `streamPlaceholderContent` 统一作用于 `Bot WS` 与 `Bot Webhook`。
- onboarding 在空配置下也会提供 `default` 账号选项。

#### v2.3.10（2026-03-10）

- onboarding 默认收敛为 `Bot + WS + 开放私聊`。
- 修复 `Bot WS` 长文本双重回复问题。
- Agent 新配置统一使用 `agentSecret`。

<details>
<summary>更早版本</summary>

#### v2.3.9（2026-03-09）

- Bot 默认接入改为 `WebSocket`，无需域名更易上手。
- 完善中文 onboarding，减少重复提示。
- 恢复 `Bot WS` 流式输出能力。
- 增强 Agent 回调与发送日志，排障更直接。

</details>

详细版本记录见 `changelog/` 目录。

---

<a id="sec-3"></a>
## 一、🚀 快速开始

> 推荐统一使用**多账号矩阵模型**。 
> 即使只有一个账号，也建议写在 `channels.wecom.accounts.default` 节点下。

### 1.1 安装插件

```bash
openclaw plugins install @yanhaidao/wecom
openclaw plugins enable wecom
```

### 1.2 互动向导式配置 (推荐)

如果你不想手写 JSON 配置文件，可以通过互动式向导完成通道挂载：

1. 确保已通过 npm 安装该插件：`openclaw plugins install @yanhaidao/wecom`并且启用了 `openclaw plugins enable wecom`
2. 在终端中，输入以下命令，添加渠道：
```bash
openclaw channels add
```
3. 在「Select channel」步骤的下拉列表中，找到并选择：**企业微信 (WeCom)**
4. 按照屏幕终端提示，依次填入企业微信机器人 `Bot ID` 及 `Secret` 等必填项即可。

向导完成后，后台服务将自动装载你的配置并尝试建立长连接通信。

### 1.3 推荐配置结构（Bot + Agent 组合版）

这是生产环境最推荐的形态（进阶纯手工配置），兼顾了快速流式体验与 Agent 强大的兜底分发能力。如果您是给企业配置多名矩阵助理，或需要启动 Agent 兜底能力和定时推送能力，请进入 OpenClaw 的配置文件直接写入 JSON。以下是生产环境最推荐的综合形态：

```jsonc
{
  "channels": {
    "wecom": {
      "enabled": true,
      "defaultAccount": "default",
      "accounts": {
        "default": {
          "enabled": true,
          "name": "默认企微账号",
          "bot": {
            "primaryTransport": "ws",             // 指定 Bot 主通讯协议：ws 或 webhook
            "streamPlaceholderContent": "正在思考...",
            "welcomeText": "你好，我已接入 OpenClaw。",
            "dm": {
              "policy": "pairing",
              "allowFrom": []
            },
            "ws": {                               // Bot WS 配置
              "botId": "BOT_ID",
              "secret": "BOT_SECRET"
            },
            "webhook": {                          // Bot Webhook 配置 (按需)
              "token": "BOT_TOKEN",
              "encodingAESKey": "BOT_AES_KEY",
              "receiveId": "BOT_RECEIVE_ID"
            }
          },
          "agent": {
            "corpId": "CORP_ID",
            "agentSecret": "AGENT_SECRET",
            "agentId": 1000001,
            "token": "AGENT_TOKEN",
            "encodingAESKey": "AGENT_AES_KEY",
            "welcomeText": "你好，这里是 Agent 通道。",
            "dm": {
              "policy": "open",
              "allowFrom": []
            }
          }
        }
      },
      "media": {
        "tempDir": "/tmp/openclaw-wecom-media",
        "retentionHours": 24,
        "cleanupOnStart": true,
        "maxBytes": 26214400
      },
      "network": {
        "egressProxyUrl": "http://127.0.0.1:3128"
      },
      "routing": {
        "failClosedOnDefaultRoute": true
      },
      "dynamicAgents": {
        "enabled": true,
        "dmCreateAgent": true,
        "groupEnabled": true,
        "adminUsers": ["zhangsan"]
      }
    }
  }
}
```

说明：
- 新配置推荐使用 `agent.agentSecret`
- 历史配置里的 `agent.corpSecret` 仍兼容读取，但后续文档统一使用 `agentSecret`
- `bot.streamPlaceholderContent` 会同时作用于 `Bot WS` 与 `Bot Webhook`；在 `Bot WS` 下，收到用户消息后会立即显示该占位符，并在长思考期间持续保活。
- 如果你在一个 OpenClaw 实例里挂载多个 `accounts`，并让它们共同路由到同一个静态 Agent，建议在全局配置里加上 `session.dmScope = "per-account-channel-peer"`，让私聊 session key 显式带上 `accountId`。

### 1.3 高级网络配置（公网出口代理）
如果您的服务器使用 **动态 IP** (如家庭宽带、内网穿透) 或 **无公网 IP**，首先使用Bot模式的ws接入方式。

企业微信 API 会因 IP 变动报错 `60020 not allow to access from your ip`。
此时需配置一个**固定 IP 的正向代理** (如 Squid)，让插件通过该代理访问企微 API。

```bash
openclaw config set channels.wecom.network.egressProxyUrl "http://proxy.company.local:3128"
```

### 1.4 验证启动与观测

使用最新的自检命令以检查通道装载、端口绑定与运行情况：
```bash
openclaw channels status --deep
```

建议重点看这几个核心状态指标是否健康：
- `primaryTransport` / `transport` / `health`

---

<a id="sec-4"></a>

## 二、⚙️ 三模配置模式详解

新版已分离 `Transport` 传输层，以下是独立运转模式的基本构成（你可以随意组合它们入同一个 account）：

### 2.1 仅 Bot WS 模式
最简的流式交互版（无兜底分发功能）。
关键约束：`bot.primaryTransport = "ws"` 必须包含 `bot.ws` 参数。

行为说明：
- 收到用户消息后立即发送一次 `streamPlaceholderContent` 占位流。
- 若模型首个真实文本块尚未产出，系统会持续发送保活占位，避免长思考期间 `req_id` 失效。

```jsonc
{
  "accounts": {
    "default": {
      "bot": {
        "primaryTransport": "ws",
        "ws": { "botId": "BOT_ID", "secret": "BOT_SECRET" }
      }
    }
  }
}
```

### 2.2 仅 Bot Webhook 模式
针对某些无法建立高可靠 WS 网关的环境，退化使用 URL 回调。
关键约束：`bot.primaryTransport = "webhook"` 必须包含 `bot.webhook` 参数。

```jsonc
{
  "accounts": {
    "default": {
      "bot": {
        "primaryTransport": "webhook",
        "webhook": { "token": "BOT_TOKEN", "encodingAESKey": "BOT_AES_KEY" }
      }
    }
  }
}
```

### 2.3 自动分流与会话隔离 (dynamicAgents)

这属于插件的**全局网络与行为组**。

| 字段 | 类型 | 说明 |
|---|---|---|
| `enabled` | `boolean` | 是否启用动态 Agent |
| `dmCreateAgent` | `boolean` | 私聊是否自动建 Agent |
| `groupEnabled` | `boolean` | 群聊是否允许动态 Agent |
| `adminUsers` | `string[]` | 管理员白名单 |

#### 场景说明（解决真实企业痛点）
企业场景下，当多名同事或多个群组同时与系统交互时，系统默认只会连接同一个全局 AI Agent。这会导致**会话上下文串扰（张三发的问题，李四接着问，上下文混乱）**。

开启 `dynamicAgents` 后，可以解决此痛点，实现**“千人千面、万群万脑”**的并发隔离机制：
- **`enabled` (总开关)**：一旦打开，系统会自动为每个会话的来源进行分流，并动态生成专属的底层 Agent 实例（如 `wecom-default-dm-张三`），无需人工配置。
- **`dmCreateAgent` (私聊自动建号)**：实现员工私人助理模式。每个人私聊发消息，系统都会临时绑定独立记忆的专属助理，避免为全公司几百人挨个去后台扫码建号配置。
- **`groupEnabled` (群聊自动分群)**：实现各个群聊主题封闭。A 群的讨论话题绝不会串扰到 B 群。
- **`adminUsers` (管理员特权后门)**：填入管理员的微信 ID。遇到这几个人发消息时，系统**不会**去进动态 Agent 隔离区，而是直通后端的主控制台 Agent，以便执行全网管理指令。

> **🌟 多账号矩阵下的全局生效与物理隔离**
> `dynamicAgents` 属于通道级的全局开关，开启后会对配置的所有账号（`accounts`）生效。为了维持账号的绝对隔离，生成的隔离 Agent ID 内置了 Account 维度（例如：`wecom-ops-dm-张三` vs `wecom-sales-dm-张三`），保证跨企业应用依旧安全隔绝。
>
> 如果你没有开启 `dynamicAgents`，但多个 `accountId` 共享同一个静态 Agent，请在 OpenClaw 全局配置里显式设置 `session.dmScope = "per-account-channel-peer"`，确保不同账号的私聊上下文不会被收敛到同一个 session key。

---

<a id="sec-5"></a>

## 三、🏢 企业微信接入指南

新版系统已将 Callback 回调处理实现了**全自动的账号分流路径派生**，开发者不要在配置里手工定义 `ReceiveID` 的硬编码路由覆盖，请在企业微信管理后台直接指向对应路径。

### 3.1 明确各类模式的目标路径

| 类型 | 默认账号 | 非默认账号 (如 ops) |
|---|---|---|
| **Bot Webhook** | `/plugins/wecom/bot/default` | `/plugins/wecom/bot/ops` |
| **Agent Callback** | `/plugins/wecom/agent/default`| `/plugins/wecom/agent/ops` |

*(注：系统通过智能中间件，若只配了 default 且你访问 `/plugins/wecom/bot` 无后缀，也会尝试自动漂移至 default，但**极不建议**，必须写标准账号名后缀以规避未来扩展冲突。)*

### 3.2 下发路由至企业微信后台
1. 登录企业微信管理后台
2. 机器人填入回调 URL：`https://your-domain.com/plugins/wecom/bot/{accountId}`
3. 自建应用填入回调 URL：`https://your-domain.com/plugins/wecom/agent/{accountId}` (不要忘记加可信IP)。

<div align="center">
  <img src="https://cdn.jsdelivr.net/npm/@yanhaidao/wecom@latest/assets/03.bot.page.png" width="45%" alt="Bot Config" />
  <img src="https://cdn.jsdelivr.net/npm/@yanhaidao/wecom@latest/assets/03.agent.page.png" width="45%" alt="Agent Config" />
</div>

---

<a id="sec-6"></a>

## 四、✨ 高级功能

### 4.1 A2UI 交互卡片

Agent 输出 `{"template_card": ...}` 时自动渲染为交互卡片：

- ✅ 单聊场景：发送真实交互卡片
- ✅ 按钮点击：触发 `template_card_event` 回调
- ✅ 自动去重：基于 `msgid` 避免重复处理
- ⚠️ 群聊降级：自动转为文本描述

### 4.2 ⏰ Cronjob 企业级定时推送

本插件深度集成了 OpenClaw 的 Cronjob 调度能力，配合 Agent 强大的广播 API，轻松实现企业级通知服务。

> **核心场景**：早报推送、服务器报警、日报提醒、节日祝福。

#### 4.2.1 目标配置 (Target)
无需遍历用户列表，直接利用 Agent 强大的组织架构触达能力：

| 目标类型 | 格式示例 | 推送范围 | 典型场景 |
|:---|:---|:---|:---|
| **部门 (Party)** | `party:1` (或 `1`) | 📢 **全员广播** | 全员通知、技术部周报 |
| **标签 (Tag)** | `tag:Ops` | 🎯 **精准分组** | 运维报警、管理层汇报 |
| **外部群 (Group)** | `group:wr...` | 💬 **群聊推送** | 项目组群日报 (需由Agent建群) |
| **用户 (User)** | `user:zhangsan` | 👤 **即时私信** | 个人待办提醒 |

#### 4.2.2 配置示例 (`schedule.json`)

只需在工作区根目录创建 `schedule.json` 即可生效：

```json
{
  "tasks": [
    {
      "cron": "0 9 * * 1-5", // 每周一至周五 早上9:00
      "action": "reply.send",
      "params": {
        "channel": "wecom",
        "to": "party:1",      // 一键发送给根部门所有人！
        "text": "🌞 早安！请查收[今日行业简报](https://example.com/daily)。"
      }
    }
  ]
}
```

### 4.3 🤖 动态 Agent 扩容引擎
在《二、配置说明》中讲解的 `dynamicAgents`，除了在运行时把会话隔离，它还在内存里做了一套高吞吐状态写入：
系统会自动以异步、排队、防冲突的队列，将被激活的动态专用助理自动追加写入底层核心系统配置文件 `openclaw.json` (或相应 yaml) 的 `agents.list` 数组中，这就意味着：这套扩容体系是对上层管理员完全**透明且免运维**的，机器人活了，号也就落盘注册好了。

### 4.4 📝 Docs 极客级协作资产管控
从 v2.3.14 起，OpenClaw WeCom 插件已深度集成了企微原生协作文档的管理策略引擎。只需自然语言指令，即可唤醒这一能力：

**【典型赋能场景】**
1. **自动化建档**：对机器人说：“建一个名为『Q1需求追踪』的表格，并把群里的人都加上可写权限。”它将自动调用 `create_doc` 并生成带权限的企微链接。
2. **移动端碎片修改**：在地铁上吩咐：“把「第二周面试记录」里的 B2 到 B5 单元格全部更新为‘二面通过’。” AI 会精准直击数据块，不干扰他人协同（`spreadsheet.edit_data`）。
3. **跨表分析**：发给机器人一张总账表的企微链接：“分析这表里的营收列，告诉我哪个部门贡献最大？” AI 原生抓取数据解算输出。

> **⚠️ 权限解锁指引**：
> 要让 AI 解锁该能力，仅在配置文件填入 `agentSecret` 不够。企业微信已将文档在权限面上实施了“物理隔离”。请务必：
> 1. 进入 [企微管理后台 -> 协作 -> 文档 -> 可调用接口应用白名单](https://work.weixin.qq.com/wework_admin/frame#apps/qykit/proxy/wedoc)，勾选赋予你的 OpenClaw 自建应用“通行证”。
> 2. 在 OpenClaw UI 界面工具集（Tool）勾选所有前缀含有 `doc:` 或 `wecom` 下相关操作单元。

---

<a id="sec-7"></a>

## 五、📖 详细行为说明 & 运行约束

### 5.1 运行约束原则
- **协议单工限制**：同一账号下，Bot 只能选择一个主传输协议 `primaryTransport` (`ws` 或 `webhook`) 运作。
- **帧边界不可打破**：Bot WS 是基于官方微信内部通信协议的扩展，它必须携带并原路奉还对应的 `req_id`。插件会在长思考期间自动发送占位/保活帧来维持该回复窗口，但标准化事件不会替代原始数据帧，业务流始终可访问该原始微信底层框架。
- **媒体沙盒边界**：不论是 `Webhook`，还是 `WS`，涉及企微媒体加解密的处理绝不再跨界干预业务执行层。由内部服务自动在 Transport / Media Service 网关边界卸载 `aeskey` 解密并转换为统一 OpenClaw 媒体类抛出。

### 5.2 企业微信群聊交付规则

*   **默认 (Bot 回复)**：群聊里 @Bot，默认由 Bot 在群内直接回复（优先文本/图片/Markdown）。
*   **例外 (文件兜底)**：如果回复内容包含**非图片文件**（如 PDF/Word/表格/压缩包等），由于企微 Bot 接口不支持，插件会自动：
    1.  Bot 在群里提示："由于格式限制，文件将通过私信发送给您"。
    2.  无缝切换到 **自建应用 (Agent)** 通道，将文件私信发送给触发者。
*   **提示**：若未配置 Agent，Bot 会明确提示“需要管理员配置自建应用通道”。

### 5.3 长任务可靠性保障

*   **超时熔断**：企业微信限制 Bot 流式回复窗口约为 6 分钟。
*   **自动接力**：当对话时长接近此阈值时，Monitor 会自动截断 Bot 流，提示 "剩余内容将私信发送"，并立即启动 Agent 通道私信发送完整结果。

### 5.4 命令行排障抓包指南

利用自带命令直接追溯到新版本的微架构心跳：
```bash
openclaw channels status --deep
```

如果出故障，除了系统根日志外，新版强化了命名空间隔离的抓包日志锚点，你可以直接在日志中过滤检索：
- `[wecom-runtime]`：插件整体初始化装配线、出入站分检
- `[wecom-ws]`：专门看 Bot WS 链路是否频繁掉线被踢、握手授权是否有效。
- `[wecom-http]`：监控与企微云端所有 HTTP 通信（如 Token 刷新、向企微主动抛消息等网络损耗/限流情况）。
- `[wecom-agent-delivery]`：看自建应用的被动反向代投情况以及群发选型问题。

---

<a id="sec-8"></a>

## 六、🙋 社区问答 (FAQ)

针对社区反馈的高频问题，解答如下：

**Q1: 能不能同时配置 `bot.ws` 和 `bot.webhook`？**
> **A:** 完全可以，且强烈推荐一起预置填写。但真正被框架加载用于**接管实时会话流量**的，永远遵循 `bot.primaryTransport` 这个单选项切换开关。

**Q2: 为什么不要手写 callback path？**
> **A:** 因为由于重构后的引擎能承载大量的企业企微号同时并发挂载，所以必须抛弃写死的映射表。运行时已强制执行 `{accountId}` 前置命名空间策略路由分配。强行手写旧路由会被中间件劫并产生警告抛出。

**Q3: 为什么 `plugins list` 出现重复 `wecom` 报错？**
> **A:** 一定是因为你既使用了 `npm i @yanhaidao/wecom`，又尝试 clone 代码本地挂载了 `openclaw plugins install -l ./extensions/wecom` 产生了 npm/file 包竞态冲突导致。请进入配置目录显露出的隐藏子目录彻底清除只留其一即可。

**Q4: 使用内网穿透时，企业微信报错 60020 (IP 不白名单) 怎么办？**
> **A:** 请启用配置中的 `config.network.egressProxyUrl` 项。利用具有独立静态外网IP的二级跳板代理（比如 Squid），来穿透这层官方强制保护盾。

**Q5: 为什么发视频给 Bot 没反应？**
> **A:** 官方 Bot 接口**不支持接收视频**。如果您需要处理视频内容，必须配置 Agent 小微应用，由于 Agent 下行具备富媒体流承接功能，本插件会自动从底层拦截将其解码并传输给底层大模型看。

**Q6: 支持个人微信吗？**
> **A:** 支持企业微信场景下的“微信插件入口”（个人微信扫码进入企业应用对话），这不等同于“个人微信网页版协议”。您可以在个人微信中直接与企业号/应用对话，无需打开企业微信 App。

---

<a id="sec-9"></a>

## 七、📮 联系我 与 版本协议

### 最近更新

近期保持高频迭代，最近版本如下：

#### v2.3.12-zh（2026-03-13）by proyy

> 本版本 WeCom Doc 功能增强来自 [proyy/wecom](https://github.com/proyy/wecom)。

**WeCom Doc 功能模块详细核验报告：**

### 📊 功能实现状态总览

| 功能模块 | 状态 | 说明 |
| :--- | :--- | :--- |
| **管理文档** | ✅ 已实现 | 新建/删除/重命名/信息获取/分享均已就绪 |
| **管理文档内容** | ✅ 已实现 | 文档内容读写、表格行列操作均已支持 |
| **智能表格** | ✅ 已实现 | 子表/视图/字段/记录/编组的全生命周期管理 |
| **设置文档权限** | ✅ 已实现 | 成员权限、安全设置、查看规则均已覆盖 |
| **管理收集表** | ✅ 已实现 | 创建/编辑/统计/答案读取均已实现 |
| **高级账号管理** | ✅ 已实现 | 分配/取消/列表查询均已实现 |
| **素材管理** | ✅ 已实现 | 支持上传图片到文档专用素材库 |
| **回调通知** | ❌ **未实现** | **当前系统会丢弃文档相关回调事件** |
| **接收外部数据** | ✅ 已实现 | 已支持向智能表格添加/更新外部记录 |

### 📝 逐项详细确认

#### 1. 管理文档
*   **新建文档**: `createDoc` (支持文档、表格、智能表格)
*   **重命名文档**: `renameDoc`
*   **删除文档**: `deleteDoc`
*   **获取文档基础信息**: `getDocBaseInfo`
*   **分享文档**: `shareDoc`

#### 2. 管理文档内容
*   **编辑文档内容**: `updateDocContent`
*   **获取文档数据**: `getDocContent`
*   **管理表格内容**: `modifySheetProperties`
*   **编辑表格内容**: `editSheetData`
*   **获取表格行列信息**: `getSheetProperties`
*   **获取表格数据**: `getSheetData`

#### 3. 管理智能表格内容
*   **添加/删除/更新/查询子表**: `smartTableAddSheet`, `smartTableDeleteSheet` 等
*   **添加/删除/更新/查询视图**: `smartTableAddView`, `smartTableView` 等
*   **添加/删除/更新/查询字段**: `smartTableAddField`, `smartTableUpdateField` 等
*   **添加/删除/更新/查询记录**: `smartTableAddRecords`, `smartTableGetRecords` 等
*   **添加/删除/更新/获取编组**: 已通过 `smartTableUpdateGrouping` 等接口实现

#### 4. 设置文档权限
*   **获取文档权限信息**: `getDocAuth`
*   **修改文档查看规则**: `setDocJoinRule`
*   **修改文档通知范围及权限**: `modDocMemberNotifiedScope`, `setDocMemberAuth`
*   **修改文档安全设置**: `setDocSafetySetting`, `modDocSecuritySetting`
*   **管理智能表格内容权限**: 已包含在上述权限接口中 (支持对子表粒度控制)

#### 5. 管理收集表
*   **创建/编辑收集表**: `createCollect`, `modifyCollect`
*   **获取收集表信息**: `getFormInfo`
*   **收集表的统计信息查询**: `getFormStatistic`
*   **读取收集表答案**: `getFormAnswer`

#### 6. 回调通知 (⚠️ 缺失)
*   修改文档成员事件
*   删除文档事件
*   收集表完成事件
*   删除收集表事件
*   修改收集表设置事件
*   字段变更事件
*   记录变更事件

**原因诊断**: 在 `src/agent/handler.ts` 的 `shouldProcessAgentInboundMessage` 函数中，系统目前**显式过滤**了除 `subscribe`, `enter_agent`, `batch_job_result` 之外的所有事件。文档变更事件（如 `update_doc`, `doc_create` 等）会被视为 `unknown event` 而直接丢弃。

#### 7. 接收外部数据到智能表格
*   **概述/添加记录**: `smartTableAddExternalRecords`
*   **更新记录**: `smartTableUpdateExternalRecords`

#### 8. 高级功能账号管理 & 素材管理
*   **账号管理**: `assignDocAdvancedAccount`, `cancelDocAdvancedAccount`, `getDocAdvancedAccountList`
*   **上传文档图片**: `uploadDocImage`

#### v2.3.11-zh（2026-03-12）by proyy

- 全面增加企业微信 WeCom Doc 工具链：文档/表格/智能表格/收集表，以及全面的 CRUD 支持。
- 增加文档权限与协作者管理 API。
- 针对分享链接可用性诊断并修复底层返回带下划线 URL 被 markdown 行内截断导致打不开的问题。
- 针对长文本分段问题进行的 BUG 修复与升级。

#### v2.3.11（2026-03-11）

- `Bot WS` 升级为即时占位 + 持续保活，降低长思考时的 `invalid req_id`。
- `streamPlaceholderContent` 统一作用于 `Bot WS` 与 `Bot Webhook`。
- onboarding 在空配置下也会提供 `default` 账号选项。
- README 补充多账号共用静态 Agent 时的 session 隔离建议。

#### v2.3.10（2026-03-10）

- onboarding 默认收敛为 `Bot + WS + 开放私聊`。
- 修复 `Bot WS` 长文本双重回复问题。
- 修复首个自定义接入标识时报 `default not found`。
- Agent 新配置统一使用 `agentSecret`。

#### v2.3.9（2026-03-09）

- Bot 默认接入改为 `WebSocket`，无需域名更易上手。
- 完善中文 onboarding，减少重复提示。
- 恢复 `Bot WS` 流式输出能力。
- 增强 Agent 回调与发送日志，排障更直接。

详细版本记录见 `changelog/v2.3.11.md`、`changelog/v2.3.10.md` 与 `changelog/v2.3.9.md`。

微信交流群（扫码入群）：

![企业微信交流群](https://openclaw.cc/wechat-github.jpg)

维护者：YanHaidao（VX：YanHaidao）

本项目采用 **ISC License** 开源协议，并在此强调以下要求：
1. **保留署名**：在任何分发、修改或使用本项目时，**必须**完整保留本项目的版权声明。
2. **尊重原创**：本项目包含的“架构”“长对话超时接力”等均为作者 **YanHaidao** 核心成果，拒绝任何去署名的“纯搬运”剽窃。
