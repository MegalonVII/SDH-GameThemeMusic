import asyncio
import base64
import datetime
import json
import os
import ssl
import aiohttp
import certifi
import logging
import platform
import shutil
from pathlib import Path

import decky
from settings import SettingsManager  # type: ignore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def get_ytdlp_path() -> str:
    binary = "yt-dlp.exe" if platform.system() == "Windows" else "yt-dlp"
    return os.path.join(decky.DECKY_PLUGIN_DIR, "bin", binary)


class Plugin:
    yt_process: asyncio.subprocess.Process | None = None
    yt_process_lock = asyncio.Lock()
    music_path = f"{decky.DECKY_PLUGIN_RUNTIME_DIR}/music"
    cache_path = f"{decky.DECKY_PLUGIN_RUNTIME_DIR}/cache"
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    async def _main(self):
        logger.info("Initializing plugin...")
        self.settings = SettingsManager(
            name="config", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR
        )
        logger.info("Settings loaded.")

    async def _unload(self):
        if self.yt_process is not None and self.yt_process.returncode is None:
            logger.info("Terminating yt_process...")
            self.yt_process.terminate()
            async with self.yt_process_lock:
                try:
                    await asyncio.wait_for(self.yt_process.communicate(), timeout=5)
                except TimeoutError:
                    logger.warning("yt_process timeout. Killing process.")
                    self.yt_process.kill()

    async def set_setting(self, key, value):
        logger.info(f"Setting config key: {key} = {value}")
        self.settings.setSetting(key, value)

    async def get_setting(self, key, default):
        value = self.settings.getSetting(key, default)
        logger.info(f"Retrieved config key: {key} = {value}")
        return value

    async def search_yt(self, term: str):
        logger.info(f"Searching YouTube for: {term}")
        ytdlp_path = get_ytdlp_path()
        if os.path.exists(ytdlp_path):
            os.chmod(ytdlp_path, 0o755)

        if self.yt_process is not None and self.yt_process.returncode is None:
            logger.info("Terminating previous yt_process...")
            self.yt_process.terminate()
            async with self.yt_process_lock:
                await self.yt_process.communicate()

        self.yt_process = await asyncio.create_subprocess_exec(
            ytdlp_path,
            f"ytsearch10:{term}",
            "-j",
            "-f", "bestaudio",
            "--match-filters", f"duration<?{20*60}",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            limit=10 * 1024**2,
            env={**os.environ, 'LD_LIBRARY_PATH': '/usr/lib:/lib'},
        )
        logger.info("yt-dlp search process started.")

        # Log stderr in the background so failures are visible in decky logs
        async def log_stderr():
            if not self.yt_process or not self.yt_process.stderr:
                return
            while True:
                line = await self.yt_process.stderr.readline()
                if not line:
                    break
                logger.warning(f"yt-dlp stderr: {line.decode().strip()}")

        asyncio.create_task(log_stderr())

    async def next_yt_result(self):
        async with self.yt_process_lock:
            if (
                not self.yt_process
                or not (output := self.yt_process.stdout)
                or not (line := (await output.readline()).strip())
            ):
                logger.info("No more results from yt_process.")
                return None
            logger.debug(f"Received result line: {line[:100]}...")
            try:
                entry = json.loads(line)
                return self.entry_to_info(entry)
            except json.JSONDecodeError as e:
                logger.error(f"Failed to parse yt-dlp output: {e}. Line: {line[:200]}")
                return None

    @staticmethod
    def entry_to_info(entry):
        return {
            "url": entry["url"],
            "title": entry["title"],
            "id": entry["id"],
            "thumbnail": entry["thumbnail"],
        }

    def local_match(self, id: str) -> str | None:
        logger.info(f"Looking for local match for ID: {id}")
        try:
            for file in os.listdir(self.music_path):
                if os.path.isfile(os.path.join(self.music_path, file)) and file.startswith(id + "."):
                    logger.info(f"Local match found: {file}")
                    return os.path.join(self.music_path, file)
        except FileNotFoundError:
            logger.warning(f"Music path not found: {self.music_path}")
        logger.info("No local match found.")
        return None

    async def single_yt_url(self, id: str):
        local_match = self.local_match(id)
        if local_match:
            extension = local_match.split(".")[-1]
            logger.info(f"Serving base64 encoded audio from local file: {local_match}")
            with open(local_match, "rb") as file:
                return f"data:audio/{extension};base64,{base64.b64encode(file.read()).decode()}"

        logger.info(f"No local file. Fetching yt-dlp info for: {id}")
        ytdlp_path = get_ytdlp_path()
        result = await asyncio.create_subprocess_exec(
            ytdlp_path,
            f"{id}",
            "-j",
            "-f", "bestaudio",
            stdout=asyncio.subprocess.PIPE,
            env={**os.environ, 'LD_LIBRARY_PATH': '/usr/lib:/lib'},
        )
        if result.stdout is None or not (output := (await result.stdout.read()).strip()):
            logger.warning("yt-dlp returned no output.")
            return None
        entry = json.loads(output)
        return entry["url"]

    async def download_yt_audio(self, id: str):
        if self.local_match(id):
            logger.info(f"Audio already downloaded for ID: {id}")
            return

        logger.info(f"Downloading audio for ID: {id}")
        ytdlp_path = get_ytdlp_path()
        process = await asyncio.create_subprocess_exec(
            ytdlp_path,
            f"{id}",
            "-f", "bestaudio",
            "-o", "%(id)s.%(ext)s",
            "-P", self.music_path,
            env={**os.environ, 'LD_LIBRARY_PATH': '/usr/lib:/lib'},
        )
        await process.communicate()

        original_path = os.path.join(self.music_path, f"{id}.m4a")
        renamed_path = os.path.join(self.music_path, f"{id}.webm")
        if os.path.exists(original_path):
            logger.info(f"Renaming {original_path} to {renamed_path}")
            os.rename(original_path, renamed_path)

    async def download_url(self, url: str, id: str):
        logger.info(f"Downloading file from URL: {url}")
        async with aiohttp.ClientSession() as session:
            res = await session.get(url, ssl=self.ssl_context)
            res.raise_for_status()
            file_path = os.path.join(self.music_path, f"{id}.webm")
            with open(file_path, "wb") as file:
                async for chunk in res.content.iter_chunked(1024):
                    file.write(chunk)
            logger.info(f"Download complete: {file_path}")

    async def clear_downloads(self):
        logger.info("Clearing all downloaded music files...")
        try:
            for file in os.listdir(self.music_path):
                full_path = os.path.join(self.music_path, file)
                if os.path.isfile(full_path):
                    logger.info(f"Removing file: {full_path}")
                    os.remove(full_path)
        except FileNotFoundError:
            logger.warning(f"Music path not found: {self.music_path}")

    async def export_cache(self, cache: dict):
        os.makedirs(self.cache_path, exist_ok=True)
        filename = f"backup-{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}.json"
        full_path = os.path.join(self.cache_path, filename)
        with open(full_path, "w") as file:
            json.dump(cache, file)
        logger.info(f"Cache exported to {full_path}")

    async def list_cache_backups(self):
        logger.info("Listing cache backup files...")
        try:
            return [
                file.rsplit(".", 1)[0]
                for file in os.listdir(self.cache_path)
                if os.path.isfile(os.path.join(self.cache_path, file))
            ]
        except FileNotFoundError:
            logger.warning(f"Cache path not found: {self.cache_path}")
            return []

    async def import_cache(self, name: str):
        path = os.path.join(self.cache_path, f"{name}.json")
        logger.info(f"Importing cache from {path}")
        with open(path, "r") as file:
            return json.load(file)

    async def clear_cache(self):
        logger.info("Clearing all cache files...")
        try:
            for file in os.listdir(self.cache_path):
                full_path = os.path.join(self.cache_path, file)
                if os.path.isfile(full_path):
                    logger.info(f"Removing file: {full_path}")
                    os.remove(full_path)
        except FileNotFoundError:
            logger.warning(f"Cache path not found: {self.cache_path}")

    async def update_yt_dlp(self):
        """
        Updates the yt-dlp binary to the latest version from GitHub releases.
        Returns a dict with 'success' (bool) and 'message' (str) keys.
        """
        try:
            yt_dlp_path = Path(f"{decky.DECKY_PLUGIN_DIR}/bin/yt-dlp")
            bin_dir = yt_dlp_path.parent
            
            bin_dir.mkdir(parents=True, exist_ok=True)
            
            async with aiohttp.ClientSession() as session:
                async with session.get(
                    "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
                    ssl=self.ssl_context
                ) as response:
                    if response.status != 200:
                        return {
                            "success": False,
                            "message": f"Failed to fetch release info: HTTP {response.status}"
                        }
                    release_data = await response.json()
                    tag_name = release_data.get("tag_name", "")
                
                assets = release_data.get("assets", [])
                binary_asset = None
                for asset in assets:
                    name = asset.get("name", "")
                    if name == "yt-dlp":
                        binary_asset = asset
                        break
                
                if not binary_asset:
                    return {
                        "success": False,
                        "message": "Could not find yt-dlp binary in release assets"
                    }
                
                download_url = binary_asset.get("browser_download_url")
                if not download_url:
                    return {
                        "success": False,
                        "message": "Could not get download URL"
                    }
                
                async with session.get(download_url, ssl=self.ssl_context) as download_response:
                    if download_response.status != 200:
                        return {
                            "success": False,
                            "message": f"Failed to download binary: HTTP {download_response.status}"
                        }
                    
                    temp_path = yt_dlp_path.with_suffix(".tmp")
                    with open(temp_path, "wb") as f:
                        async for chunk in download_response.content.iter_chunked(8192):
                            f.write(chunk)
                    
                    if yt_dlp_path.exists():
                        yt_dlp_path.unlink()
                    temp_path.rename(yt_dlp_path)
                    
                    yt_dlp_path.chmod(0o755)
                    
                    return {
                        "success": True,
                        "message": f"Successfully updated yt-dlp to {tag_name}"
                    }
        
        except Exception as e:
            return {
                "success": False,
                "message": f"Error updating yt-dlp: {str(e)}"
            }
