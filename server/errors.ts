// Turns raw tool errors into a code and a plain sentence for the page. The raw text goes to tools.log.
import type { ErrorCode } from '../src/shared/types';

const RULES: { code: ErrorCode; re: RegExp; text: string }[] = [
  { code: 'disk_full', re: /ENOSPC|No space left|disk full|Disk quota/i, text: 'The disk is full. Free some space on the Mac, then try again.' },
  {
    code: 'tool_missing',
    re: /Could not start|spawn\s+\S+\s+ENOENT|No such file or directory: '(ffmpeg|ffprobe|python3?)'|command not found|ModuleNotFoundError|No module named/i,
    text: 'A part of the app is missing. Run the installer again ("Start Reel Studio.command").',
  },
  {
    code: 'bad_file',
    re: /moov atom|Invalid data found|not a video|no video stream|does not contain any stream|could not find codec|ffprobe failed|Invalid argument.*source|End of file|corrupt/i,
    text: 'This file is not a video, or it is damaged. Try another file.',
  },
  {
    code: 'no_internet',
    re: /ConnectionError|Connection (refused|reset|aborted)|Max retries|Name or service not known|Temporary failure in name resolution|getaddrinfo|ENOTFOUND|ECONNRESET|ETIMEDOUT|Network is unreachable|LocalEntryNotFoundError|offline|huggingface|SSLError|download/i,
    text: 'No internet. The first video needs internet once to download the speech model. Connect and try again.',
  },
  { code: 'no_speech', re: /no speech|no words|no voice/i, text: 'No speech was found in this video.' },
];

export const PLAIN: Record<ErrorCode, string> = {
  bad_file: RULES[2].text,
  upload_incomplete: 'The upload did not finish. Drop the video again.',
  no_internet: RULES[3].text,
  disk_full: RULES[0].text,
  no_speech: RULES[4].text,
  tool_missing: RULES[1].text,
  parent_missing: 'The long video this clip was made from is gone, so this clip cannot play.',
  render_failed: 'The video could not be made. Try again, or ask Claude to look at it.',
  unknown: 'Something went wrong. Try again. If it happens again, ask Claude to look at it.',
};

export const mapError = (raw: string, fallback: ErrorCode = 'unknown'): { code: ErrorCode; message: string } => {
  for (const r of RULES) if (r.re.test(raw)) return { code: r.code, message: r.text };
  return { code: fallback, message: PLAIN[fallback] };
};
