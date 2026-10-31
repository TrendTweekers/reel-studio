# Klipownia connector (MCP) for the Claude Desktop chat

Lets the user edit their reels from their normal Claude Desktop chat (no Claude Code needed).
`mcp/server.ts` is a local stdio MCP server. It talks only to the app's JSON API on
http://localhost:8787. It reads `brand.md` and appends to it (remember_preference); it writes
nothing else directly. It has no delete tools and never posts anywhere.

## Registration

`install.sh` calls:

    node mcp/register.mjs "<abs path to node>" "<abs app dir>"

This merges one entry into `~/Library/Application Support/Claude/claude_desktop_config.json`
(other servers and keys stay, the old file is copied to `.bak` first, the write is atomic, a
file that is not valid JSON is left alone and the script exits 1):

    "mcpServers": {
      "klipownia": {
        "command": "/opt/homebrew/opt/node@24/bin/node",
        "args": ["--import", "file:///<app>/node_modules/tsx/dist/loader.mjs", "/<app>/mcp/server.ts"],
        "cwd": "/<app>"
      }
    }

The tsx loader is given as an absolute file URL, not as `tsx`. Claude Desktop may not honour
`cwd`, and `node --import tsx` looks for tsx from the working directory, so it fails anywhere
else. The server also changes into the app folder when it starts. An optional third argument
sets another config path (used by the tests). Claude Desktop must be quit and opened again to
load the connector.

### Windows

`install.ps1` calls the same script with the config path given explicitly (the default in
`register.mjs` is the Mac path):

    node.exe mcp\register.mjs "C:\Program Files\nodejs\node.exe" "C:\Users\<user>\Klipownia" "%APPDATA%\Claude\claude_desktop_config.json"

The result:

    "klipownia": {
      "command": "C:\\Program Files\\nodejs\\node.exe",
      "args": ["--import", "file:///C:/Users/<user>/Klipownia/node_modules/tsx/dist/loader.mjs", "C:\\Users\\<user>\\Klipownia\\mcp\\server.ts"],
      "cwd": "C:\\Users\\<user>\\Klipownia"
    }

The Microsoft Store (MSIX) build of Claude Desktop reads a redirected copy of `%APPDATA%`, so
`install.ps1` also writes `%LOCALAPPDATA%\Packages\Claude_*\LocalCache\Roaming\Claude\claude_desktop_config.json`
when such a package folder exists. When Claude Desktop is not installed yet, the file is written
anyway and the connector shows up once it is installed. Quit Claude Desktop fully (also the tray
icon near the clock) and open it again to load the connector. `install.ps1` also removes an
old `"reel-studio"` entry (from before the rename), so the tools do not show up twice. The app itself is started with
`win\start.ps1` (the Desktop and Start menu shortcut), see SETUP.md.

## Tools

| Area | Tools |
|---|---|
| App | open_klipownia (starts the app on macOS and waits up to 60 s; can open a reel page) |
| Read | list_reels, get_reel, get_words (search / from-to), get_transcript, check_reel, list_styles, list_board, list_music, video_status |
| Edit | update_reel (JSON merge patch on: title, hook, style, sound, toggles, cover, wordFixes, endCard, post, tiktok), apply_style, add_effect / update_effect / remove_effect, cut_words / keep_words, fix_word, set_pause_tightness, make_clip |
| Cover | find_cover_frames (shows the top 4 frames), set_cover, make_cover (shows both covers) |
| Output | make_video (instagram or tiktok, waits up to 10 min, sends progress), show_in_finder |
| See | show_reel_frame: a 540x960 JPEG of the current edit at an output second |
| Memory | get_preferences, remember_preference (appends one line, max 200 chars, to brand.md) |

Edits use GET, then `PUT /edit` with `x-base-version`. On a 409 (the user saved on the page in
between) the tool reads the edit again and makes the change once more. After each change the
tool returns the check result. Cut and keep use the same segment math as the editor page
(`web/src/editState.ts`).

When the server is not running, every tool answers "Klipownia is not open. I can open it:
call open_klipownia."

Fallbacks for an older server: when `GET /problems` is missing, the connector runs
`src/shared/check.ts` itself. When `POST /reveal` is missing, it runs `open -R` itself.

## show_reel_frame speed (measured on Linux)

It uses the real Remotion renderer (bundle plus a hidden browser that stays open, `renderStill`
at scale 0.5):

- First picture: about 11 to 15 s.
- Each later picture: about 1.5 to 2.5 s.

After the first edit the engine starts warming up in the background. The browser closes after
10 idle minutes. If a picture takes more than 25 s, the tool sends the plain ffmpeg frame from
proxy.mp4 instead (no effects drawn), with a text list of what is on screen at that moment.

## Test

    npx tsc --noEmit -p mcp
