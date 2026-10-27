// The one contract between the analysis tools, the server, the editor page and the video.
// A project lives in projects/<slug>/ and holds:
//   source.<ext>    the original upload, never changed
//   proxy.mp4       1080x1920, 30 fps, H.264. Every edit and render reads this
//   cutout.webm     optional: the person alone on a transparent background (VP9 alpha)
//   words.json      Word[]        (from tools/transcribe.py)
//   faces.json      FaceSample[]  (from tools/faces.py)
//   edit.json       Edit          (the edit itself; the page and Claude both change this file)
//   out/*.mp4       finished renders
//
// All times in words.json, faces.json, segments and effects are SOURCE seconds
// (seconds into proxy.mp4). Cutting pauses then never moves an effect off its word.
// Use src/shared/time.ts to turn source time into output time.

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export type Word = {
  text: string;
  start: number;
  end: number;
  prob?: number;
};

export type FaceSample = {
  t: number;
  // Face box, 0..1 of the frame. x, y = top-left corner.
  x: number;
  y: number;
  w: number;
  h: number;
};

export type Segment = { start: number; end: number };

export const SFX_NAMES = [
  'double-click',
  'click',
  'soft-click',
  'pop',
  'soft-pop',
  'sticker-slap',
  'camera-shutter',
  'whoosh',
  'ding',
  'typewriter',
] as const;
export type SfxName = (typeof SFX_NAMES)[number];

export const HOOK_FONTS = [
  'Playfair Display',
  'Cormorant Garamond',
  'Bodoni Moda',
  'DM Serif Display',
  'Instrument Serif',
  'Fraunces',
] as const;
export const SUBTITLE_FONTS = ['Helvetica Neue', 'Inter', 'Montserrat', 'DM Sans', 'Courier Prime'] as const;
export type HookFont = (typeof HOOK_FONTS)[number];
export type SubtitleFont = (typeof SUBTITLE_FONTS)[number];

export type EffectKind =
  | 'picture' // a picture from the board pops in (polaroid / sticker), with a sound
  | 'label' // a small tag sticker with text, e.g. "editing"
  | 'zoom' // a punch-in on the face
  | 'glass' // big frosted-glass type over the video
  | 'behind' // big type BEHIND the person (needs cutout.webm, else falls back to normal big type)
  | 'chapter' // chapter title, e.g. "[about editing]"
  | 'checklist' // a card with items that tick one by one
  | 'flash' // a quick white flash, for a cut or a reveal
  | 'phone' // a phone mock-up holding a board picture
  | 'emoji' // one big emoji that pops
  // Scenes: the whole picture changes for a moment (they draw their own footage).
  | 'framebreak' // the video shrinks into a framed photo and she steps out of the frame (cutout)
  | 'papercut' // she becomes a paper cut-out sticker with a white edge on a paper background (cutout)
  | 'vertigo' // dolly zoom: the room stretches away, she stays the same size (cutout)
  | 'pullback' // starts close, pulls back to reveal the whole frame inside a soft border
  | 'greenscreen' // she stands in front of a board picture instead of her room (cutout + image)
  | 'cover' // a magazine cover: big title behind her head, cover lines (title = text, lines = items)
  | 'zoomthrough' // a fast zoom through her into the next shot (transition, ~0.6 s)
  // Overlays: drawn over the video.
  | 'orbit' // words (items) or a picture circle around her head, behind her on the far side
  | 'doodle' // hand-drawn doodles that "boil" (wiggle) around her: hearts, stars, arrows, underline
  | 'ui' // floating app cards around her: notification, search bar, chat bubble, like counter (items)
  | 'chart'; // a chart card that grows: items "Label: number", title = text

// Effects that need the person cut-out (cutout.webm). Without it they fall back to a plainer look.
export const NEEDS_CUTOUT: EffectKind[] = ['behind', 'framebreak', 'papercut', 'vertigo', 'greenscreen'];
// Effects that look better with the cut-out but work without it.
export const LIKES_CUTOUT: EffectKind[] = ['cover', 'orbit'];
// Full-frame scenes (drawn above the footage, below hook, cards and subtitles).
export const SCENE_KINDS: EffectKind[] = ['framebreak', 'papercut', 'vertigo', 'pullback', 'greenscreen', 'cover', 'zoomthrough'];

export type EffectPosition = 'auto' | 'top' | 'bottom' | 'left' | 'right' | 'above-head' | 'center';

export type Effect = {
  id: string;
  kind: EffectKind;
  at: number; // source seconds, normally the start of the trigger word
  duration: number; // seconds on screen (output time)
  word?: string; // the trigger word, for people and for Claude to read
  text?: string; // label, glass, behind, chapter, emoji; cover title; chart title; ui main line
  items?: string[]; // checklist; cover lines; orbit words; ui card texts; chart bars "Label: 42"
  image?: string; // file name in board/ (picture, phone, greenscreen background, orbit picture, framebreak backdrop)
  position?: EffectPosition;
  sfx?: SfxName | 'none' | 'default';
  scale?: number; // zoom: 1.0 = none, 1.25 = normal punch
};

export type SubtitleStyle = 'clean' | 'box' | 'karaoke' | 'pop' | 'off';

export type Edit = {
  version: 1;
  title: string;
  language: string; // 'pl', 'en', ...
  source: { duration: number; width: number; height: number };
  segments: Segment[]; // the parts of the source we keep, in order
  hook: null | {
    text: string; // big line, e.g. "nobody's saying it,"
    accent?: string; // second line in italic, e.g. "so I will"
    sub?: string; // small line under it, e.g. "[about editing]"
    until: number; // output seconds the hook stays on screen
  };
  style: {
    hookFont: HookFont;
    hookColor: string; // CSS colour
    subtitleFont: SubtitleFont;
    subtitleStyle: SubtitleStyle;
    subtitlePosition: 'lower' | 'middle' | 'above-head';
    accentColor: string;
    vibe: 'clean' | 'film' | 'glow' | 'editorial';
  };
  sound: {
    effects: boolean;
    defaultSfx: SfxName;
    music: string | null; // file name in assets/music/
    musicVolume: number; // 0..1
    duck: boolean; // music goes quiet while she speaks
  };
  toggles: {
    zoomJumps: boolean; // automatic small punch-ins on the face, every few seconds
    progressBar: boolean;
    grain: boolean;
    glowAboveHead: boolean;
  };
  effects: Effect[];
  // Word fixes: index into words.json -> corrected text. Whisper can mishear brand names.
  wordFixes?: Record<string, string>;
  // The cover (thumbnail). t = source seconds of the chosen frame.
  cover?: Cover;
  // The editing style last applied (src/shared/styles.ts or styles/<id>.json), for the picker.
  styleId?: string;
  // The closing card that sells: ebook cover + "comment KEYWORD" call to action. Shown AFTER the last
  // kept part, so it adds endCard.seconds to the video. Use totalFrames() from time.ts for the length.
  endCard?: EndCard;
  // Texts for posting. Not drawn in the video; the page shows them with copy buttons.
  post?: PostText;
  // The TikTok version: same edit with these changes (other hook, other caption, no Instagram words).
  // Rendered with POST /render {variant: 'tiktok'}.
  tiktok?: { hook?: Edit['hook']; endCardLine?: string; endCardSub?: string; post?: PostText };
  // Auto light fix: measured once from the video (server/light.ts), applied as a colour filter on the
  // footage only (never on text or cards). strength 0 = off look, 1 = measured fix, up to 1.5.
  light?: { auto: boolean; strength: number; fix?: LightFix };
};

// The measured correction at strength 1. Each value is a CSS filter amount (1 = no change; warmth 0 = none).
export type LightFix = { brightness: number; contrast: number; saturate: number; warmth: number };

export type EndCard = {
  enabled: boolean;
  keyword: string; // the word to comment, e.g. "JESIEN". One per reel, so DMs show which reel sold.
  line: string; // e.g. "Napisz w komentarzu" (shown above the keyword)
  sub?: string; // e.g. "a wyślę Ci link do ebooka"
  image?: string; // board picture, usually the ebook cover
  seconds: number; // 2 to 4
};

export type PostText = {
  caption: string; // full caption; first line = the search keyword phrase
  hashtags: string[]; // 3 to 5, without '#'
  keyword?: string; // the search phrase the caption is built around
};

export type Cover = {
  t: number;
  title?: string; // big line in the hook font
  accent?: string; // second line, italic
  layout: 'top' | 'center' | 'bottom' | 'none'; // where the title sits; 'none' = clean frame
  // Instagram shows covers on the profile grid as a 3:4 crop from the middle of the 9:16 cover.
  // The title is always kept inside that middle 3:4 area.
};

// One candidate frame for a cover, from tools/cover_frames.py -> covers/candidates.json
export type CoverCandidate = {
  t: number; // source seconds
  file: string; // path inside the project, e.g. "covers/c01-1.50.jpg"; full 1080x1920 frame
  score: number; // 0..1, higher = sharper, eyes open, face well placed
};

// Covers render as stills: covers/cover-9x16.jpg (Reel / TikTok) and covers/cover-3x4.jpg (grid).
export const COVER_GRID = { width: 1080, height: 1440 };

// meta.json of a project. A clip made from a longer video has parent = the long video's slug and
// shares its proxy.mp4 (a link, not a copy).
export type ProjectMeta = {
  title: string;
  createdAt: string;
  parent?: string;
  range?: { start: number; end: number };
  summary?: FirstEditSummary; // what the automatic first edit did
  autoTitle?: boolean; // true when the title was taken from the transcript (file was IMG_1234 etc.)
  // Batch video (upload header x-batch: 1): split into clips after analysis. clips = the clip slugs.
  batch?: { requested?: boolean; clips?: string[]; reason?: string };
};

export type RenderVariant = 'instagram' | 'tiktok';

// What the automatic first edit did, for the "what I did" card on the page.
export type FirstEditSummary = { pausesCut: number; secondsSaved: number; hook: string | null; effects: number };

// Error codes in status.json, render state and chat messages. The page shows its own words for each.
export type ErrorCode =
  | 'bad_file'
  | 'upload_incomplete'
  | 'no_internet'
  | 'disk_full'
  | 'no_speech'
  | 'tool_missing'
  | 'parent_missing'
  | 'render_failed'
  | 'unknown';

// status.json of a project. 'queued' = waiting for another reel; position 1 = next in line.
export type ProjectStep = 'queued' | 'uploading' | 'normalize' | 'transcribe' | 'faces' | 'autoedit' | 'cutout' | 'covers' | 'ready' | 'error';
export type ProjectStatus = {
  step: ProjectStep;
  progress: number;
  message?: string;
  code?: ErrorCode;
  position?: number;
  queuedFor?: 'analyse' | 'cutout' | 'covers';
};

// One saved earlier version of edit.json (projects/<slug>/history/<id>.json).
export type HistoryEntry = { id: string; at: string; effects: number; seconds: number; by: 'page' | 'claude' | 'auto' };

// What the cover still gets.
export type CoverProps = {
  cover: Cover;
  style: Edit['style'];
  light?: Edit['light']; // the same auto light fix as the video
  urls: { frame: string }; // full URL of the chosen frame image (covers/<file>.jpg)
  face: FaceSample | null;
  grid: boolean; // true = render the 1080x1440 grid version
};

// What the video component gets. URLs are full http URLs served by the local server,
// so the editor preview and the final render read the same files.
export type ReelProps = {
  edit: Edit;
  words: Word[];
  faces: FaceSample[];
  urls: {
    video: string; // proxy.mp4
    cutout: string | null; // cutout.webm, or null if not made
    board: string; // folder URL, ends with '/'
    sfx: string; // folder URL, ends with '/'
    music: string; // folder URL, ends with '/'
  };
};
