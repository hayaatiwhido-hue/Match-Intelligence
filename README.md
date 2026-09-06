# FF Match Intelligence v1.0.5

Projeto em **um único núcleo de servidor**: não existe pasta `api/`.

Arquivos principais:
- `server.ts` — servidor, arquivos estáticos e rota `/api/scrape` no mesmo núcleo.
- `index.html` — interface.
- `style.css` — estilos.
- `app.js` — lógica do navegador.
- `package.json` — dependências.

## Deploy

Envie todos os arquivos para a raiz de um repositório GitHub e importe o repositório na Vercel. O projeto usa o suporte atual da Vercel para detectar `server.ts` na raiz.

## Importante

A consulta ao MatchStats é feita por automação de navegador: abre a URL `match?search=MatchID`, procura e clica no botão `View` e lê as tabelas renderizadas. Não existe integração com endpoint/API interna do MatchStats.

A função de scraping usa Chromium serverless. A Vercel pode impor limites de duração e recursos conforme o plano.

## Versão

1.0.5 — servidor consolidado em um único núcleo, sem pasta `api/`.
