// Registers the Reel Studio connector in Claude Desktop. No dependencies. Called by install.sh:
//   node mcp/register.mjs <abs path to node> <abs app dir> [config file]
// Default config file: ~/Library/Application Support/Claude/claude_desktop_config.json
// Keeps every other server and key, backs the old file up to .bak, writes atomically.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const [nodeBin, appDir, cfgArg] = process.argv.slice(2);
const fail = (msg) => {
  console.error(`register: ${msg}`);
  process.exit(1);
};
if (!nodeBin || !appDir) fail('usage: node mcp/register.mjs <abs path to node> <abs app dir> [config file]');
if (!path.isAbsolute(nodeBin) || !path.isAbsolute(appDir)) fail('node and app dir must be absolute paths');
if (!fs.existsSync(path.join(appDir, 'mcp', 'server.ts'))) fail(`no mcp/server.ts in ${appDir}`);

const cfgPath = cfgArg ?? path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
fs.mkdirSync(path.dirname(cfgPath), { recursive: true });

let cfg = {};
if (fs.existsSync(cfgPath)) {
  const raw = fs.readFileSync(cfgPath, 'utf8');
  fs.writeFileSync(`${cfgPath}.bak`, raw);
  if (raw.trim()) {
    try {
      cfg = JSON.parse(raw);
    } catch (e) {
      // Never overwrite a file we cannot read: she may have hand-written settings in it.
      fail(`${cfgPath} is not valid JSON (${e.message}); left unchanged`);
    }
  }
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) fail(`${cfgPath} is not a JSON object; left unchanged`);
}

const servers = cfg.mcpServers && typeof cfg.mcpServers === 'object' && !Array.isArray(cfg.mcpServers) ? cfg.mcpServers : {};
// The tsx loader by absolute URL: Claude Desktop may not honour "cwd", and a bare "tsx" is resolved
// from the working directory.
const loader = path.join(appDir, 'node_modules', 'tsx', 'dist', 'loader.mjs');
if (!fs.existsSync(loader)) fail(`tsx is not installed in ${appDir} (run npm install first)`);
servers['reel-studio'] = {
  command: nodeBin,
  args: ['--import', pathToFileURL(loader).href, path.join(appDir, 'mcp', 'server.ts')],
  cwd: appDir,
};
cfg.mcpServers = servers;

const tmp = `${cfgPath}.tmp-${process.pid}`;
fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2) + '\n');
fs.renameSync(tmp, cfgPath);
console.log(`register: reel-studio added to ${cfgPath}`);
