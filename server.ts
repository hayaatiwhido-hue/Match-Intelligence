import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3000);

const TEAM_HEADERS = ["Match Rank","Team ID","Team Name","Survival Score","Kill","Total Score","BOOYAH!","Damage","On Target","Headshots","Headshots Kill Rate","Headshot Accuracy Rate","Survival Time","Revival","Rescue Members"];
const PLAYER_HEADERS = ["MatchRank","Team Name","Player ID","Player Name","Kill","Damage","Assistências","On Target","Moving Distance","Headshots","Headshot Kill Rate","Headshot Accuracy Rate","Revival","Revival Members","Knock Down","Rescue Members","Survival Time","Maximum Kill Distance"];

function send(res:ServerResponse,status:number,body:string,type="text/html; charset=utf-8"){
  res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store"});
  res.end(body);
}
function json(res:ServerResponse,status:number,obj:any){send(res,status,JSON.stringify(obj),"application/json; charset=utf-8")}
function escapeHtml(s:string){return s.replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"} as any)[c])}

async function extractTables(page:any){
  return await page.evaluate((TEAM_HEADERS:any,PLAYER_HEADERS:any)=>{
    const norm=(x:string)=>x.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
    const tables=[...document.querySelectorAll("table")];
    const read=(table:HTMLTableElement)=>{
      const trs=[...table.querySelectorAll("tr")];
      return trs.map(tr=>[...tr.querySelectorAll("th,td")].map(c=>(c.textContent||"").replace(/\s+/g," ").trim())).filter(r=>r.length);
    };
    const scored=tables.map(t=>{const rows=read(t);const head=(rows[0]||[]).map(norm);let team=0,player=0;for(const h of head){if(TEAM_HEADERS.some((x:string)=>norm(x)===h))team++;if(PLAYER_HEADERS.some((x:string)=>norm(x)===h))player++;}return {rows,team,player}}).filter(x=>x.rows.length);
    const pick=(kind:"team"|"player")=>{
      const target=kind==="team"?TEAM_HEADERS:PLAYER_HEADERS;
      const found=scored.sort((a,b)=>(kind==="team"?b.team-a.team:b.player-a.player))[0];
      if(!found)return [];
      const head=found.rows[0].map(norm);
      const indexes=target.map((h:string)=>head.indexOf(norm(h)));
      return found.rows.slice(1).map((r:string[])=>indexes.map((i:number)=>i>=0?r[i]??"":r[r.length-1]??"")).filter(r=>r.some(Boolean));
    };
    return {teams:pick("team"),players:pick("player")};
  },TEAM_HEADERS,PLAYER_HEADERS);
}

async function scrape(matchId:string){
  const url=`https://matchstats.us.ffesports.com/match?search=${encodeURIComponent(matchId)}`;
  const browser=await puppeteer.launch({
    args: [...chromium.args, "--no-sandbox","--disable-setuid-sandbox"],
    executablePath: await chromium.executablePath(),
    headless:true,
    defaultViewport:{width:1440,height:1000}
  });
  try{
    const page=await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36");
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(()=>document.body && document.body.innerText.length>100,{timeout:30000});
    await new Promise(r=>setTimeout(r,1200));

    const view=await page.evaluate(()=>{
      const els=[...document.querySelectorAll("button,a")];
      const e=els.find(x=>(x.textContent||"").trim().toLowerCase()==="view");
      if(e){(e as HTMLElement).click();return true}
      return false;
    });
    if(view) await new Promise(r=>setTimeout(r,1200));

    const data=await extractTables(page);
    const bodyText=await page.evaluate(()=>document.body.innerText);
    if(!data.teams.length && !data.players.length) throw new Error("O MatchStats abriu, mas as tabelas Team Data/Player Data não foram encontradas.");
    const mode=/battle royale|\\bbr\\b/i.test(bodyText)?"BR":(/contra squad|\\bcs\\b/i.test(bodyText)?"CS":"—");
    const teamCount=data.teams.length;
    const playerCount=data.players.length;
    let format="—";
    if(teamCount&&playerCount){const per=playerCount/teamCount;if(Number.isInteger(per))format=`${per}v${per}`}
    const finished=data.teams.some((r:any[])=>String(r[3]||"").trim()==="12");
    return {ok:true,matchId,source:url,mode,format,teamCount,playerCount,teams:data.teams,players:data.players,finished};
  }finally{await browser.close()}
}

async function route(req:IncomingMessage,res:ServerResponse){
  try{
    const u=new URL(req.url||"/","http://localhost");
    if(u.pathname==="/api/scrape"){
      const matchId=(u.searchParams.get("matchId")||"").trim();
      if(!/^\d+$/.test(matchId)) return json(res,400,{ok:false,error:"MatchID inválido."});
      try{return json(res,200,await scrape(matchId))}catch(e:any){return json(res,502,{ok:false,error:e?.message||"Falha ao consultar o MatchStats."})}
    }
    let file=u.pathname==="/"?"index.html":u.pathname.replace(/^\/+/,"");
    if(file.includes("..")) return send(res,403,"Forbidden","text/plain");
    const path=join(ROOT,file);
    if(!existsSync(path)) return send(res,404,"Not found","text/plain");
    const ext=extname(path);
    const type=ext===".html"?"text/html; charset=utf-8":ext===".css"?"text/css; charset=utf-8":ext===".js"?"text/javascript; charset=utf-8":"application/octet-stream";
    return send(res,200,await readFile(path,"utf8"),type);
  }catch(e:any){return json(res,500,{ok:false,error:e?.message||"Erro interno"})}
}

createServer(route).listen(PORT,()=>console.log(`FF Match Intelligence v1.0.5 listening on ${PORT}`));
