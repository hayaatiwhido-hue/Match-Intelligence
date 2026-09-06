import { createServer, IncomingMessage, ServerResponse } from "node:http";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, extname } from "node:path";

const ROOT = process.cwd();
const PORT = Number(process.env.PORT || 3000);

const TEAM_HEADERS = ["Match Rank","Team ID","Team Name","Survival Score","Kill","Total Score","BOOYAH!","Damage","On Target","Headshots","Headshots Kill Rate","Headshot Accuracy Rate","Survival Time","Revival","Rescue Members"];
const PLAYER_HEADERS = ["MatchRank","Team Name","Player ID","Player Name","Kill","Damage","Assistências","On Target","Moving Distance","Headshots","Headshot Kill Rate","Headshot Accuracy Rate","Revival","Revival Members","Knock Down","Rescue Members","Survival Time","Maximum Kill Distance"];

function send(res:ServerResponse,status:number,body:string,type="text/html; charset=utf-8"){
  res.writeHead(status,{"Content-Type":type,"Cache-Control":"no-store"});
  res.end(body);
}
function json(res:ServerResponse,status:number,obj:any){send(res,status,JSON.stringify(obj),"application/json; charset=utf-8");}

async function scrape(matchId:string){
  // These heavy browser packages are loaded only when a scrape is requested.
  // The homepage therefore cannot crash just because Chromium is unavailable.
  const [{default: puppeteer}, {default: chromium}] = await Promise.all([
    import("puppeteer-core"),
    import("@sparticuz/chromium")
  ]);

  const browser=await puppeteer.launch({
    args:[...chromium.args,"--no-sandbox","--disable-setuid-sandbox"],
    executablePath:await chromium.executablePath(),
    headless:true,
    defaultViewport:{width:1440,height:1000}
  });

  try{
    const page=await browser.newPage();
    await page.setUserAgent("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/128 Safari/537.36");
    const url=`https://matchstats.us.ffesports.com/match?search=${encodeURIComponent(matchId)}`;
    await page.goto(url,{waitUntil:"domcontentloaded",timeout:45000});
    await page.waitForFunction(()=>document.body && document.body.innerText.length>100,{timeout:30000});
    await new Promise(r=>setTimeout(r,1200));

    const clicked=await page.evaluate(()=>{
      const els=[...document.querySelectorAll("button,a")];
      const el=els.find(x=>(x.textContent||"").trim().toLowerCase()==="view") as HTMLElement|undefined;
      if(el){el.click();return true}
      return false;
    });
    if(clicked) await new Promise(r=>setTimeout(r,1200));

    const extracted=await page.evaluate((teamHeaders:any[],playerHeaders:any[])=>{
      const norm=(x:any)=>String(x??"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\s+/g," ").trim();
      const read=(table:HTMLTableElement)=>{
        const rows=[...table.querySelectorAll("tr")].map(tr=>[...tr.querySelectorAll("th,td")].map(c=>(c.textContent||"").replace(/\s+/g," ").trim())).filter(r=>r.length);
        return rows;
      };
      const tables=[...document.querySelectorAll("table")].map(t=>read(t as HTMLTableElement)).filter(r=>r.length);
      const pick=(headers:any[])=>{
        let best:string[][]=[];
        let score=-1;
        for(const rows of tables){
          const head=(rows[0]||[]).map(norm);
          const s=headers.reduce((n:any,h:any)=>n+(head.includes(norm(h))?1:0),0);
          if(s>score){score=s;best=rows}
        }
        if(score<2)return [];
        const head=best[0].map(norm);
        const indexes=headers.map((h:any)=>head.indexOf(norm(h)));
        return best.slice(1).map((r:any[])=>indexes.map((i:number)=>i>=0?(r[i]??""):"")).filter((r:any[])=>r.some(Boolean));
      };
      const body=document.body.innerText||"";
      return {teams:pick(teamHeaders),players:pick(playerHeaders),body};
    },TEAM_HEADERS,PLAYER_HEADERS);

    if(!extracted.teams.length && !extracted.players.length){
      throw new Error("O MatchStats abriu, mas as tabelas Team Data/Player Data não foram encontradas.");
    }

    const mode=/battle royale|\bbr\b/i.test(extracted.body)?"BR":(/contra squad|\bcs\b/i.test(extracted.body)?"CS":"—");
    const teamCount=extracted.teams.length;
    const playerCount=extracted.players.length;
    let format="—";
    if(teamCount && playerCount){
      const per=playerCount/teamCount;
      if(Number.isInteger(per)) format=`${per}v${per}`;
    }
    const finished=extracted.teams.some((r:any[])=>String(r[3]??"").trim()==="12");
    return {ok:true,matchId,source:url,mode,format,teamCount,playerCount,teams:extracted.teams,players:extracted.players,finished};
  } finally {
    await browser.close();
  }
}

async function route(req:IncomingMessage,res:ServerResponse){
  try{
    const u=new URL(req.url||"/","http://localhost");

    if(u.pathname==="/api/scrape"){
      const matchId=(u.searchParams.get("matchId")||"").trim();
      if(!/^\d+$/.test(matchId)) return json(res,400,{ok:false,error:"MatchID inválido."});
      try{return json(res,200,await scrape(matchId));}
      catch(e:any){return json(res,502,{ok:false,error:e?.message||"Falha ao consultar o MatchStats."});}
    }

    if(u.pathname==="/api/health"){
      return json(res,200,{ok:true,version:"1.0.6",service:"FF Match Intelligence"});
    }

    let file=u.pathname==="/"?"index.html":u.pathname.replace(/^\/+/,"");
    if(file.includes("..")) return send(res,403,"Forbidden","text/plain");
    const path=join(ROOT,file);
    if(!existsSync(path)) return send(res,404,"Not found","text/plain");
    const ext=extname(path);
    const type=ext===".html"?"text/html; charset=utf-8":ext===".css"?"text/css; charset=utf-8":ext===".js"?"text/javascript; charset=utf-8":"application/octet-stream";
    return send(res,200,await readFile(path,"utf8"),type);
  }catch(e:any){
    return json(res,500,{ok:false,error:e?.message||"Erro interno"});
  }
}

createServer(route).listen(PORT,()=>console.log(`FF Match Intelligence v1.0.6 listening on ${PORT}`));
