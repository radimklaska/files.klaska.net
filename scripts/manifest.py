"""Crawl an Apache-style (or our Worker's) directory listing and print one TSV line per file:
<url-path>\t<listed size>. Usage: python3 -I scripts/manifest.py https://files.klaska.net/ > manifest.tsv"""
import re, sys, urllib.parse, urllib.request
base = sys.argv[1]
seen, stack = set(), [base]
link = re.compile(r'<a href="([^"?/][^"]*)">')
size_after = re.compile(r'<a href="([^"?/][^"]*)">.*?</a>(?:</td><td class="m">[^<]*</td><td class="s">|\s+\S+ \S+\s+)(\S+?)(?:</td>|\s)')
while stack:
    u = stack.pop()
    if u in seen: continue
    seen.add(u)
    html = urllib.request.urlopen(urllib.request.Request(u, headers={"User-Agent": "files-manifest"}), timeout=60).read().decode("utf-8", "surrogateescape")
    for href, size in size_after.findall(html):
        if href.startswith("../"): continue
        full = urllib.parse.urljoin(u, href)
        if not full.startswith(base): continue
        if href.endswith("/"): stack.append(full)
        else: print(f"{urllib.parse.urlparse(full).path}\t{size}")
