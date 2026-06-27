import os


def test_finds_audio_file_by_id(plugin):
    target = os.path.join(plugin.music_path, "abc123.webm")
    with open(target, "wb") as file:
        file.write(b"audio")

    assert plugin.local_match("abc123") == target


def test_ignores_non_audio_extensions(plugin):
    target = os.path.join(plugin.music_path, "abc123.txt")
    with open(target, "w") as file:
        file.write("not audio")

    assert plugin.local_match("abc123") is None


def test_escapes_glob_special_characters(plugin):
    special_id = "track*?["
    target = os.path.join(plugin.music_path, f"{special_id}.mp3")
    with open(target, "wb") as file:
        file.write(b"audio")

    assert plugin.local_match(special_id) == target


def test_returns_none_when_no_match(plugin):
    assert plugin.local_match("missing") is None
