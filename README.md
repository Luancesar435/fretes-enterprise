# Fretes Enterprise

Sistema web pronto para deploy no Cloudflare Pages, com importação de planilhas Excel, leitura automática de colunas, dashboard executivo e SQL completo para Supabase.

## O que já faz
- Importa `.xlsx`, `.xls` e `.csv`
- Calcula lucro ou prejuízo por pedido
- Consolida receita, custo, margem, divergências, devoluções e reentregas
- Gera visão por transportadora, marketplace e UF
- Exporta base filtrada em CSV
- Pode salvar snapshots no Supabase

## Estrutura
- `src/` frontend React
- `supabase/fretes_enterprise_schema.sql` schema completo do banco
- `.env.example` exemplo de variáveis

## Como rodar localmente
```bash
npm install
npm run dev
```

## Como gerar build
```bash
npm install
npm run build
```
O build final será criado na pasta `dist/`.

## Deploy no Cloudflare Pages
1. Suba esta pasta em um repositório GitHub.
2. No Cloudflare Pages, crie um novo projeto apontando para o repositório.
3. Configure:
   - Build command: `npm run build`
   - Build output directory: `dist`
4. Em **Environment Variables**, adicione:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Faça o deploy.

## Como subir o SQL no Supabase
1. Abra o projeto no Supabase.
2. Vá em **SQL Editor**.
3. Cole o conteúdo de `supabase/fretes_enterprise_schema.sql`.
4. Execute.
5. Depois crie os usuários normalmente via Auth.

## Observação importante
O sistema já funciona sem Supabase para apresentação, porque processa a planilha direto no navegador. Com Supabase configurado, ele passa a gravar as importações e virar produto SaaS de verdade.
