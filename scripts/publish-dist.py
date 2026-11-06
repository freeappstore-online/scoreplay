"""Publish dependencies before entry points; retain assets used by existing tabs.

R2's single-part ETags are MD5 digests. Compare content, not checkout timestamps,
so a UI change does not upload the entire music archive again. Unknown/multipart
ETags are uploaded again. This is an app-level safeguard, not atomic releases.
"""
import base64
import hashlib
import json
import mimetypes
import os
from pathlib import Path
import re
import subprocess
from concurrent.futures import ThreadPoolExecutor

ENTRY_POINTS = ("manifest.webmanifest", "registerSW.js", "index.html", "sw.js")


def digest(path):
    with path.open("rb") as source:
        return hashlib.file_digest(source, "md5").hexdigest()


class R2:
    def __init__(self, account, app):
        if not re.fullmatch(r"[a-z0-9][a-z0-9-]*", app):
            raise ValueError("Invalid app ID")
        self.endpoint = f"https://{account}.r2.cloudflarestorage.com"
        self.prefix = f"apps/{app}/"

    def call(self, *args):
        result = subprocess.run(["aws", "s3api", *args, "--endpoint-url", self.endpoint,
                                 "--no-cli-pager", "--output", "json"], check=True,
                                capture_output=True, text=True)
        return json.loads(result.stdout or "{}")

    def inventory(self):
        result = self.call("list-objects-v2", "--bucket", "fas-apps", "--prefix", self.prefix)
        return {item["Key"][len(self.prefix):]: (item["Size"], item["ETag"].strip('"'))
                for item in result.get("Contents", [])}

    def put(self, name, path, checksum):
        content_type = {".js": "application/javascript", ".mid": "audio/midi",
                        ".musicxml": "application/vnd.recordare.musicxml+xml",
                        ".webmanifest": "application/manifest+json"}.get(path.suffix)
        content_type = content_type or mimetypes.guess_type(name)[0] or "application/octet-stream"
        result = self.call("put-object", "--bucket", "fas-apps", "--key", self.prefix + name,
                           "--body", str(path), "--content-type", content_type,
                           "--content-md5", base64.b64encode(bytes.fromhex(checksum)).decode())
        if result.get("ETag", "").strip('"') != checksum:
            raise RuntimeError(f"Upload verification failed: {name}")


def publish(root, store):
    root = Path(root).resolve()
    if not (root / "index.html").is_file():
        raise ValueError("Build output has no index.html")
    remote = store.inventory()
    changed = {}
    total = 0
    for path in sorted(root.rglob("*")):
        if path.is_symlink():
            raise ValueError(f"Build contains a symlink: {path}")
        if not path.is_file():
            continue
        total += 1
        name = path.relative_to(root).as_posix()
        checksum = digest(path)
        if remote.get(name) != (path.stat().st_size, checksum):
            changed[name] = (path, checksum)
    print(f"Verified {total} local files; {len(changed)} need uploading.", flush=True)

    def upload(name):
        store.put(name, *changed[name])
        print(f"Uploaded and verified {name}", flush=True)

    # A failed asset upload exits before touching index.html or the service worker.
    with ThreadPoolExecutor(max_workers=8) as pool:
        list(pool.map(upload, [name for name in changed if name not in ENTRY_POINTS]))
    for name in ENTRY_POINTS:
        if name in changed:
            upload(name)
    print("Published complete build; previous assets retained for open tabs.", flush=True)


if __name__ == "__main__":
    app_id = os.environ["GITHUB_REPOSITORY"].split("/")[-1]
    publish(os.environ["OUTPUT_PATH"], R2(os.environ["R2_ACCOUNT_ID"], app_id))
