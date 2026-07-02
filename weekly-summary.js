// 過去7日分のdiaryエントリをclaude-haiku-4-5-20251001で要約し、Discordに投稿する。
// crontab から週次で `node weekly-summary.js` として起動される想定（ecosystem/pm2は使わない単発スクリプト）。
require('dotenv').config();
const fs = require('fs');
const os = require('os');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const DATA = path.join(__dirname, 'entries.json');
const MODEL = 'claude-haiku-4-5-20251001';
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL || '';

function load() {
  try { return JSON.parse(fs.readFileSync(DATA, 'utf8')); } catch { return []; }
}

// task-manager/server.js の createAnthropicClient() と同じ方式:
// claude CLI が保存したOAuthトークンを優先し、無ければANTHROPIC_API_KEYにフォールバック。
function createAnthropicClient() {
  try {
    const credPath = path.join(os.homedir(), '.claude', '.credentials.json');
    const creds = JSON.parse(fs.readFileSync(credPath, 'utf8'));
    const token = creds?.claudeAiOauth?.accessToken;
    const expiresAt = creds?.claudeAiOauth?.expiresAt;
    if (token) {
      const expiresAtMs = expiresAt != null ? (expiresAt < 1e11 ? expiresAt * 1000 : expiresAt) : null;
      const isExpired = expiresAtMs != null && Date.now() >= expiresAtMs;
      if (!isExpired) return new Anthropic({ authToken: token, maxRetries: 3 });
    }
  } catch {
    // ファイルなし・パースエラーは次の方法にフォールバック
  }
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (apiKey) return new Anthropic({ apiKey, maxRetries: 3 });
  throw new Error('認証情報が見つかりません。claude CLI でログイン済みか、ANTHROPIC_API_KEY を確認してください。');
}

function getWeekEntries(entries) {
  const since = Date.now() - 7 * 24 * 60 * 60 * 1000;
  return entries.filter(e => {
    const t = Date.parse(e.date);
    return !Number.isNaN(t) && t >= since;
  });
}

async function summarize(entries) {
  const listText = entries
    .slice()
    .reverse()
    .map(e => `- [${e.date.slice(0, 10)}] (${e.app}) ${e.content}`)
    .join('\n');
  const prompt = `以下は過去7日間の開発日誌エントリです。日本語で週次サマリーを作成してください。\n` +
    `- アプリ/プロジェクトごとに主な進捗をまとめる\n` +
    `- 箇条書き中心、Discordに投稿するので簡潔に（全体で800文字程度まで）\n` +
    `- 見出しやコードブロックは使わない\n\n${listText}`;

  const client = createAnthropicClient();
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });
  return response.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim();
}

async function postToDiscord(summary, entryCount, rangeStart, rangeEnd) {
  if (!DISCORD_WEBHOOK_URL) {
    console.log('[weekly-summary] DISCORD_WEBHOOK_URL未設定のため投稿をスキップします。');
    return;
  }
  const fmt = d => `${d.getMonth() + 1}/${d.getDate()}`;
  const payload = {
    embeds: [{
      title: `📅 開発週次サマリー (${fmt(rangeStart)} - ${fmt(rangeEnd)})`,
      description: summary.slice(0, 4000),
      color: 0xd4a030,
      footer: { text: `対象エントリ ${entryCount}件` },
      timestamp: new Date().toISOString(),
    }],
  };
  const res = await fetch(DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    throw new Error(`Discord webhook failed: ${res.status} ${await res.text()}`);
  }
  console.log('[weekly-summary] Discordに投稿しました。');
}

async function main() {
  const entries = load();
  const weekEntries = getWeekEntries(entries);
  console.log(`[weekly-summary] 過去7日のエントリ数: ${weekEntries.length}`);
  if (weekEntries.length === 0) {
    console.log('[weekly-summary] 対象エントリなし。終了します。');
    return;
  }
  const summary = await summarize(weekEntries);
  await postToDiscord(summary, weekEntries.length, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), new Date());
}

main().catch(err => {
  console.error('[weekly-summary] エラー:', err.message || err);
  process.exitCode = 1;
});
