#!/usr/bin/env node
'use strict';

const fs       = require('fs');
const readline = require('readline');
const { Lexer }        = require('../src/lexer');
const { Parser }       = require('../src/parser');
const { Interpreter }  = require('../src/interpreter');

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
  run(fs.readFileSync(file, 'utf8'), file);
  process.exit(0);
}

// ─── REPL mode ───────────────────────────────────────────────────────────────
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

  // REPL commands
  if (trimmed === '.exit' || trimmed === '.quit') {
    console.log("See ya later, alligator! 🧽");
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
