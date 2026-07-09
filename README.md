# NEXUS - Infraestrutura Cognitiva Universal

Experiencia web 3D para visualizar um ecossistema cognitivo modular com agentes, memoria, evidencias e camadas de escala.

## Rodar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:5173`.

## Build de producao

```bash
npm run build
npm run preview
```

O build estatico sai em `dist/` e pode ser hospedado em GitHub Pages, Cloudflare Pages, Netlify, Vercel ou qualquer servidor HTTP.

## Publicar no GitHub Pages

1. Crie ou conecte um repositorio GitHub.
2. Suba este projeto para a branch `main`.
3. O workflow em `.github/workflows/deploy.yml` publica automaticamente o conteudo de `dist/` no GitHub Pages.

## Estado atual

Esta versao deixa a ideia funcionando como uma aplicacao web globalmente publicavel: build, preview, PWA basico e deploy automatico. Os numeros de status na interface ainda sao demonstrativos. Para virar infraestrutura cognitiva operacional, os proximos modulos reais sao API de agentes, autenticacao, memoria vetorial, conectores de modelos e observabilidade.
