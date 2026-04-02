"""
seq_hunter_gui.py
=================
SeqHunter GUI版 — NCBI SRA / DDBJ 検体検索・ダウンロードツール

使い方:
    python seq_hunter_gui.py

依存:
    pip install customtkinter biopython requests rich questionary
"""

import json
import os
import subprocess
import sys
import threading
import time
import tkinter as tk
import webbrowser
from pathlib import Path
from tkinter import filedialog, messagebox, ttk

import customtkinter as ctk
import requests
from Bio import Entrez

# ─── seq_hunter のコア関数を再利用 ───────────────────────
sys.path.insert(0, str(Path(__file__).parent))
from seq_hunter import (
    ENV_KEYWORDS,
    FORMAT_KEYWORDS,
    SEQ_METHOD_KEYWORDS,
    build_ncbi_query,
    check_sra_toolkit,
    download_via_ebi_ftp,
    download_with_prefetch,
    fetch_by_accessions,
    search_ddbj,
    search_ncbi_sra,
)

# ─── テーマ設定 ────────────────────────────────────────────
ctk.set_appearance_mode("dark")
ctk.set_default_color_theme("blue")

COLOR_BG       = "#1a1a2e"
COLOR_PANEL    = "#16213e"
COLOR_ACCENT   = "#0f3460"
COLOR_BLUE     = "#2E96FF"
COLOR_GREEN    = "#00b894"
COLOR_YELLOW   = "#fdcb6e"
COLOR_RED      = "#e17055"
COLOR_TEXT     = "#e0e0e0"
COLOR_DIM      = "#888899"
COLOR_ROW_ODD  = "#1e2a45"
COLOR_ROW_EVEN = "#16213e"
COLOR_SEL      = "#0f3460"

DEFAULT_OUTDIR = str(Path("c:/local_bioinfomatics_workspace/Research/Original_Data/downloaded"))


# ════════════════════════════════════════════════════════════
#  SearchPanel — 左サイドバー（検索条件）
# ════════════════════════════════════════════════════════════

class SearchPanel(ctk.CTkFrame):
    def __init__(self, master, on_search_callback, **kwargs):
        super().__init__(master, fg_color=COLOR_PANEL, corner_radius=12, **kwargs)
        self.on_search = on_search_callback
        self._build()

    def _build(self):
        pad = {"padx": 12, "pady": 4}

        # タイトル
        ctk.CTkLabel(self, text="🔬 検索条件",
                     font=ctk.CTkFont(size=16, weight="bold"),
                     text_color=COLOR_BLUE).pack(anchor="w", padx=14, pady=(14, 6))

        self._sep()

        # DB
        self._label("データベース")
        self.db_var = ctk.StringVar(value="両方 (NCBI + DDBJ)")
        ctk.CTkOptionMenu(self, values=["NCBI SRA", "DDBJ", "両方 (NCBI + DDBJ)"],
                          variable=self.db_var,
                          fg_color=COLOR_ACCENT, button_color=COLOR_BLUE).pack(fill="x", **pad)

        # 採取環境
        self._label("採取環境")
        self.env_var = ctk.StringVar(value="hot spring / 温泉")
        ctk.CTkOptionMenu(self, values=list(ENV_KEYWORDS.keys()),
                          variable=self.env_var,
                          fg_color=COLOR_ACCENT, button_color=COLOR_BLUE).pack(fill="x", **pad)

        # フォーマット
        self._label("シーケンスフォーマット")
        self.fmt_var = ctk.StringVar(value="16S rRNA")
        ctk.CTkOptionMenu(self, values=list(FORMAT_KEYWORDS.keys()),
                          variable=self.fmt_var,
                          fg_color=COLOR_ACCENT, button_color=COLOR_BLUE).pack(fill="x", **pad)

        # シーケンサー
        self._label("シーケンス機器")
        self.seq_var = ctk.StringVar(value="指定なし")
        ctk.CTkOptionMenu(self, values=list(SEQ_METHOD_KEYWORDS.keys()),
                          variable=self.seq_var,
                          fg_color=COLOR_ACCENT, button_color=COLOR_BLUE).pack(fill="x", **pad)

        # 国・地域
        self._label("採取国・地域 (任意)")
        self.country_entry = ctk.CTkEntry(self, placeholder_text="例: Japan",
                                          fg_color=COLOR_ACCENT)
        self.country_entry.pack(fill="x", **pad)

        # 追加キーワード
        self._label("追加キーワード (任意)")
        self.extra_entry = ctk.CTkEntry(self, placeholder_text="例: volcanic",
                                        fg_color=COLOR_ACCENT)
        self.extra_entry.pack(fill="x", **pad)

        # カスタム自由入力欄（その他が選ばれたとき）
        self._label("カスタム環境/フォーマット (その他の場合)")
        self.custom_entry = ctk.CTkEntry(self, placeholder_text="例: cave, glacier, ITS2",
                                         fg_color=COLOR_ACCENT)
        self.custom_entry.pack(fill="x", **pad)

        self._sep()

        # 件数
        self._label("最大取得件数")
        self.limit_var = ctk.StringVar(value="50")
        ctk.CTkEntry(self, textvariable=self.limit_var,
                     fg_color=COLOR_ACCENT).pack(fill="x", **pad)

        # メールアドレス
        self._label("NCBIメールアドレス")
        self.email_entry = ctk.CTkEntry(self, placeholder_text="your@email.com",
                                        fg_color=COLOR_ACCENT)
        self.email_entry.pack(fill="x", **pad)

        self._sep()

        # 検索ボタン
        self.search_btn = ctk.CTkButton(
            self, text="🔍  検索実行", height=40,
            fg_color=COLOR_BLUE, hover_color="#1a7de0",
            font=ctk.CTkFont(size=14, weight="bold"),
            command=self._on_click_search,
        )
        self.search_btn.pack(fill="x", padx=12, pady=(8, 4))

        self._sep()

        # ── アクセッション番号直接検索 ──────────────────────
        ctk.CTkLabel(self, text="🔎 アクセッション番号で検索",
                     font=ctk.CTkFont(size=13, weight="bold"),
                     text_color=COLOR_YELLOW).pack(anchor="w", padx=14, pady=(4, 2))

        self._label("アクセッション番号 (カンマ区切り)")
        self.accession_entry = ctk.CTkEntry(
            self,
            placeholder_text="例: SRR12345, DRR67890, SRP001234",
            fg_color=COLOR_ACCENT,
        )
        self.accession_entry.pack(fill="x", padx=12, pady=4)

        self.acc_search_btn = ctk.CTkButton(
            self, text="🔍  アクセッション検索", height=36,
            fg_color=COLOR_YELLOW, hover_color="#e0b800",
            text_color="#1a1a2e",
            font=ctk.CTkFont(size=13, weight="bold"),
            command=self._on_click_acc_search,
        )
        self.acc_search_btn.pack(fill="x", padx=12, pady=(2, 12))

    def _label(self, text):
        ctk.CTkLabel(self, text=text, font=ctk.CTkFont(size=11),
                     text_color=COLOR_DIM).pack(anchor="w", padx=14, pady=(6, 0))

    def _sep(self):
        ctk.CTkFrame(self, height=1, fg_color=COLOR_ACCENT).pack(fill="x", padx=10, pady=6)

    def _on_click_search(self):
        params = self.get_params()
        self.on_search(params)

    def _on_click_acc_search(self):
        raw = self.accession_entry.get().strip()
        if not raw:
            return
        accessions = [a.strip() for a in raw.replace("、", ",").split(",") if a.strip()]
        email = self.email_entry.get().strip() or "user@example.com"
        self.on_search({"mode": "accession", "accessions": accessions, "email": email})

    def get_params(self) -> dict:
        env_key = self.env_var.get()
        fmt_key = self.fmt_var.get()
        seq_key = self.seq_var.get()
        custom  = self.custom_entry.get().strip()

        env_terms = ENV_KEYWORDS.get(env_key, [])
        if "__custom__" in env_terms:
            env_terms = [custom] if custom else []

        fmt_terms = FORMAT_KEYWORDS.get(fmt_key, [])
        if "__custom__" in fmt_terms:
            fmt_terms = [custom] if custom else []

        seq_terms = SEQ_METHOD_KEYWORDS.get(seq_key, [])

        try:
            limit = int(self.limit_var.get())
        except ValueError:
            limit = 50

        return {
            "db": self.db_var.get(),
            "env_terms": env_terms,
            "fmt_terms": fmt_terms,
            "seq_terms": seq_terms,
            "country": self.country_entry.get().strip(),
            "extra_query": self.extra_entry.get().strip(),
            "limit": limit,
            "email": self.email_entry.get().strip() or "user@example.com",
        }

    def set_searching(self, state: bool):
        self.search_btn.configure(
            state="disabled" if state else "normal",
            text="検索中..." if state else "🔍  検索実行",
        )
        self.acc_search_btn.configure(
            state="disabled" if state else "normal",
            text="検索中..." if state else "🔍  アクセッション検索",
        )


# ════════════════════════════════════════════════════════════
#  ResultsPanel — 中央テーブル
# ════════════════════════════════════════════════════════════

def get_detail_url(result: dict) -> str:
    """検体の詳細ページURLを返す"""
    db = result["db"]
    study_acc = result.get("study_acc", "N/A")
    if not study_acc or study_acc == "N/A":
        return ""
    if db == "NCBI":
        return f"https://www.ncbi.nlm.nih.gov/sra/{study_acc}"
    elif db == "DDBJ":
        if study_acc.startswith("DRP"):
            return f"https://ddbj.nig.ac.jp/resource/sra-study/{study_acc}"
        elif study_acc.startswith(("PRJDB", "PRJNA", "PRJEB")):
            return f"https://ddbj.nig.ac.jp/resource/bioproject/{study_acc}"
        else:
            return f"https://ddbj.nig.ac.jp/search?query={study_acc}"
    return ""


COLUMNS = [
    ("sel",      "✓",        30),
    ("db",       "DB",       55),
    ("study",    "Study 🔗", 110),
    ("title",    "タイトル",  300),
    ("plat",     "Platform", 120),
    ("geo",      "採取地",   130),
    ("src",      "由来",     130),
    ("biosample","BioSample", 120),
    ("runs",     "Runs",      50),
    ("gb",       "GB",        60),
]

class ResultsPanel(ctk.CTkFrame):
    def __init__(self, master, **kwargs):
        super().__init__(master, fg_color=COLOR_PANEL, corner_radius=12, **kwargs)
        self.results: list = []
        self.check_vars: dict = {}   # index -> BooleanVar
        self._build()

    def _build(self):
        # ヘッダー
        hdr = ctk.CTkFrame(self, fg_color="transparent")
        hdr.pack(fill="x", padx=12, pady=(12, 4))
        ctk.CTkLabel(hdr, text="📋 検索結果",
                     font=ctk.CTkFont(size=16, weight="bold"),
                     text_color=COLOR_BLUE).pack(side="left")
        self.count_label = ctk.CTkLabel(hdr, text="",
                                        font=ctk.CTkFont(size=12),
                                        text_color=COLOR_DIM)
        self.count_label.pack(side="left", padx=10)

        # 全選択/解除ボタン
        btn_frame = ctk.CTkFrame(hdr, fg_color="transparent")
        btn_frame.pack(side="right")
        ctk.CTkButton(btn_frame, text="全選択", width=70, height=28,
                      fg_color=COLOR_ACCENT, hover_color=COLOR_BLUE,
                      command=self._select_all).pack(side="left", padx=2)
        ctk.CTkButton(btn_frame, text="全解除", width=70, height=28,
                      fg_color=COLOR_ACCENT, hover_color=COLOR_RED,
                      command=self._deselect_all).pack(side="left", padx=2)

        # 採取地N/A除外フィルター
        self.filter_na_var = ctk.BooleanVar(value=False)
        ctk.CTkCheckBox(btn_frame, text="採取地N/Aを除外",
                        variable=self.filter_na_var,
                        text_color=COLOR_DIM,
                        command=self._refresh_tree).pack(side="left", padx=10)

        # Treeview スタイル
        style = ttk.Style()
        style.theme_use("clam")
        style.configure("SeqHunter.Treeview",
                        background=COLOR_ROW_EVEN,
                        foreground=COLOR_TEXT,
                        fieldbackground=COLOR_ROW_EVEN,
                        rowheight=26,
                        font=("Segoe UI", 10))
        style.configure("SeqHunter.Treeview.Heading",
                        background=COLOR_ACCENT,
                        foreground=COLOR_TEXT,
                        font=("Segoe UI", 10, "bold"),
                        relief="flat")
        style.map("SeqHunter.Treeview",
                  background=[("selected", COLOR_SEL)],
                  foreground=[("selected", COLOR_TEXT)])

        # フレーム（スクロール対応）
        tree_frame = ctk.CTkFrame(self, fg_color="transparent")
        tree_frame.pack(fill="both", expand=True, padx=12, pady=(0, 8))

        col_ids = [c[0] for c in COLUMNS]
        self.tree = ttk.Treeview(tree_frame, columns=col_ids,
                                  show="headings",
                                  style="SeqHunter.Treeview",
                                  selectmode="none")

        for cid, cname, cwidth in COLUMNS:
            self.tree.heading(cid, text=cname,
                              command=lambda c=cid: self._sort_by(c))
            self.tree.column(cid, width=cwidth, minwidth=30,
                              anchor="center" if cid in ("sel","runs","gb","db") else "w")

        self.tree.tag_configure("odd",  background=COLOR_ROW_ODD)
        self.tree.tag_configure("even", background=COLOR_ROW_EVEN)
        self.tree.tag_configure("ncbi", foreground="#7ec8e3")
        self.tree.tag_configure("ddbj", foreground="#a8e6cf")

        vsb = ttk.Scrollbar(tree_frame, orient="vertical",   command=self.tree.yview)
        hsb = ttk.Scrollbar(tree_frame, orient="horizontal", command=self.tree.xview)
        self.tree.configure(yscrollcommand=vsb.set, xscrollcommand=hsb.set)

        self.tree.grid(row=0, column=0, sticky="nsew")
        vsb.grid(row=0, column=1, sticky="ns")
        hsb.grid(row=1, column=0, sticky="ew")
        tree_frame.grid_rowconfigure(0, weight=1)
        tree_frame.grid_columnconfigure(0, weight=1)

        self.tree.bind("<ButtonRelease-1>", self._on_click)
        self.tree.bind("<Motion>", self._on_motion)

    def load_results(self, results: list):
        self.results = results
        self.check_vars = {i: False for i in range(len(results))}
        self._refresh_tree()

    def _visible_results(self) -> list:
        """フィルター適用後の表示対象 (元インデックス付き)"""
        filter_na = self.filter_na_var.get()
        out = []
        for i, r in enumerate(self.results):
            if filter_na and r.get("geo_loc", "N/A") in ("N/A", "", "not collected", "missing"):
                continue
            out.append((i, r))
        return out

    def _refresh_tree(self):
        self.tree.delete(*self.tree.get_children())
        visible = self._visible_results()
        for row_num, (i, r) in enumerate(visible):
            checked = "☑" if self.check_vars.get(i, False) else "☐"
            tag = ("odd" if row_num % 2 else "even",
                   "ncbi" if r["db"] == "NCBI" else "ddbj")
            self.tree.insert("", "end", iid=str(i), tags=tag,
                              values=(
                                  checked,
                                  r["db"],
                                  r["study_acc"],
                                  r["title"][:60],
                                  r["platform"],
                                  r["geo_loc"][:20],
                                  r["isolation_source"][:20],
                                  r.get("biosample", "N/A")[:20],
                                  r["run_count"],
                                  f"{r['bases_gb']:.2f}",
                              ))
        total = len(self.results)
        shown = len(visible)
        hidden = total - shown
        suffix = f"  (採取地不明 {hidden} 件を非表示)" if hidden > 0 else ""
        self.count_label.configure(text=f"{total} 件ヒット{suffix}")

    def _on_click(self, event):
        region = self.tree.identify_region(event.x, event.y)
        if region != "cell":
            return
        col = self.tree.identify_column(event.x)
        row_id = self.tree.identify_row(event.y)
        if not row_id:
            return
        idx = int(row_id)

        # Study列 (#3) クリック → ブラウザで詳細ページを開く
        if col == "#3":
            url = get_detail_url(self.results[idx])
            if url:
                webbrowser.open(url)
            return

        # それ以外の列 → 選択トグル
        self.check_vars[idx] = not self.check_vars.get(idx, False)
        self._refresh_tree()

    def _on_motion(self, event):
        """Study列ホバー時にカーソルをhand2に変更"""
        region = self.tree.identify_region(event.x, event.y)
        if region == "cell" and self.tree.identify_column(event.x) == "#3":
            self.tree.configure(cursor="hand2")
        else:
            self.tree.configure(cursor="")

    def _sort_by(self, col):
        pass  # 必要なら実装

    def _select_all(self):
        for i in range(len(self.results)):
            self.check_vars[i] = True
        self._refresh_tree()

    def _deselect_all(self):
        for i in range(len(self.results)):
            self.check_vars[i] = False
        self._refresh_tree()

    def get_selected(self) -> list:
        return [self.results[i] for i, v in self.check_vars.items() if v]


# ════════════════════════════════════════════════════════════
#  DownloadPanel — 下部ダウンロード設定＋進捗
# ════════════════════════════════════════════════════════════

class DownloadPanel(ctk.CTkFrame):
    def __init__(self, master, get_selected_callback, **kwargs):
        super().__init__(master, fg_color=COLOR_PANEL, corner_radius=12, **kwargs)
        self.get_selected = get_selected_callback
        self._build()

    def _build(self):
        top = ctk.CTkFrame(self, fg_color="transparent")
        top.pack(fill="x", padx=12, pady=(10, 4))

        ctk.CTkLabel(top, text="💾 ダウンロード設定",
                     font=ctk.CTkFont(size=14, weight="bold"),
                     text_color=COLOR_BLUE).pack(side="left")

        # 出力先
        dir_frame = ctk.CTkFrame(top, fg_color="transparent")
        dir_frame.pack(side="left", padx=20)
        ctk.CTkLabel(dir_frame, text="出力先:", text_color=COLOR_DIM,
                     font=ctk.CTkFont(size=11)).pack(side="left")
        self.outdir_var = ctk.StringVar(value=DEFAULT_OUTDIR)
        ctk.CTkEntry(dir_frame, textvariable=self.outdir_var,
                     width=340, fg_color=COLOR_ACCENT).pack(side="left", padx=4)
        ctk.CTkButton(dir_frame, text="📁", width=36, height=28,
                      fg_color=COLOR_ACCENT, hover_color=COLOR_BLUE,
                      command=self._browse).pack(side="left")

        # SRA Toolkit オプション
        self.use_toolkit_var = ctk.BooleanVar(value=False)
        ctk.CTkCheckBox(top, text="SRA Toolkit を使用",
                        variable=self.use_toolkit_var,
                        text_color=COLOR_DIM).pack(side="left", padx=16)

        # ダウンロードボタン
        self.dl_btn = ctk.CTkButton(
            top, text="⬇  ダウンロード開始", height=36,
            fg_color=COLOR_GREEN, hover_color="#00a381",
            font=ctk.CTkFont(size=13, weight="bold"),
            command=self._start_download,
        )
        self.dl_btn.pack(side="right", padx=4)

        # プログレスバー
        prog_frame = ctk.CTkFrame(self, fg_color="transparent")
        prog_frame.pack(fill="x", padx=12, pady=(4, 2))
        self.progress = ctk.CTkProgressBar(prog_frame, height=14,
                                           progress_color=COLOR_GREEN,
                                           fg_color=COLOR_ACCENT)
        self.progress.pack(fill="x")
        self.progress.set(0)

        self.status_label = ctk.CTkLabel(self, text="",
                                         text_color=COLOR_DIM,
                                         font=ctk.CTkFont(size=11))
        self.status_label.pack(anchor="w", padx=14, pady=(0, 4))

        # ログエリア
        self.log = ctk.CTkTextbox(self, height=130, fg_color=COLOR_BG,
                                   text_color=COLOR_TEXT,
                                   font=ctk.CTkFont(family="Consolas", size=11))
        self.log.pack(fill="x", padx=12, pady=(0, 10))

    def _browse(self):
        d = filedialog.askdirectory(initialdir=self.outdir_var.get())
        if d:
            self.outdir_var.set(d)

    def log_write(self, text: str, color_tag: str = ""):
        self.log.configure(state="normal")
        self.log.insert("end", text + "\n")
        self.log.see("end")
        self.log.configure(state="disabled")

    def set_progress(self, value: float, text: str = ""):
        self.progress.set(value)
        if text:
            self.status_label.configure(text=text)

    def _start_download(self):
        selected = self.get_selected()
        if not selected:
            messagebox.showwarning("選択なし", "ダウンロードする検体を選択してください。")
            return

        total_runs = sum(r["run_count"] for r in selected)
        total_gb   = sum(r["bases_gb"] for r in selected)

        if not messagebox.askyesno(
            "確認",
            f"{len(selected)} Study / {total_runs} Run をダウンロードします。\n"
            f"推定合計: {total_gb:.2f} GB\n\n続行しますか？"
        ):
            return

        outdir = Path(self.outdir_var.get())
        use_toolkit = self.use_toolkit_var.get() and check_sra_toolkit()

        self.dl_btn.configure(state="disabled", text="ダウンロード中...")
        self.log.configure(state="normal")
        self.log.delete("1.0", "end")
        self.log.configure(state="disabled")

        def worker():
            all_runs = [(run, r) for r in selected for run in r["runs"]]
            n = len(all_runs)
            ok_list, fail_list = [], []

            for i, (run_acc, meta) in enumerate(all_runs):
                self.after(0, self.set_progress,
                           i / n,
                           f"[{i+1}/{n}] {run_acc} — {meta['title'][:40]}")
                self.after(0, self.log_write, f"\n── [{i+1}/{n}] {run_acc}")
                self.after(0, self.log_write, f"    採取地: {meta['geo_loc']}")
                self.after(0, self.log_write, f"    由来  : {meta['isolation_source']}")

                run_dir = outdir / meta.get("study_acc", "unknown")
                run_dir.mkdir(parents=True, exist_ok=True)

                def gui_log(msg, _idx=i):
                    self.after(0, self.log_write, f"    {msg}")

                try:
                    if use_toolkit:
                        ok = download_with_prefetch(run_acc, run_dir)
                    else:
                        ok = download_via_ebi_ftp(run_acc, run_dir, log_fn=gui_log)
                except Exception as e:
                    ok = False
                    self.after(0, self.log_write, f"    エラー: {e}")

                if ok:
                    ok_list.append(run_acc)
                    self.after(0, self.log_write, f"    ✓ 完了")
                else:
                    fail_list.append(run_acc)
                    self.after(0, self.log_write, f"    ✗ 失敗")

            # メタデータ保存
            outdir.mkdir(parents=True, exist_ok=True)
            meta_path = outdir / "download_metadata.json"
            with open(meta_path, "w", encoding="utf-8") as f:
                json.dump({
                    "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S"),
                    "success": ok_list,
                    "failed": fail_list,
                    "entries": selected,
                }, f, ensure_ascii=False, indent=2)

            self.after(0, self.set_progress, 1.0,
                       f"完了 — 成功: {len(ok_list)} / {n}"
                       + (f"  失敗: {len(fail_list)}" if fail_list else ""))
            self.after(0, self.log_write,
                       f"\n✅ 完了: {len(ok_list)}/{n}  "
                       f"メタデータ → {meta_path}")
            self.after(0, self.dl_btn.configure,
                       {"state": "normal", "text": "⬇  ダウンロード開始"})

            if fail_list:
                self.after(0, messagebox.showwarning,
                           "一部失敗",
                           f"以下のRunのダウンロードに失敗しました:\n" + "\n".join(fail_list))

        threading.Thread(target=worker, daemon=True).start()


# ════════════════════════════════════════════════════════════
#  App — メインウィンドウ
# ════════════════════════════════════════════════════════════

class SeqHunterApp(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("SeqHunter — NCBI/DDBJ 検体収集ツール")
        self.geometry("1400x860")
        self.minsize(1100, 700)
        self.configure(fg_color=COLOR_BG)
        self._build_layout()

    def _build_layout(self):
        # ─── ヘッダー ───
        header = ctk.CTkFrame(self, fg_color=COLOR_PANEL, corner_radius=0, height=52)
        header.pack(fill="x")
        header.pack_propagate(False)
        ctk.CTkLabel(header,
                     text="🧬  SeqHunter",
                     font=ctk.CTkFont(size=20, weight="bold"),
                     text_color=COLOR_BLUE).pack(side="left", padx=20, pady=12)
        ctk.CTkLabel(header,
                     text="NCBI SRA / DDBJ 検体検索・ダウンロードツール",
                     font=ctk.CTkFont(size=12),
                     text_color=COLOR_DIM).pack(side="left")

        # ─── ボディ ───
        body = ctk.CTkFrame(self, fg_color="transparent")
        body.pack(fill="both", expand=True, padx=10, pady=(6, 0))

        # 左：検索条件パネル
        self.search_panel = SearchPanel(body, on_search_callback=self._run_search)
        self.search_panel.pack(side="left", fill="y", padx=(0, 6))

        # 右：結果 + ダウンロード
        right = ctk.CTkFrame(body, fg_color="transparent")
        right.pack(side="left", fill="both", expand=True)

        self.results_panel = ResultsPanel(right)
        self.results_panel.pack(fill="both", expand=True, pady=(0, 6))

        self.download_panel = DownloadPanel(
            right, get_selected_callback=self.results_panel.get_selected)
        self.download_panel.pack(fill="x")

    # ── 検索実行（バックグラウンドスレッド）──────────────────
    def _run_search(self, params: dict):
        self.search_panel.set_searching(True)
        self.results_panel.load_results([])
        self.results_panel.count_label.configure(text="検索中...")

        def worker():
            all_results = []

            if params.get("mode") == "accession":
                # ── アクセッション番号直接検索 ──
                try:
                    all_results = fetch_by_accessions(
                        params["accessions"], params["email"]
                    )
                except Exception as e:
                    self.after(0, messagebox.showerror, "検索エラー", str(e))
            else:
                # ── キーワード検索 ──
                if params["db"] in ("NCBI SRA", "両方 (NCBI + DDBJ)"):
                    query = build_ncbi_query(
                        params["env_terms"], params["fmt_terms"],
                        params["country"], params["extra_query"]
                    )
                    try:
                        ncbi = search_ncbi_sra(query, params["limit"], params["email"])
                        all_results.extend(ncbi)
                    except Exception as e:
                        self.after(0, messagebox.showerror, "NCBI エラー", str(e))

                if params["db"] in ("DDBJ", "両方 (NCBI + DDBJ)"):
                    ddbj_terms = (params["env_terms"] + params["fmt_terms"] +
                                  ([params["country"]] if params["country"] else []))
                    try:
                        ddbj = search_ddbj(ddbj_terms, params["limit"])
                        all_results.extend(ddbj)
                    except Exception as e:
                        self.after(0, messagebox.showerror, "DDBJ エラー", str(e))

            self.after(0, self.results_panel.load_results, all_results)
            self.after(0, self.search_panel.set_searching, False)

            if not all_results:
                self.after(0, messagebox.showinfo, "結果なし",
                           "検索結果が0件でした。\n条件を変更して再試行してください。")

        threading.Thread(target=worker, daemon=True).start()


# ════════════════════════════════════════════════════════════
#  エントリーポイント
# ════════════════════════════════════════════════════════════

if __name__ == "__main__":
    app = SeqHunterApp()
    app.mainloop()
