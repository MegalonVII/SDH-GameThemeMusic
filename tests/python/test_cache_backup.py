import json
import os

import pytest


@pytest.mark.asyncio
async def test_export_and_import_cache_round_trip(plugin):
    cache = {"570": {"videoId": "abc123", "volume": 0.5}}
    await plugin.export_cache(cache)

    backups = await plugin.list_cache_backups()
    assert len(backups) == 1

    imported = await plugin.import_cache(backups[0])
    assert imported == cache


@pytest.mark.asyncio
async def test_list_cache_backups_strips_json_extension(plugin):
    backup_path = os.path.join(plugin.cache_path, "backup-test.json")
    with open(backup_path, "w") as file:
        json.dump({}, file)

    assert await plugin.list_cache_backups() == ["backup-test"]


@pytest.mark.asyncio
async def test_list_cache_backups_handles_missing_directory(plugin):
    os.rmdir(plugin.cache_path)
    assert await plugin.list_cache_backups() == []
