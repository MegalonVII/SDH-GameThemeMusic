import os

import pytest


@pytest.mark.asyncio
async def test_download_url_skips_data_urls(plugin, monkeypatch):
    called = False

    class FakeSession:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return False

        def get(self, *args, **kwargs):
            nonlocal called
            called = True
            raise AssertionError("HTTP should not be called for data URLs")

    monkeypatch.setattr("main.aiohttp.ClientSession", lambda: FakeSession())

    await plugin.download_url("data:audio/mp3;base64,abc", "track-id")

    assert called is False
    assert os.listdir(plugin.music_path) == []
