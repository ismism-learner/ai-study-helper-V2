import json
import os
import shutil
import subprocess
from pathlib import Path
from typing import Optional, Tuple


class QuarkConfig:
    def __init__(self):
        self.config_dir = Path(__file__).parent.parent.parent / "quark_config"
        self.config_file = self.config_dir / "config.json"
        self.config_dir.mkdir(parents=True, exist_ok=True)

    def get_config(self) -> dict:
        if self.config_file.exists():
            try:
                with open(self.config_file, encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                pass
        return {"Quark": {"access_tokens": []}}

    def save_config(self, config: dict):
        with open(self.config_file, "w", encoding="utf-8") as f:
            json.dump(config, f, indent=2, ensure_ascii=False)

    def set_cookie(self, cookie: str):
        config = self.get_config()
        config["Quark"]["access_tokens"] = [cookie]
        self.save_config(config)

    def get_cookie(self) -> str | None:
        config = self.get_config()
        tokens = config.get("Quark", {}).get("access_tokens", [])
        return tokens[0] if tokens else None

    def has_cookie(self) -> bool:
        return bool(self.get_cookie())

    def clear_cookie(self):
        self.set_cookie("")
        return True


class QuarkService:
    def __init__(self):
        self.config = QuarkConfig()
        self.cli_path = self._find_cli()

    def _find_cli(self) -> str | None:
        possible_names = [
            "kuake.exe",
            "kuake",
            "kuake-cli.exe",
            "kuake-cli",
        ]

        cli_dir = Path(__file__).parent.parent.parent / "tools"
        if cli_dir.exists():
            for name in possible_names:
                cli_path = cli_dir / name
                if cli_path.exists():
                    return str(cli_path)

        for name in possible_names:
            if shutil.which(name):
                return name

        return None

    def is_available(self) -> bool:
        return self.cli_path is not None

    def _run_command(self, args: list, timeout: int = 300) -> tuple[bool, str, str]:
        if not self.cli_path:
            return False, "", "Quake CLI not found. Please download it first."

        config_path = str(self.config.config_file)

        cmd = [self.cli_path, "-c", config_path] + args

        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                encoding="utf-8",
                errors="replace",
            )
            return result.returncode == 0, result.stdout, result.stderr
        except subprocess.TimeoutExpired:
            return False, "", "Command timed out"
        except Exception as e:
            return False, "", str(e)

    def test_connection(self) -> tuple[bool, str]:
        success, stdout, stderr = self._run_command(["user"])
        if success:
            return True, stdout
        return False, stderr or "Connection failed"

    def upload_file(
        self, local_path: str, remote_path: str, parallel: int = 4
    ) -> tuple[bool, dict]:
        if not os.path.exists(local_path):
            return False, {"error": "Local file not found"}

        args = [
            "upload",
            local_path,
            remote_path,
            "--max_upload_parallel",
            str(parallel),
        ]

        success, stdout, stderr = self._run_command(args, timeout=600)

        result = {
            "stdout": stdout,
            "stderr": stderr,
            "file_id": None,
            "file_path": remote_path,
        }

        if success:
            try:
                for line in stdout.split("\n"):
                    line = line.strip()
                    if line.startswith("{") or line.startswith("["):
                        try:
                            data = json.loads(line)
                            if isinstance(data, dict):
                                if "fid" in data:
                                    result["file_id"] = data["fid"]
                                elif "data" in data and isinstance(data["data"], dict):
                                    result["file_id"] = data["data"].get("fid")
                            elif isinstance(data, list) and len(data) > 0:
                                result["file_id"] = data[0].get("fid")
                        except json.JSONDecodeError:
                            pass
            except Exception:
                pass

        return success, result

    def create_share_link(
        self, file_path: str, expire_days: int = 0, password: str | None = None
    ) -> tuple[bool, dict]:
        passcode = password if password else "false"
        args = ["share", file_path, str(expire_days), passcode]

        success, stdout, stderr = self._run_command(args)

        result = {
            "stdout": stdout,
            "stderr": stderr,
            "share_url": None,
            "password": password,
        }

        if success:
            try:
                for line in stdout.split("\n"):
                    line = line.strip()
                    if line.startswith("{"):
                        try:
                            data = json.loads(line)
                            if "data" in data:
                                share_data = data["data"]
                                share_url = share_data.get("share_url")
                                if share_url:
                                    result["share_url"] = share_url.strip('"').strip(
                                        "'"
                                    )
                                if share_data.get("passcode"):
                                    result["password"] = share_data.get("passcode")
                            elif "share_url" in data:
                                share_url = data["share_url"]
                                if share_url:
                                    result["share_url"] = share_url.strip('"').strip(
                                        "'"
                                    )
                                if data.get("passcode"):
                                    result["password"] = data.get("passcode")
                        except json.JSONDecodeError:
                            pass
            except Exception:
                pass

            if not result["share_url"]:
                url_patterns = ["https://pan.quark.cn/s/", "http://pan.quark.cn/s/"]
                for pattern in url_patterns:
                    if pattern in stdout:
                        start = stdout.find(pattern)
                        end = stdout.find("\n", start)
                        if end == -1:
                            end = len(stdout)
                        share_url = stdout[start:end].strip()
                        result["share_url"] = share_url.strip('"').strip("'")
                        break

        return success, result

    def ensure_remote_folder(self, folder_path: str) -> tuple[bool, str]:
        parts = [p for p in folder_path.split("/") if p]

        current_path = "/"
        for part in parts:
            check_path = f"{current_path}/{part}".replace("//", "/")
            success, stdout, stderr = self._run_command(["info", check_path])

            if not success:
                success, _, _ = self._run_command(["create", part, current_path or "/"])
                if not success:
                    return False, current_path

            current_path = check_path

        return True, current_path


quark_config = QuarkConfig()
quark_service = QuarkService()
