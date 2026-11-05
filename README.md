# files.klaska.net

**https://files.klaska.net/** is a plain directory listing of old study materials (mostly ČVUT, 2008–2014), about 4 GB.

It runs on Cloudflare:

- **R2 bucket `files-klaska-net`** holds the files. Each object key is the URL path without the leading slash, for example `cvut/numerika/num metody/po_ada_1.pdf`.
- **Worker `files-klaska-net`** (`src/index.js`) serves the bucket on the `files.klaska.net` custom domain:
  - A path ending in `/` gets an "Index of …" page, built live from the bucket listing. Dates are shown in Prague time, and query strings are ignored.
  - Any other path is streamed from R2, with `Range`, `ETag`/`If-None-Match` and `HEAD` support.
  - A folder path without the trailing slash gets a 301 redirect to the slash version.
  - A URL that isn't valid UTF-8 is decoded as Windows-1250 and 301-redirected to the UTF-8 key, if that key exists.
  - Text files are sent without a charset, because several are Windows-1250 or ISO-8859-1. Browsers then use the file's own `<meta charset>` or detect it.
  - "Last modified" shows the file's original mtime, which rclone stores as `mtime` metadata.

The data itself is **not** in this repository. Locally it lives in `data/`, which is gitignored.

## Cost

Everything fits in the free tier: R2 gives 10 GB storage, 1M writes and 10M reads per month, with no egress fees, and Workers gives 100k requests per day. R2 needs a payment method on the account even when it stays free.

## Day-to-day: add, change or remove files

1. Put the file into `data/` at the path it should have in the URL.
2. Run `scripts/sync.sh --dry-run` and check what would change.
3. Run `scripts/sync.sh`.

Nothing has to be redeployed. Listings are built live, so a new file shows up right away (listing pages are cached for up to 5 minutes, files for 1 day).

`sync.sh` is a `rclone sync`: **`data/` is the source of truth, and objects missing from `data/` are deleted from the bucket.** `.htaccess` files are never uploaded. You can also upload single files in the Cloudflare dashboard (R2 → `files-klaska-net` → Upload). If you do, copy them into `data/` too, or the next sync deletes them.

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

Cloudflare compresses text responses and drops `Content-Length`, so for those files `verify.py` compares MD5 instead. It also ignores the `beacon.min.js` tag that Cloudflare Web Analytics, a zone setting, adds to HTML responses.

`scripts/manifest.py <base-url>` crawls a directory listing and prints `path<TAB>size` for each file.
