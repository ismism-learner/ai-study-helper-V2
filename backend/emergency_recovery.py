"""
紧急数据恢复工具
用法:
    python emergency_recovery.py --status    查看当前状态
    python emergency_recovery.py --list      列出所有备份
    python emergency_recovery.py --auto      自动恢复最佳备份
    python emergency_recovery.py --restore <文件名>  恢复指定备份
"""

import os
import sys
import shutil
import sqlite3
from datetime import datetime

BACKEND_DIR = os.path.dirname(os.path.abspath(__file__))
BACKUP_DIR = os.path.join(BACKEND_DIR, "backups")
DB_PATH = os.path.join(BACKEND_DIR, "interactive_docs.db")

os.makedirs(BACKUP_DIR, exist_ok=True)


def get_db_stats(db_path):
    if not os.path.exists(db_path):
        return {}
    
    stats = {}
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        
        tables = [
            "documents", "folders", "highlights", "book_documents",
            "document_timeline_events", "world_timeline_events",
            "countries", "categories", "time_periods"
        ]
        
        for table in tables:
            try:
                cursor.execute(f"SELECT COUNT(*) FROM {table}")
                stats[table] = cursor.fetchone()[0]
            except:
                stats[table] = 0
        
        conn.close()
    except Exception as e:
        print(f"获取数据库统计失败: {e}")
    
    return stats


def list_backups():
    print("\n" + "=" * 60)
    print("可用的备份文件:")
    print("=" * 60)
    
    backups = []
    
    if os.path.exists(BACKUP_DIR):
        for f in os.listdir(BACKUP_DIR):
            if f.endswith(".db"):
                path = os.path.join(BACKUP_DIR, f)
                stats = get_db_stats(path)
                mtime = datetime.fromtimestamp(os.path.getmtime(path))
                backups.append({
                    "name": f,
                    "path": path,
                    "mtime": mtime,
                    "stats": stats,
                    "source": "backups目录"
                })
    
    for f in os.listdir(BACKEND_DIR):
        if f.endswith(".old") or f.endswith(".backup"):
            if f.startswith("interactive_docs"):
                path = os.path.join(BACKEND_DIR, f)
                stats = get_db_stats(path)
                mtime = datetime.fromtimestamp(os.path.getmtime(path))
                backups.append({
                    "name": f,
                    "path": path,
                    "mtime": mtime,
                    "stats": stats,
                    "source": "backend目录"
                })
    
    if not backups:
        print("没有找到任何备份文件!")
        return []
    
    backups.sort(key=lambda x: x["mtime"], reverse=True)
    
    for i, backup in enumerate(backups):
        print(f"\n[{i+1}] {backup['name']}")
        print(f"    来源: {backup['source']}")
        print(f"    时间: {backup['mtime'].strftime('%Y-%m-%d %H:%M:%S')}")
        print(f"    统计:")
        for table, count in backup["stats"].items():
            if count > 0:
                print(f"      - {table}: {count}")
    
    return backups


def show_current_status():
    print("\n" + "=" * 60)
    print("当前数据库状态:")
    print("=" * 60)
    
    if not os.path.exists(DB_PATH):
        print("数据库文件不存在!")
        return None
    
    stats = get_db_stats(DB_PATH)
    print(f"文件: {DB_PATH}")
    print(f"修改时间: {datetime.fromtimestamp(os.path.getmtime(DB_PATH)).strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"统计:")
    
    total_items = 0
    for table, count in stats.items():
        print(f"  - {table}: {count}")
        total_items += count
    
    print(f"\n总记录数: {total_items}")
    return stats


def restore_backup(backup_path, backup_name):
    print("\n" + "=" * 60)
    print(f"正在恢复备份: {backup_name}")
    print("=" * 60)
    
    if not os.path.exists(backup_path):
        print(f"错误: 备份文件不存在: {backup_path}")
        return False
    
    backup_stats = get_db_stats(backup_path)
    print(f"备份内容:")
    for table, count in backup_stats.items():
        if count > 0:
            print(f"  - {table}: {count}")
    
    if os.path.exists(DB_PATH):
        pre_restore_backup = os.path.join(
            BACKUP_DIR, 
            f"pre_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}.db"
        )
        shutil.copy2(DB_PATH, pre_restore_backup)
        print(f"\n已创建恢复前备份: {pre_restore_backup}")
    
    try:
        shutil.copy2(backup_path, DB_PATH)
        print(f"\n恢复成功!")
        
        restored_stats = get_db_stats(DB_PATH)
        print(f"恢复后统计:")
        for table, count in restored_stats.items():
            print(f"  - {table}: {count}")
        
        return True
    except Exception as e:
        print(f"恢复失败: {e}")
        return False


def auto_recovery():
    print("\n" + "=" * 60)
    print("自动紧急恢复")
    print("=" * 60)
    
    current_stats = get_db_stats(DB_PATH)
    current_score = (
        current_stats.get("documents", 0) +
        current_stats.get("book_documents", 0) * 2 +
        current_stats.get("document_timeline_events", 0) * 0.5
    )
    
    print(f"当前数据评分: {current_score:.1f}")
    
    backups = list_backups()
    if not backups:
        print("\n没有可用的备份文件!")
        return False
    
    best_backup = None
    best_score = -1
    
    for backup in backups:
        score = (
            backup["stats"].get("documents", 0) +
            backup["stats"].get("book_documents", 0) * 2 +
            backup["stats"].get("document_timeline_events", 0) * 0.5
        )
        if score > best_score:
            best_score = score
            best_backup = backup
    
    if best_backup:
        print(f"\n最佳备份: {best_backup['name']}")
        print(f"备份数据评分: {best_score:.1f}")
        
        if best_score > current_score * 1.2:
            print("\n备份数据明显优于当前数据，建议恢复!")
            response = input("是否恢复此备份? (y/n): ")
            if response.lower() == 'y':
                return restore_backup(best_backup["path"], best_backup["name"])
            else:
                print("已取消恢复")
                return False
        else:
            print("\n当前数据与最佳备份差异不大，无需恢复")
            return True
    
    return False


def main():
    import argparse
    
    parser = argparse.ArgumentParser(description="紧急数据恢复工具")
    parser.add_argument("--list", action="store_true", help="列出所有可用备份")
    parser.add_argument("--restore", type=str, help="恢复指定的备份文件")
    parser.add_argument("--auto", action="store_true", help="自动选择最佳备份恢复")
    parser.add_argument("--status", action="store_true", help="显示当前数据库状态")
    
    args = parser.parse_args()
    
    if args.list:
        list_backups()
    elif args.restore:
        backup_path = None
        for search_dir in [BACKUP_DIR, BACKEND_DIR]:
            test_path = os.path.join(search_dir, args.restore)
            if os.path.exists(test_path):
                backup_path = test_path
                break
        
        if backup_path:
            restore_backup(backup_path, args.restore)
        else:
            print(f"找不到备份文件: {args.restore}")
            print("可用的备份:")
            list_backups()
    elif args.auto:
        auto_recovery()
    elif args.status:
        show_current_status()
    else:
        show_current_status()
        list_backups()
        
        print("\n" + "=" * 60)
        print("使用说明:")
        print("  python emergency_recovery.py --status    查看当前状态")
        print("  python emergency_recovery.py --list      列出所有备份")
        print("  python emergency_recovery.py --auto      自动恢复最佳备份")
        print("  python emergency_recovery.py --restore <文件名>  恢复指定备份")
        print("=" * 60)


if __name__ == "__main__":
    main()
