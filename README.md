# FF Match Intelligence — v1.0.2

Projeto completo em arquivos separados: HTML, CSS, JavaScript do navegador e servidor Node/TypeScript.

## Fluxo
1. O usuário cola o nome de um ReplayInfo.
2. O navegador extrai o MatchID.
3. O servidor abre `https://matchstats.us.ffesports.com/match?search=MatchID` em Chromium automatizado.
4. O servidor procura visualmente o botão **View**, clica nele e lê as tabelas HTML renderizadas de Team Data e Player Data.
5. Nenhuma API/endpoint interno do MatchStats é consultado.

A automação usa Puppeteer para navegar, localizar elementos e clicar na página renderizada.

## Arquivos
- `index.html` — interface
- `style.css` — visual
- `app.js` — lógica da interface, registros, aliases, consolidação e atualização
- `server.ts` — servidor e automação do navegador
- `package.json` — dependências
- `vercel.json` — configuração de função

## Rodar localmente
Requer Node.js 22+.

```bash
npm install
npm start
```

Abra `http://localhost:3000`.

Se tiver Chrome/Chromium instalado localmente e o pacote não conseguir localizar um executável, defina `PUPPETEER_EXECUTABLE_PATH` para o caminho do Chrome.

## Hospedagem
O projeto pode ser usado em uma infraestrutura Node que permita Chromium. Para uma implantação serverless, a função precisa ter memória/tempo suficientes para iniciar o navegador e carregar o MatchStats. A configuração deste pacote reserva 1024 MB e 60 segundos para a função.

## Observação sobre atualização ao vivo
A interface consulta a rota de extração a cada 1 segundo enquanto uma partida estiver aberta. Isso significa novas navegações ao MatchStats; não existe polling a cada 1 ms, pois seria impraticável para navegador automatizado e servidor.
