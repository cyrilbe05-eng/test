# Pingu Studio: uploading videos with the API

*For Anton, or for the AI agent / automation that uploads for him. Paste this whole page into your agent.*

## What this does

Each upload creates **one new video project** in Anton's Pingu Studio account, with the video attached as the footage, exactly like pressing "New video" on the website. The Pingu team is notified as usual.

The API key can only do this: upload videos into Anton's account. It can't read projects, messages or anything else.

## Setup (once)

1. Pingu Studio gives you an **API key**. It starts with `pgk_`. Keep it secret like a password and don't paste it into shared documents or code repositories. If it leaks, ask Pingu Studio to turn it off and make a new one.
2. Store it as an environment variable named `PINGU_API_KEY`.
3. Save the script at the bottom of this page as `pingu_upload.py`. It needs Python 3.8 or newer and nothing to install.

## How to upload (instructions for the agent)

**A video file on this computer:**
```
python pingu_upload.py "/path/to/video.mov" --title "Gym tour" --instructions "Fast cuts, captions in white"
```

**A video in Google Drive, Dropbox, or at any direct download link** (our server downloads it, so nothing goes through this computer):
```
python pingu_upload.py --link "https://drive.google.com/file/d/…/view" --title "Gym tour"
```

- `--title` is the project name. If you leave it out, the file name is used.
- Optional extras: `--instructions` (notes for the editor), `--script` (the video script), `--inspiration` (a link to a reference video).
- **Google Drive / Dropbox links must be shared as "Anyone with the link".** Use the link to **one video file**, not a folder.
- **One video per command.** For several videos, run the command once per video. It's fine to run two or three at the same time, but not dozens.
- When it finishes, the script prints one line of JSON with `"status": "done"` and the `project_url`. That means the upload worked.
- **If it stops** (lost connection, computer slept, crash), **run exactly the same command again.** A file upload resumes where it stopped; nothing is sent twice. Link downloads keep going on our server and the script waits for them.
- If it prints `Error …` or `The link download failed: …`, the message says what to fix. Common ones are in the table below.

## Limits

- Up to **100 GB** per video. Video files only: .mp4 .mov .m4v .webm .mkv .avi .mts .m2ts .3gp .mxf
- **60 requests per minute** per key. The script slows down automatically if it hits this.
- Normal account limits apply: storage space, videos in progress at once.

## Common errors

| Message | What to do |
|---|---|
| `invalid_api_key` / 401 | The key is wrong or was turned off. Ask Pingu Studio for a new one. |
| `not_a_video` | The file name must end in a video extension (see Limits). |
| `The link opened a web page instead of a video file` | The Drive/Dropbox link isn't public. Share it as "Anyone with the link", or use a direct download link. |
| `The link answered 404` / `403` | The link is wrong, expired or not shared. |
| `storage_limit_reached` | The account is out of storage space. Contact Pingu Studio. |
| `active_project_limit_reached` | Too many videos in progress at once. Wait until some are finished. |
| `full_package_needs_script` | This account uploads from scripts on the website. Upload there instead. |

## For developers: the calls the script makes

Base address: `https://dashboard.projectpingu.com/api/v1`. Every call needs the header `Authorization: Bearer pgk_…`. Bodies are JSON. Errors come back as `{"error": "…", "code": "…"}`.

| Call | What it does |
|---|---|
| `GET /me` | Checks the key: returns the account name and limits. |
| `POST /uploads` `{file_name, file_size, title?, instructions?, video_script?, inspiration_url?}` | Starts a file upload. Returns `upload` (id, `part_size`, `part_count`) and `parts`: an upload address per piece (first 1,000; valid 24 h). |
| `PUT <piece url>` | Send piece *n*: bytes from `(n-1)*part_size` to `n*part_size`. Keep the `ETag` header from the answer. |
| `POST /uploads/{id}/parts` `{part_numbers:[…]}` | New addresses for pieces (expired, or above 1,000). Max 1,000 per call. |
| `POST /uploads/{id}/complete` `{parts:[{part_number, etag}]}` | All pieces sent. Creates the project; the answer has `upload.project.url`. Safe to repeat. |
| `GET /uploads/{id}` | Status of an upload: `uploading`, `processing`, `done`, `failed`, `cancelled`. |
| `DELETE /uploads/{id}` | Cancels an unfinished file upload. |
| `GET /uploads` | Your last 50 API uploads. |
| `POST /imports` `{url, title?, instructions?, video_script?, inspiration_url?}` | Our server downloads the link. Answers `done`, `failed`, or `queued`/`downloading`. |
| `GET /imports/{id}` | Status of a link download, with `bytes_received`. Check every 30–60 seconds until `done` or `failed`. |

## The script: `pingu_upload.py`

```python
#!/usr/bin/env python3
"""Upload a video to Pingu Studio (creates a new video project).

  python pingu_upload.py FILE [--title T] [--instructions I] [--script S] [--inspiration URL]
  python pingu_upload.py --link URL [--title T] [--instructions I] [--script S] [--inspiration URL]

Needs the API key in the environment:  PINGU_API_KEY=pgk_...
Python 3.8+, nothing to install. Safe to run again after a crash or a lost
connection: a file upload resumes where it stopped (progress is kept next to
the file in FILE.pingu-upload.json and deleted when done).
"""
import argparse, json, os, sys, time, urllib.error, urllib.request

API = os.environ.get("PINGU_API_URL", "https://dashboard.projectpingu.com/api/v1").rstrip("/")
KEY = os.environ.get("PINGU_API_KEY", "")


def call(method, path, body=None, tries=6):
    data = json.dumps(body).encode() if body is not None else None
    for attempt in range(tries):
        req = urllib.request.Request(API + path, data=data, method=method, headers={
            "Authorization": "Bearer " + KEY, "Content-Type": "application/json", "User-Agent": "pingu-upload/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                return r.status, json.loads(r.read() or b"{}")
        except urllib.error.HTTPError as e:
            payload = json.loads(e.read() or b"{}")
            if e.code == 429:                                   # too many requests: wait as told
                time.sleep(int(e.headers.get("Retry-After", "30")) + 1); continue
            if e.code >= 500 and attempt < tries - 1:
                time.sleep(5 * (attempt + 1)); continue
            return e.code, payload
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            if attempt == tries - 1: raise
            print(f"  connection problem ({e}); retrying...", flush=True); time.sleep(5 * (attempt + 1))
    raise SystemExit("Gave up after several tries.")


def fail(status, payload):
    raise SystemExit(f"Error {status}: {payload.get('error', payload)}")


def put_piece(url, data, tries=8):
    for attempt in range(tries):
        req = urllib.request.Request(url, data=data, method="PUT", headers={"Content-Length": str(len(data))})
        try:
            with urllib.request.urlopen(req, timeout=600) as r:
                etag = r.headers.get("ETag")
                if etag: return etag
        except urllib.error.HTTPError as e:
            if e.code == 403: return None                       # address expired: caller gets a fresh one
            if attempt == tries - 1: raise
        except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
            if attempt == tries - 1: raise
            print(f"  connection dropped ({e}); retrying piece...", flush=True)
        time.sleep(min(60, 3 * 2 ** attempt))
    raise SystemExit("A piece could not be sent after several tries. Run the same command again to resume.")


def upload_file(path, fields):
    size = os.path.getsize(path)
    state_file = path + ".pingu-upload.json"
    state = None
    if os.path.exists(state_file):
        state = json.load(open(state_file))
        if state.get("size") != size or state.get("mtime") != int(os.path.getmtime(path)):
            state = None                                        # file changed: start over
        else:
            st, r = call("GET", f"/uploads/{state['id']}")
            if st != 200 or r["upload"]["status"] != "uploading":
                if st == 200 and r["upload"]["status"] == "done":
                    os.remove(state_file); return r["upload"]
                state = None
    if state is None:
        st, r = call("POST", "/uploads", {"file_name": os.path.basename(path), "file_size": size, **fields})
        if st != 201: fail(st, r)
        up = r["upload"]
        state = {"id": up["id"], "size": size, "mtime": int(os.path.getmtime(path)),
                 "part_size": up["part_size"], "part_count": up["part_count"], "etags": {}}
        urls = {p["part_number"]: p["url"] for p in r["parts"]}
        json.dump(state, open(state_file, "w"))
        print(f"Started upload {up['id']}: {size / 1e6:.1f} MB in {up['part_count']} pieces", flush=True)
    else:
        urls = {}
        print(f"Resuming upload {state['id']}: {len(state['etags'])}/{state['part_count']} pieces already sent", flush=True)

    todo = [n for n in range(1, state["part_count"] + 1) if str(n) not in state["etags"]]
    with open(path, "rb") as f:
        for n in todo:
            for _ in range(3):
                if n not in urls:                               # fetch addresses 1000 at a time
                    batch = [m for m in todo if m >= n][:1000]
                    st, r = call("POST", f"/uploads/{state['id']}/parts", {"part_numbers": batch})
                    if st != 200: fail(st, r)
                    urls.update({p["part_number"]: p["url"] for p in r["parts"]})
                f.seek((n - 1) * state["part_size"])
                etag = put_piece(urls[n], f.read(state["part_size"]))
                if etag: break
                urls.pop(n, None)
            else:
                raise SystemExit("Upload addresses keep expiring. Run the same command again.")
            state["etags"][str(n)] = etag
            json.dump(state, open(state_file, "w"))
            print(f"  piece {n}/{state['part_count']} sent", flush=True)

    parts = [{"part_number": int(n), "etag": e} for n, e in state["etags"].items()]
    st, r = call("POST", f"/uploads/{state['id']}/complete", {"parts": parts})
    if st == 409:                                               # already being finished: wait for it
        for _ in range(20):
            time.sleep(5); st, r = call("GET", f"/uploads/{state['id']}")
            if r.get("upload", {}).get("status") in ("done", "failed"): break
    if st not in (200, 201) or r["upload"]["status"] != "done": fail(st, r)
    os.remove(state_file)
    return r["upload"]


def upload_link(link, fields):
    st, r = call("POST", "/imports", {"url": link, **fields})
    if st not in (201, 202, 422): fail(st, r)
    up = r["upload"]
    print(f"Link accepted ({up['id']}); our server is downloading it...", flush=True)
    while up["status"] not in ("done", "failed"):
        time.sleep(30)
        st, r = call("GET", f"/imports/{up['id']}")
        if st != 200: fail(st, r)
        up = r["upload"]
        got = (up.get("bytes_received") or 0) / 1e6
        total = f" of {up['file_size'] / 1e6:.0f}" if up.get("file_size") else ""
        print(f"  {up['status']}: {got:.0f}{total} MB", flush=True)
    if up["status"] == "failed": raise SystemExit(f"The link download failed: {up['error']}")
    return up


def main():
    ap = argparse.ArgumentParser(description="Upload a video to Pingu Studio.")
    ap.add_argument("file", nargs="?", help="video file to upload")
    ap.add_argument("--link", help="instead of a file: a Google Drive, Dropbox or direct download link")
    ap.add_argument("--title"); ap.add_argument("--instructions")
    ap.add_argument("--script", dest="video_script"); ap.add_argument("--inspiration", dest="inspiration_url")
    a = ap.parse_args()
    if not KEY.startswith("pgk_"): raise SystemExit("Set PINGU_API_KEY to your API key (it starts with pgk_).")
    if bool(a.file) == bool(a.link): raise SystemExit("Give either a FILE or --link URL.")
    fields = {k: v for k, v in {"title": a.title, "instructions": a.instructions,
              "video_script": a.video_script, "inspiration_url": a.inspiration_url}.items() if v}
    up = upload_file(a.file, fields) if a.file else upload_link(a.link, fields)
    print(json.dumps({"status": "done", "project_id": up["project"]["id"], "project_url": up["project"]["url"],
                      "title": up["title"], "file_name": up["file_name"]}))


if __name__ == "__main__":
    main()
```
