<div align="center">

# 🧠 Akasha

**AIコーディングエージェントのための永続メモリ。**

判断、制約、要約をセッションをまたいで保持します。<br/>
セルフホストのストレージ、ローカル埋め込み、MCPアクセスでコーディング作業を支えます。

[![CI](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml/badge.svg)](https://github.com/YouSangSon/akasha/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![MCP](https://img.shields.io/badge/MCP-compatible-blue.svg)](https://modelcontextprotocol.io/)
[![Node](https://img.shields.io/badge/node-%3E%3D22-brightgreen.svg)](https://nodejs.org/)

[English](README.md) · [한국어](README.ko.md) · **日本語** · [简体中文](README.zh-CN.md)

[概要](#overview) · [クイックスタート](#quick-start) · [機能](#features) · [メモリUI](#memory-ui) · [アーキテクチャ](#architecture) · [ドキュメント](#documentation)

</div>

---

<a id="overview"></a>
## 概要

Akashaは、MCPクライアントが長期的に必要なコンテキストを保存・取得できる共通の場所を提供します。
Postgresが正本レコードを保存し、Qdrantまたはpgvectorが再構築可能な検索インデックスを提供します。
既定の`transformers`プロバイダーは、埋め込みAPIキーを使わず、ONNXでテキストの埋め込みをローカル生成します。
モデルファイルは初回利用時にダウンロードされます。クライアントのサブスクリプション、任意の有料API、
ホスティングの費用は別途必要です。

| 必要なこと | Akashaが提供するもの |
|------|----------------------|
| 新しいセッションで作業を再開する | 検索可能な判断記録とタスク別のコンテキストパック |
| 保存したメモリを自分で管理する | セルフホストのPostgres、組織単位の読み書き、監査証跡 |
| 検索インデックスを修復する | Postgresの正本チャンクからベクトルを再構築 |
| 実行するサービスを減らす | `VECTOR_BACKEND=pgvector`でQdrantの代わりにPostgresへベクトルを保存 |
| エージェントの記憶内容を確認する | レコードの確認、編集、タグ付け、アーカイブができるメモリUI |

名前の由来は*アカシックレコード*です。エージェントが覚えておく価値のあることを書き留める場所を表します。

[DeusData/codebase-memory-mcp](https://github.com/DeusData/codebase-memory-mcp)
のようなコードインテリジェンスMCPサーバーとは、置き換えではなく相互補完の関係にあります。
それらはリポジトリのシンボル、ルート、コールグラフ、ADRをインデックス化し、コード構造に関する質問に答えます。
Akashaが保存するのは、判断、制約、要約、組織単位の監査証跡、そしてセッションやクライアントをまたいで
作業を引き継ぐコンテキストパックなど、エージェントの永続メモリです。

<a id="quick-start"></a>
## クイックスタート

Docker（Postgres + Qdrant用）とNode.js ≥ 22が必要です。

```bash
git clone https://github.com/YouSangSon/akasha.git
cd akasha

# 1. ローカル開発用テンプレートをコピーし、認証情報を確認します。
#    OPENAI_API_KEYが必要なのはEMBEDDING_PROVIDER=openaiの場合だけです。
cp .env.example .env
${EDITOR:-nano} .env

# 2. Postgres + Qdrantを起動し、マイグレーションとビルドを実行します。
./install.sh

# 3. 生成された設定をMCPクライアントに追加します。
cat .akasha/mcp/claude-desktop.json
cat .akasha/mcp/codex.toml

# セッションフックに対応したホスト向けの任意のライフサイクルヘルパー:
.akasha/hooks/session-start.sh "continue implementation"
printf '%s\n' "Summary: durable outcome ..." | .akasha/hooks/session-end.sh
```

インストーラーはデータベース、ビルド、クライアント用の設定例を準備します。
HTTPサーバーの起動や、次に開くターミナルへの`.env`のエクスポートは行いません。
HTTPの例とメモリUIを使う場合は、別のターミナルで次を実行し続けてください。

```bash
set -a
source .env
set +a
export DATABASE_URL="${DATABASE_URL:-postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT:-5432}/${POSTGRES_DB}}"
npm run start:server
```

設定の詳細は[クライアント連携のレシピ](docs/integrations.md)を参照してください。
Composeの既定の認証情報はローカル開発用です。他のマシンにサービスを公開する前に変更してください。

<a id="features"></a>
## 機能

実装には以下の仕組みが含まれます。本番運用の準備が整っているかどうかは、
設定、バックアップ、ワークロードの検証にも依存します。

- **正本ストアと派生インデックス。** Postgresを信頼できる情報源とし、正本レコードとチャンクが
  残っていればベクトルインデックスを再構築できます。
  `reindex_memory`は件数を制限したページ単位でチャンクの埋め込みを再生成します。バックアップではありません。
- **取り込み処理の復旧。** ベクトルストアに触れる前に、書き込みの意図を先行記録します。
  取り込みスイーパーを有効にすると、中断した書き込みの未完了処理を再試行できます
  （可視性タイムアウト付きの処理権取得、`FOR UPDATE SKIP LOCKED`）。
- **書き込み時の秘密情報検出。** 保存先に到達する前に内容を検査します。
  プロバイダーのAPIキー、PEMブロック、bearer/JWTトークン、認証情報を含むデータベースURLは、
  保存せずに拒否します（`SecretDetectedError`）。
- **ドライラン付きのコンパクション。** 完全一致・意味的一致による重複排除と、時間経過に伴うアーカイブを
  既定でプレビューします（`dryRun: true`）。適用処理は冪等で、レート制限があります。
  アーカイブ済みレコードは`unarchive_memory`で復元できます。
- **監査とレート制限。** ツール呼び出しでは組織単位の監査記録の書き込みを試み、失敗はログに記録します。
  設定可能なトークンごとのHTTP制限は、各プロセス内で適用されます。
- **2種類のMCPトランスポートとJSON HTTP。** MCPクライアントはstdio、または`POST /mcp`の
  Streamable HTTPを利用できます。スクリプトやMCP以外のクライアントは、引き続き`/v1/*`の
  JSON HTTPを利用できます。
- **メモリ管理UI。** 運用担当者は静的な`/admin/memory`画面からレコードを確認、編集、タグ付け、
  アーカイブできます。データに関する呼び出しはすべて、認証された`/v1/*` APIを経由します。
- **本番向けヘルスプローブ。** `/healthz`（liveness）と依存先の状態を考慮する`/readyz`（readiness）を、
  Kubernetesやロードバランサーのヘルスチェックに利用できます。
- **切り替え可能なベクトルバックエンド。** 既定はQdrantです。`VECTOR_BACKEND=pgvector`にすると、
  Postgresだけで実行できます。

<a id="memory-ui"></a>
## メモリUI

HTTPサーバーの起動後、[http://localhost:8787/admin/memory](http://localhost:8787/admin/memory)を開きます。
設定済みのbearerトークン1つとその組織IDを入力し、レコードを読み込むと、メモリの確認、編集、タグ付け、
アーカイブができます。画面は認証付きAPIを利用し、アーカイブ前に確認を求めます。
運用手順は[メモリ管理](docs/operations.md)を参照してください。

## ツールとAPI

コーディングエージェントとの会話は、セッションが終わるとコンテキストを失います。
Akashaは、エージェントが覚えておく価値のあることを保存し、次回読み返すための場所です。
同じ20個のサービスツールを、MCP stdio、`POST /mcp`のMCP Streamable HTTP、
`/v1/*`のJSON-HTTPで公開しています。完全なリクエスト・レスポンススキーマは
[docs/api-reference.md](docs/api-reference.md)を参照してください。
HTTPとMCPはサービスのスキーマを共有しているため、両トランスポートで検証とペイロードの構造が一致します。
さらにMCPでは、接続したクライアントが対応機能を通知している場合、ワークスペースルート、
ユーザーへの情報入力要求（elicitation）、サンプリングに関するクライアントコンテキスト用ヘルパーを公開します。

| ツール | 動作 | HTTPルート |
|------|--------------|------------|
| `add_memory` | 判断、事実、要約を保存（書き込み時に秘密情報を検査） | `POST /v1/memory` |
| `search_memory` | スコープで絞り込むベクトル検索と字句検索のハイブリッド検索 | `POST /v1/memory/search` |
| `build_context_pack` | 新しいセッションの初期情報となる簡潔なパックを生成 | `POST /v1/memory/context-pack` |
| `compact_memory` | 重複や重要度が減衰したレコードを整理（適用またはドライラン） | `POST /v1/memory/compact` |
| `reindex_memory` | Postgresに残っているチャンクからベクトルを再構築 | `POST /v1/memory/reindex` |
| `list_memory` | タグ・アーカイブ状態で絞り込んで正本レコードを確認 | `POST /v1/memory/list` |
| `inspect_memory_graph` | 保存済みのエンティティへの言及と関係を確認 | `POST /v1/memory/graph` |
| `update_memory` | 正本レコード1件を編集し、そのベクトル状態を更新 | `POST /v1/memory/update` |
| `delete_memory` | 管理操作としてレコード1件をアーカイブし、ベクトルを削除 | `POST /v1/memory/delete` |
| `tag_memory` | レコード1件の管理用タグを置き換え | `POST /v1/memory/tag` |
| `unarchive_memory` | 調査・復旧のためにアーカイブ済みレコードを復元 | `POST /v1/memory/unarchive` |
| `list_audit_log` | コンプライアンス対応やデバッグのために監査証跡を参照 | `POST /v1/audit/list` |
| `start_goal_run` | 任意の終了条件を指定して永続的な目標の実行を開始 | `POST /v1/goal-run/start` |
| `record_iteration` | 試行と結果を追記し、必要に応じて関連メモリを固定 | `POST /v1/goal-run/iteration` |
| `get_goal_run` | 目標の実行1件と、順序付きの試行履歴を取得 | `POST /v1/goal-run/get` |
| `list_goal_runs` | スコープ内の目標の実行を状態別に一覧表示 | `POST /v1/goal-run/list` |
| `complete_goal_run` | 解決内容のメモを付け、実行中の目標を完了として終了 | `POST /v1/goal-run/complete` |
| `abandon_goal_run` | 理由のメモを付け、実行中の目標を中止として終了 | `POST /v1/goal-run/abandon` |
| `build_goal_context` | 実行履歴とメモリから、目標に沿った継続用コンテキストを構築 | `POST /v1/goal-run/context` |
| `check_repeat_attempt` | 過去の失敗した試行を繰り返す試行候補を検出 | `POST /v1/goal-run/check-repeat` |

MCP専用のコンテキストツールもあります。`list_workspace_roots`はクライアントが通知したルートを読み取り、
`add_memory_interactive`はMCP elicitationを使ってユーザーが確認したメモリを収集・保存し、
`classify_memory_candidate`はMCP samplingを使ってメモリの種類と要約を提案します。

マルチテナント（各レコードに`organization_id`）、bearerトークン認証、監査ログ、レート制限に対応しています。
ノートPC上の個人用MCPサーバーとしても、自社インフラ上の複数チーム向けバックエンドとしても動作する設計です。
個人利用では、1つの組織ラベルを一貫して使えます。
[個人・シングルテナントでの利用](docs/configuration.md#personal--single-tenant-use)を参照してください。

## 実行例

HTTP APIで判断を保存し、検索して取り出し、新しいセッションの初期情報となるパックを構築します
（MCPツールも同じフィールドを受け取ります）。レスポンスは説明のために省略しています。

```bash
# 設定済みのトークンを1つ入力します。任意の:orgサフィックスは付けません。
read -r -s -p "API token: " TOKEN
printf '\n'
ORGANIZATION_ID=default   # トークンに組織が紐付いている場合は、その組織を使います

# 1. メモリを保存します。
curl -sX POST http://localhost:8787/v1/memory \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","kind":"decision",
       "content":"Use idempotency keys on POST /charge to make retries safe."}'
# → {"success":true,"data":{"ok":true,"memoryId":"project:checkout:42",
#                           "summary":"Use idempotency keys on POST /charge…"}}

# 2. 意味に基づいて検索します。キーワードの一致は不要です。
curl -sX POST http://localhost:8787/v1/memory/search \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","query":"how do we avoid double-charging?"}'
# → {"success":true,"data":{"ok":true,"results":[
#      {"id":42,"memoryType":"decision",
#       "content":"Use idempotency keys on POST /charge…"}]}}

# 3. 新しいエージェントセッションに貼り付けるコンテキストパックを構築します。
curl -sX POST http://localhost:8787/v1/memory/context-pack \
  -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -H "x-organization-id: $ORGANIZATION_ID" \
  -d '{"projectKey":"checkout","task":"add refund endpoint"}'
# → data.packMarkdownをそのままプロンプトに挿入できます。
```

コンテキストパックの任意入力 `maxOutputBytes` で、構造化結果全体の UTF-8 バイト数を制限できます。選択済みの決定と制約を保持し、予算が足りない場合は失敗します。適用範囲と CLI の使用方法は [API リファレンス](docs/api-reference.md#build_context_pack--generate-a-session-priming-pack)を参照してください。

<a id="architecture"></a>
## アーキテクチャ

| レイヤー | 役割 |
|-------|----------------|
| MCPサーバー（`src/mcp/`） | 共通のMCPサーバー機能: ツール記述、スキーマ、レジストリ、ハンドラー |
| HTTPサーバー（`src/app/`） | `/mcp`でMCP Streamable HTTPを、`/v1/*`でJSON HTTPを提供 |
| 正本ストア（`src/store/memory-repository.ts`） | Postgres — レコード、ソース、取り込みジョブ、エンティティグラフ、監査 |
| ベクトルインデックス（`src/vector/`） | Qdrant（既定）またはpgvector — チャンク化した埋め込みと類似検索。Postgresのみでデプロイするには`VECTOR_BACKEND=pgvector`を設定。 |
| コンパクション（`src/compact/`） | 重複排除（完全一致・意味的一致）、減衰、アーカイブ、アーカイブ解除、スイーパー |
| 埋め込み（`src/embedding/`） | `transformers`（無料のローカルONNX、既定）、`openai`（`text-embedding-3-small`）、または`local`（CI用の決定論的スタブ） |

データフロー: 呼び出し元が`add_memory`で書き込み → レコードをPostgresに保存し、エンティティへの言及を
関連付け、内容をチャンク化・埋め込み生成して、使用中のベクトルバックエンドにupsertします。
`search_memory` → クエリの埋め込み生成 → ベクトル類似検索 + PostgresのFTS・エンティティ字句検索 →
レコード本体の取得 → ランキング → 返却。設計の詳細は
[docs/architecture.md](docs/architecture.md)を参照してください。

## 設定

すべての設定は環境変数で指定します。初めて使うときに主に設定するのは次の3つです。

| 変数 | 既定値 | 用途 |
|-----|---------|---------|
| `MEMORY_API_TOKENS` | _（OAuth JWT検証を設定しない場合は必須）_ | HTTP API用の静的bearerトークン。`token:org`でトークンを組織に紐付け |
| `EMBEDDING_PROVIDER` | `transformers` | `transformers`（無料のローカルONNX）、`openai`、または`local`（CI用スタブ） |
| `VECTOR_BACKEND` | `qdrant` | `qdrant`、またはPostgresのみでデプロイするための`pgvector` |

`OPENAI_API_KEY`は任意で、`EMBEDDING_PROVIDER=openai`の場合だけ必要です。
その他には適切な既定値があります。完全な一覧は[.env.example](.env.example)、型、既定値、設定例は
[docs/configuration.md](docs/configuration.md)を参照してください。

<a id="documentation"></a>
## ドキュメント

このREADMEは英語、韓国語、日本語、簡体字中国語で提供し、セクションの順序、例、扱う機能の範囲を揃えています。
運用担当者・コントリビューター向けの詳細ドキュメント一式は、英語と韓国語のみで
[`docs/`](docs/README.md)に整備しています。日本語版・中国語版READMEのリンク先は英語のリファレンスです。

| トピック | 内容 |
|-------|-------------|
| [アーキテクチャ](docs/architecture.md) | コンポーネント図、データフロー、埋め込みプロバイダー、マイグレーション履歴 |
| [設定](docs/configuration.md) | 全環境変数の型、既定値、設定例 |
| [APIリファレンス](docs/api-reference.md) | HTTPエンドポイントとMCPツールのスキーマ |
| [デプロイ](docs/deployment.md) | Docker Composeのセットアップ、本番環境用チェックリスト |
| [運用](docs/operations.md) | 日常の作業: ヘルスチェック、コンパクション、メモリ管理、監査ログ |
| [セキュリティ](docs/security.md) | 認証モデル、秘密情報検出、組織の分離、脅威モデル |
| [セルフホスト運用](docs/self-hosted-operations.md) | バックアップ、復元、スモークテストのランブック |
| [トラブルシューティング](docs/troubleshooting.md) | よくある障害と解決手順 |

## よく使うコマンド

```bash
npm run dev:server    # HTTP APIを監視モードで実行
npm run dev:worker    # バックグラウンドスイーパーを監視モードで実行
npm run start:worker  # dist/からバックグラウンドスイーパーを実行
npm run dev:mcp       # MCP stdioサーバーを監視モードで実行
npm run dev:cli       # CLIを監視モードで実行
npm run lifecycle:init -- --project my-project --organization-id default
npm run typecheck     # tsc --noEmit
npm run build         # dist/を削除してTypeScriptをコンパイル
npm run audit:dependencies
npm test              # vitest run
npm run db:migrate    # 未適用のマイグレーションを適用
npm run backup:create # VECTOR_BACKENDに応じたバックアップ
npm run backup:create:pgvector # Postgresのみのpgvectorバックアップを明示的に実行
```

`VECTOR_BACKEND=qdrant`では、`backup:create`がPostgresとQdrantスナップショットを取得します。
`VECTOR_BACKEND=pgvector`では論理的なベクトルデータがPostgresにあるため、`backup:create`は
`scripts/snapshot-qdrant.sh`をスキップし、`QDRANT_URL`も不要です。
`BACKUP_ENCRYPTION_KEY_FILE`を設定すると、ホスト外へコピーする前にバックアップ成果物を
AES-256-GCMで暗号化できます。

## 状況と制限

- 既定の構成はローカルで実行します。CIバッジの成功は、本番環境へのデプロイの証拠ではありません。
  現在の検証結果と、提供に向けて未解決の項目は[GATES.md](https://github.com/YouSangSon/akasha/blob/main/GATES.md)に記録しています。
- トークン削減効果はクライアントとワークフローに依存します。条件を管理したMCP評価とCLI評価には
  それぞれ別の結果があり、一般的なトークン削減、低遅延、費用削減を保証するものではありません。
  [評価の根拠](https://github.com/YouSangSon/akasha/blob/main/GATES.md)を参照してください。
- 秘密情報検出は既知のパターンを拒否しますが、あらゆる秘密情報を識別できるわけではありません。
  メモリの内容に認証情報を含めないでください。
- ベクトルインデックスを再構築しても、削除済みの正本データは復元できません。
  検証済みのバックアップと[復元ランブック](docs/self-hosted-operations.md)を利用してください。

## コントリビューションとセキュリティ

- **コントリビューション:** [CONTRIBUTING.md](CONTRIBUTING.md)と
  [行動規範](CODE_OF_CONDUCT.md)を参照してください。
- **セキュリティ:** 脆弱性は[SECURITY.md](SECURITY.md)の手順で報告してください。
  公開Issueには投稿しないでください。
- **変更履歴:** リリースの変更は[CHANGELOG](CHANGELOG.md)に記録しています。

## ライセンス

[MIT](LICENSE) — © 2026 YouSangSon.
