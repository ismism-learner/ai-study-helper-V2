import json
import logging
import os
import shutil
import sqlite3
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

BACKUP_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "backups"
)
DB_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "interactive_docs.db"
)
DATA_BACKUP_PATH = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data_backup.json"
)

MAX_BACKUPS = 20
MIN_DOCUMENTS_WARNING = 10

os.makedirs(BACKUP_DIR, exist_ok=True)


class BackupService:
    def __init__(self):
        self._scheduler_thread = None
        self._running = False

    def create_backup(self, reason: str = "manual") -> dict[str, Any]:
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_name = f"interactive_docs_{timestamp}_{reason}.db"
        backup_path = os.path.join(BACKUP_DIR, backup_name)

        result = {
            "success": False,
            "backup_path": None,
            "timestamp": timestamp,
            "reason": reason,
            "stats": {},
            "error": None,
        }

        try:
            if os.path.exists(DB_PATH):
                shutil.copy2(DB_PATH, backup_path)
                result["backup_path"] = backup_path

                stats = self._get_db_stats(DB_PATH)
                result["stats"] = stats

                self._cleanup_old_backups()

                self._save_backup_manifest(backup_name, reason, stats)

                result["success"] = True
                logger.info(f"Backup created: {backup_name}, stats: {stats}")
            else:
                result["error"] = "Database file not found"
                logger.error(f"Database file not found: {DB_PATH}")

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Failed to create backup: {e}")

        return result

    def _get_db_stats(self, db_path: str) -> dict[str, int]:
        stats = {}
        try:
            conn = sqlite3.connect(db_path)
            cursor = conn.cursor()

            tables = [
                "documents",
                "folders",
                "highlights",
                "book_documents",
                "document_timeline_events",
                "world_timeline_events",
                "countries",
                "categories",
                "time_periods",
                "book_time_periods",
            ]

            for table in tables:
                try:
                    cursor.execute(f"SELECT COUNT(*) FROM {table}")
                    stats[table] = cursor.fetchone()[0]
                except Exception:
                    stats[table] = 0

            conn.close()
        except Exception as e:
            logger.error(f"Failed to get DB stats: {e}")

        return stats

    def _cleanup_old_backups(self):
        try:
            backups = []
            for f in os.listdir(BACKUP_DIR):
                if f.startswith("interactive_docs_") and f.endswith(".db"):
                    path = os.path.join(BACKUP_DIR, f)
                    backups.append((path, os.path.getmtime(path)))

            backups.sort(key=lambda x: x[1], reverse=True)

            for backup_path, _ in backups[MAX_BACKUPS:]:
                os.remove(backup_path)
                logger.info(f"Removed old backup: {backup_path}")

        except Exception as e:
            logger.error(f"Failed to cleanup old backups: {e}")

    def _save_backup_manifest(
        self, backup_name: str, reason: str, stats: dict[str, int]
    ):
        manifest_path = os.path.join(BACKUP_DIR, "backup_manifest.json")

        manifest = {"backups": []}
        if os.path.exists(manifest_path):
            try:
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = json.load(f)
            except Exception:
                pass

        manifest["backups"].append(
            {
                "name": backup_name,
                "reason": reason,
                "timestamp": datetime.now().isoformat(),
                "stats": stats,
            }
        )

        manifest["backups"] = manifest["backups"][-MAX_BACKUPS:]

        with open(manifest_path, "w", encoding="utf-8") as f:
            json.dump(manifest, f, ensure_ascii=False, indent=2)

    def list_backups(self) -> list[dict[str, Any]]:
        backups = []

        try:
            manifest_path = os.path.join(BACKUP_DIR, "backup_manifest.json")
            if os.path.exists(manifest_path):
                with open(manifest_path, encoding="utf-8") as f:
                    manifest = json.load(f)
                    backups = manifest.get("backups", [])

            for f in os.listdir(BACKUP_DIR):
                if f.startswith("interactive_docs_") and f.endswith(".db"):
                    path = os.path.join(BACKUP_DIR, f)

                    existing = next((b for b in backups if b["name"] == f), None)
                    if not existing:
                        stats = self._get_db_stats(path)
                        backups.append(
                            {
                                "name": f,
                                "path": path,
                                "reason": "unknown",
                                "timestamp": datetime.fromtimestamp(
                                    os.path.getmtime(path)
                                ).isoformat(),
                                "stats": stats,
                            }
                        )

            backups.sort(key=lambda x: x.get("timestamp", ""), reverse=True)

        except Exception as e:
            logger.error(f"Failed to list backups: {e}")

        return backups

    def restore_backup(self, backup_name: str) -> dict[str, Any]:
        backup_path = os.path.join(BACKUP_DIR, backup_name)

        result = {
            "success": False,
            "backup_name": backup_name,
            "restored_stats": {},
            "previous_stats": {},
            "error": None,
        }

        try:
            if not os.path.exists(backup_path):
                result["error"] = f"Backup file not found: {backup_name}"
                return result

            result["previous_stats"] = self._get_db_stats(DB_PATH)

            pre_restore_backup = self.create_backup("pre_restore")
            logger.info(f"Created pre-restore backup: {pre_restore_backup}")

            shutil.copy2(backup_path, DB_PATH)

            result["restored_stats"] = self._get_db_stats(DB_PATH)
            result["success"] = True

            logger.info(
                f"Restored backup: {backup_name}, stats: {result['restored_stats']}"
            )

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Failed to restore backup: {e}")

        return result

    def check_data_integrity(self) -> dict[str, Any]:
        result = {
            "healthy": True,
            "current_stats": {},
            "warnings": [],
            "recommendations": [],
        }

        try:
            result["current_stats"] = self._get_db_stats(DB_PATH)

            docs_count = result["current_stats"].get("documents", 0)
            books_count = result["current_stats"].get("book_documents", 0)

            if docs_count < MIN_DOCUMENTS_WARNING:
                result["warnings"].append(
                    f"文档数量较少 ({docs_count})，可能存在数据丢失"
                )
                result["recommendations"].append("建议检查最近的备份并考虑恢复")
                result["healthy"] = False

            if books_count < MIN_DOCUMENTS_WARNING:
                result["warnings"].append(
                    f"书籍数量较少 ({books_count})，可能存在数据丢失"
                )
                result["recommendations"].append("建议检查最近的备份并考虑恢复")
                result["healthy"] = False

            backups = self.list_backups()
            if backups:
                latest_backup = backups[0]
                backup_docs = latest_backup.get("stats", {}).get("documents", 0)
                backup_books = latest_backup.get("stats", {}).get("book_documents", 0)

                if backup_docs > docs_count + 5:
                    result["warnings"].append(
                        f"最新备份中有 {backup_docs} 个文档，当前只有 {docs_count} 个"
                    )
                    result["recommendations"].append(
                        f"建议从备份 {latest_backup['name']} 恢复"
                    )
                    result["healthy"] = False

                if backup_books > books_count + 5:
                    result["warnings"].append(
                        f"最新备份中有 {backup_books} 个书籍，当前只有 {books_count} 个"
                    )
                    result["healthy"] = False

            if not backups:
                result["warnings"].append("没有找到任何备份文件")
                result["recommendations"].append("建议立即创建备份")

        except Exception as e:
            result["healthy"] = False
            result["warnings"].append(f"数据完整性检查失败: {str(e)}")

        return result

    def emergency_recovery(self) -> dict[str, Any]:
        result = {"success": False, "action": None, "details": {}, "error": None}

        try:
            integrity = self.check_data_integrity()

            if integrity["healthy"]:
                result["success"] = True
                result["action"] = "no_action_needed"
                result["details"] = integrity
                return result

            backups = self.list_backups()
            if not backups:
                result["error"] = "没有可用的备份文件"
                return result

            current_stats = integrity["current_stats"]

            best_backup = None
            best_score = -1

            for backup in backups:
                backup_stats = backup.get("stats", {})
                score = (
                    backup_stats.get("documents", 0)
                    + backup_stats.get("book_documents", 0) * 2
                    + backup_stats.get("document_timeline_events", 0) * 0.5
                )

                if score > best_score:
                    best_score = score
                    best_backup = backup

            if best_backup:
                current_score = (
                    current_stats.get("documents", 0)
                    + current_stats.get("book_documents", 0) * 2
                    + current_stats.get("document_timeline_events", 0) * 0.5
                )

                if best_score > current_score * 1.5:
                    restore_result = self.restore_backup(best_backup["name"])
                    result["success"] = restore_result["success"]
                    result["action"] = "restored"
                    result["details"] = {
                        "backup_used": best_backup["name"],
                        "previous_stats": restore_result["previous_stats"],
                        "restored_stats": restore_result["restored_stats"],
                    }
                else:
                    result["success"] = True
                    result["action"] = "current_data_acceptable"
                    result["details"] = integrity
            else:
                result["error"] = "无法找到合适的备份"

        except Exception as e:
            result["error"] = str(e)
            logger.error(f"Emergency recovery failed: {e}")

        return result

    def start_scheduled_backups(self, interval_hours: int = 6):
        if self._running:
            return

        self._interval_seconds = interval_hours * 3600
        self._running = True

        def run_scheduler():
            while self._running:
                time.sleep(self._interval_seconds)
                if self._running:
                    self._scheduled_backup()

        self._scheduler_thread = threading.Thread(target=run_scheduler, daemon=True)
        self._scheduler_thread.start()

        logger.info(f"Scheduled backups started (every {interval_hours} hours)")

    def stop_scheduled_backups(self):
        self._running = False
        logger.info("Scheduled backups stopped")

    def _scheduled_backup(self):
        logger.info("Running scheduled backup...")
        result = self.create_backup("scheduled")
        if result["success"]:
            logger.info(f"Scheduled backup completed: {result['backup_path']}")
        else:
            logger.error(f"Scheduled backup failed: {result['error']}")


backup_service = BackupService()
