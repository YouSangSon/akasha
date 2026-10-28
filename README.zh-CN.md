<div align="center">

# 🧠 Akasha

**为 AI 编程智能体提供持久记忆。**

跨会话保留决策、约束和摘要。<br/>
通过自托管存储、本地嵌入和 MCP 接入，融入你的编程工作流。

[![CI](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

[English](README.md) · [한국어](README.ko.md) · [日本語](README.ja.md) · **简体中文**

[概览](#overview) · [快速开始](#quick-start) · [功能](#features) · [记忆管理界面](#memory-ui) · [架构](#architecture) · [文档](#documentation)

</div>

---

<a id="overview"></a>
## 项目概览

Akasha 为 MCP 客户端提供一个共享空间，用于保存和检索需要长期保留的上下文。
Postgres 存储权威记录；Qdrant 或 pgvector 提供可重建的搜索索引。
默认的 `transformers` 提供方使用 ONNX 在本地生成文本嵌入，无需嵌入 API 密钥。
模型文件会在首次使用时下载；客户端订阅、可选的付费 API 和托管费用另计。

长文档按嵌入分词器的实际输入上限切分，计入特殊词元。
升级后运行 `reindex_memory`，即可从原始记录修复旧文本块。
重试与并发处理方式参见[索引恢复](docs/operations.md#ingest-sweeper)（英文）。

韩语、日语、中文及跨语言检索可参考
[实验性多语言配置](docs/configuration.md#multilingual-retrieval)（英文）。
小规模评测中的正确结果召回率有所提高，但相似的错误答案仍可能排在前面。

| 需求 | Akasha 提供的能力 |
|------|----------------------|
| 在新会话中继续工作 | 可搜索的决策和面向具体任务的上下文包 |
| 掌控已存储的记忆 | 自托管 Postgres、按组织隔离的读写和审计记录 |
| 修复搜索索引 | 从 Postgres 中的权威记录重建文本块和向量 |
| 减少运行的服务数量 | `VECTOR_BACKEND=pgvector` 将向量存储在 Postgres 中，替代 Qdrant |
| 查看智能体记住了什么 | 可查看、编辑、标记和归档记录的记忆管理界面 |

项目名称源自 *阿卡西记录（Akashic records）*：让智能体记下值得记住的内容。

[DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
等代码智能 MCP 服务器与 Akasha 相互补充。
它们为仓库中的符号、路由、调用图和 ADR 建立索引，用于回答代码结构问题；
Akasha 则存储智能体的持久记忆：决策、约束、摘要、按组织隔离的审计记录，
以及随工作跨会话、跨客户端延续的上下文包。

<a id="quick-start"></a>
## 快速开始

需要 Docker（用于 Postgres + Qdrant）和 Node.js ≥ 22。

```bash
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 1. 复制本地开发模板并检查其中的凭据。
#    仅在 EMBEDDING_PROVIDER=openai 时需要 OPENAI_API_KEY。
cp .env.example .env
${EDITOR:-nano} .env

# 2. 启动 Postgres + Qdrant，执行迁移并构建。
./install.sh

# 3. 将生成的配置添加到 MCP 客户端：
cat .akasha/mcp/claude-desktop.json
cat .akasha/mcp/codex.toml

# 可选：适用于支持会话钩子的宿主的生命周期辅助脚本：
.akasha/hooks/session-start.sh "continue implementation"
printf '%s\n' "Summary: durable outcome ..." | .akasha/hooks/session-end.sh
```

安装程序会准备数据库、构建产物和客户端配置片段，但不会启动 HTTP 服务器，也不会将 `.env` 导出到你接下来使用的终端环境中。
要使用 HTTP 示例和记忆管理界面，请在单独的终端中持续运行：

```bash
set -a
source .env
set +a
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB}}"
npm run start:server
```

配置详情见[客户端集成指南](docs/integrations.md)。
Compose 的默认凭据仅用于本地开发；在向其他机器开放服务之前，请先替换这些凭据。

<a id="features"></a>
## 功能

当前实现包含以下控制机制。部署是否就绪，仍取决于你的配置、备份和工作负载检查：

- **权威存储与派生索引。** Postgres 是事实来源；只要权威记录和文本块仍然完整，
  就可以重建向量索引。`reindex_memory` 按有界分页重新生成这些文本块的嵌入；它不是备份。
- **可恢复的数据摄入。** 写入操作在访问向量存储前，先记录预写意图。
  启用摄入清扫任务后，可重试因写入中断而挂起的工作（通过可见性超时认领任务，使用 `FOR UPDATE SKIP LOCKED`）。
- **写入时检测并拒绝敏感凭据。** 内容在落盘前就会接受扫描；提供方 API 密钥、PEM 块、
  bearer/JWT 令牌和包含凭据的数据库 URL 会被拒绝（`SecretDetectedError`），而不会被持久化。
- **支持预演的压缩整理。** 精确与语义去重、基于时间衰减的归档默认只生成预览
  （`dryRun: true`）；实际应用具有幂等性并受速率限制。归档记录可通过 `unarchive_memory` 恢复。
- **审计与速率限制。** 工具调用会尝试写入按组织隔离的审计记录；审计写入失败会记入日志。
  可配置的按令牌 HTTP 速率限制仅在当前进程内生效。
- **双 MCP 传输与 JSON HTTP。** MCP 客户端可使用 stdio，或通过 `POST /mcp` 使用
  Streamable HTTP；脚本和非 MCP 客户端仍可使用 `/v1/*` 下的 JSON HTTP。
- **记忆治理界面。** 运维人员可通过静态页面 `/admin/memory` 查看、编辑、标记和归档记录，
  所有数据调用仍经过需要身份验证的 `/v1/*` API。
- **生产环境健康探针。** `/healthz`（存活检查）和检查依赖状态的 `/readyz`（就绪检查）
  为 Kubernetes / 负载均衡器提供健康检查。
- **可替换的向量后端。** 默认使用 Qdrant，也可设置 `VECTOR_BACKEND=pgvector`，仅运行 Postgres。

<a id="memory-ui"></a>
## 记忆管理界面

启动 HTTP 服务器后，打开
[http://localhost:8787/admin/memory](http://localhost:8787/admin/memory)。
输入一个已配置的 bearer 令牌及其组织 ID，加载记录，然后查看、编辑、标记或归档记忆。
页面使用需要身份验证的 API，并会在归档前要求确认。
运维操作流程见[记忆治理](docs/operations.md)。

## 工具与 API

与编程智能体的对话会在会话结束时丢失上下文。
Akasha 让智能体保存值得记住的内容，并在下次工作时读取。
同一组 20 个服务工具通过 MCP stdio、`POST /mcp` 上的 MCP Streamable HTTP，
以及 `/v1/*` 下的 JSON-HTTP 提供。完整的请求/响应结构定义见
[docs/api-reference.md](docs/api-reference.md)。
HTTP 与 MCP 共享这些服务结构定义，因此两种传输方式的输入验证和载荷结构保持一致。
此外，当已连接的客户端声明支持相应能力时，MCP 还提供工作区根目录、用户信息征询
（elicitation）和采样（sampling）等客户端上下文辅助功能。

| 工具 | 用途 | HTTP 路由 |
|------|--------------|------------|
| `add_memory` | 保存决策、事实或摘要（写入时检测敏感凭据） | `POST /v1/memory` |
| `search_memory` | 结合向量与词法搜索，按作用域过滤检索结果 | `POST /v1/memory/search` |
| `build_context_pack` | 生成紧凑的上下文包，用于启动新会话 | `POST /v1/memory/context-pack` |
| `compact_memory` | 清理重复和衰减记录（实际应用或预演） | `POST /v1/memory/compact` |
| `reindex_memory` | 从 Postgres 中保留的文本块重建向量 | `POST /v1/memory/reindex` |
| `list_memory` | 按标签和归档状态筛选、查看权威记录 | `POST /v1/memory/list` |
| `inspect_memory_graph` | 查看已持久化的实体提及及关系 | `POST /v1/memory/graph` |
| `update_memory` | 编辑一条权威记录并刷新其向量状态 | `POST /v1/memory/update` |
| `delete_memory` | 对一条记录执行治理归档，并清理向量 | `POST /v1/memory/delete` |
| `tag_memory` | 替换一条记录的治理标签 | `POST /v1/memory/tag` |
| `unarchive_memory` | 恢复归档记录，用于取证恢复 | `POST /v1/memory/unarchive` |
| `list_audit_log` | 读取审计记录，用于合规检查和调试 | `POST /v1/audit/list` |
| `start_goal_run` | 启动持久目标，可选设定终止条件 | `POST /v1/goal-run/start` |
| `record_iteration` | 追加一次尝试及其结果，并可固定关联记忆 | `POST /v1/goal-run/iteration` |
| `get_goal_run` | 获取一次目标运行及按顺序排列的迭代记录 | `POST /v1/goal-run/get` |
| `list_goal_runs` | 按状态列出指定作用域内的目标运行 | `POST /v1/goal-run/list` |
| `complete_goal_run` | 将进行中的目标运行标记为完成，并附上解决说明 | `POST /v1/goal-run/complete` |
| `abandon_goal_run` | 将进行中的目标运行标记为放弃，并附上原因说明 | `POST /v1/goal-run/abandon` |
| `build_goal_context` | 根据运行历史和记忆构建围绕目标的续接上下文 | `POST /v1/goal-run/context` |
| `check_repeat_attempt` | 检测候选尝试是否重复了先前失败的迭代 | `POST /v1/goal-run/check-repeat` |

仅 MCP 提供的上下文工具：`list_workspace_roots` 读取客户端声明的根目录；
`add_memory_interactive` 使用 MCP elicitation 收集并存储经用户确认的记忆；
`classify_memory_candidate` 使用 MCP sampling 建议记忆类型和摘要。

支持多租户（每条记录带有 `organization_id`）、bearer 令牌身份验证、审计日志和速率限制。
既可作为单用户 MCP 服务器运行在笔记本上，也可作为多团队后端运行在你的基础设施中。
个人用户只需始终使用同一个组织标签，详见
[个人 / 单租户使用](docs/configuration.md#personal--single-tenant-use)。

## 操作示例

通过 HTTP API 保存一条决策、将其检索出来，再构建用于启动新会话的上下文包
（MCP 工具接受相同字段）。为便于说明，响应内容有所省略。

```bash
# 输入一个已配置的令牌，不包含可选的 :org 后缀。
read -r -s -p "API token: " TOKEN
printf '\n'
ORGANIZATION_ID=default   # 若令牌绑定了组织，请使用该组织

# 1. 保存记忆。
curl -sX POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","kind":"decision",
       "content":"Use idempotency keys on POST /charge to make retries safe."}'
# → {"success":true,"data":{"ok":true,"memoryId":"project:checkout:42",
#                           "summary":"Use idempotency keys on POST /charge…"}}

# 2. 进行语义搜索，无需匹配关键词。
curl -sX POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","query":"how do we avoid double-charging?"}'
# → {"success":true,"data":{"ok":true,"results":[
#      {"id":42,"memoryType":"decision",
#       "content":"Use idempotency keys on POST /charge…"}]}}

# 3. 构建上下文包，粘贴到新的智能体会话中。
curl -sX POST http://localhost:8787/v1/memory/context-pack \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","task":"add refund endpoint"}'
# → data.packMarkdown 可直接放入提示词。
```

上下文包的可选输入 `maxOutputBytes` 可限制整个结构化结果的 UTF-8 字节数。已选中的决策和约束会保留；预算不足时请求失败。适用范围及 CLI 用法见 [API 参考](docs/api-reference.md#build_context_pack--generate-a-session-priming-pack)。

<a id="architecture"></a>
## 架构

| 层 | 职责 |
|-------|----------------|
| MCP 服务器（`src/mcp/`） | 共享的 MCP 服务接口：工具描述、结构定义、注册表和处理器 |
| HTTP 服务器（`src/app/`） | 在 `/mcp` 提供 MCP Streamable HTTP，并在 `/v1/*` 下提供 JSON HTTP |
| 权威存储（`src/store/memory-repository.ts`） | Postgres — 记录、来源、摄入任务、实体图谱和审计 |
| 向量索引（`src/vector/`） | Qdrant（默认）或 pgvector — 分块嵌入与相似度搜索。设置 `VECTOR_BACKEND=pgvector` 可仅部署 Postgres。 |
| 压缩整理（`src/compact/`） | 去重（精确与语义）、衰减、归档、取消归档和清扫任务 |
| 嵌入（`src/embedding/`） | `transformers`（免费的本地 ONNX，默认）、`openai`（`text-embedding-3-small`）或 `local`（用于 CI 的确定性桩实现） |

数据流：调用方通过 `add_memory` 写入 → 将记录持久化到 Postgres、关联实体提及、
对内容分块并生成嵌入，再更新或插入到当前向量后端。
`search_memory` → 对查询生成嵌入 → 向量相似度搜索与 Postgres 全文搜索（FTS）/实体词法搜索
→ 补全记录数据 → 排序 → 返回。设计详情见
[docs/architecture.md](docs/architecture.md)。

## 配置

所有设置都通过环境变量配置。初次使用时，通常需要关注以下三个变量：

| 变量 | 默认值 | 用途 |
|-----|---------|---------|
| `MEMORY_API_TOKENS` | _（除非已配置 OAuth JWT 验证，否则必填）_ | HTTP API 使用的静态 bearer 令牌；`token:org` 将令牌绑定到组织 |
| `EMBEDDING_PROVIDER` | `transformers` | `transformers`（免费的本地 ONNX）、`openai` 或 `local`（CI 桩实现） |
| `VECTOR_BACKEND` | `qdrant` | `qdrant`，或使用 `pgvector` 仅部署 Postgres |

`OPENAI_API_KEY` 是可选项，仅在 `EMBEDDING_PROVIDER=openai` 时需要。
其余设置均有合理的默认值。完整列表见 [.env.example](.env.example)；
类型、默认值和示例见 [docs/configuration.md](docs/configuration.md)。

<a id="documentation"></a>
## 文档

本 README 提供英语、韩语、日语和简体中文版本，各版本的章节顺序、示例和能力范围相同。
完整的运维与贡献者详细文档仅以英语和韩语维护，位于 [`docs/`](docs/README.md)。
日语和中文 README 中的链接指向英文参考页面。

| 主题 | 内容 |
|-------|-------------|
| [架构](docs/architecture.md) | 组件图、数据流、嵌入提供方和迁移历史 |
| [配置](docs/configuration.md) | 所有环境变量的类型、默认值和示例 |
| [API 参考](docs/api-reference.md) | HTTP 端点与 MCP 工具结构定义 |
| [部署](docs/deployment.md) | Docker Compose 配置和生产环境检查清单 |
| [运维](docs/operations.md) | 日常任务：健康检查、压缩整理、记忆治理和审计日志 |
| [安全](docs/security.md) | 身份验证模型、敏感凭据检测、组织隔离和威胁模型 |
| [自托管运维](docs/self-hosted-operations.md) | 备份、恢复与冒烟测试操作手册 |
| [故障排查](docs/troubleshooting.md) | 常见故障模式与解决步骤 |

## 常用命令

```bash
npm run dev:server    # 以监听模式运行 HTTP API
npm run dev:worker    # 以监听模式运行后台清扫任务
npm run start:worker  # 从 dist/ 运行后台清扫任务
npm run dev:mcp       # 以监听模式运行 MCP stdio 服务器
npm run dev:cli       # 以监听模式运行 CLI
npm run lifecycle:init -- --project my-project --organization-id default
npm run typecheck     # tsc --noEmit
npm run build         # 清理 dist/ 并编译 TypeScript
npm run audit:dependencies
npm test              # vitest run
npm run db:migrate    # 应用待执行的迁移
npm run backup:create # 根据 VECTOR_BACKEND 选择备份方式
npm run backup:create:pgvector # 显式执行仅含 Postgres 的 pgvector 备份
```

当 `VECTOR_BACKEND=qdrant` 时，`backup:create` 会备份 Postgres 并创建 Qdrant 快照。
当 `VECTOR_BACKEND=pgvector` 时，逻辑向量数据存储在 Postgres 中，
因此 `backup:create` 会跳过 `scripts/snapshot-qdrant.sh`，且不需要 `QDRANT_URL`。
设置 `BACKUP_ENCRYPTION_KEY_FILE` 后，备份产物会在复制到主机外之前使用 AES-256-GCM 加密。

## 当前状态与限制

- 默认配置在本地运行；CI 徽章通过并不能证明已完成生产部署。
  当前验证情况和尚未完成的交付事项记录在 [GATES.md](https://github.com/YouSangSon/akasha/blob/main/GATES.md) 中。
- 令牌节省效果取决于客户端和工作流。受控的 MCP 与 CLI 评估分别给出了各自的结果；
  它们不能保证普遍节省令牌、降低延迟或降低成本。详见[评估证据](https://github.com/YouSangSon/akasha/blob/main/GATES.md)。
- 敏感凭据检测会拒绝已知模式，但无法识别所有可能的秘密信息。请勿将凭据写入记忆内容。
- 重建向量索引无法恢复已删除的权威数据。请使用经过验证的备份，并遵循
  [恢复操作手册](docs/self-hosted-operations.md)。

## 贡献与安全

- **贡献：** 请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 和[行为准则](CODE_OF_CONDUCT.md)。
- **安全：** 请按 [SECURITY.md](SECURITY.md) 中的说明报告漏洞，不要为此提交公开 issue。
- **变更：** [CHANGELOG](CHANGELOG.md) 记录了各版本的变更。

## 许可证

[MIT](LICENSE) — © 2026 YouSangSon.
