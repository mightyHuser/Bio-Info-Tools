# SlidePal — 発表PDF閲覧支援ツール 設計書

**作成日:** 2026-04-01  
**リポジトリ:** Bio-Info-Tools  
**ステータス:** 承認済み

---

## Context

研究室では発表資料をGoogle Driveで共有し、手元のPCで閲覧しながら他人の発表を聞く。
分野の幅が広いため、発表中に理解できない専門用語が頻出する。
コピペして検索する方法では発表のスピードに追いつかない。

本ツール **SlidePal** は以下の課題を解決する：
1. 発表中に知らない用語をその場で素早く調べられる
2. 発表者への質問候補を事前に洗い出せる
3. 蓄積された用語データベースで繰り返し学習できる

---

## アーキテクチャ

### リポジトリ構成

```
Bio-Info-Tools/
├── seq_hunter.py          (既存)
├── seq_hunter_gui.py      (既存)
└── slidepal/              (新規)
    ├── app/
    │   ├── page.tsx                  # Drive ファイル一覧
    │   ├── viewer/[id]/page.tsx      # PDF ビューア
    │   └── database/page.tsx         # 用語 DB 閲覧
    ├── components/
    │   ├── PdfViewer.tsx             # react-pdf ラッパー + ページ遷移UI
    │   ├── TermPopup.tsx             # 用語説明ポップアップ
    │   ├── SidePanel.tsx             # 難語リスト・質問候補
    │   └── TermCard.tsx              # DB閲覧用カード
    ├── lib/
    │   ├── google-drive.ts           # Google Drive API v3
    │   ├── ai.ts                     # AI SDK (用語説明・事前解析)
    │   └── db.ts                     # better-sqlite3 操作
    ├── slidepal.db                   # ローカル SQLite (gitignore)
    └── package.json
```

### 技術スタック

| 役割 | 採用技術 | 選定理由 |
|------|---------|---------|
| フレームワーク | Next.js 16 (App Router) | フルスタック、豊富なエコシステム |
| PDF ビューア | `react-pdf` (pdf.js) | React 統合、テキスト選択に対応 |
| Google Drive 連携 | Google Drive API v3 + NextAuth.js | OAuth 認証込みで管理が容易 |
| AI 用語説明 | Vercel AI SDK + Claude | ストリーミング対応、品質が高い |
| データベース | SQLite (`better-sqlite3`) | 個人利用・サーバー不要・ファイル1個 |
| UI | Tailwind CSS + shadcn/ui | ダークテーマ、コンポーネント再利用 |

---

## 機能仕様

### 1. Google Drive 連携

- 初回起動時に OAuth 2.0 認証 (NextAuth.js)
- 指定フォルダ内の PDF ファイル一覧を表示
- PDF はドライブから直接ストリーミング (ローカル保存なし)

### 2. PDF ビューア

- `react-pdf` でブラウザ内レンダリング
- **ページ遷移**: 左右端にマウスオーバーでグラデーション + 矢印がフェードイン、クリックでページ移動
- ヘッダーに現在ページ / 総ページ数を表示

### 3. リアルタイム用語調べ

```
テキスト選択
  → DB を検索
  → ヒット    : 緑バッジ「📚 DB」でポップアップ即表示 (ゼロ遅延)
  → ミス      : AI API 呼び出し → 日本語 2〜3 文生成 → 青バッジ「✨ AI生成」で表示
                ポップアップ内に「保存」ボタン
```

**ポップアップ表示内容:**
- 用語名
- DB/AI生成バッジ
- 定義 + 背景・使われ方 (2〜3 文、日本語)
- DB 出現件数 (DB ヒット時のみ)
- 関連キーワード

### 4. 事前解析

PDFを開いた際、またはビューア上部で**発表タイプ**を選択できる：

- **進捗報告**: 手法選択の根拠、結果の解釈、次のステップ、対照実験の有無
- **抄読**: 論文の新規性、実験デザインの妥当性、限界・批判点、自研究への応用可能性

```
発表タイプを選択 (📊進捗報告 / 📄抄読)
  ↓
「🤖 このPDFを事前解析する」ボタンクリック
  → PDF 全文テキスト抽出
  → AI に送信: 難解用語リスト + 質問候補 (タイプ別プロンプト) を JSON 形式で返す
  → サイドパネルに表示
     - 難語: 用語名 + 出現ページ番号 + DB済みバッジ
     - 質問候補: 発表タイプに応じた観点の質問リスト
  → 解析完了後: 「新語 N 件を DB に保存」ボタン表示
```

### 5. DB への保存

- **個別保存**: AI 生成ポップアップ内の「保存」ボタン
- **一括保存**: 事前解析後に表示される「N 件を DB に保存」ボタン (チェックボックスで選択可)
- 自動保存はしない (ゴミデータを防ぐため手動運用)

### 6. 用語データベース閲覧

- 発表と独立した `/database` ページ
- フリーワード検索
- 分野タグでフィルタ
- 各エントリ: 用語名・説明・タグ・出現件数・最終出現日
- 説明文の手動編集・削除が可能

---

## データモデル

```sql
-- 用語テーブル
CREATE TABLE terms (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  term        TEXT    NOT NULL UNIQUE,
  explanation TEXT    NOT NULL,
  tags        TEXT    DEFAULT '[]',   -- JSON 配列 e.g. '["α多様性","微生物学"]'
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 出現履歴テーブル
CREATE TABLE term_occurrences (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id     INTEGER NOT NULL REFERENCES terms(id) ON DELETE CASCADE,
  pdf_name    TEXT    NOT NULL,   -- 発表ファイル名
  page        INTEGER,           -- 出現ページ (事前解析時のみ)
  appeared_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## UI レイアウト

### ビューア画面 (70% / 30% 分割)

```
[ヘッダー: フォルダ名 | ページ番号 | 接続状態]
┌─────────────────────────────┬──────────────┐
│                             │ [難語リスト] [質問候補] │
│   PDF スライド              │              │
│                             │ 難語カード一覧  │
│   ← ホバーで矢印表示 →     │ (DB/AI バッジ付) │
│                             │              │
│   [ポップアップ]            │ 質問候補リスト  │
│   用語名 [DBバッジ]         │              │
│   説明文 2〜3文             │              │
│                             │ [事前解析ボタン] │
└─────────────────────────────┴──────────────┘
```

---

## 統合ランチャー

Bio-Info-Tools の全ツールを一元管理する CustomTkinter 製ランチャー。

### リポジトリ構成への追加

```
Bio-Info-Tools/
├── launcher.py            (新規) ← ダブルクリックで起動
├── tools.json             (新規) ← ツール定義ファイル
├── seq_hunter.py
├── seq_hunter_gui.py
└── slidepal/
```

### tools.json

```json
[
  { "name": "SeqHunter", "icon": "🔍", "desc": "NCBI/DDBJ からサンプルを検索・ダウンロード", "type": "gui", "cmd": "seq_hunter_gui.py" },
  { "name": "SlidePal",  "icon": "📑", "desc": "発表PDF閲覧支援・用語データベース",           "type": "web", "cmd": "slidepal/", "port": 3000 }
]
```

### 起動フロー

- `gui` タイプ: `subprocess` で Python スクリプトを直接起動
- `web` タイプ: `npm run dev` をバックグラウンドで起動 → `webbrowser.open("http://localhost:{port}")` で自動オープン
- 新ツール追加時は `tools.json` に1行追記するだけ

---

## 検証方法

1. `slidepal/` ディレクトリで `npm run dev` を起動
2. Google OAuth でログイン → Drive フォルダが表示されることを確認
3. PDF を開いて専門用語をテキスト選択 → ポップアップが表示されることを確認
4. 「保存」ボタンで DB に登録 → 同語の再選択でDBバッジ (緑) が出ることを確認
5. 「事前解析」ボタン → サイドパネルに難語・質問候補が表示されることを確認
6. `/database` ページで用語一覧・検索が動くことを確認
