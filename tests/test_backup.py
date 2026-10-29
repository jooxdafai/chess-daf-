import sqlite3
import pytest
from backend.game import GameStore
from deploy.backup import backup


def test_consistent_backup_can_restore_saved_game_and_preserves_earlier_copy(tmp_path):
    store=GameStore(tmp_path/'live.sqlite')
    game=store.create()
    first=backup(store.path,tmp_path/'first.sqlite')
    store.move(game['id'],'e2e4',0)
    second=backup(store.path,tmp_path/'second.sqlite')
    assert GameStore(first).get(game['id'])['ply']==0
    assert GameStore(second).get(game['id'])['ply']==1
    assert first.stat().st_mode & 0o777 == 0o600
    with pytest.raises(FileExistsError):
        backup(store.path,first)
    assert GameStore(first).get(game['id'])['ply']==0
