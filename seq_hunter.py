"""
seq_hunter.py
=============
NCBI SRA / DDBJ から条件指定で検体を検索・選択・ダウンロードするツール

使い方:
    python seq_hunter.py
    python seq_hunter.py --db ncbi --format 16S --env "hot spring" --country Japan --limit 50
    python seq_hunter.py --no-interactive --accessions SRR12345,SRR67890 --outdir ./downloads

依存:
    pip install rich questionary biopython requests
"""

import argparse
import json
import os
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path
from typing import Optional

import questionary
import requests
from Bio import Entrez
from rich import box
from rich.console import Console
from rich.panel import Panel
from rich.progress import BarColumn, Progress, SpinnerColumn, TextColumn
from rich.table import Table
from rich.text import Text

console = Console()

# ─────────────────────────────────────────────────────────
# 定数・マスタデータ
# ─────────────────────────────────────────────────────────

ENV_KEYWORDS = {
    "hot spring / 温泉": ["hot spring", "thermal spring", "onsen", "geothermal"],
    "hydrothermal vent / 熱水噴出孔": ["hydrothermal vent", "deep-sea vent", "black smoker"],
    "soil / 土壌": ["soil", "sediment", "terrestrial"],
    "seawater / 海水": ["seawater", "marine", "ocean", "sea water"],
    "freshwater / 淡水": ["freshwater", "river", "lake", "pond"],
    "human gut / 腸内": ["gut", "intestine", "feces", "stool", "colon"],
    "human skin / 皮膚": ["skin", "dermal"],
    "human oral / 口腔": ["oral", "mouth", "saliva", "dental"],
    "air / 大気": ["air", "aerosol", "atmosphere"],
    "plant / 植物": ["plant", "rhizosphere", "phyllosphere", "root"],
    "wastewater / 排水": ["wastewater", "sewage", "activated sludge"],
    "その他 (自由入力)": ["__custom__"],
}

FORMAT_KEYWORDS = {
    "16S rRNA": ["16S", "16S rRNA", "16S ribosomal"],
    "18S rRNA": ["18S", "18S rRNA", "18S ribosomal"],
    "ITS (真菌)": ["ITS", "internal transcribed spacer", "fungal"],
    "メタゲノム (WGS)": ["metagenomic", "shotgun", "whole genome shotgun"],
    "メタトランスクリプトーム": ["metatranscriptome", "RNA-seq", "transcriptome"],
    "その他 (自由入力)": ["__custom__"],
}

SEQ_METHOD_KEYWORDS = {
    "Illumina MiSeq": ["MiSeq", "Illumina MiSeq"],
    "Illumina HiSeq": ["HiSeq", "Illumina HiSeq"],
    "Illumina NovaSeq": ["NovaSeq"],
    "PacBio": ["PacBio", "SMRT"],
    "Oxford Nanopore": ["Nanopore", "ONT", "MinION"],
    "Ion Torrent": ["Ion Torrent"],
    "指定なし": [],
}


# ─────────────────────────────────────────────────────────
# NCBI SRA 検索
# ─────────────────────────────────────────────────────────

def build_ncbi_query(env_terms: list, format_terms: list,
                     country: str, custom_query: str) -> str:
    parts = []

    if env_terms and "__custom__" not in env_terms:
        env_q = " OR ".join(f'"{t}"[All Fields]' for t in env_terms)
        parts.append(f"({env_q})")

    if format_terms and "__custom__" not in format_terms:
        fmt_q = " OR ".join(f'"{t}"[All Fields]' for t in format_terms)
        parts.append(f"({fmt_q})")

    if country:
        # [Attributes] で geo_loc_name などのサンプル属性に限定して検索
        # [All Fields] だとタイトル・概要文ヒットで採取地N/Aの検体が混入する
        parts.append(f'("{country}"[Attributes] OR "{country}"[geo_loc])')

    if custom_query:
        parts.append(f"({custom_query})")

    # アンプリコンの場合は絞り込み
    if format_terms and any(k in ["16S rRNA", "18S rRNA", "ITS (真菌)"]
                            for k in format_terms):
        parts.append("(amplicon[Strategy] OR AMPLICON[Strategy])")

    return " AND ".join(parts) if parts else "environmental samples[Filter]"


def search_ncbi_sra(query: str, limit: int, email: str) -> list:
    Entrez.email = email
    results = []

    with console.status("[bold cyan]NCBI SRA を検索中...", spinner="dots"):
        try:
            handle = Entrez.esearch(db="sra", term=query,
                                    retmax=limit, usehistory="y")
            record = Entrez.read(handle)
            handle.close()

            total = int(record["Count"])
            ids = record["IdList"]
            webenv = record["WebEnv"]
            query_key = record["QueryKey"]

            if not ids:
                return []

            # バッチでサマリー取得
            fetch_handle = Entrez.esummary(db="sra", webenv=webenv,
                                           query_key=query_key,
                                           retmax=limit)
            summaries = Entrez.read(fetch_handle)
            fetch_handle.close()

            for s in summaries:
                exp_xml = s.get("ExpXml", "")
                runs_xml = s.get("Runs", "")

                title = re.search(r'<Study acc="([^"]+)"[^>]*name="([^"]+)"', exp_xml)
                platform = re.search(r'<Platform instrument_model="([^"]+)"', exp_xml)
                spots = re.search(r'total_spots="(\d+)"', runs_xml)
                bases = re.search(r'total_bases="(\d+)"', runs_xml)
                run_acc = re.findall(r'acc="(SRR\d+|ERR\d+|DRR\d+)"', runs_xml)

                biosample = re.search(r'<Biosample>(\S+)</Biosample>', exp_xml)
                organism = re.search(r'<Organism taxid="\d+" ScientificName="([^"]+)"', exp_xml)
                # geo_loc_name は複数のXML形式で記録されるため複数パターンで抽出
                geo = (
                    re.search(r'geo_loc_name[^>]*value="([^"]+)"', exp_xml) or
                    re.search(r'geo_loc_name[^>]*>([^<]+)<', exp_xml) or
                    re.search(r'<Tag>geo_loc_name</Tag>\s*<Value>([^<]+)</Value>', exp_xml) or
                    re.search(r'"geo_loc_name"\s*:\s*"([^"]+)"', exp_xml)
                )
                source = (
                    re.search(r'isolation_source[^>]*value="([^"]+)"', exp_xml) or
                    re.search(r'isolation_source[^>]*>([^<]+)<', exp_xml) or
                    re.search(r'<Tag>isolation_source</Tag>\s*<Value>([^<]+)</Value>', exp_xml)
                )

                study_acc = title.group(1) if title else "N/A"
                study_name = title.group(2) if title else s.get("Title", "N/A")
                plat_name = platform.group(1) if platform else "N/A"
                total_spots_val = int(spots.group(1)) if spots else 0
                total_bases_val = int(bases.group(1)) if bases else 0
                run_list = run_acc if run_acc else []

                results.append({
                    "db": "NCBI",
                    "study_acc": study_acc,
                    "title": study_name[:80],
                    "platform": plat_name,
                    "runs": run_list,
                    "run_count": len(run_list),
                    "spots": total_spots_val,
                    "bases_gb": round(total_bases_val / 1e9, 2),
                    "organism": organism.group(1) if organism else "N/A",
                    "geo_loc": geo.group(1).strip() if geo else "N/A",
                    "isolation_source": source.group(1).strip() if source else "N/A",
                    "biosample": biosample.group(1) if biosample else "N/A",
                })

        except Exception as e:
            console.print(f"[red]NCBI 検索エラー: {e}[/red]")

    return results


# ─────────────────────────────────────────────────────────
# アクセッション番号直接フェッチ
# ─────────────────────────────────────────────────────────

def fetch_by_accessions(accessions: list, email: str) -> list:
    """SRR/DRR/ERR/SRP/DRP などのアクセッション番号からメタデータを取得する。

    Run accession (SRR/DRR/ERR) と Study accession (SRP/DRP/ERP) の両方に対応。
    """
    Entrez.email = email
    results = []

    with console.status("[bold cyan]アクセッション番号を検索中...", spinner="dots"):
        for acc in accessions:
            acc = acc.strip()
            if not acc:
                continue
            try:
                handle = Entrez.esearch(db="sra", term=f"{acc}[Accession]", retmax=200)
                record = Entrez.read(handle)
                handle.close()

                ids = record.get("IdList", [])
                if not ids:
                    console.print(f"[yellow]{acc}: 見つかりませんでした[/yellow]")
                    continue

                fetch_handle = Entrez.esummary(db="sra", id=",".join(ids), retmax=200)
                summaries = Entrez.read(fetch_handle)
                fetch_handle.close()

                for s in summaries:
                    exp_xml  = s.get("ExpXml", "")
                    runs_xml = s.get("Runs", "")

                    title    = re.search(r'<Study acc="([^"]+)"[^>]*name="([^"]+)"', exp_xml)
                    platform = re.search(r'<Platform instrument_model="([^"]+)"', exp_xml)
                    spots    = re.search(r'total_spots="(\d+)"', runs_xml)
                    bases    = re.search(r'total_bases="(\d+)"', runs_xml)
                    run_acc  = re.findall(r'acc="(SRR\d+|ERR\d+|DRR\d+)"', runs_xml)
                    biosample = re.search(r'<Biosample>(\S+)</Biosample>', exp_xml)
                    organism  = re.search(r'<Organism taxid="\d+" ScientificName="([^"]+)"', exp_xml)
                    geo = (
                        re.search(r'geo_loc_name[^>]*value="([^"]+)"', exp_xml) or
                        re.search(r'geo_loc_name[^>]*>([^<]+)<', exp_xml) or
                        re.search(r'<Tag>geo_loc_name</Tag>\s*<Value>([^<]+)</Value>', exp_xml)
                    )
                    source = (
                        re.search(r'isolation_source[^>]*value="([^"]+)"', exp_xml) or
                        re.search(r'isolation_source[^>]*>([^<]+)<', exp_xml) or
                        re.search(r'<Tag>isolation_source</Tag>\s*<Value>([^<]+)</Value>', exp_xml)
                    )

                    results.append({
                        "db": "NCBI",
                        "study_acc": title.group(1) if title else acc,
                        "title": (title.group(2) if title else s.get("Title", acc))[:80],
                        "platform": platform.group(1) if platform else "N/A",
                        "runs": run_acc if run_acc else [acc],
                        "run_count": len(run_acc) if run_acc else 1,
                        "spots": int(spots.group(1)) if spots else 0,
                        "bases_gb": round(int(bases.group(1)) / 1e9, 2) if bases else 0,
                        "organism": organism.group(1) if organism else "N/A",
                        "geo_loc": geo.group(1).strip() if geo else "N/A",
                        "isolation_source": source.group(1).strip() if source else "N/A",
                        "biosample": biosample.group(1) if biosample else "N/A",
                    })

            except Exception as e:
                console.print(f"[red]{acc} 取得エラー: {e}[/red]")

    return results


# ─────────────────────────────────────────────────────────
# DDBJ 検索
# ─────────────────────────────────────────────────────────

def search_ddbj(query_terms: list, limit: int) -> list:
    """DDBJ Search API を使用して検索"""
    results = []
    base_url = "https://ddbj.nig.ac.jp/search/entry/sra-run"

    query = " ".join(query_terms) if query_terms else "environmental metagenome"

    params = {
        "query": query,
        "limit": min(limit, 100),
        "offset": 0,
    }

    with console.status("[bold cyan]DDBJ を検索中...", spinner="dots"):
        try:
            resp = requests.get(base_url, params=params, timeout=30)
            if resp.status_code == 200:
                data = resp.json()
                entries = data.get("hits", {}).get("hits", [])

                for entry in entries:
                    src = entry.get("_source", {})
                    acc = src.get("accession", "N/A")
                    title = src.get("title", "N/A")
                    organism = src.get("organism", {})
                    if isinstance(organism, dict):
                        org_name = organism.get("name", "N/A")
                    else:
                        org_name = str(organism)

                    attrs = {a.get("tag", ""): a.get("value", "")
                             for a in src.get("sampleAttributes", [])
                             if isinstance(a, dict)}

                    results.append({
                        "db": "DDBJ",
                        "study_acc": src.get("bioProject", "N/A"),
                        "title": str(title)[:80],
                        "platform": src.get("instrument", "N/A"),
                        "runs": [acc],
                        "run_count": 1,
                        "spots": src.get("totalSpots", 0),
                        "bases_gb": round(src.get("totalBases", 0) / 1e9, 2),
                        "organism": org_name,
                        "geo_loc": attrs.get("geo_loc_name", "N/A"),
                        "isolation_source": attrs.get("isolation_source", "N/A"),
                        "biosample": src.get("bioSample", "N/A"),
                    })
            else:
                console.print(f"[yellow]DDBJ API レスポンス: {resp.status_code}[/yellow]")

        except Exception as e:
            console.print(f"[yellow]DDBJ 検索スキップ: {e}[/yellow]")

    return results


# ─────────────────────────────────────────────────────────
# 結果表示・選択
# ─────────────────────────────────────────────────────────

def display_results_table(results: list) -> None:
    table = Table(
        title=f"検索結果 ({len(results)} 件)",
        box=box.ROUNDED,
        show_lines=True,
        style="bold",
        header_style="bold white on dark_blue",
    )
    table.add_column("#", style="dim", width=4, justify="right")
    table.add_column("DB", width=5)
    table.add_column("Study/Run", width=12)
    table.add_column("タイトル", width=35)
    table.add_column("Platform", width=14)
    table.add_column("採取地", width=18)
    table.add_column("由来", width=18)
    table.add_column("Run数", justify="right", width=5)
    table.add_column("GB", justify="right", width=6)

    for i, r in enumerate(results):
        db_style = "cyan" if r["db"] == "NCBI" else "green"
        table.add_row(
            str(i + 1),
            Text(r["db"], style=db_style),
            r["study_acc"],
            r["title"],
            r["platform"],
            r["geo_loc"][:18],
            r["isolation_source"][:18],
            str(r["run_count"]),
            str(r["bases_gb"]),
        )

    console.print(table)


def interactive_select(results: list) -> list:
    """チェックボックスで複数選択"""
    choices = []
    for i, r in enumerate(results):
        label = (f"[{r['db']}] {r['study_acc']} | "
                 f"{r['title'][:40]} | "
                 f"{r['geo_loc'][:15]} | "
                 f"{r['run_count']}Runs | {r['bases_gb']}GB")
        choices.append(questionary.Choice(title=label, value=i))

    selected_indices = questionary.checkbox(
        "ダウンロードする検体を選択してください（スペースで選択、Enterで決定）:",
        choices=choices,
    ).ask()

    if selected_indices is None:
        return []
    return [results[i] for i in selected_indices]


# ─────────────────────────────────────────────────────────
# ダウンロード
# ─────────────────────────────────────────────────────────

def check_sra_toolkit() -> bool:
    """prefetch コマンドが使えるか確認"""
    try:
        result = subprocess.run(["prefetch", "--version"],
                                capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return False


def download_with_prefetch(run_acc: str, outdir: Path) -> bool:
    """SRA Toolkit の prefetch + fasterq-dump を使用"""
    console.print(f"  [cyan]prefetch {run_acc}...[/cyan]")
    try:
        result = subprocess.run(
            ["prefetch", run_acc, "--output-directory", str(outdir)],
            capture_output=True, text=True, timeout=3600
        )
        if result.returncode != 0:
            console.print(f"  [red]prefetch 失敗: {result.stderr[:200]}[/red]")
            return False

        # SRA → FASTQ 変換
        sra_path = outdir / run_acc / f"{run_acc}.sra"
        if sra_path.exists():
            console.print(f"  [cyan]fasterq-dump {run_acc}...[/cyan]")
            result2 = subprocess.run(
                ["fasterq-dump", str(sra_path), "--outdir", str(outdir),
                 "--split-files", "--progress"],
                capture_output=True, text=True, timeout=3600
            )
            if result2.returncode == 0:
                # 中間 SRA ファイルを削除
                import shutil
                shutil.rmtree(outdir / run_acc, ignore_errors=True)
                return True

        return True

    except subprocess.TimeoutExpired:
        console.print(f"  [red]{run_acc}: タイムアウト[/red]")
        return False


def _ena_api_ftp_urls(run_acc: str) -> list:
    """ENA Portal API で run_acc の実際の FASTQ FTP URL リストを取得する。
    返値: https:// に変換済みの URL リスト。取得失敗時は空リスト。
    """
    api = ("https://www.ebi.ac.uk/ena/portal/api/filereport"
           f"?accession={run_acc}&result=read_run&fields=fastq_ftp&format=json")
    try:
        resp = requests.get(api, timeout=15)
        if resp.status_code == 200:
            data = resp.json()
            if data:
                ftp_field = data[0].get("fastq_ftp", "")
                if ftp_field:
                    return [f"https://{p.strip()}"
                            for p in ftp_field.split(";") if p.strip()]
    except Exception:
        pass
    return []


def download_via_ebi_ftp(run_acc: str, outdir: Path, log_fn=None, progress_fn=None) -> bool:
    """EBI FTP 経由で FASTQ をダウンロード（SRA Toolkit 不要）

    ENA Portal API でファイルパスを取得してからダウンロードする。
    log_fn:      GUI 等からログを受け取るコールバック (msg: str)。None なら rich console。
    progress_fn: ファイル別進捗コールバック (fname: str, downloaded_bytes: int, total_bytes: int)。
    """
    _log = log_fn if log_fn else (lambda msg: console.print(msg))

    # ① ENA API で実際の URL を取得
    urls = _ena_api_ftp_urls(run_acc)

    if not urls:
        _log(f"  ENA API: {run_acc} のFTPパスが見つかりません")
        return False

    success = False
    for url in urls:
        fname = url.split("/")[-1]
        dest = outdir / fname
        if dest.exists():
            _log(f"  {fname} は既存 — スキップ")
            success = True
            continue

        try:
            response = requests.head(url, timeout=10)
            if response.status_code != 200:
                _log(f"  HTTP {response.status_code}: {url}")
                continue

            size_mb = int(response.headers.get("content-length", 0)) / 1e6
            _log(f"  DL: {fname} ({size_mb:.1f} MB)")

            if log_fn:
                # GUI モード: シンプルダウンロード（rich Progress バーなし）
                total_bytes = int(response.headers.get("content-length", 0))
                downloaded = 0
                with requests.get(url, stream=True, timeout=600) as r:
                    r.raise_for_status()
                    with open(dest, "wb") as f:
                        for chunk in r.iter_content(chunk_size=65536):
                            f.write(chunk)
                            downloaded += len(chunk)
                            if progress_fn and total_bytes:
                                progress_fn(fname, downloaded, total_bytes)
            else:
                # CLI モード: rich Progress バーあり
                with Progress(
                    SpinnerColumn(),
                    TextColumn("[progress.description]{task.description}"),
                    BarColumn(),
                    TextColumn("{task.percentage:>3.0f}%"),
                    console=console,
                    transient=True,
                ) as progress:
                    task = progress.add_task(fname, total=int(size_mb))
                    with requests.get(url, stream=True, timeout=600) as r:
                        r.raise_for_status()
                        downloaded = 0
                        with open(dest, "wb") as f:
                            for chunk in r.iter_content(chunk_size=8192):
                                f.write(chunk)
                                downloaded += len(chunk)
                                progress.update(task, completed=downloaded / 1e6)

            _log(f"  ✓ {fname} 保存完了")
            success = True

        except Exception as e:
            _log(f"  {fname} エラー: {e}")

    return success


def download_selected(selected: list, outdir: Path,
                      use_sra_toolkit: bool) -> None:
    outdir.mkdir(parents=True, exist_ok=True)

    all_runs = []
    for r in selected:
        for run in r["runs"]:
            all_runs.append((run, r))

    console.print(Panel(
        f"[bold]ダウンロード開始[/bold]\n"
        f"対象 Run 数: {len(all_runs)}\n"
        f"出力先: {outdir}\n"
        f"方法: {'SRA Toolkit' if use_sra_toolkit else 'EBI FTP'}",
        style="bold green"
    ))

    success_list, fail_list = [], []

    for i, (run_acc, meta) in enumerate(all_runs, 1):
        console.rule(f"[{i}/{len(all_runs)}] {run_acc}")
        console.print(f"  Study : {meta['study_acc']}")
        console.print(f"  採取地: {meta['geo_loc']}")
        console.print(f"  由来  : {meta['isolation_source']}")

        run_dir = outdir / meta.get("study_acc", "unknown")
        run_dir.mkdir(parents=True, exist_ok=True)

        if use_sra_toolkit:
            ok = download_with_prefetch(run_acc, run_dir)
        else:
            ok = download_via_ebi_ftp(run_acc, run_dir)

        if ok:
            success_list.append(run_acc)
            console.print(f"  [green]✓ {run_acc} 完了[/green]")
        else:
            fail_list.append(run_acc)
            console.print(f"  [red]✗ {run_acc} 失敗[/red]")

    # サマリー
    console.print()
    console.print(Panel(
        f"[green]成功: {len(success_list)} / {len(all_runs)}[/green]\n" +
        (f"[red]失敗: {', '.join(fail_list)}[/red]" if fail_list else ""),
        title="ダウンロード完了",
        style="bold"
    ))

    # メタデータ保存
    meta_path = outdir / "download_metadata.json"
    with open(meta_path, "w", encoding="utf-8") as f:
        json.dump({
            "downloaded_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "success": success_list,
            "failed": fail_list,
            "entries": selected,
        }, f, ensure_ascii=False, indent=2)
    console.print(f"[dim]メタデータ保存: {meta_path}[/dim]")


# ─────────────────────────────────────────────────────────
# インタラクティブモード
# ─────────────────────────────────────────────────────────

def interactive_mode() -> dict:
    console.print(Panel(
        "[bold cyan]SeqHunter[/bold cyan] — NCBI / DDBJ 検体検索・収集ツール",
        subtitle="[dim]Ctrl+C で終了[/dim]",
        style="bold"
    ))

    # DB 選択
    db_choice = questionary.select(
        "検索するデータベース:",
        choices=["NCBI SRA", "DDBJ", "両方 (NCBI + DDBJ)"],
        default="両方 (NCBI + DDBJ)",
    ).ask()
    if db_choice is None:
        sys.exit(0)

    # 環境選択
    env_choice = questionary.select(
        "採取環境を選択:",
        choices=list(ENV_KEYWORDS.keys()),
    ).ask()
    if env_choice is None:
        sys.exit(0)

    env_terms = ENV_KEYWORDS[env_choice]
    if "__custom__" in env_terms:
        custom_env = questionary.text("環境キーワードを入力 (例: cave, glacier):").ask()
        env_terms = [custom_env] if custom_env else []

    # フォーマット選択
    fmt_choice = questionary.select(
        "シーケンスフォーマット / ターゲット:",
        choices=list(FORMAT_KEYWORDS.keys()),
    ).ask()
    if fmt_choice is None:
        sys.exit(0)

    fmt_terms = FORMAT_KEYWORDS[fmt_choice]
    if "__custom__" in fmt_terms:
        custom_fmt = questionary.text("フォーマットキーワードを入力:").ask()
        fmt_terms = [custom_fmt] if custom_fmt else []

    # シーケンス機器
    seq_choice = questionary.select(
        "シーケンス機器 (任意):",
        choices=list(SEQ_METHOD_KEYWORDS.keys()),
        default="指定なし",
    ).ask()

    # 国・地域
    country = questionary.text(
        "採取国・地域 (任意, 例: Japan, United States):").ask() or ""

    # 追加クエリ
    extra_query = questionary.text(
        "追加の検索キーワード (任意):").ask() or ""

    # 件数
    limit_str = questionary.text("最大取得件数 [50]:", default="50").ask()
    limit = int(limit_str) if limit_str and limit_str.isdigit() else 50

    # 出力ディレクトリ
    default_out = str(Path("c:/local_bioinfomatics_workspace/Research/Original_Data/downloaded"))
    outdir_str = questionary.text(
        f"ダウンロード先ディレクトリ [{default_out}]:",
        default=default_out,
    ).ask()
    outdir = Path(outdir_str or default_out)

    # メールアドレス (NCBI 必須)
    email = questionary.text(
        "NCBI 用メールアドレス (NCBI を使用する場合必須):",
        default="your_email@example.com",
    ).ask() or "your_email@example.com"

    seq_terms = SEQ_METHOD_KEYWORDS.get(seq_choice, [])
    all_terms = env_terms + fmt_terms + seq_terms

    return {
        "db": db_choice,
        "env_terms": env_terms,
        "fmt_terms": fmt_terms,
        "seq_terms": seq_terms,
        "all_terms": all_terms,
        "country": country,
        "extra_query": extra_query,
        "limit": limit,
        "outdir": outdir,
        "email": email,
    }


# ─────────────────────────────────────────────────────────
# メイン
# ─────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="NCBI SRA / DDBJ 検体検索・ダウンロードツール",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--db", choices=["ncbi", "ddbj", "both"], default=None)
    parser.add_argument("--env", help="環境キーワード (例: 'hot spring')")
    parser.add_argument("--format", dest="fmt", help="フォーマット (例: 16S)")
    parser.add_argument("--country", help="国・地域 (例: Japan)")
    parser.add_argument("--query", help="追加のカスタムクエリ")
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--outdir", default=None)
    parser.add_argument("--email", default="your_email@example.com")
    parser.add_argument("--no-interactive", action="store_true",
                        help="インタラクティブモードを無効化")
    parser.add_argument("--accessions", help="直接指定するアクセッション (カンマ区切り)")
    parser.add_argument("--use-sra-toolkit", action="store_true",
                        help="SRA Toolkit (prefetch) を使用 (デフォルト: EBI FTP)")
    args = parser.parse_args()

    # ─── 直接アクセッション指定モード ───
    if args.accessions:
        outdir = Path(args.outdir or "downloads")
        accs = [a.strip() for a in args.accessions.split(",")]
        selected = [{"db": "NCBI", "study_acc": a, "title": a,
                     "platform": "N/A", "runs": [a], "run_count": 1,
                     "spots": 0, "bases_gb": 0, "organism": "N/A",
                     "geo_loc": "N/A", "isolation_source": "N/A",
                     "biosample": "N/A"} for a in accs]
        has_toolkit = check_sra_toolkit()
        download_selected(selected, outdir, args.use_sra_toolkit and has_toolkit)
        return

    # ─── インタラクティブモード ───
    if not args.no_interactive:
        params = interactive_mode()
    else:
        env_terms = [args.env] if args.env else []
        fmt_terms = [args.fmt] if args.fmt else []
        params = {
            "db": args.db or "both",
            "env_terms": env_terms,
            "fmt_terms": fmt_terms,
            "seq_terms": [],
            "all_terms": env_terms + fmt_terms,
            "country": args.country or "",
            "extra_query": args.query or "",
            "limit": args.limit,
            "outdir": Path(args.outdir or "downloads"),
            "email": args.email,
        }

    # ─── 検索実行 ───
    all_results = []

    if params["db"] in ("NCBI SRA", "ncbi", "両方 (NCBI + DDBJ)", "both"):
        query = build_ncbi_query(
            params["env_terms"], params["fmt_terms"],
            params["country"], params["extra_query"]
        )
        console.print(f"\n[dim]NCBI クエリ: {query}[/dim]\n")
        ncbi_results = search_ncbi_sra(query, params["limit"], params["email"])
        all_results.extend(ncbi_results)
        console.print(f"[green]NCBI: {len(ncbi_results)} 件ヒット[/green]")

    if params["db"] in ("DDBJ", "ddbj", "両方 (NCBI + DDBJ)", "both"):
        ddbj_terms = (params["env_terms"] + params["fmt_terms"] +
                      ([params["country"]] if params["country"] else []))
        ddbj_results = search_ddbj(ddbj_terms, params["limit"])
        all_results.extend(ddbj_results)
        console.print(f"[green]DDBJ: {len(ddbj_results)} 件ヒット[/green]")

    if not all_results:
        console.print("[red]検索結果が0件でした。条件を変更して再試行してください。[/red]")
        return

    # ─── 結果表示 ───
    display_results_table(all_results)

    # ─── 選択 ───
    selected = interactive_select(all_results)
    if not selected:
        console.print("[yellow]選択なし — 終了します。[/yellow]")
        return

    console.print(f"\n[bold]{len(selected)} 件の Study を選択[/bold]")
    total_runs = sum(r["run_count"] for r in selected)
    total_gb = sum(r["bases_gb"] for r in selected)
    console.print(f"  Run 総数: {total_runs}")
    console.print(f"  推定合計: {total_gb:.2f} GB\n")

    confirm = questionary.confirm(
        f"{total_runs} Run をダウンロードしますか?", default=True).ask()
    if not confirm:
        console.print("[yellow]キャンセルしました。[/yellow]")
        return

    # ─── ダウンロード ───
    has_toolkit = check_sra_toolkit()
    use_toolkit = args.use_sra_toolkit and has_toolkit
    if args.use_sra_toolkit and not has_toolkit:
        console.print("[yellow]SRA Toolkit が見つかりません。EBI FTP にフォールバックします。[/yellow]")

    download_selected(selected, params["outdir"], use_toolkit)


if __name__ == "__main__":
    main()
