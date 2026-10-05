#!/usr/bin/env bash
# One-shot probe: download a shared Google-Drive video, extract frames + contact
# sheets, and push them to the arena branch so the coding agent can inspect the UI.
set -x
FILE_ID="1Zxq53a9-TQQL3d-2MIKsNqnEyMCqiNx8"
BRANCH="arena/93d9c27f-allegiantattire-com"
cd "$(git rev-parse --show-toplevel)" || exit 1

LOG="video-probe.log"
: > "$LOG"
exec > >(tee -a "$LOG") 2>&1

sudo apt-get update -qq >>"$LOG" 2>&1
sudo apt-get install -y -qq ffmpeg python3-pip >>"$LOG" 2>&1
python3 -m pip install --quiet --upgrade gdown pillow >>"$LOG" 2>&1

echo "=== downloading drive file $FILE_ID ==="
gdown "https://drive.google.com/uc?id=${FILE_ID}&export=download" -O /tmp/video.mp4 \
  || gdown "${FILE_ID}" -O /tmp/video.mp4 \
  || gdown --fuzzy "https://drive.google.com/file/d/${FILE_ID}/view" -O /tmp/video.mp4
ls -la /tmp/video.mp4
ffprobe -v error -show_entries stream=codec_type,codec_name,width,height,r_frame_rate,duration \
  -show_entries format=duration,size,format_name -of default=noprint_wrappers=1 /tmp/video.mp4

python3 - <<'PY'
import json, subprocess, math, os
from PIL import Image, ImageDraw
v = "/tmp/video.mp4"
if not os.path.exists(v) or os.path.getsize(v) < 10000:
    raise SystemExit("download failed")
meta = json.loads(subprocess.check_output(["ffprobe","-v","error","-print_format","json","-show_format","-show_streams", v]))
dur = float(meta["format"]["duration"])
print("DURATION", dur)
os.makedirs("video-frames", exist_ok=True)
n = max(12, min(48, int(dur/2)+1))
step = dur/n
for i in range(n):
    t = min(dur-0.05, i*step)
    subprocess.run(["ffmpeg","-y","-v","error","-ss",f"{t:.2f}","-i",v,"-frames:v","1",
                    "-vf","scale=1100:-2","-q:v","4", f"video-frames/f{i:03d}_t{t:05.1f}.jpg"], check=True)
files = sorted(os.listdir("video-frames"))
os.makedirs("video-sheets", exist_ok=True)
per, cols = 6, 3
for s in range(math.ceil(len(files)/per)):
    chunk = files[s*per:(s+1)*per]
    ims = []
    for f in chunk:
        im = Image.open(os.path.join("video-frames", f)).convert("RGB"); im.thumbnail((600,600)); ims.append((f, im))
    cw = max(i.width for _,i in ims)+8; ch = max(i.height for _,i in ims)+24
    sheet = Image.new("RGB",(cw*cols, ch*math.ceil(len(ims)/cols)),(18,18,18)); d = ImageDraw.Draw(sheet)
    for k,(f,im) in enumerate(ims):
        x=(k%cols)*cw; y=(k//cols)*ch
        sheet.paste(im,(x+4,y+4)); d.text((x+6,y+im.height+7), f.replace(".jpg",""), fill=(255,255,255))
    sheet.save(f"video-sheets/sheet{s+1}.jpg", quality=78)
print("FRAMES", len(files))
PY

git config user.name "arena-codespace"
git config user.email "agent@arena.ai"
git add -f video-frames video-sheets video-probe.log
git commit -m "chore: reference-video frames (auto-extracted)" || echo "nothing to commit"
git push "https://x-access-token:${GITHUB_TOKEN}@github.com/${GITHUB_REPOSITORY}.git" HEAD:"$BRANCH" || git push origin HEAD:"$BRANCH"
echo "=== DONE ==="
