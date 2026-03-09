import asyncio
import base64
import datetime
import glob
import json
import os
import ssl
from pathlib import Path

import aiohttp
import certifi

import decky  # type: ignore
from settings import SettingsManager 


class Plugin:
    yt_process: asyncio.subprocess.Process | None = None
    
    yt_process_lock = asyncio.Lock()
    ssl_context = ssl.create_default_context(cafile=certifi.where())

    music_path = f"{decky.DECKY_PLUGIN_RUNTIME_DIR}/music"
    cache_path = f"{decky.DECKY_PLUGIN_RUNTIME_DIR}/cache"

    async def _main(self):
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

    async def _unload(self):
        
        if self.yt_process is not None and self.yt_process.returncode is None:
            self.yt_process.terminate()
            
            async with self.yt_process_lock:
                try:
                    
                    await asyncio.wait_for(self.yt_process.communicate(), timeout=5)
                except TimeoutError:
                    
                    self.yt_process.kill()

    async def set_setting(self, key, value):
        self.settings.setSetting(key, value)

    async def get_setting(self, key, default):
        return self.settings.getSetting(key, default)

    async def search_yt(self, term: str):

        
        if self.yt_process is not None and self.yt_process.returncode is None:
            self.yt_process.terminate()
            
            async with self.yt_process_lock:
                await self.yt_process.communicate()
        
        try:
            path = Path(f"{decky.DECKY_PLUGIN_DIR}/bin/yt-dlp")
            if path.exists():
                path.chmod(0o755)
        except:
            pass

        self.yt_process = await asyncio.create_subprocess_exec(
            f"{decky.DECKY_PLUGIN_DIR}/bin/yt-dlp",
            f"ytsearch50:{term}",
            "--dump-json",
            "--flat-playlist",
            "--no-playlist",
            "--no-warnings",
            "--no-check-certificates",
            "--quiet",
            stdout=asyncio.subprocess.PIPE,
            
            limit=10 * 1024**2,
            env={**os.environ, "LD_LIBRARY_PATH": "/usr/lib:/usr/lib64:/lib:/lib64"},
        )

    async def next_yt_result(self):
        async with self.yt_process_lock:
            if (
                not self.yt_process
                or not (output := self.yt_process.stdout)
                or not (line := (await output.readline()).strip())
            ):
                return None
            entry = json.loads(line)
            return self.entry_to_info(entry)

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
            env={**os.environ, "LD_LIBRARY_PATH": "/usr/lib:/usr/lib64:/lib:/lib64"},
        )
        if (
            result.stdout is None
            or len(output := (await result.stdout.read()).strip()) == 0
        ):
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


    async def download_url(self, url: str, id: str):
        async with aiohttp.ClientSession() as session:
            res = await session.get(url, ssl=self.ssl_context)
            res.raise_for_status()
            os.makedirs(self.music_path, exist_ok=True)
            with open(f"{self.music_path}/{id}.webm", "wb") as file:
                async for chunk in res.content.iter_chunked(1024):
                    file.write(chunk)

    async def clear_downloads(self):
        for file in glob.glob(f"{self.music_path}/*"):
            if os.path.isfile(file):
                os.remove(file)

    async def export_cache(self, cache: dict):
        os.makedirs(self.cache_path, exist_ok=True)
        filename = f"backup-{datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}.json"
        with open(f"{self.cache_path}/{filename}", "w") as file:
            json.dump(cache, file)

    async def list_cache_backups(self):
        return [
            file.split("/")[-1].rsplit(".", 1)[0]
            for file in glob.glob(f"{self.cache_path}/*")
        ]

    async def import_cache(self, name: str):
        with open(f"{self.cache_path}/{name}.json", "r") as file:
            return json.load(file)

    async def clear_cache(self):
        for file in glob.glob(f"{self.cache_path}/*"):
            if os.path.isfile(file):
                os.remove(file)
