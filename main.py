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
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    music_path = f"{decky.DECKY_PLUGIN_RUNTIME_DIR}/music"
    cache_path = f"{decky.DECKY_PLUGIN_RUNTIME_DIR}/cache"

    async def _main(self):
        logger.info("Initializing plugin...")
        self.settings = SettingsManager(
            name="config", settings_directory=decky.DECKY_PLUGIN_SETTINGS_DIR
        )
        
        os.makedirs(self.music_path, exist_ok=True)
        os.makedirs(self.cache_path, exist_ok=True)
        
        
        try:
            path = Path(f"{decky.DECKY_PLUGIN_DIR}/bin/yt-dlp")
            if path.exists():
                path.chmod(0o755)
        except Exception as e:
            print(f"Error setting permissions for yt-dlp: {e}")

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

        try:
            path = Path(f"{decky.DECKY_PLUGIN_DIR}/bin/yt-dlp")
            if path.exists():
                path.chmod(0o755)
        except:
            pass
            
        self.yt_process = await asyncio.create_subprocess_exec(
            ytdlp_path,
            f"ytsearch50:{term}",
            "-j",
            "-f", "bestaudio",
            "--match-filters", f"duration<?{20*60}",
            "--flat-playlist",
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificates",
            "--quiet",
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
            "url": entry.get("url"),
            "title": entry.get("title"),
            "id": entry.get("id"),
            "thumbnail": entry.get("thumbnail") or entry.get("thumbnails", [{}])[0].get("url"),
        }

    async def fetch_url(self, url: str):
        try:
            async with aiohttp.ClientSession() as session:
                headers = {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                }
                async with session.get(url, headers=headers, timeout=10, ssl=self.ssl_context) as response:
                    return await response.text()
        except Exception as e:
            print(f"fetch_url error for {url}: {e}")
            return ""

    def local_match(self, id: str) -> str | None:
        import glob
        
        safe_id = glob.escape(id)
        local_matches = [
            x for x in glob.glob(f"{self.music_path}/{safe_id}.*")
            if os.path.isfile(x) and x.rsplit('.', 1)[-1].lower() in ['webm', 'm4a', 'mp3', 'ogg', 'wav', 'aac', 'flac', 'opus', 'weba', 'mp4']
        ]
        if len(local_matches) == 0:
            return None

        return local_matches[0]

    async def single_yt_url(self, id: str):
        if id.startswith("https://"):
            url = id
            
            import re
            safe_id = re.sub(r'[^a-zA-Z0-9_\-]', '_', id.split('/')[-1])
        else:
            url = f"https://www.youtube.com/watch?v={id}"
            safe_id = id
            
        local_match = self.local_match(safe_id)
        if local_match is not None:
            # Reverting to base64 encoding as it's the most reliable method for offline use
            extension = local_match.rsplit(".", 1)[-1].lower()
            mime_types = {
                "m4a": "audio/mp4",
                "mp3": "audio/mpeg",
                "webm": "audio/webm",
                "ogg": "audio/ogg",
                "wav": "audio/wav",
                "aac": "audio/aac",
                "flac": "audio/flac",
                "opus": "audio/ogg",
                "weba": "audio/webm",
                "mp4": "audio/mp4"
            }
            mime_type = mime_types.get(extension, "audio/webm")
            
            with open(local_match, "rb") as file:
                return f"data:{mime_type};base64,{base64.b64encode(file.read()).decode()}"

        result = await asyncio.create_subprocess_exec(
            f"{decky.DECKY_PLUGIN_DIR}/bin/yt-dlp",
            url,
            "-j",
            "-f",
            "bestaudio[protocol^=http][protocol!*=m3u8]/bestaudio/best",
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificates",
            "--quiet",
            "--extractor-args", "youtube:player-client=android,web",
            stdout=asyncio.subprocess.PIPE,
            env={**os.environ, 'LD_LIBRARY_PATH': '/usr/lib:/lib'},
        )
        if result.stdout is None or not (output := (await result.stdout.read()).strip()):
            logger.warning("yt-dlp returned no output.")
            return None
        entry = json.loads(output)
        return entry["url"]

    async def fetch_url(self, url: str):
        async with aiohttp.ClientSession() as session:
            try:
                res = await session.get(url, ssl=self.ssl_context)
                res.raise_for_status()
                return await res.text()
            except Exception as e:
                print(f"Error fetching URL {url}: {e}")
                return ""

    async def download_yt_audio(self, id: str):
        if id.startswith("https://"):
            url = id
            
            import re
            safe_id = re.sub(r'[^a-zA-Z0-9_\-]', '_', id.split('/')[-1])
        else:
            url = f"https://www.youtube.com/watch?v={id}"
            safe_id = id

        if self.local_match(safe_id) is not None:
            
            return
        
        process = await asyncio.create_subprocess_exec(
            f"{decky.DECKY_PLUGIN_DIR}/bin/yt-dlp",
            url,
            "-f",
            "bestaudio[protocol^=http][protocol!*=m3u8]/bestaudio/best",
            "-o",
            f"{safe_id}.%(ext)s",
            "-P",
            self.music_path,
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificates",
            "--quiet",
            "--extractor-args", "youtube:player-client=android,web",
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "LD_LIBRARY_PATH": "/usr/lib:/usr/lib64:/lib:/lib64"},
        )
        stdout, stderr = await process.communicate()
        if process.returncode != 0:
            err_msg = stderr.decode() if stderr else 'Unknown error'
            raise Exception(f"yt-dlp failed to download: {err_msg}")

        original_path = os.path.join(self.music_path, f"{id}.m4a")
        renamed_path = os.path.join(self.music_path, f"{id}.webm")
        if os.path.exists(original_path):
            logger.info(f"Renaming {original_path} to {renamed_path}")
            os.rename(original_path, renamed_path)

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
