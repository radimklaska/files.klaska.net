# files.klaska.net

**https://files.klaska.net/** is a plain directory listing of old study materials (mostly ČVUT, 2008–2014), about 4 GB.

It used to be an Apache `Options +Indexes` site on Active24/Websupport hosting. It now runs on Cloudflare:

- **R2 bucket `files-klaska-net`** holds the files. Each object key is the URL path without the leading slash (`cvut/numerika/num metody/po_ada_1.pdf`), so every old URL still works.
- **Worker `files-klaska-net`** (`src/index.js`) serves the bucket on the `files.klaska.net` custom domain:
  - A path ending in `/` gets an Apache-style "Index of …" page, built live from the bucket listing.
  - Any other path is streamed from R2, with `Range`, `ETag`/`If-None-Match` and `HEAD` support.
  - A folder path without the trailing slash gets a 301 redirect to the slash version, as Apache's `mod_dir` did.
  - One old file had a Windows-1250 (non-UTF-8) name. Its key is now UTF-8, and old percent-encoded links to it are 301-redirected.
  - "Last modified" shows the original file mtime, which rclone stores as `mtime` metadata.

The data itself is **not** in this repository. Locally it lives in `data/`, which is gitignored.

## Cost

Everything fits in the free tier: R2 gives 10 GB storage, 1M writes and 10M reads per month, with no egress fees, and Workers gives 100k requests per day. R2 needs a payment method on the account even when it stays free.

## Day-to-day: add, change or remove files

1. Put the file into `data/` at the path it should have in the URL.
2. Run `scripts/sync.sh --dry-run` and check what would change.
3. Run `scripts/sync.sh`.

Nothing has to be redeployed. Listings are built live, so a new file shows up right away (listing pages are cached for up to 5 minutes, files for 1 day).

`sync.sh` is a `rclone sync`: **`data/` is the source of truth, and objects missing from `data/` are deleted from the bucket.** You can also upload single files in the Cloudflare dashboard (R2 → `files-klaska-net` → Upload). If you do, copy them into `data/` too, or the next sync deletes them.

`sync.sh` reads these from `~/.env`:

```
CF_ACCOUNT_ID=...          # Cloudflare account id
R2_ACCESS_KEY_ID=...       # R2 API token (Object Read & Write, this bucket only)
R2_SECRET_ACCESS_KEY=...
```

Create the token in the Cloudflare dashboard → R2 → Manage API tokens.

## Worker development

```sh
npm install
npx wrangler login          # once
npm run dev                 # local, uses a simulated empty bucket (.wrangler/state)
npx wrangler r2 object put files-klaska-net/test.txt --file README.md --local   # seed it
npm run deploy
```

## Verification

`scripts/verify.py <base-url>` checks every file in `data/` against a deployment:

```sh
python3 -I scripts/verify.py https://files.klaska.net/          # HEAD: sizes
python3 -I scripts/verify.py https://files.klaska.net/ --get    # GET: MD5 of every body (downloads ~4 GB)
```

`scripts/manifest.py <base-url>` crawls any Apache-style or Worker listing and prints `path<TAB>size` for each file. It's useful for comparing two hosts.

## Migration log (2026-11-05)

- Source: the Active24/Websupport shell account, web root `~/files.klaska.net/web/`. Copied with `rsync -a` (this keeps mtimes) into `data/`.
- Not migrated:
  - `.htaccess` files. They only set `Options +Indexes` and `IndexOptions -FancyIndexing`. Apache never served them, and the Worker's listing covers both.
  - Apache's sort links (`?C=M;O=A`) and the `/eikonostasi/` icons. Query strings are ignored, so old sort links still show the listing.
- The redirect `sites/files.klaska.net/files/manual_files/* → /*` existed only in an old local copy, not on the live host, so it was dropped.
- DNS for `klaska.net` was already on Cloudflare. The cutover replaced the proxied A record for `files.klaska.net` with the Worker custom domain.
