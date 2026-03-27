# Bio-Info-Tools

バイオインフォマティクス用ツール集。

## ツール一覧

### SeqHunter (`seq_hunter_gui.py` / `seq_hunter.py`)

NCBI SRA / DDBJ から条件指定で検体を検索・選択・ダウンロードするツール。

**起動 (GUI):**

```bash
python seq_hunter_gui.py
```

**起動 (CLI):**

```bash
python seq_hunter.py
python seq_hunter.py --db ncbi --format 16S --env "hot spring" --country Japan --limit 50
```

**依存パッケージ:**

```bash
pip install customtkinter biopython requests rich questionary
```

**主な機能:**

- 採取環境・フォーマット・シーケンス機器・採取国で絞り込み検索
- NCBI SRA / DDBJ 同時検索対応
- Study列クリックで NCBI / DDBJ の詳細ページをブラウザで開く
- 選択した検体を EBI FTP 経由でダウンロード（SRA Toolkit オプションあり）
