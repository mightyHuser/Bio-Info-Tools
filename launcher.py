import json
import subprocess
import sys
import threading
import webbrowser
from pathlib import Path

import customtkinter as ctk

BASE_DIR = Path(__file__).parent


def load_tools():
    with open(BASE_DIR / "tools.json", encoding="utf-8") as f:
        return json.load(f)


def launch_gui(cmd: str):
    subprocess.Popen([sys.executable, BASE_DIR / cmd])


def launch_web(cmd: str, port: int):
    work_dir = BASE_DIR / cmd

    def _run():
        subprocess.Popen(
            ["npm", "run", "dev"],
            cwd=work_dir,
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )

    threading.Thread(target=_run, daemon=True).start()
    import time
    time.sleep(3)
    webbrowser.open(f"http://localhost:{port}")


class App(ctk.CTk):
    def __init__(self):
        super().__init__()
        self.title("Bio-Info-Tools Launcher")
        self.geometry("480x400")
        self.resizable(False, False)
        ctk.set_appearance_mode("dark")
        ctk.set_default_color_theme("blue")

        ctk.CTkLabel(
            self, text="🧬  Bio-Info-Tools", font=ctk.CTkFont(size=20, weight="bold")
        ).pack(pady=(24, 4))
        ctk.CTkLabel(self, text="ツールを選択して起動", text_color="gray").pack(pady=(0, 20))

        tools = load_tools()
        for tool in tools:
            self._add_tool_card(tool)

    def _add_tool_card(self, tool: dict):
        frame = ctk.CTkFrame(self, corner_radius=8)
        frame.pack(fill="x", padx=24, pady=6)

        left = ctk.CTkFrame(frame, fg_color="transparent")
        left.pack(side="left", fill="both", expand=True, padx=12, pady=10)

        ctk.CTkLabel(
            left,
            text=f"{tool['icon']}  {tool['name']}",
            font=ctk.CTkFont(weight="bold"),
            anchor="w",
        ).pack(anchor="w")
        version = tool.get("version", "")
        desc_ver = f"{tool['desc']}  •  v{version}" if version else tool["desc"]
        ctk.CTkLabel(
            left,
            text=desc_ver,
            text_color="gray",
            font=ctk.CTkFont(size=11),
            anchor="w",
        ).pack(anchor="w")

        tag = "GUI" if tool["type"] == "gui" else "Web"
        ctk.CTkLabel(
            frame,
            text=tag,
            fg_color=("#1a3a1a" if tool["type"] == "gui" else "#1a2a3a"),
            corner_radius=4,
            width=40,
            font=ctk.CTkFont(size=11),
        ).pack(side="right", padx=8)

        ctk.CTkButton(
            frame,
            text="起動",
            width=60,
            command=lambda t=tool: self._on_launch(t),
        ).pack(side="right", padx=4, pady=10)

    def _on_launch(self, tool: dict):
        if tool["type"] == "gui":
            launch_gui(tool["cmd"])
        else:
            threading.Thread(
                target=launch_web,
                args=(tool["cmd"], tool.get("port", 3000)),
                daemon=True,
            ).start()


if __name__ == "__main__":
    App().mainloop()
