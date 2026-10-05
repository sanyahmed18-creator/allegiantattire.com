#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Study the reference video frame by frame.
#
#   ./tools/analyze-video.sh [video.mp4] [seconds-per-frame]
#
# With no arguments it uses the newest file dropped into ./video-inbox/
# (that is where tools/grab-video.html puts it).
#
# Outputs:
#   video-frames/fNNN.jpg   one frame every N seconds, 1280px wide
#   video-sheets/sheetNN.jpg 3x3 contact sheets for a fast overview
#   a printed map of sheet → timecodes, plus ffprobe metadata
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."

# ffmpeg/ffprobe: $FFMPEG/$FFPROBE override → node_modules → PATH.
# (Static npm builds are handy where the system has no ffmpeg:
#    mkdir -p /tmp/ff && cd /tmp/ff && npm i @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe
#    FFPROBE=/tmp/ff/node_modules/@ffprobe-installer/linux-x64/ffprobe \
#    FFMPEG=/tmp/ff/node_modules/@ffmpeg-installer/linux-x64/ffmpeg ./tools/analyze-video.sh )
FFMPEG="${FFMPEG:-$(ls node_modules/@ffmpeg-installer/linux-*/ffmpeg 2>/dev/null | head -1 || true)}"
FFPROBE="${FFPROBE:-$(ls node_modules/@ffprobe-installer/linux-*/ffprobe 2>/dev/null | head -1 || true)}"
[[ -n "$FFMPEG" ]] || FFMPEG="$(command -v ffmpeg || true)"
[[ -n "$FFPROBE" ]] || FFPROBE="$(command -v ffprobe || true)"
[[ -n "$FFMPEG" && -n "$FFPROBE" ]] || { echo "ffmpeg/ffprobe not found. Try: npm i @ffmpeg-installer/ffmpeg @ffprobe-installer/ffprobe"; exit 1; }

VIDEO="${1:-}"
if [[ -z "$VIDEO" ]]; then
  VIDEO="$(ls -t video-inbox/* 2>/dev/null | head -1 || true)"
fi
[[ -n "$VIDEO" && -f "$VIDEO" ]] || { echo "No video. Drop one into ./video-inbox/ or pass a path."; exit 1; }
EVERY="${2:-2}"

echo "── video ───────────────────────────────────────────────"
ls -la "$VIDEO"
"$FFPROBE" -v error -print_format json -show_format -show_streams "$VIDEO" \
  | node -e '
      let s=""; process.stdin.on("data",d=>s+=d).on("end",()=>{
        const j = JSON.parse(s), f = j.format, v = (j.streams||[]).find(x=>x.codec_type==="video")||{};
        const dur = Number(f.duration||0);
        console.log("  container :", f.format_name, "| size", (f.size/1048576).toFixed(2)+" MB");
        console.log("  duration  :", dur.toFixed(2)+"s", "("+Math.floor(dur/60)+"m "+Math.round(dur%60)+"s)");
        console.log("  video     :", v.codec_name, v.width+"x"+v.height, (v.r_frame_rate||"?")+" fps");
        if (j.streams.some(x=>x.codec_type==="audio")) console.log("  audio     : yes");
      });'

rm -rf video-frames video-sheets
mkdir -p video-frames video-sheets

echo "── extracting 1 frame every ${EVERY}s ────────────────────"
"$FFMPEG" -y -v error -i "$VIDEO" -vf "fps=1/${EVERY},scale=1280:-2" -q:v 3 video-frames/f%03d.jpg
FRAMES=$(ls video-frames | wc -l)
echo "  $FRAMES frames → video-frames/"

"$FFMPEG" -y -v error -i "$VIDEO" -vf "fps=1/${EVERY},scale=600:-2,tile=3x3" -q:v 4 video-sheets/sheet%02d.jpg
SHEETS=$(ls video-sheets | wc -l)
echo "  $SHEETS contact sheets → video-sheets/"

echo "── map (tile n of sheet m ≈ time) ──────────────────────"
i=1
for s in video-sheets/*.jpg; do
  first=$(( (i - 1) * 9 * EVERY ))
  last=$(( first + 8 * EVERY ))
  printf "  %-22s t=%ss → %ss\n" "$s" "$first" "$last"
  i=$(( i + 1 ))
done
