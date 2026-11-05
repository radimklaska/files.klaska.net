"""Check that every file in ./data is served by the given base URL with the same size.
Usage: python3 -I scripts/verify.py https://files.klaska.net/  [--get]  (--get also compares MD5 of the body)"""
import concurrent.futures, hashlib, os, sys, urllib.parse, urllib.request

base = sys.argv[1].rstrip("/")
full = "--get" in sys.argv
root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "data")
paths = []
for d, _, files in os.walk(root):
    for f in files:
        if f == ".htaccess":
            continue
        rel = os.path.relpath(os.path.join(d, f), root)
        paths.append(rel)

def check(rel):
    url = base + "/" + "/".join(urllib.parse.quote(p, safe="") for p in rel.split("/"))
    req = urllib.request.Request(url, method="GET" if full else "HEAD", headers={"User-Agent": "files-verify"})
    local = os.path.join(root, rel)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            if full:
                h = hashlib.md5()
                for chunk in iter(lambda: r.read(1 << 20), b""):
                    h.update(chunk)
                with open(local, "rb") as fh:
                    lh = hashlib.md5()
                    for chunk in iter(lambda: fh.read(1 << 20), b""):
                        lh.update(chunk)
                return None if h.hexdigest() == lh.hexdigest() else f"MD5 MISMATCH {rel}"
            size = int(r.headers.get("Content-Length", -1))
            return None if size == os.path.getsize(local) else f"SIZE {size} != {os.path.getsize(local)} {rel}"
    except Exception as e:
        return f"ERROR {e} {rel}"

with concurrent.futures.ThreadPoolExecutor(16) as ex:
    problems = [p for p in ex.map(check, paths) if p]
for p in problems:
    print(p)
print(f"checked {len(paths)} files, {len(problems)} problems")
sys.exit(1 if problems else 0)
