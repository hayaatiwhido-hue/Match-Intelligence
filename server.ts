import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const VERSION = '1.0.3';
const ROOT = process.cwd();
const UPSTREAM = 'https://matchstats.us.ffesports.com';
const TEAM_COLS = ['Match Rank','Team ID','Team Name','Survival Score','Kill','Total Score','BOOYAH!','Damage','On Target','Headshots','Headshots Kill Rate','Headshot Accuracy Rate','Survival Time','Revival','Rescue Members'];
const PLAYER_COLS = ['MatchRank','Team Name','Player ID','Player Name','Kill','Damage','Assistências','On Target','Moving Distance','Headshots','Headshot Kill Rate','Headshot Accuracy Rate','Revival','Revival Members','Knock Down','Rescue Members','Survival Time','Maximum Kill Distance'];

const text = (v: unknown) => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (v: unknown) => text(v).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
const num = (v: unknown) => { const n = Number(String(v ?? '').replace(',', '.').replace(/[^\d.-]/g, '')); return Number.isFinite(n) ? n : 0; };

function send(res: ServerResponse, status: number, body: unknown, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(type === 'application/json' ? JSON.stringify(body) : String(body));
}

function mime(path: string) {
  const ext = extname(path).slice(1);
  return ({ html:'text/html; charset=utf-8', css:'text/css; charset=utf-8', js:'application/javascript; charset=utf-8', json:'application/json' } as Record<string,string>)[ext] || 'text/plain; charset=utf-8';
}

async function openBrowser() {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || await chromium.executablePath();
  return puppeteer.launch({
    headless: true,
    executablePath,
    args: [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 1000 }
  });
}

async function clickView(page: any) {
  await page.waitForFunction(() => [...document.querySelectorAll('button,a,[role="button"]')].some((el: any) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && /^(view|visualizar)$/i.test((el.innerText || el.textContent || '').trim());
  }), { timeout: 20000 });

  const clicked = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('button,a,[role="button"]')] as HTMLElement[];
    const target = elements.find(el => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && /^(view|visualizar)$/i.test((el.innerText || el.textContent || '').trim());
    });
    if (!target) return false;
    target.click();
    return true;
  });
  if (!clicked) throw new Error('Botão View não encontrado no MatchStats.');
}

async function scrape(matchId: string) {
  const url = `${UPSTREAM}/match?search=${encodeURIComponent(matchId)}`;
  const browser = await openBrowser();
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 45000 });
    await new Promise(r => setTimeout(r, 1200));
    await clickView(page);
    await new Promise(r => setTimeout(r, 1500));

    const extracted = await page.evaluate(({ teamCols, playerCols }) => {
      const normalize = (s: unknown) => String(s ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
      const visible = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const st = getComputedStyle(el); return r.width > 0 && r.height > 0 && st.display !== 'none' && st.visibility !== 'hidden'; };
      const tables = [...document.querySelectorAll('table')].filter(visible);
      const read = (table: HTMLTableElement) => ({
        heads: [...table.querySelectorAll('thead th')].map(x => x.textContent?.trim() || ''),
        body: [...table.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent?.replace(/\s+/g, ' ').trim() || ''))
      });
      const raw = tables.map(read);
      const score = (table: any, cols: string[]) => { const h = table.heads.map(normalize); return cols.filter(c => h.includes(normalize(c))).length; };
      const best = (cols: string[]) => raw.slice().sort((a,b) => score(b, cols) - score(a, cols))[0] || { heads: [], body: [] };
      const toRows = (table: any, cols: string[]) => {
        const indexes = new Map(table.heads.map((h: string, i: number) => [normalize(h), i]));
        return table.body.map((cells: string[]) => Object.fromEntries(cols.map(c => [c, cells[indexes.get(normalize(c)) ?? -1] ?? ''])));
      };
      const pageText = document.body.innerText || '';
      const teamTable = best(teamCols);
      const playerTable = best(playerCols);
      const mode = /Battle Royale|\bBR\b/i.test(pageText) ? 'BR' : /Contra Squad|\bCS\b/i.test(pageText) ? 'CS' : '—';
      const format = (pageText.match(/\b(\d+v\d+)\b/i) || [])[1] || '—';
      return { team: toRows(teamTable, teamCols), player: toRows(playerTable, playerCols), mode, format, tableCount: raw.length };
    }, { teamCols: TEAM_COLS, playerCols: PLAYER_COLS });

    const teams = extracted.team.map((row: any) => ({ ...row, 'Team Name': text(row['Team Name']) }));
    const players = extracted.player.map((row: any) => ({ ...row, 'Team Name': text(row['Team Name']), 'Player Name': text(row['Player Name']) }));
    const finalized = teams.some((row: any) => num(row['Survival Score']) === 12);

    return {
      version: VERSION,
      matchId,
      url,
      mode: extracted.mode,
      format: extracted.format,
      teamCount: teams.length,
      playerCount: players.length,
      finalized,
      teams,
      players,
      source: 'rendered MatchStats page'
    };
  } finally {
    await browser.close();
  }
}

const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  try {
    const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
    if (url.pathname === '/api/health') return send(res, 200, { ok: true, version: VERSION });
    if (url.pathname === '/api/scrape') {
      const matchId = url.searchParams.get('matchId')?.trim();
      if (!matchId) return send(res, 400, { error: 'MatchID ausente.' });
      return send(res, 200, await scrape(matchId));
    }
    const relative = url.pathname === '/' ? '/index.html' : url.pathname;
    const file = join(ROOT, relative);
    if (!existsSync(file)) return send(res, 404, 'Arquivo não encontrado.', 'text/plain; charset=utf-8');
    return send(res, 200, await readFile(file), mime(file));
  } catch (error: any) {
    return send(res, 500, { error: error?.message || 'Erro interno ao processar a partida.' });
  }
});

server.listen(Number(process.env.PORT || 3000), () => console.log(`FF Match Intelligence v${VERSION}`));
