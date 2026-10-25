import asyncio

import aiohttp
import pytest


class FakeResponse:
    def __init__(self, status=200, html="<html>Album</html>", headers=None):
        self.status = status
        self.headers = headers or {}
        self.url = "https://downloads.khinsider.com/album"
        self._html = html

    async def text(self):
        return self._html


class FakeRequest:
    def __init__(self, response=None, error=None):
        self.response = response
        self.error = error

    async def __aenter__(self):
        if self.error:
            raise self.error
        return self.response

    async def __aexit__(self, *args):
        return False


class FakeSession:
    def __init__(self, response=None, error=None):
        self.response = response or FakeResponse()
        self.error = error

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    def get(self, *args, **kwargs):
        return FakeRequest(self.response, self.error)


def patch_session(monkeypatch, **kwargs):
    monkeypatch.setattr("main.aiohttp.ClientSession", lambda: FakeSession(**kwargs))


@pytest.mark.asyncio
async def test_fetch_page_blocked_pages_drop_the_html(plugin, monkeypatch):
    patch_session(
        monkeypatch,
        response=FakeResponse(status=403, html="Cloudflare error page", headers={"cf-ray": "example-ray"}),
    )
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "", "error": "blocked", "status": 403}

    patch_session(
        monkeypatch,
        response=FakeResponse(status=200, html="Cloudflare error page", headers={"cf-mitigated": "challenge"}),
    )
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "", "error": "blocked", "status": 200}


@pytest.mark.asyncio
async def test_fetch_page_rate_limit_and_other_http_errors(plugin, monkeypatch):
    patch_session(monkeypatch, response=FakeResponse(status=429, html="slow down"))
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "", "error": "rate_limited", "status": 429}

    patch_session(monkeypatch, response=FakeResponse(status=503, html="down"))
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "", "error": "http_error", "status": 503}


@pytest.mark.asyncio
async def test_fetch_page_keeps_successful_html(plugin, monkeypatch):
    patch_session(monkeypatch, response=FakeResponse(html="<html>Album</html>"))
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "<html>Album</html>", "error": None, "status": 200}

    patch_session(monkeypatch, response=FakeResponse(html=""))
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "", "error": None, "status": 200}


@pytest.mark.asyncio
async def test_fetch_page_timeout_and_connection_error(plugin, monkeypatch):
    patch_session(monkeypatch, error=asyncio.TimeoutError())
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "", "error": "timeout", "status": None}

    patch_session(monkeypatch, error=aiohttp.ClientConnectionError())
    result = await plugin.fetch_page("https://downloads.khinsider.com/album")
    assert result == {"html": "", "error": "network_error", "status": None}


@pytest.mark.asyncio
async def test_fetch_url_returns_empty_string_when_blocked(plugin, monkeypatch):
    patch_session(monkeypatch, response=FakeResponse(status=403, html="Cloudflare error page"))
    assert await plugin.fetch_url("https://downloads.khinsider.com/album") == ""
