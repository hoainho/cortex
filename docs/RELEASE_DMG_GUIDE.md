# Building & Publishing the macOS `.dmg` Artifact

> **TL;DR**: After tagging a release, run these on a macOS host (NOT in Docker), then upload the `.dmg` to the existing GitHub Release.

## Prerequisites

- **macOS host** (Apple Silicon or Intel) — `electron-builder`'s DMG target uses `hdiutil`, `osascript`, and `codesign`, all macOS-only.
- Node 22 LTS installed (`nvm install 22 && nvm use 22`).
- A GitHub PAT with `repo` scope set as `GH_TOKEN` env var, OR `gh auth login` completed.

## One-time fix: Python symlink (macOS Tahoe / 26+)

macOS 26+ removed the default `python` symlink. `electron-builder`'s DMG creator calls `which python`, which fails without this:

```bash
sudo ln -sf $(which python3) /usr/local/bin/python
which python && python --version  # verify
```

## Rebuild `.dmg` for a tagged release

```bash
cd ~/Documents/personal/cortex
git fetch --tags
git checkout v5.0.0   # or any released tag

# Ensure deps are correct for current Node version
npm install

# Build (≈3-5 min: vite build + electron-builder package + DMG creation)
npm run dist:mac
```

Expected output in `release/`:

```
Cortex-5.0.0-arm64.dmg              ≈ 190 MB
Cortex-5.0.0-arm64.dmg.blockmap     ≈ 200 KB
Cortex-5.0.0-arm64-mac.zip          ≈ 167 MB  (will be overwritten)
Cortex-5.0.0-arm64-mac.zip.blockmap ≈ 180 KB
latest-mac.yml                       (auto-updater manifest, SHA512 refreshed)
```

## Upload to existing GitHub Release

The release tag (`v5.0.0`) must already exist with the `.zip` uploaded. To add the `.dmg`:

```bash
export GH_TOKEN="<your-PAT-with-repo-scope>"

gh release upload v5.0.0 \
  release/Cortex-5.0.0-arm64.dmg \
  release/Cortex-5.0.0-arm64.dmg.blockmap \
  --repo hoainho/cortex \
  --clobber
```

The `--clobber` flag overwrites existing assets if you're re-uploading.

If `latest-mac.yml` changed (because the SHA512 of the rebuilt `.zip` differs), also re-upload it:

```bash
gh release upload v5.0.0 \
  release/latest-mac.yml \
  release/Cortex-5.0.0-arm64-mac.zip \
  release/Cortex-5.0.0-arm64-mac.zip.blockmap \
  --repo hoainho/cortex \
  --clobber
```

## Verify

```bash
gh release view v5.0.0 --repo hoainho/cortex --json assets --jq '.assets[].name'
```

Should show:

```
Cortex-5.0.0-arm64-mac.zip
Cortex-5.0.0-arm64-mac.zip.blockmap
Cortex-5.0.0-arm64.dmg
Cortex-5.0.0-arm64.dmg.blockmap
latest-mac.yml
```

And the landing page download buttons
(`https://github.com/hoainho/cortex/releases/download/v5.0.0/Cortex-5.0.0-arm64.dmg`)
will start working.

## Common pitfalls

| Symptom | Fix |
|---|---|
| `Command failed: which python` | Run the `ln -sf` symlink step above. |
| `ImportError: pyexpat` (Python 3.11 from brew) | Use `python3` from Xcode CLT instead — that's what `python3` resolves to by default. |
| `invalid ELF header` on `iconv-corefoundation` | You're building from Linux/Docker — switch to macOS host. |
| `node-gyp` rebuild loops on `better-sqlite3` | Use Node 22 LTS — prebuilt binaries are available, no compile needed. |
| `skipped macOS application code signing` (warning, not error) | You don't have an Apple Developer ID certificate. Users will need to right-click → Open the first time. Safe to ignore for personal/dev releases. |

## Code signing (optional, for production releases)

Without an Apple Developer ID:
- The `.app` runs but macOS Gatekeeper shows "developer cannot be verified" on first open.
- Users must right-click → Open → confirm once.

With an Apple Developer ID Application certificate (`$99/yr`):

```bash
export CSC_LINK=/path/to/cert.p12
export CSC_KEY_PASSWORD=<cert-password>
export APPLE_ID=your@email.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=ABCDE12345
npm run dist:mac
```

`electron-builder` will sign + notarize automatically.

---

_See also: [`electron-builder.yml`](../electron-builder.yml) for the build config._
