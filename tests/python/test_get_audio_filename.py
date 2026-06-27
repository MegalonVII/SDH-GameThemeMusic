import hashlib

from main import get_audio_filename


def test_youtube_id_is_unchanged():
    assert get_audio_filename("dQw4w9WgXcQ") == "dQw4w9WgXcQ"


def test_https_url_uses_md5_hex_digest():
    url = "https://downloads.khinsider.com/game-soundtracks/album/1-1-title.mp3"
    expected = hashlib.md5(url.encode()).hexdigest()
    assert get_audio_filename(url) == expected


def test_same_url_produces_same_filename():
    url = "https://downloads.khinsider.com/game-soundtracks/album/track"
    assert get_audio_filename(url) == get_audio_filename(url)
