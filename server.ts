import {createServer, IncomingMessage, ServerResponse} from 'node:http';
import {readFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {join, extname} from 'node:path';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const VERSION='1.0.2';
const ROOT=process.cwd();
const UPSTREAM='https://matchstats.us.ffesports.com';
const TEAM_COLS=['Match Rank','Team ID','Team Name','Survival Score','Kill','Total Score','BOOYAH!','Damage','On Target','Headshots','Headshots Kill Rate','Headshot Accuracy Rate','Survival Time','Revival','Rescue Members'];
const PLAYER_COLS=['MatchRank','Team Name','Player ID','Player Name','Kill','Damage','Assistências','On Target','Moving Distance','Headshots','Headshot Kill Rate','Headshot Accuracy Rate','Revival','Revival Members','Knock Down','Rescue Members','Survival Time','Maximum Kill Distance'];
const clean=(v:any)=>String(v??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
const text=(v:any)=>String(v??'').replace(/\s+/g,' ').trim();
const num=(v:any)=>{const n=Number(String(v??'').replace(',','.').replace(/[^\d.-]/g,''));return Number.isFinite(n)?n:0};
function send(res:ServerResponse,status:number,body:any,type='application/json'){res.writeHead(status,{'content-type':type,'cache-control':'no-store'});res.end(type==='application/json'?JSON.stringify(body):body)}
function mime(path:string){return {'html':'text/html; charset=utf-8','css':'text/css; charset=utf-8','js':'application/javascript; charset=utf-8','json':'application/json'}[extname(path).slice(1)]||'text/plain'}
async function browser(){const executable=process.env.PUPPETEER_EXECUTABLE_PATH||await chromium.executablePath();return puppeteer.launch({headless:true,executablePath:executable,args:[...chromium.args,'--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage'],defaultViewport:{width:1440,height:1000}})}
async function clickText(page:any,label:string){const loc=page.locator('::-p-text('+JSON.stringify(label)+')').setTimeout(7000);try{await loc.click();return true}catch{}return false}
async function scrape(matchId:string){const url=`${UPSTREAM}/match?search=${encodeURIComponent(matchId)}`;const b=await browser();try{const p=await b.newPage();await p.goto(url,{waitUntil:'networkidle2',timeout:45000});await new Promise(r=>setTimeout(r,1500));
  // The site is read as a normal rendered web page. We intentionally do not call an internal API.
  const clicked=await clickText(p,'View'); if(!clicked)throw new Error('Botão View não encontrado no MatchStats.');
  await new Promise(r=>setTimeout(r,1200));
  const data=await p.evaluate(({TEAM_COLS,PLAYER_COLS})=>{
    const norm=(s:any)=>String(s??'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
    const visible=(el:any)=>{const r=el.getBoundingClientRect();const st=getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden'};
    const tables=[...document.querySelectorAll('table')].filter(visible);
    const read=(table:any)=>{const heads=[...table.querySelectorAll('thead th')].map((x:any)=>x.innerText.trim());const body=[...table.querySelectorAll('tbody tr')].map((tr:any)=>[...tr.querySelectorAll('td')].map((td:any)=>td.innerText.trim()));return {heads,body}};
    const raw=tables.map(read);
    const score=(t:any,cols:any[])=>{const hs=t.heads.map(norm);return cols.filter((c:any)=>hs.includes(norm(c))).length};
    let team=raw.slice().sort((a:any,b:any)=>score(b,TEAM_COLS)-score(a,TEAM_COLS))[0]||{heads:[],body:[]};
    let player=raw.slice().sort((a:any,b:any)=>score(b,PLAYER_COLS)-score(a,PLAYER_COLS))[0]||{heads:[],body:[]};
    const toRows=(t:any,cols:any[])=>{const ix=new Map(t.heads.map((h:any,i:number)=>[norm(h),i]));return t.body.map((cells:any[])=>Object.fromEntries(cols.map((c:any)=>[c,cells[ix.get(norm(c))??-1]??''])))};
    const pageText=document.body.innerText;
    const mode=/Battle Royale|\bBR\b/i.test(pageText)?'BR':/Contra Squad|\bCS\b/i.test(pageText)?'CS':'—';
    const format=(pageText.match(/\b(\d+v\d+)\b/i)||[])[1]||'—';
    return {team:toRows(team,TEAM_COLS),player:toRows(player,PLAYER_COLS),pageText,mode,format,tables:raw.length};
  },{TEAM_COLS,PLAYER_COLS});
  const teams=data.team.map((r:any)=>({...r,'Team Name':text(r['Team Name'])}));const players=data.player.map((r:any)=>({...r,'Team Name':text(r['Team Name']),'Player Name':text(r['Player Name'])}));
  const teamCount=teams.length;const playerCount=players.length;const finalized=teams.some((r:any)=>num(r['Survival Score'])===12);
  return {version:VERSION,matchId,url,mode:data.mode,format:data.format,teamCount,playerCount,finalized,teams,players,source:'rendered MatchStats page'};
 }finally{await b.close()}}

const server=createServer(async(req:IncomingMessage,res:ServerResponse)=>{try{const u=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);if(u.pathname==='/api/scrape'){const id=u.searchParams.get('matchId')?.trim();if(!id)return send(res,400,{error:'MatchID ausente'});const m=await scrape(id);return send(res,200,m)}if(u.pathname==='/api/health')return send(res,200,{ok:true,version:VERSION});let path=u.pathname==='/'?'/index.html':u.pathname;const file=join(ROOT,path);if(!existsSync(file))return send(res,404,'Not found','text/plain');return send(res,200,await readFile(file),mime(file));}catch(e:any){return send(res,500,{error:e?.message||'Erro interno'})}});
server.listen(Number(process.env.PORT||3000),()=>console.log(`FF Match Intelligence v${VERSION} running`));
