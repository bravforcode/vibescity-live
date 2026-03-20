#!/usr/bin/env python3
"""
Automated Backup System for VibeCity DevOps Configuration and Metrics
Provides automated backup, rotation, and restoration capabilities
"""

import json
import shutil
import sqlite3
import subprocess
import gzip
import hashlib
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, asdict
import logging
import schedule
import time

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

@dataclass
class BackupConfig:
    """Configuration for automated backup system"""
    backup_interval_hours: int = 6
    retention_days: int = 30
    compression_enabled: bool = True
    encryption_enabled: bool = False
    backup_locations: List[str] = None
    max_backup_size_mb: int = 1000
    
    def __post_init__(self):
        if self.backup_locations is None:
            self.backup_locations = ["local"]

@dataclass
class BackupMetadata:
    """Metadata for backup files"""
    backup_id: str
    timestamp: datetime
    backup_type: str  # "configuration", "metrics", "full"
    file_count: int
    total_size_mb: float
    checksum: str
    compressed: bool
    encrypted: bool
    location: str
    description: str = ""

class AutomatedBackupSystem:
    """Comprehensive automated backup system"""
    
    def __init__(self, project_root: str):
        self.project_root = Path(project_root)
        self.config = self.load_backup_config()
        self.backup_dir = self.project_root / ".agent" / "backups"
        self.backup_dir.mkdir(exist_ok=True)
        
        # Initialize backup database
        self.db_path = self.backup_dir / "backup_registry.db"
        self.init_backup_database()
        
        # Define backup sources
        self.backup_sources = {
            "configuration": [
                self.project_root / ".agent" / "config",
                self.project_root / ".github" / "workflows",
                self.project_root / "CLAUDE.md",
                self.project_root / "AGENTS.md"
            ],
            "metrics": [
                self.project_root / ".agent" / "metrics",
                self.project_root / ".agent" / "reports",
                self.project_root / ".agent" / "alerts"
            ],
            "logs": [
                self.project_root / ".agent" / "logs"
            ],
            "scripts": [
                self.project_root / ".agent" / "scripts"
            ]
        }
    
    def load_backup_config(self) -> BackupConfig:
        """Load backup configuration"""
        config_file = self.project_root / ".agent" / "config" / "backup_config.json"
        
        default_config = BackupConfig()
        
        if config_file.exists():
            try:
                with open(config_file, 'r') as f:
                    config_data = json.load(f)
                return BackupConfig(**config_data)
            except Exception as e:
                logger.warning(f"Failed to load backup config, using defaults: {e}")
        
        return default_config
    
    def save_backup_config(self) -> bool:
        """Save backup configuration"""
        try:
            config_file = self.project_root / ".agent" / "config" / "backup_config.json"
            config_file.parent.mkdir(exist_ok=True)
            
            with open(config_file, 'w') as f:
                json.dump(asdict(self.config), f, indent=2)
            
            return True
        except Exception as e:
            logger.error(f"Failed to save backup config: {e}")
            return False
    
    def init_backup_database(self) -> None:
        """Initialize backup registry database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS backups (
                        backup_id TEXT PRIMARY KEY,
                        timestamp TEXT NOT NULL,
                        backup_type TEXT NOT NULL,
                        file_count INTEGER NOT NULL,
                        total_size_mb REAL NOT NULL,
                        checksum TEXT NOT NULL,
                        compressed BOOLEAN NOT NULL,
                        encrypted BOOLEAN NOT NULL,
                        location TEXT NOT NULL,
                        description TEXT,
                        created_at TEXT DEFAULT CURRENT_TIMESTAMP
                    )
                ''')
                
                conn.execute('''
                    CREATE TABLE IF NOT EXISTS backup_files (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        backup_id TEXT NOT NULL,
                        file_path TEXT NOT NULL,
                        relative_path TEXT NOT NULL,
                        file_size INTEGER NOT NULL,
                        file_checksum TEXT NOT NULL,
                        FOREIGN KEY (backup_id) REFERENCES backups (backup_id)
                    )
                ''')
                
                conn.commit()
                
        except Exception as e:
            logger.error(f"Failed to initialize backup database: {e}")
            raise
    
    def calculate_checksum(self, file_path: Path) -> str:
        """Calculate SHA-256 checksum for file"""
        hash_sha256 = hashlib.sha256()
        
        try:
            with open(file_path, 'rb') as f:
                for chunk in iter(lambda: f.read(4096), b""):
                    hash_sha256.update(chunk)
            return hash_sha256.hexdigest()
        except Exception as e:
            logger.error(f"Failed to calculate checksum for {file_path}: {e}")
            return ""
    
    def collect_files_for_backup(self, backup_type: str) -> List[Path]:
        """Collect all files for backup based on type"""
        files = []
        
        if backup_type == "full":
            # Include all sources
            sources = []
            for source_list in self.backup_sources.values():
                sources.extend(source_list)
        elif backup_type in self.backup_sources:
            sources = self.backup_sources[backup_type]
        else:
            logger.error(f"Unknown backup type: {backup_type}")
            return files
        
        for source in sources:
            if source.exists():
                if source.is_file():
                    files.append(source)
                elif source.is_dir():
                    files.extend(source.rglob('*'))
        
        # Filter only files (exclude directories)
        files = [f for f in files if f.is_file()]
        
        # Exclude temporary and cache files
        excluded_patterns = [
            '*.tmp', '*.temp', '*.cache', '*.log.*', '*.pyc',
            '__pycache__', '.DS_Store', 'Thumbs.db'
        ]
        
        filtered_files = []
        for file in files:
            should_exclude = False
            for pattern in excluded_patterns:
                if file.match(pattern):
                    should_exclude = True
                    break
            if not should_exclude:
                filtered_files.append(file)
        
        return filtered_files
    
    def create_backup_archive(self, files: List[Path], backup_id: str, backup_type: str) -> Path:
        """Create backup archive from files"""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        archive_name = f"{backup_type}_backup_{timestamp}_{backup_id}"
        
        if self.config.compression_enabled:
            archive_path = self.backup_dir / f"{archive_name}.tar.gz"
        else:
            archive_path = self.backup_dir / f"{archive_name}.tar"
        
        try:
            # Create tar archive
            import tarfile
            
            mode = 'w:gz' if self.config.compression_enabled else 'w'
            
            with tarfile.open(archive_path, mode) as tar:
                for file in files:
                    try:
                        # Calculate relative path from project root
                        relative_path = file.relative_to(self.project_root)
                        tar.add(file, arcname=relative_path)
                    except Exception as e:
                        logger.warning(f"Failed to add {file} to archive: {e}")
            
            return archive_path
            
        except Exception as e:
            logger.error(f"Failed to create backup archive: {e}")
            raise
    
    def calculate_archive_size(self, archive_path: Path) -> float:
        """Calculate archive size in MB"""
        try:
            size_bytes = archive_path.stat().st_size
            return size_bytes / (1024 * 1024)  # Convert to MB
        except Exception as e:
            logger.error(f"Failed to calculate archive size: {e}")
            return 0.0
    
    def register_backup(self, metadata: BackupMetadata) -> bool:
        """Register backup in database"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Insert backup metadata
                conn.execute('''
                    INSERT INTO backups 
                    (backup_id, timestamp, backup_type, file_count, total_size_mb, 
                     checksum, compressed, encrypted, location, description)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                ''', (
                    metadata.backup_id,
                    metadata.timestamp.isoformat(),
                    metadata.backup_type,
                    metadata.file_count,
                    metadata.total_size_mb,
                    metadata.checksum,
                    metadata.compressed,
                    metadata.encrypted,
                    metadata.location,
                    metadata.description
                ))
                
                conn.commit()
            
            return True
            
        except Exception as e:
            logger.error(f"Failed to register backup: {e}")
            return False
    
    def perform_backup(self, backup_type: str = "full", description: str = "") -> Optional[str]:
        """Perform backup operation"""
        logger.info(f"Starting {backup_type} backup...")
        
        try:
            # Generate backup ID
            backup_id = hashlib.md5(f"{backup_type}_{datetime.now().isoformat()}".encode()).hexdigest()[:8]
            
            # Collect files
            files = self.collect_files_for_backup(backup_type)
            
            if not files:
                logger.warning("No files found for backup")
                return None
            
            logger.info(f"Collected {len(files)} files for backup")
            
            # Create backup archive
            archive_path = self.create_backup_archive(files, backup_id, backup_type)
            
            # Calculate metadata
            archive_size = self.calculate_archive_size(archive_path)
            archive_checksum = self.calculate_checksum(archive_path)
            
            metadata = BackupMetadata(
                backup_id=backup_id,
                timestamp=datetime.now(),
                backup_type=backup_type,
                file_count=len(files),
                total_size_mb=archive_size,
                checksum=archive_checksum,
                compressed=self.config.compression_enabled,
                encrypted=self.config.encryption_enabled,
                location=str(archive_path),
                description=description
            )
            
            # Register backup
            if self.register_backup(metadata):
                logger.info(f"Backup completed successfully: {archive_path}")
                return backup_id
            else:
                logger.error("Failed to register backup")
                # Clean up archive if registration failed
                if archive_path.exists():
                    archive_path.unlink()
                return None
                
        except Exception as e:
            logger.error(f"Backup failed: {e}")
            return None
    
    def cleanup_old_backups(self) -> int:
        """Clean up old backups based on retention policy"""
        logger.info("Starting backup cleanup...")
        
        try:
            cutoff_date = datetime.now() - timedelta(days=self.config.retention_days)
            
            with sqlite3.connect(self.db_path) as conn:
                # Find old backups
                cursor = conn.execute('''
                    SELECT backup_id, location FROM backups 
                    WHERE timestamp < ? 
                    ORDER BY timestamp ASC
                ''', (cutoff_date.isoformat(),))
                
                old_backups = cursor.fetchall()
                
                cleaned_count = 0
                for backup_id, location in old_backups:
                    try:
                        # Delete archive file
                        archive_path = Path(location)
                        if archive_path.exists():
                            archive_path.unlink()
                        
                        # Delete from database
                        conn.execute('DELETE FROM backups WHERE backup_id = ?', (backup_id,))
                        conn.execute('DELETE FROM backup_files WHERE backup_id = ?', (backup_id,))
                        
                        cleaned_count += 1
                        logger.info(f"Deleted old backup: {backup_id}")
                        
                    except Exception as e:
                        logger.warning(f"Failed to delete backup {backup_id}: {e}")
                
                conn.commit()
                
                logger.info(f"Cleanup completed. Deleted {cleaned_count} old backups.")
                return cleaned_count
                
        except Exception as e:
            logger.error(f"Backup cleanup failed: {e}")
            return 0
    
    def list_backups(self, backup_type: Optional[str] = None, limit: int = 50) -> List[Dict[str, Any]]:
        """List available backups"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                query = '''
                    SELECT backup_id, timestamp, backup_type, file_count, total_size_mb,
                           compressed, encrypted, location, description
                    FROM backups
                '''
                params = []
                
                if backup_type:
                    query += ' WHERE backup_type = ?'
                    params.append(backup_type)
                
                query += ' ORDER BY timestamp DESC LIMIT ?'
                params.append(limit)
                
                cursor = conn.execute(query, params)
                columns = [desc[0] for desc in cursor.description]
                
                backups = []
                for row in cursor.fetchall():
                    backup = dict(zip(columns, row))
                    backups.append(backup)
                
                return backups
                
        except Exception as e:
            logger.error(f"Failed to list backups: {e}")
            return []
    
    def restore_backup(self, backup_id: str, restore_path: Optional[Path] = None) -> bool:
        """Restore from backup"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get backup info
                cursor = conn.execute('''
                    SELECT location, backup_type, checksum FROM backups 
                    WHERE backup_id = ?
                ''', (backup_id,))
                
                backup_info = cursor.fetchone()
                if not backup_info:
                    logger.error(f"Backup not found: {backup_id}")
                    return False
                
                location, backup_type, stored_checksum = backup_info
                archive_path = Path(location)
                
                if not archive_path.exists():
                    logger.error(f"Archive file not found: {archive_path}")
                    return False
                
                # Verify checksum
                current_checksum = self.calculate_checksum(archive_path)
                if current_checksum != stored_checksum:
                    logger.error("Backup archive checksum mismatch - file may be corrupted")
                    return False
                
                # Set restore path
                if restore_path is None:
                    restore_path = self.project_root / f"restore_{backup_id}"
                
                restore_path.mkdir(exist_ok=True)
                
                # Extract archive
                import tarfile
                
                mode = 'r:gz' if archive_path.suffix == '.gz' else 'r'
                
                with tarfile.open(archive_path, mode) as tar:
                    tar.extractall(restore_path)
                
                logger.info(f"Backup restored successfully to: {restore_path}")
                return True
                
        except Exception as e:
            logger.error(f"Restore failed: {e}")
            return False
    
    def verify_backup_integrity(self, backup_id: str) -> bool:
        """Verify backup integrity"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Get backup info
                cursor = conn.execute('''
                    SELECT location, checksum FROM backups 
                    WHERE backup_id = ?
                ''', (backup_id,))
                
                backup_info = cursor.fetchone()
                if not backup_info:
                    return False
                
                location, stored_checksum = backup_info
                archive_path = Path(location)
                
                if not archive_path.exists():
                    return False
                
                # Verify checksum
                current_checksum = self.calculate_checksum(archive_path)
                return current_checksum == stored_checksum
                
        except Exception as e:
            logger.error(f"Backup integrity check failed: {e}")
            return False
    
    def get_backup_statistics(self) -> Dict[str, Any]:
        """Get backup system statistics"""
        try:
            with sqlite3.connect(self.db_path) as conn:
                # Total backups
                cursor = conn.execute('SELECT COUNT(*) FROM backups')
                total_backups = cursor.fetchone()[0]
                
                # Backups by type
                cursor = conn.execute('''
                    SELECT backup_type, COUNT(*) FROM backups 
                    GROUP BY backup_type
                ''')
                backups_by_type = dict(cursor.fetchall())
                
                # Total size
                cursor = conn.execute('SELECT SUM(total_size_mb) FROM backups')
                total_size = cursor.fetchone()[0] or 0
                
                # Latest backup
                cursor = conn.execute('''
                    SELECT timestamp, backup_type FROM backups 
                    ORDER BY timestamp DESC LIMIT 1
                ''')
                latest_backup = cursor.fetchone()
                
                # Storage usage
                backup_files = list(self.backup_dir.glob("*"))
                total_files = len(backup_files)
                
                return {
                    "total_backups": total_backups,
                    "backups_by_type": backups_by_type,
                    "total_size_mb": total_size,
                    "latest_backup": {
                        "timestamp": latest_backup[0] if latest_backup else None,
                        "type": latest_backup[1] if latest_backup else None
                    },
                    "storage_usage": {
                        "total_files": total_files,
                        "backup_directory": str(self.backup_dir)
                    },
                    "config": {
                        "backup_interval_hours": self.config.backup_interval_hours,
                        "retention_days": self.config.retention_days,
                        "compression_enabled": self.config.compression_enabled,
                        "encryption_enabled": self.config.encryption_enabled
                    }
                }
                
        except Exception as e:
            logger.error(f"Failed to get backup statistics: {e}")
            return {}
    
    def start_scheduled_backups(self) -> None:
        """Start scheduled backup service"""
        logger.info("Starting scheduled backup service...")
        
        # Schedule regular backups
        schedule.every(self.config.backup_interval_hours).hours.do(
            self.perform_backup, "full", "Scheduled automatic backup"
        )
        
        # Schedule cleanup
        schedule.every(24).hours.do(self.cleanup_old_backups)
        
        # Run the scheduler
        while True:
            try:
                schedule.run_pending()
                time.sleep(60)  # Check every minute
            except Exception as e:
                logger.error(f"Scheduler error: {e}")
                time.sleep(300)  # Wait 5 minutes on error

def main():
    import argparse
    import sys
    
    parser = argparse.ArgumentParser(description="Automated Backup System")
    parser.add_argument("project_root", nargs="?", default=".", help="Project root directory")
    parser.add_argument("action", choices=["backup", "restore", "list", "cleanup", "verify", "stats", "schedule"], 
                       help="Action to perform")
    parser.add_argument("--type", choices=["full", "configuration", "metrics", "logs", "scripts"], 
                       default="full", help="Backup type")
    parser.add_argument("--backup-id", help="Backup ID for restore/verify")
    parser.add_argument("--description", default="", help="Backup description")
    parser.add_argument("--restore-path", help="Custom restore path")
    
    args = parser.parse_args()
    
    backup_system = AutomatedBackupSystem(args.project_root)
    
    print("🔄 Automated Backup System")
    print("=" * 50)
    
    try:
        if args.action == "backup":
            backup_id = backup_system.perform_backup(args.type, args.description)
            if backup_id:
                print(f"✅ Backup completed successfully")
                print(f"   Backup ID: {backup_id}")
                print(f"   Type: {args.type}")
            else:
                print("❌ Backup failed")
                sys.exit(1)
                
        elif args.action == "restore":
            if not args.backup_id:
                print("❌ Backup ID required for restore")
                sys.exit(1)
            
            restore_path = Path(args.restore_path) if args.restore_path else None
            success = backup_system.restore_backup(args.backup_id, restore_path)
            
            if success:
                print(f"✅ Backup restored successfully")
                if restore_path:
                    print(f"   Restore path: {restore_path}")
            else:
                print("❌ Restore failed")
                sys.exit(1)
                
        elif args.action == "list":
            backups = backup_system.list_backups(args.type if args.type != "full" else None)
            
            if backups:
                print(f"📋 Available Backups ({len(backups)}):")
                for backup in backups:
                    print(f"   {backup['backup_id']} - {backup['backup_type']} - {backup['timestamp']}")
                    print(f"      Size: {backup['total_size_mb']:.1f}MB - Files: {backup['file_count']}")
                    if backup['description']:
                        print(f"      Description: {backup['description']}")
            else:
                print("📋 No backups found")
                
        elif args.action == "cleanup":
            cleaned_count = backup_system.cleanup_old_backups()
            print(f"🧹 Cleanup completed. Deleted {cleaned_count} old backups.")
            
        elif args.action == "verify":
            if not args.backup_id:
                print("❌ Backup ID required for verification")
                sys.exit(1)
            
            is_valid = backup_system.verify_backup_integrity(args.backup_id)
            
            if is_valid:
                print(f"✅ Backup {args.backup_id} integrity verified")
            else:
                print(f"❌ Backup {args.backup_id} integrity check failed")
                sys.exit(1)
                
        elif args.action == "stats":
            stats = backup_system.get_backup_statistics()
            
            print("📊 Backup System Statistics:")
            print(f"   Total Backups: {stats.get('total_backups', 0)}")
            print(f"   Total Size: {stats.get('total_size_mb', 0):.1f}MB")
            
            if stats.get('backups_by_type'):
                print("   Backups by Type:")
                for backup_type, count in stats['backups_by_type'].items():
                    print(f"     {backup_type}: {count}")
            
            if stats.get('latest_backup'):
                latest = stats['latest_backup']
                print(f"   Latest Backup: {latest['type']} at {latest['timestamp']}")
            
            config = stats.get('config', {})
            print("   Configuration:")
            print(f"     Backup Interval: {config.get('backup_interval_hours', 0)} hours")
            print(f"     Retention: {config.get('retention_days', 0)} days")
            print(f"     Compression: {'Enabled' if config.get('compression_enabled') else 'Disabled'}")
            
        elif args.action == "schedule":
            print("⏰ Starting scheduled backup service...")
            print("   Press Ctrl+C to stop")
            backup_system.start_scheduled_backups()
            
    except KeyboardInterrupt:
        print("\n⏹️  Backup service stopped")
    except Exception as e:
        logger.error(f"Command failed: {e}")
        print(f"❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
