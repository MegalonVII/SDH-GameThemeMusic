from main import Plugin


def test_maps_full_yt_dlp_entry():
    entry = {
        "url": "https://example.com/audio.webm",
        "title": "Main Theme",
        "id": "abc123",
        "thumbnail": "https://example.com/thumb.jpg",
    }
    assert Plugin.entry_to_info(entry) == {
        "url": "https://example.com/audio.webm",
        "title": "Main Theme",
        "id": "abc123",
        "thumbnail": "https://example.com/thumb.jpg",
    }


def test_falls_back_to_thumbnails_array():
    entry = {
        "id": "abc123",
        "thumbnails": [{"url": "https://example.com/fallback.jpg"}],
    }
    assert Plugin.entry_to_info(entry)["thumbnail"] == "https://example.com/fallback.jpg"


def test_missing_thumbnail_fields_return_none():
    entry = {"id": "abc123", "thumbnails": []}
    info = Plugin.entry_to_info(entry)
    assert info["thumbnail"] is None
    assert info["title"] is None
