# SlidePal

Google Drive の PDF スライドを開きながら、テキスト選択で用語解説・PDF全体の事前解析ができる学術発表サポートツール。

## 主な機能

- **PDF ビューア** — Google Drive の PDF をブラウザ内で表示
- **用語ポップアップ** — テキストを選択すると用語の解説をその場に表示（DB/AI 自動切り替え）
- **用語 DB** — 解説をローカル SQLite に保存・一覧管理
- **PDF 事前解析** — スライド全体から難解用語・発表者への質問候補を自動生成
- **ローカル LLM 対応** — Ollama 経由でオフライン動作可能（課金不要）

## セットアップ

### 1. 依存パッケージのインストール

```bash
cd slidepal
npm install
```

### 2. 環境変数の設定

```bash
cp .env.local.example .env.local
```

`.env.local` を編集して以下を設定：

| 変数 | 説明 |
| ---- | ---- |
| `NEXTAUTH_SECRET` | `openssl rand -base64 32` で生成 |
| `GOOGLE_CLIENT_ID` | Google Cloud Console → OAuth 2.0 クライアント ID |
| `GOOGLE_CLIENT_SECRET` | 同上 |
| `AI_PROVIDER` | `ollama`（ローカル）または `vercel`（Vercel AI Gateway） |

### 3. Google OAuth 設定

[Google Cloud Console](https://console.cloud.google.com/) で OAuth 2.0 クライアントを作成し、以下を許可済みリダイレクト URI に追加：

```text
http://localhost:3001/api/auth/callback/google
```

スコープ: `openid`, `email`, `profile`, `https://www.googleapis.com/auth/drive.readonly`

### 4. AI プロバイダーの設定

#### ローカル LLM（推奨・無料）

```bash
# Ollama をインストール: https://ollama.com
ollama pull gemma3:4b   # ラップトップ向け（約3GB）
```

`.env.local`:

```text
AI_PROVIDER=ollama
LOCAL_LLM_MODEL=gemma3:4b
```

#### Vercel AI Gateway

```text
AI_PROVIDER=vercel
AI_GATEWAY_API_KEY=your-key
```

### 5. 起動

```bash
npm run dev
```

[http://localhost:3001](http://localhost:3001) を開く。

## 技術スタック

- **Next.js 15** (App Router)
- **NextAuth.js** — Google OAuth + リフレッシュトークン自動更新
- **react-pdf / pdfjs-dist** — PDF 表示
- **unpdf** — サーバーサイド PDF テキスト抽出
- **better-sqlite3** — 用語 DB（SQLite）
- **Vercel AI SDK v6** — LLM 呼び出し抽象化
- **Tailwind CSS**
