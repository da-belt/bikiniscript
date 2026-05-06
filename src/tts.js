'use strict';

const fs   = require('fs');
const path = require('path');
const os   = require('os');
const { spawn } = require('child_process');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const CHARACTERS = [
  { name: 'SpongeBob SquarePants', voiceId: process.env.VOICE_ID_SPONGEBOB },
  { name: 'Patrick Star',          voiceId: process.env.VOICE_ID_PATRICK   },
  { name: 'Sandy Cheeks',          voiceId: process.env.VOICE_ID_SANDY     },
  { name: 'Squidward Tentacles',   voiceId: process.env.VOICE_ID_SQUIDWARD },
  { name: 'Mr. Krabs',             voiceId: process.env.VOICE_ID_MRKRABS   },
];

const FILE_VOICE_MAP = {
  'hello':                  process.env.VOICE_ID_SPONGEBOB,
  'RUready':                process.env.VOICE_ID_SPONGEBOB,
  'fizzbuzz':               process.env.VOICE_ID_PATRICK,
  'fizzbuzz_demo':          process.env.VOICE_ID_PATRICK,
  'Dirty_dan':              process.env.VOICE_ID_PATRICK,
  'krusty':                 process.env.VOICE_ID_MRKRABS,
  'fibonacci':              process.env.VOICE_ID_SQUIDWARD,
};

class TtsManager {
  constructor(filename = null) {
    const apiKey  = process.env.ELEVENLABS_API_KEY;
    this.enabled  = !!apiKey;

    if (this.enabled) {
      const { ElevenLabsClient } = require('@elevenlabs/elevenlabs-js');
      this.client = new ElevenLabsClient({ apiKey });
    }

    const basename   = filename ? path.basename(filename, path.extname(filename)) : null;
    const mappedId   = basename ? FILE_VOICE_MAP[basename] : null;
    const mapped     = mappedId ? CHARACTERS.find(c => c.voiceId === mappedId) : null;
    const available  = CHARACTERS.filter(c => c.voiceId);
    const pool       = available.length > 0 ? available : CHARACTERS;
    this.character   = mapped || pool[Math.floor(Math.random() * pool.length)];

    this.queue         = [];
    this.running       = false;
    this._drainResolve = null;
  }

  init() {
    if (!this.enabled) return;
    console.log(`\x1b[36m🎙  ${this.character.name} will be narrating today!\x1b[0m`);
  }

  enqueue(text) {
    if (!this.enabled) return;
    const clean = this._sanitize(text);
    if (!clean) return;
    this.queue.push(clean);
    if (!this.running) this._processNext();
  }

  _sanitize(text) {
    return text
      .replace(/\$/g, ' dollars ')
      .replace(/%/g, ' percent ')
      .replace(/&/g, ' and ')
      .replace(/@/g, ' at ')
      .replace(/#/g, ' number ')
      .replace(/\*/g, ' times ')
      .replace(/-+/g, ' ')
      .replace(/_+/g, ' ')
      .replace(/[<>[\]{}|\\^~`]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  drain() {
    if (!this.enabled || (!this.running && this.queue.length === 0)) return Promise.resolve();
    return new Promise(resolve => { this._drainResolve = resolve; });
  }

  async _processNext() {
    if (this.queue.length === 0) {
      this.running = false;
      if (this._drainResolve) { this._drainResolve(); this._drainResolve = null; }
      return;
    }
    this.running = true;
    const text = this.queue.shift();
    try {
      await this._speakOne(text);
    } catch (err) {
      if (process.env.BS_DEBUG) console.error('[TTS] Error:', err.message);
    }
    this._processNext();
  }

  async _speakOne(text) {
    const audioStream = await this.client.textToSpeech.convert(this.character.voiceId, {
      text,
      model_id: 'eleven_turbo_v2_5',
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    });

    const chunks = [];
    for await (const chunk of audioStream) chunks.push(chunk);

    const tmpFile = path.join(os.tmpdir(), `bs_tts_${Date.now()}.mp3`);
    fs.writeFileSync(tmpFile, Buffer.concat(chunks));
    await this._playMp3(tmpFile);
    try { fs.unlinkSync(tmpFile); } catch (_) {}
  }

  _playMp3(filePath) {
    return new Promise((resolve, reject) => {
      const absPath = path.resolve(filePath);
      let cmd, args;

      if (os.platform() === 'darwin') {
        cmd  = 'afplay';
        args = [absPath];
      } else if (os.platform() === 'win32') {
        const fwdPath = absPath.replace(/\\/g, '/');
        const psCmd = [
          'Add-Type -AssemblyName PresentationCore',
          '$p = New-Object System.Windows.Media.MediaPlayer',
          `$p.Open([System.Uri]::new('file:///${fwdPath}'))`,
          '$p.Play()',
          '$t = [DateTime]::Now.AddSeconds(10)',
          'while (-not $p.NaturalDuration.HasTimeSpan -and [DateTime]::Now -lt $t) { Start-Sleep -Milliseconds 50 }',
          'if ($p.NaturalDuration.HasTimeSpan) { Start-Sleep -Milliseconds ([int]$p.NaturalDuration.TimeSpan.TotalMilliseconds) } else { Start-Sleep -Seconds 3 }'
        ].join('; ');
        cmd  = 'powershell.exe';
        args = ['-NoProfile', '-STA', '-WindowStyle', 'Hidden', '-Command', psCmd];
      } else {
        cmd  = 'mpg123';
        args = ['-q', absPath];
      }

      const opts = os.platform() === 'win32' ? { stdio: 'ignore', windowsHide: true } : { stdio: 'ignore' };
      const proc = spawn(cmd, args, opts);

      proc.on('close', code => code === 0 ? resolve() : reject(new Error(`Player exit ${code}`)));
      proc.on('error', reject);
    });
  }
}

module.exports = { TtsManager };
