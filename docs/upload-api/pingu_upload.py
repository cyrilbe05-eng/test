#!/usr/bin/env python3
"""Upload videos to Pingu Studio. Every video becomes its own new project.

  python pingu_upload.py FILE        [--title T] [--instructions I] [--script S] [--inspiration URL]
  python pingu_upload.py FOLDER      [same options]   every video in the folder and its sub-folders
  python pingu_upload.py --link URL  [same options]   one video, or a Google Drive folder

Needs the API key in the environment:  PINGU_API_KEY=pgk_...
Python 3.8+, nothing to install. Safe to run again after a crash or a lost
connection: a file upload resumes where it stopped (progress is kept next to
the file in FILE.pingu-upload.json), a folder upload skips videos it already
uploaded (FOLDER/.pingu-folder-upload.json), and a link upload picks up the
downloads it already started (~/.pingu-upload/). All are deleted when done.
"""
import argparse, hashlib, json, os, sys, time, urllib.error, urllib.request

API = os.environ.get("PINGU_API_URL", "https://dashboard.projectpingu.com/api/v1").rstrip("/")
KEY = os.environ.get("PINGU_API_KEY", "")
try: sys.stdout.reconfigure(errors="replace")       # odd file names never crash the progress lines
except Exception: pass


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


VIDEO_EXTS = {".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi", ".mts", ".m2ts", ".3gp", ".mxf"}
MAX_FOLDER = 100


def done_line(up):
    return {"title": up["title"], "file_name": up["file_name"], "project_id": up["project"]["id"], "project_url": up["project"]["url"]}


def summary(projects, failed, skipped):
    print(json.dumps({"status": "done" if not failed else "partial", "projects": projects, "failed": failed, "skipped": skipped}))
    if failed: sys.exit(1)


def wait_for(uploads):
    """Polls link downloads until each is done or failed; prints progress."""
    pending = {u["id"]: u for u in uploads}
    final = {}
    for u in uploads:
        if u["status"] in ("done", "failed"): final[u["id"]] = pending.pop(u["id"])
    while pending:
        time.sleep(30)
        for uid in list(pending):
            st, r = call("GET", f"/imports/{uid}")
            if st != 200: fail(st, r)
            up = r["upload"]
            got = (up.get("bytes_received") or 0) / 1e6
            total = f" of {up['file_size'] / 1e6:.0f}" if up.get("file_size") else ""
            print(f"  {up['file_name'] or up['title'] or uid}: {up['status']}, {got:.0f}{total} MB", flush=True)
            if up["status"] in ("done", "failed"): final[uid] = pending.pop(uid)
    return [final[u["id"]] for u in uploads]


def upload_link(link, fields):
    # Remember what this command started, so running it again waits for the same
    # downloads instead of starting them twice.
    sig = hashlib.sha256(json.dumps([API, KEY[-8:], link, fields], sort_keys=True).encode()).hexdigest()[:16]
    state_file = os.path.join(os.path.expanduser("~"), ".pingu-upload", f"link-{sig}.json")
    r = None
    if os.path.exists(state_file):
        saved = json.load(open(state_file))
        ups = []
        for uid in saved["ids"]:
            st, got = call("GET", f"/imports/{uid}")
            if st not in (200, 201, 202, 422): ups = None; break
            ups.append(got["upload"])
        if ups:
            print(f"Picking up the {len(ups)} download(s) this command already started...", flush=True)
            r = {"folder": saved["folder"], "uploads": ups} if saved.get("folder") else {"upload": ups[0]}
    if r is None:
        st, r = call("POST", "/imports", {"url": link, **fields})
        if st not in (201, 202, 422) or not ("uploads" in r or "upload" in r): fail(st, r)
        ids = [u["id"] for u in r["uploads"]] if "folder" in r else [r["upload"]["id"]]
        os.makedirs(os.path.dirname(state_file), exist_ok=True)
        json.dump({"link": link, "ids": ids, "folder": r.get("folder")}, open(state_file, "w"))
    if "folder" in r:                                           # a Google Drive folder: one project per video
        f = r["folder"]
        print(f"Drive folder: {f['videos']} video(s) found, {len(f['skipped'])} other file(s) skipped. Our server is downloading them...", flush=True)
        ups = wait_for(r["uploads"])
        os.remove(state_file)                                   # every download has its final result
        summary([done_line(u) for u in ups if u["status"] == "done"],
                [{"file_name": u["file_name"], "error": u["error"]} for u in ups if u["status"] != "done"], f["skipped"])
        return
    up = r["upload"]
    print(f"Link accepted ({up['id']}); our server is downloading it...", flush=True)
    up = wait_for([up])[0]
    os.remove(state_file)
    if up["status"] == "failed": raise SystemExit(f"The link download failed: {up['error']}")
    print(json.dumps({"status": "done", **done_line(up)}))


def upload_folder(folder, fields):
    """Every video in a folder on this computer (sub-folders too): one project each."""
    folder = os.path.abspath(folder)
    videos, skipped = [], []
    for root, dirs, files in os.walk(folder):
        dirs[:] = sorted(d for d in dirs if not d.startswith("."))
        for name in sorted(files):
            if name.startswith(".") or name.endswith(".pingu-upload.json"): continue
            rel = os.path.relpath(os.path.join(root, name), folder).replace(os.sep, "/")
            (videos if os.path.splitext(name)[1].lower() in VIDEO_EXTS else skipped).append(rel)
    state_file = os.path.join(folder, ".pingu-folder-upload.json")
    done = json.load(open(state_file)) if os.path.exists(state_file) else {}
    sig = lambda rel: [os.path.getsize(os.path.join(folder, rel)), int(os.path.getmtime(os.path.join(folder, rel)))]
    todo = [v for v in videos if done.get(v, {}).get("sig") != sig(v)]
    if not videos: raise SystemExit(f"No video files in this folder (skipped: {', '.join(skipped[:10]) or 'nothing'}).")
    if len(todo) > MAX_FOLDER: raise SystemExit(f"{len(todo)} videos: at most {MAX_FOLDER} at a time. Upload the sub-folders one by one.")
    print(f"Folder: {len(videos)} video(s), {len(skipped)} other file(s) skipped"
          + (f", {len(videos) - len(todo)} already uploaded earlier" if len(todo) < len(videos) else ""), flush=True)
    if todo:                                                    # whole folder fits the account, or nothing starts
        st, r = call("POST", "/check", {"files": [{"file_name": os.path.basename(v), "file_size": sig(v)[0]} for v in todo]})
        if st != 200: fail(st, r)
    failed = []
    for i, rel in enumerate(todo, 1):
        stem = " · ".join(os.path.splitext(rel)[0].split("/"))     # "Vid 3/After.mp4" -> "Vid 3 · After"
        print(f"[{i}/{len(todo)}] {rel}", flush=True)
        f = dict(fields, title=f"{fields['title']} · {stem}" if fields.get("title") else stem)
        try:
            up = upload_file(os.path.join(folder, rel), f)
        except SystemExit as e:
            print(f"  failed: {e}", flush=True); failed.append({"file_name": rel, "error": str(e)}); continue
        done[rel] = {"sig": sig(rel), **done_line(up)}
        json.dump(done, open(state_file, "w"))
    projects = [{k: v for k, v in done[rel].items() if k != "sig"} for rel in videos if rel in done]
    if not failed and os.path.exists(state_file): os.remove(state_file)
    summary(projects, failed, skipped)


def main():
    ap = argparse.ArgumentParser(description="Upload videos to Pingu Studio (one new project per video).")
    ap.add_argument("path", nargs="?", help="a video file, or a folder of videos on this computer")
    ap.add_argument("--link", help="instead: a link to one video (Google Drive, Dropbox, direct) or a Google Drive folder")
    ap.add_argument("--title"); ap.add_argument("--instructions")
    ap.add_argument("--script", dest="video_script"); ap.add_argument("--inspiration", dest="inspiration_url")
    a = ap.parse_args()
    if not KEY.startswith("pgk_"): raise SystemExit("Set PINGU_API_KEY to your API key (it starts with pgk_).")
    if bool(a.path) == bool(a.link): raise SystemExit("Give either a FILE or FOLDER, or --link URL.")
    fields = {k: v for k, v in {"title": a.title, "instructions": a.instructions,
              "video_script": a.video_script, "inspiration_url": a.inspiration_url}.items() if v}
    if a.link: return upload_link(a.link, fields)
    if os.path.isdir(a.path): return upload_folder(a.path, fields)
    if not os.path.isfile(a.path): raise SystemExit(f"Not found: {a.path}")
    up = upload_file(a.path, fields)
    print(json.dumps({"status": "done", **done_line(up)}))


if __name__ == "__main__":
    main()
