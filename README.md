# Reel Studio

Edit your Reels on your Mac with Claude. Drop a video from your phone: pauses are cut, subtitles
appear word by word, and you change the look in one click or by asking Claude in plain words.
Everything runs on your Mac with your own Claude subscription. Your videos never leave your Mac.

*Edytuj rolki na swoim Macu razem z Claude. Wrzucasz film z telefonu: pauzy są wycięte, napisy
pojawiają się słowo po słowie, a wygląd zmieniasz jednym kliknięciem albo prosząc Claude
zwykłymi słowami. Wszystko działa na Twoim Macu, z Twoją subskrypcją Claude. Filmy nie
opuszczają Twojego komputera.*

Before you film and after you post, Claude also helps with Instagram: hooks and scripts, a
week plan, caption checks, replies and DMs. *Przed nagraniem i po publikacji Claude pomaga też
z Instagramem: hooki i scenariusze, plan tygodnia, opisy, odpowiedzi i wiadomości.*

## Install / Instalacja

You need / Potrzebujesz:
- A Mac with an Apple chip (M1 or newer) and macOS 15 or newer.
  *Mac z procesorem Apple (M1 lub nowszy) i macOS 15 lub nowszy.*
- An administrator account on the Mac and its password.
  *Konto administratora na Macu i jego hasło.*
- A Claude Pro or Max subscription. *Subskrypcja Claude Pro albo Max.*
- About 15 GB free disk space and 30 to 45 minutes. *Około 15 GB wolnego miejsca i 30–45 minut.*

1. Open **Terminal** (press Cmd + Space, type `Terminal`, press Enter).
   *Otwórz **Terminal** (Cmd + Spacja, wpisz `Terminal`, Enter).*
2. Copy this line, paste it into Terminal, press Enter.
   *Skopiuj tę linię, wklej do Terminala i naciśnij Enter.*

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/TrendTweekers/reel-studio/main/get.sh)"
```

3. Type your Mac password when asked (nothing shows while you type, that is normal) and wait.
   *Wpisz hasło do Maca, gdy o nie poprosi (podczas pisania nic nie widać, to normalne) i poczekaj.*
4. At the end, log in to Claude once: a browser window opens. Choose **"Claude account with
   subscription"** and click **Authorize**. Never choose the API key option.
   *Na końcu zaloguj się raz do Claude: otworzy się okno przeglądarki. Wybierz **„Claude account
   with subscription"** i kliknij **Authorize**. Nigdy nie wybieraj opcji z kluczem API.*
5. Open **Reel Studio** from Applications and drag it to the Dock.
   *Otwórz **Reel Studio** z folderu Aplikacje i przeciągnij do Docka.*

## Update / Aktualizacja

Run the same line again. Your reels, pictures, music and styles stay.
*Uruchom tę samą linię jeszcze raz. Twoje rolki, zdjęcia, muzyka i style zostają.*

## For the technical helper

- App folder: `~/ReelStudio`. Logs: `~/Library/Logs/ReelStudio.log` and `ReelStudio-install.log`.
- Local server on `127.0.0.1:8787` only. Node + Remotion (video), Python + faster-whisper + MediaPipe
  (analysis), Claude Code (`claude -p`) for the chat box. No API key is used or needed.
- Remotion is free for individuals and companies with up to 3 people
  ([licence](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md)).
- Instagram know-how (`.claude/skills/ig-*`): Jake Schincariol's
  [instagram-agent-skill](https://github.com/Jakeschincariol/instagram-agent-skill) (MIT, commit
  `d03c56b`), adapted for Polish and this app. In Claude Desktop the connector gives the same guides
  and checks (`instagram_guide`, `instagram_check`).
