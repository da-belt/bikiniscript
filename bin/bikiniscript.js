#!/usr/bin/env node
'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { spawn, execFileSync } = require('child_process');
const { Lexer }        = require('../src/lexer');
const { Parser }       = require('../src/parser');
const { Interpreter }  = require('../src/interpreter');
const { TtsManager }   = require('../src/tts');

// ─── Fast Windows audio player (compile-once C# binary) ──────────────────────
// csc.exe ships with .NET Framework on every Windows machine. We compile a tiny
// PlaySound wrapper once; subsequent runs use the .exe directly (~50ms startup
// vs ~2s for PowerShell). Falls back to PowerShell if csc.exe is not found.
function ensureAudioPlayer() {
  const soundsDir = path.join(__dirname, '..', 'sounds');
  const playerExe = path.join(soundsDir, 'play.exe');
  if (fs.existsSync(playerExe)) return playerExe;

  // Find csc.exe — ships with .NET Framework 4.x, always on Windows 10/11
  let csc = null;
  const netRoot = 'C:\\Windows\\Microsoft.NET';
  for (const arch of ['Framework64', 'Framework']) {
    const archDir = path.join(netRoot, arch);
    if (!fs.existsSync(archDir)) continue;
    const versions = fs.readdirSync(archDir).filter(d => d.startsWith('v')).sort().reverse();
    for (const ver of versions) {
      const candidate = path.join(archDir, ver, 'csc.exe');
      if (fs.existsSync(candidate)) { csc = candidate; break; }
    }
    if (csc) break;
  }
  if (!csc) return null;

  // Tiny C# program: calls winmm.dll PlaySound directly — no Windows Forms needed
  const src = [
    'using System.Runtime.InteropServices;',
    'class P {',
    '    [DllImport("winmm.dll")]',
    '    static extern bool PlaySound(string f, System.IntPtr m, uint flags);',
    '    static void Main(string[] a) {',
    '        if (a.Length > 0) PlaySound(a[0], System.IntPtr.Zero, 0x20000);',
    '    }',
    '}'
  ].join('\n');

  const csSrc = path.join(soundsDir, 'play.cs');
  try {
    fs.writeFileSync(csSrc, src, 'utf8');
    execFileSync(csc, ['/nologo', `/out:${playerExe}`, csSrc], { stdio: 'ignore' });
  } catch (_) {
    return null;
  } finally {
    try { fs.unlinkSync(csSrc); } catch (_) {}
  }

  return fs.existsSync(playerExe) ? playerExe : null;
}

// ─── Read WAV duration from header ───────────────────────────────────────────
function getWavDurationMs(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.length < 44 || buf.slice(0, 4).toString() !== 'RIFF') return 0;
    const byteRate = buf.readUInt32LE(28);
    let offset = 12;
    while (offset + 8 <= buf.length) {
      const id   = buf.slice(offset, offset + 4).toString();
      const size = buf.readUInt32LE(offset + 4);
      if (id === 'data') return byteRate > 0 ? Math.round((size / byteRate) * 1000) : 0;
      offset += 8 + size;
    }
    return 0;
  } catch (_) { return 0; }
}

// ─── Bubble sound player ─────────────────────────────────────────────────────
// Plays sounds/bubbles.wav (preferred) or sounds/bubbles.mp3 on every run.
// Returns the child process — Node must stay alive until it exits or VS Code's
// job object will kill the child when Node exits.
function playBubbles() {
  const soundsDir = path.join(__dirname, '..', 'sounds');
  const wavFile   = path.join(soundsDir, 'bubbles.wav');
  const mp3File   = path.join(soundsDir, 'bubbles.mp3');
  const soundFile = fs.existsSync(wavFile) ? wavFile : fs.existsSync(mp3File) ? mp3File : null;
  if (!soundFile) return null;

  try {
    if (process.platform !== 'win32') {
      const player = require('play-sound')({});
      player.play(soundFile, (err) => {
        if (err && process.env.BS_DEBUG) console.error('\x1b[33m[Sound]', err.message, '\x1b[0m');
      });
      return null;
    }

    const absPath = path.resolve(soundFile);

    if (soundFile.endsWith('.wav')) {
      const playerExe = ensureAudioPlayer();
      if (playerExe) {
        return spawn(playerExe, [absPath], { stdio: 'ignore', windowsHide: true });
      }
      // Fallback: PowerShell SoundPlayer (slower startup, but always available)
      return spawn('powershell.exe', [
        '-NoProfile', '-WindowStyle', 'Hidden', '-Command',
        `(New-Object System.Media.SoundPlayer '${absPath}').PlaySync()`
      ], { stdio: 'ignore', windowsHide: true });
    }

    // MP3 via WPF MediaPlayer — requires -STA threading
    const fwdPath = absPath.replace(/\\/g, '/');
    const psCmd = [
      `Add-Type -AssemblyName PresentationCore`,
      `$p = New-Object System.Windows.Media.MediaPlayer`,
      `$p.Open([System.Uri]::new('file:///${fwdPath}'))`,
      `$p.Play()`,
      `$t = [DateTime]::Now.AddSeconds(8)`,
      `while (-not $p.NaturalDuration.HasTimeSpan -and [DateTime]::Now -lt $t) { Start-Sleep -Milliseconds 50 }`,
      `if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds) } else { Start-Sleep -Seconds 3 }`
    ].join('; ');
    return spawn('powershell.exe', [
      '-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-Command', psCmd
    ], { stdio: 'ignore', windowsHide: true });

  } catch (e) {
    if (process.env.BS_DEBUG) console.error('[Sound] Error:', e.message);
    return null;
  }
}

// ─── Entry point args (needed early so TTS can pick voice by filename) ───────
const args = process.argv.slice(2);

// ─── TTS narration (character voice assigned by filename via ElevenLabs) ─────
const tts = new TtsManager(args[0] || null);
tts.init();

// ─── Shared interpreter (keeps state across REPL lines) ─────────────────────
const interpreter = new Interpreter(tts);

// ─── Run a source string ─────────────────────────────────────────────────────
function run(source, filename = '<input>') {
  try {
    const tokens = new Lexer(source).tokenize();
    const ast    = new Parser(tokens).parse();
    interpreter.run(ast);
  } catch (err) {
    const loc = err.line ? ` (line ${err.line})` : '';
    console.error(`\x1b[31m🦀 [${err.name ?? 'Error'}]${loc}: ${err.message}\x1b[0m`);
    if (process.env.BS_DEBUG) console.error(err.stack);
  }
}

// ─── Entry point ─────────────────────────────────────────────────────────────

if (args.length > 0) {
  // ─── File mode ─────────────────────────────────────────────────────────────
  const file = args[0];
  if (!fs.existsSync(file)) {
    console.error(`\x1b[31mBarnacles! File not found: ${file}\x1b[0m`);
    process.exit(1);
  }
  const soundsDir2  = path.join(__dirname, '..', 'sounds');
  const wavFile2    = path.join(soundsDir2, 'bubbles.wav');
  const durationMs  = fs.existsSync(wavFile2) ? getWavDurationMs(wavFile2) : 3000;
  const overlapMs   = 500;
  const startDelay  = Math.max(0, durationMs - overlapMs);

  playBubbles(); // 🫧 play bubble sound, then start TTS 500ms before it ends
  setTimeout(() => {
    run(fs.readFileSync(file, 'utf8'), file);
    tts.drain(); // keep event loop alive until all TTS audio finishes
  }, startDelay);
  // No process.exit() — Node stays alive until audio child processes exit.

} else {
  // ─── REPL mode ─────────────────────────────────────────────────────────────
  playBubbles(); // 🫧 play sound when REPL starts too

  console.log('\x1b[36m');
  console.log('  🧽  BikiniScript v1.0.0 — Interactive REPL');
  console.log('  🌊  Type BikiniScript code and press Enter.');
  console.log('  🐚  Type .exit to quit, .help for commands.');
  console.log('\x1b[0m');

  const rl = readline.createInterface({
    input:  process.stdin,
    output: process.stdout,
    prompt: '\x1b[33m🌊 > \x1b[0m',
  });

  rl.prompt();

  rl.on('line', line => {
    const trimmed = line.trim();
    if (!trimmed) { rl.prompt(); return; }

    if (trimmed === '.exit' || trimmed === '.quit') {
      console.log('See ya later, alligator! 🧽');
      process.exit(0);
    }
    if (trimmed === '.help') {
      console.log('\x1b[36m');
      console.log('  BikiniScript REPL Commands:');
      console.log('    .exit  / .quit  — exit the REPL');
      console.log('    .help           — show this help');
      console.log('');
      console.log('  Quick examples:');
      console.log('    krabby name = "SpongeBob"');
      console.log('    shout("Hello, " + name + "!")');
      console.log('    spatula greet(n) { give back "Ahoy, " + n }');
      console.log('    shout(greet(name))');
      console.log('\x1b[0m');
      rl.prompt();
      return;
    }

    run(trimmed);
    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\nSee ya, Sandy! 🦀');
    process.exit(0);
  });
}
