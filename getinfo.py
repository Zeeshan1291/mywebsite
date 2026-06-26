import sys, json, subprocess
url = sys.argv[1]
result = subprocess.run(['yt-dlp', '-j', '--no-warnings', url], capture_output=True, text=True)
if result.returncode != 0:
    print(json.dumps({"error": result.stderr}))
    sys.exit(1)
data = json.loads(result.stdout)
print(json.dumps({
    "title": data.get("title", ""),
    "thumbnail": data.get("thumbnail", ""),
    "channel": data.get("uploader", ""),
    "duration": data.get("duration_string", "")
}))
