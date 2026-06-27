import sys
from pathlib import Path
from unittest.mock import MagicMock

import pytest

ROOT = Path(__file__).resolve().parents[2]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

decky_mock = MagicMock()
decky_mock.DECKY_PLUGIN_DIR = "/tmp/decky-plugin"
decky_mock.DECKY_PLUGIN_RUNTIME_DIR = "/tmp/decky-runtime"
decky_mock.DECKY_PLUGIN_SETTINGS_DIR = "/tmp/decky-settings"
sys.modules.setdefault("decky", decky_mock)

settings_mock = MagicMock()
settings_mock.SettingsManager = MagicMock
sys.modules.setdefault("settings", settings_mock)

from main import Plugin  # noqa: E402


@pytest.fixture
def plugin(tmp_path):
    instance = Plugin()
    instance.music_path = str(tmp_path / "music")
    instance.cache_path = str(tmp_path / "cache")
    (tmp_path / "music").mkdir()
    (tmp_path / "cache").mkdir()
    return instance
