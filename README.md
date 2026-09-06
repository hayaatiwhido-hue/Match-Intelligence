# FF Match Intelligence — v1.0.3

Projeto completo, pronto para publicar pelo GitHub e importar na Vercel.

## O que esta versão faz

- Extrai o MatchID de nomes `ReplayInfo_ID_DATA.json`.
- Abre o MatchStats com `match?search=MatchID` usando um navegador automatizado.
- Clica no botão `View` da página real.
- Lê as tabelas renderizadas de Team Data e Player Data.
- Não consulta endpoint/API interna do MatchStats.
- Mostra modo, formato, equipes e jogadores.
- Permite salvar MatchIDs e consolidar equipes.
- Permite cadastrar nickname de evento e função por Player ID.
- Permite normalizar variações do nome das equipes.
- Atualiza automaticamente a partida acompanhada.
- Marca a partida como finalizada quando uma equipe chega a Survival Score 12.
- Guarda os registros no navegador do usuário.

## Publicação pelo celular

1. Crie um repositório novo no GitHub.
2. Abra o ZIP e envie **todos os arquivos que estão na raiz do projeto** para a raiz do repositório. Não coloque o ZIP dentro do repositório.
3. No painel da Vercel, importe esse repositório do GitHub.
4. Não preencha variáveis de ambiente, não escolha banco de dados e não altere comandos de build.
5. Publique.

O projeto usa `server.ts` na raiz. A Vercel atualmente detecta esse tipo de servidor Node automaticamente, sem exigir um framework separado.

## Observação importante sobre o navegador

A extração usa Chromium/Puppeteer no servidor para abrir o MatchStats como uma página normal, executar JavaScript, localizar o botão View e ler o conteúdo renderizado. Por isso, a primeira consulta pode levar alguns segundos enquanto o navegador inicia.

## Versão

1.0.3
