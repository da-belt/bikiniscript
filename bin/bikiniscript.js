#!/usr/bin/env node
'use strict';

const fs       = require('fs');
const path     = require('path');
const readline = require('readline');
const { spawn } = require('child_process');
const { Lexer }        = require('../src/lexer');
const { Parser }       = require('../src/parser');
const { Interpreter }  = require('../src/interpreter');

// ─── Bubble sound player ─────────────────────────────────────────────────────
// Plays sounds/bubbles.mp3 every time a program runs.
// Silently skips if the file doesn't exist yet.
function playBubbles() {
  const soundFile = path.join(__dirname, '..', 'sounds', 'bubbles.mp3');
  if (!fs.existsSync(soundFile)) return;

  try {
    const isWindows = process.platform === 'win32';
    
    if (isWindows) {
      const absPath = path.resolve(soundFile);
      
      // Use PowerShell with Windows Media Foundation for MP3 playback
      // This is the exact command that works when run directly
      const psCmd = `Add-Type -AssemblyName PresentationCore; $p = New-Object System.Windows.Media.MediaPlayer; $p.Open([System.Uri]'file:///${absPath.replace(/\\\\/g, '/')}'); $p.Play(); Start-Sleep -Milliseconds 2500`;
      
      // Don't detach - let the process complete the audio playback
      spawn('powershell.exe', [
        '-NoProfile',
        '-Command',
        psCmd
      ], {
        stdio: 'ignore',
        windowsHide: true
      });
      
    } else {
      // Use play-sound for macOS/Linux
      const player = require('play-sound')({});
      player.play(soundFile, (err) => {
        if (err && process.env.BS_DEBUG) {
          console.error('\x1b[33m[Sound] Playback error:', err.message, '\x1b[0m');
        }
      });
    }
  } catch (e) {
    if (process.env.BS_DEBUG) console.error('[Sound] Error:', e.message);
  }
}

// ─── Shared interpreter (keeps state across REPL lines) ─────────────────────
const interpreter = new Interpreter();

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

// ─── File mode ───────────────────────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.length > 0) {
  const file = args[0];
  if (!fs.existsSync(file)) {
    console.error(`\x1b[31mBarnacles! File not found: ${file}\x1b[0m`);
    process.exit(1);
  }
  playBubbles(); // 🫧 play sound before running the program
  run(fs.readFileSync(file, 'utf8'), file);
  process.exit(0);
}

// ─── REPL mode ───────────────────────────────────────────────────────────────
playBubbles(); // 🫧 play sound when REPL starts too

console.log('\x1b[36m');
console.log('  🧽  BikiniScript v1.0.0 \u2014 Interactive REPL');
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
    console.log("See ya later, alligator! 🧽");
    process.exit(0);
  }
  if (trimmed === '.help') {
    console.log('\x1b[36m');
    console.log('  BikiniScript REPL Commands:');
    console.log('    .exit  / .quit  \u2014 exit the REPL');
    console.log('    .help           \u2014 show this help');
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
