'use strict';

// ─── Helpers ────────────────────────────────────────────────────────────────
const isDigit   = c => c >= '0' && c <= '9';
const isAlpha   = c => /[a-zA-Z_]/.test(c);
const isAlphaNum = c => /[a-zA-Z0-9_]/.test(c);

// ─── Token ──────────────────────────────────────────────────────────────────
class Token {
  constructor(type, value, line) {
    this.type  = type;
    this.value = value;
    this.line  = line;
  }
  toString() { return `[${this.type} ${JSON.stringify(this.value)} L${this.line}]`; }
}

// ─── Keywords ────────────────────────────────────────────────────────────────
// Single-word keywords (multi-word handled specially in scanIdent)
const KEYWORDS = {
  krabby:       'KRABBY',       // var declaration
  spatula:      'SPATULA',      // function definition
  jellyfishing: 'JELLYFISHING', // for loop
  shout:        'SHOUT',        // print / console.log
  plankton:     'PLANKTON',     // null
  crusty:       'CRUSTY',       // class definition / instantiation
  self:         'SELF',         // this
  NetBag:       'NETBAG',       // array type
  uh:           'UH',           // start of 'uh oh' error block
  catch:        'CATCH',        // catch clause
  sandy:        'SANDY',        // catch variable binding keyword
};

// ─── Lexer ───────────────────────────────────────────────────────────────────
class Lexer {
  constructor(source) {
    this.source = source;
    this.pos    = 0;
    this.line   = 1;
    this.tokens = [];
  }

  isAtEnd()       { return this.pos >= this.source.length; }
  peek(n = 0)     { return this.source[this.pos + n] ?? ''; }
  advance()       {
    const c = this.source[this.pos++];
    if (c === '\n') this.line++;
    return c;
  }
  match(c)        { if (this.peek() === c) { this.advance(); return true; } return false; }
  add(type, val = null) { this.tokens.push(new Token(type, val, this.line)); }

  // Skip whitespace and // line comments
  skipWS() {
    while (!this.isAtEnd()) {
      const c = this.peek();
      if (c === ' ' || c === '\t' || c === '\r' || c === '\n') {
        this.advance();
      } else if (c === '/' && this.peek(1) === '/') {
        while (!this.isAtEnd() && this.peek() !== '\n') this.advance();
      } else break;
    }
  }

  // Skip only spaces and tabs (not newlines) — used for multi-word keyword detection
  skipInlineWS() {
    while (!this.isAtEnd() && (this.peek() === ' ' || this.peek() === '\t')) this.advance();
  }

  // After consuming the first word, peek ahead (skipping inline whitespace) to see
  // if the next word matches `word`. Returns the position after that word, or -1.
  checkNextWord(word) {
    const saved = this.pos;
    this.skipInlineWS();
    if (this.source.startsWith(word, this.pos)) {
      const after = this.pos + word.length;
      // Make sure it's not part of a longer identifier
      if (after >= this.source.length || !isAlphaNum(this.source[after])) {
        return after;
      }
    }
    this.pos = saved;
    return -1;
  }

  // Scan a quoted string literal
  scanString() {
    let s = '';
    while (!this.isAtEnd() && this.peek() !== '"') {
      const c = this.advance();
      if (c === '\\') {
        const e = this.advance();
        const esc = { n: '\n', t: '\t', '"': '"', '\\': '\\', r: '\r' };
        s += esc[e] ?? ('\\' + e);
      } else {
        s += c;
      }
    }
    if (this.isAtEnd()) throw new Error(`Line ${this.line}: Barnacles! Unterminated string`);
    this.advance(); // closing "
    this.add('STRING', s);
  }

  // Scan a numeric literal (int or float)
  scanNumber(first) {
    let n = first;
    while (!this.isAtEnd() && isDigit(this.peek())) n += this.advance();
    if (this.peek() === '.' && isDigit(this.peek(1))) {
      n += this.advance(); // consume '.'
      while (!this.isAtEnd() && isDigit(this.peek())) n += this.advance();
    }
    this.add('NUMBER', parseFloat(n));
  }

  // Scan an identifier or keyword (including multi-word keywords)
  scanIdent(first) {
    let word = first;
    while (!this.isAtEnd() && isAlphaNum(this.peek())) word += this.advance();

    // ── Multi-word keywords ──────────────────────────────────────────────
    // "aye aye" → AYE_AYE (if)   |   "aye" alone → AYE (true)
    if (word === 'aye') {
      const nextPos = this.checkNextWord('aye');
      if (nextPos !== -1) { this.pos = nextPos; this.add('AYE_AYE'); return; }
      this.add('AYE', true);
      return;
    }

    // "nay nay" → NAY_NAY (else)  |  "nay" alone → NAY (false)
    if (word === 'nay') {
      const nextPos = this.checkNextWord('nay');
      if (nextPos !== -1) { this.pos = nextPos; this.add('NAY_NAY'); return; }
      this.add('NAY', false);
      return;
    }

    // "give back" → GIVE_BACK (return)
    if (word === 'give') {
      const nextPos = this.checkNextWord('back');
      if (nextPos !== -1) { this.pos = nextPos; this.add('GIVE_BACK'); return; }
      this.add('IDENTIFIER', 'give');
      return;
    }

    // "reel in" → REEL_IN (import — future use)
    if (word === 'reel') {
      const nextPos = this.checkNextWord('in');
      if (nextPos !== -1) { this.pos = nextPos; this.add('REEL_IN'); return; }
      this.add('IDENTIFIER', 'reel');
      return;
    }

    // "tide await" → TIDE_AWAIT (async — future use)
    if (word === 'tide') {
      const nextPos = this.checkNextWord('await');
      if (nextPos !== -1) { this.pos = nextPos; this.add('TIDE_AWAIT'); return; }
      this.add('IDENTIFIER', 'tide');
      return;
    }

    // ── Single-word keywords ─────────────────────────────────────────────
    const type = KEYWORDS[word] || 'IDENTIFIER';
    this.add(type, type === 'IDENTIFIER' ? word : word);
  }

  // Main tokenize loop
  tokenize() {
    while (!this.isAtEnd()) {
      this.skipWS();
      if (this.isAtEnd()) break;

      const c = this.advance();
      switch (c) {
        case '(': this.add('LPAREN');    break;
        case ')': this.add('RPAREN');    break;
        case '{': this.add('LBRACE');    break;
        case '}': this.add('RBRACE');    break;
        case '[': this.add('LBRACKET'); break;
        case ']': this.add('RBRACKET'); break;
        case ';': this.add('SEMICOLON'); break;
        case ',': this.add('COMMA');     break;
        case '.': this.add('DOT');       break;
        case '+':
          if      (this.match('+')) this.add('PLUS_PLUS');
          else if (this.match('=')) this.add('PLUS_ASSIGN');
          else                      this.add('PLUS');
          break;
        case '-':
          if      (this.match('-')) this.add('MINUS_MINUS');
          else if (this.match('=')) this.add('MINUS_ASSIGN');
          else                      this.add('MINUS');
          break;
        case '*': this.add('STAR');    break;
        case '/': this.add('SLASH');   break;
        case '%': this.add('PERCENT'); break;
        case '=': this.add(this.match('=') ? 'EQEQ'   : 'ASSIGN'); break;
        case '!': this.add(this.match('=') ? 'NEQ'    : 'BANG');   break;
        case '<': this.add(this.match('=') ? 'LTE'    : 'LT');     break;
        case '>': this.add(this.match('=') ? 'GTE'    : 'GT');     break;
        case '&':
          if (this.match('&')) this.add('AND');
          else throw new Error(`Line ${this.line}: Unexpected '&'`);
          break;
        case '|':
          if (this.match('|')) this.add('OR');
          else throw new Error(`Line ${this.line}: Unexpected '|'`);
          break;
        case '"': this.scanString(); break;
        default:
          if (isDigit(c))  this.scanNumber(c);
          else if (isAlpha(c)) this.scanIdent(c);
          else throw new Error(`Line ${this.line}: Barnacles! Unexpected character '${c}'`);
      }
    }

    this.add('EOF');
    return this.tokens;
  }
}

module.exports = { Lexer, Token };
