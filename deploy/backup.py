"""Consistent online SQLite backup. Never removes an existing backup."""
from datetime import datetime, timezone
from pathlib import Path
import sqlite3
import os


def backup(source, destination):
    destination=Path(destination)
    os.close(os.open(destination,os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600))
    with sqlite3.connect(f'file:{Path(source)}?mode=ro',uri=True) as src:
        with sqlite3.connect(destination) as dst:
            src.backup(dst)
            if dst.execute('PRAGMA integrity_check').fetchone()[0]!='ok':
                raise RuntimeError('Backup integrity check failed')
    destination.chmod(0o600)
    return destination


if __name__=='__main__':
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    path=backup('/var/lib/chess-daf/chess.sqlite',f'/var/backups/chess-daf/data/chess-{stamp}.sqlite')
    print(f'Backup verified: {path.name}')
