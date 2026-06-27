from main import infer_download_extension


def test_keeps_known_audio_extension():
    assert infer_download_extension("https://cdn.example.com/track.mp3") == "mp3"
    assert infer_download_extension("https://cdn.example.com/track.flac") == "flac"


def test_defaults_unknown_extension_to_webm():
    assert infer_download_extension("https://cdn.example.com/download") == "webm"
    assert infer_download_extension("https://cdn.example.com/file.bin") == "webm"
