# Pingu Studio: uploading videos with the API

*For Anton, or for the AI agent / automation that uploads for him. Paste this whole page into your agent.*

## What this does

**Every video becomes its own new project** in Anton's Pingu Studio account, with the video attached as the footage, exactly like pressing "New video" on the website. The Pingu team is notified as usual.

The API key can only do this: upload videos into Anton's account. It can't read projects, messages or anything else.

## Setup (once)

1. Pingu Studio gives you an **API key**. It starts with `pgk_`. Keep it secret like a password and don't paste it into shared documents or code repositories. If it leaks, ask Pingu Studio to turn it off and make a new one.
2. Store it as an environment variable named `PINGU_API_KEY`.
3. Save the script at the bottom of this page as `pingu_upload.py`. It needs Python 3.8 or newer and nothing to install.

## The 4 ways to upload (instructions for the agent)

Pick the one that matches where the videos are. Always use this script; don't click through the website.

**1. One video file on this computer**
```
python pingu_upload.py "/path/to/video.mov" --title "Gym tour" --instructions "Fast cuts, captions in white"
```

**2. A folder of videos on this computer** (folders inside it are included)
```
python pingu_upload.py "/path/to/folder" --title "Gym shoot" --instructions "Same style for all"
```
One project per video, titled with the file name; with `--title`, it's used as a prefix: "Gym shoot · IMG_0412". Photos, documents and other non-video files are skipped and listed. The script first checks the account has room for all the videos; if not, it uploads nothing and says why.

**3. One video at a link** (Google Drive, Dropbox, or any direct download link; our server downloads it, so nothing goes through this computer)
```
python pingu_upload.py --link "https://drive.google.com/file/d/…/view" --title "Gym tour"
```

**4. A Google Drive folder link** (folders inside it are included)
```
python pingu_upload.py --link "https://drive.google.com/drive/folders/…" --title "Gym shoot"
```
Same as option 2: one project per video, others skipped and listed, the account is checked first. Our server downloads the videos.

### Rules for all 4
- `--title` is optional. Without it, the file name is the project title. Other optional extras: `--instructions` (notes for the editor), `--script` (the video script), `--inspiration` (a link to a reference video). For folders, these apply to every video.
- **Links must be shared as "Anyone with the link".** Folder links work for **Google Drive only**. For Dropbox, send one link per video.
- **At most 100 videos per folder.** For more, upload the sub-folders one at a time.
- **When it finishes, the script prints one line of JSON.**
  - Options 1 and 3: `{"status": "done", "title": …, "project_url": …}`
  - Options 2 and 4: `{"status": "done", "projects": [ … one entry per video, each with its project_url … ], "failed": [], "skipped": [ … ]}`
  - `"status": "partial"` means some videos failed. They're listed in `"failed"` with the reason.
- **If it stops** (lost connection, computer slept, crash), **run exactly the same command again.** It continues where it stopped: videos already uploaded are not uploaded twice, and a half-sent file resumes. Link downloads keep going on our server and the script waits for them.
- **One command at a time per folder.** Running a few different commands at once is fine; dozens at once isn't.
- If it prints `Error …` or `The link download failed: …`, the message says what to fix. Common ones are below.

## Limits

- Up to **100 GB** per video. Video files only: .mp4 .mov .m4v .webm .mkv .avi .mts .m2ts .3gp .mxf
- **60 requests per minute** per key. The script slows down automatically if it hits this.
- Normal account limits apply: storage space, videos in progress at once.

## Common errors

| Message | What to do |
|---|---|
| `invalid_api_key` / 401 | The key is wrong or was turned off. Ask Pingu Studio for a new one. |
| `not_a_video` | Only video files can be uploaded (see Limits). |
| `The link opened a web page instead of a video file` | The Drive/Dropbox link isn't public. Share it as "Anyone with the link", or use a direct download link. |
| `Google Drive could not open this folder` | Share the folder as "Anyone with the link". |
| `No video files found in this folder` | The folder (and the folders inside it) has no videos. Check the link. |
| `too_many_videos` | More than 100 videos. Upload sub-folders one at a time. |
| `The link answered 404` / `403` | The link is wrong, expired or not shared. |
| `storage_limit_reached` | Not enough storage space left on the account. Nothing was uploaded. Contact Pingu Studio. |
| `active_project_limit_reached` | Too many videos in progress at once. Nothing was uploaded. Wait until some are finished, or upload fewer. |
| `full_package_needs_script` | This account uploads from scripts on the website. Upload there instead. |

## For developers: the calls the script makes

Base address: `https://dashboard.projectpingu.com/api/v1`. Every call needs the header `Authorization: Bearer pgk_…`. Bodies are JSON. Errors come back as `{"error": "…", "code": "…"}`.

| Call | What it does |
|---|---|
| `GET /me` | Checks the key: returns the account name and limits. |
| `POST /check` `{files:[{file_name, file_size}]}` | Would these videos fit the account (count and storage)? Use before uploading a folder. |
| `POST /uploads` `{file_name, file_size, title?, instructions?, video_script?, inspiration_url?}` | Starts a file upload. Returns `upload` (id, `part_size`, `part_count`) and `parts`: an upload address per piece (first 1,000; valid 24 h). |
| `PUT <piece url>` | Send piece *n*: bytes from `(n-1)*part_size` to `n*part_size`. Keep the `ETag` header from the answer. |
| `POST /uploads/{id}/parts` `{part_numbers:[…]}` | New addresses for pieces (expired, or above 1,000). Max 1,000 per call. |
| `POST /uploads/{id}/complete` `{parts:[{part_number, etag}]}` | All pieces sent. Creates the project; the answer has `upload.project.url`. Safe to repeat. |
| `GET /uploads/{id}` | Status of an upload: `uploading`, `processing`, `done`, `failed`, `cancelled`. |
| `DELETE /uploads/{id}` | Cancels an unfinished file upload. |
| `GET /uploads` | Your last 50 API uploads. |
| `POST /imports` `{url, title?, instructions?, video_script?, inspiration_url?}` | Our server downloads the link. For one video, returns `upload`. For a Google Drive folder, returns `folder` (videos found, skipped files) and `uploads` (one per video). |
| `GET /imports/{id}` | Status of a link download, with `bytes_received`. Check every 30–60 seconds until `done` or `failed`. |

## The script: `pingu_upload.py`

```python
{{SCRIPT}}
```
