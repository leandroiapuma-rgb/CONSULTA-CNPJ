# Consulta CNPJ

Site gratuito, sem cadastro e sem login, para consultar dados cadastrais de empresas brasileiras (CNPJ) e, quando disponível, a Inscrição Estadual. Monetização prevista via anúncios (espaços já reservados no layout).

## Estrutura do projeto

```
consulta-cnpj/
├── frontend/          → HTML/CSS/JS puro, sem build step
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── backend/           → Express, único lugar onde chaves de API vivem
│   ├── server.js
│   ├── package.json
│   └── .env.example
└── README.md
```

O frontend nunca fala diretamente com provedores de dados que exigem chave — tudo passa pelo backend (`/api/cnpj/:cnpj` e `/api/ie`). Isso permite trocar de fornecedor de dados a qualquer momento sem tocar na interface.

## Rodando localmente

```bash
cd backend
cp .env.example .env
npm install
npm start
```

O backend sobe em `http://localhost:3000` e já serve os arquivos de `frontend/` na raiz. Abra `http://localhost:3000` no navegador.

## Provedores de dados

**CNPJ (funcional, real, já integrado):** o backend usa a [BrasilAPI](https://brasilapi.com.br), pública, gratuita e sem necessidade de chave, para trazer razão social, situação cadastral, endereço, CNAEs e quadro societário. Para trocar por outro fornecedor (ex.: pago, com SLA), edite apenas a função `fetchCNPJData()` em `backend/server.js` — o contrato de dados que o frontend espera está documentado nos comentários dessa função.

**Inscrição Estadual (arquitetura pronta, fornecedor a definir):** não existe uma API nacional única, gratuita e em tempo real para IE — cada estado (SEFAZ) tem seu próprio sistema, e os agregadores que unificam isso (CNPJá, Casa dos Dados, IE Fácil, ReceitaWS Pro, etc.) são serviços pagos. O endpoint `/api/ie` já está pronto para receber as credenciais de um desses provedores via variáveis de ambiente (`IE_PROVIDER_URL`, `IE_PROVIDER_API_KEY`) em `backend/.env`. Enquanto nenhum provedor estiver configurado, o site informa honestamente "Não foi localizada Inscrição Estadual disponível para este CNPJ" — nunca inventa dados.

## Publicidade

Os espaços de anúncio (topo, meio da página, lateral no desktop, rodapé) são blocos visuais reservados (`.ad-slot` em `styles.css`), sem nenhuma rede de anúncios integrada ainda. Para ativar, basta substituir o conteúdo de cada `.ad-slot` pelo código de tag da rede escolhida (ex. Google AdSense) — o layout já reserva o espaço para não deslocar o restante do conteúdo quando os anúncios carregarem.

## Deploy

Qualquer serviço que rode Node.js funciona (Render, Railway, Fly.io, um VPS comum). Passos gerais:

1. Suba a pasta `backend/` (que também serve o `frontend/`) para o serviço escolhido.
2. Configure as variáveis de ambiente de `.env.example` no painel do serviço.
3. Aponte o domínio (`consultacnpj.com.br` ou similar) para o serviço.
4. As rotas `/consulta-cnpj`, `/inscricao-estadual`, `/cartao-cnpj` e `/consulta-empresa` estão referenciadas no rodapé como páginas de SEO futuras — hoje redirecionam para a página única; podem virar páginas próprias mais adiante sem mudar a arquitetura de dados.

## Decisões de design

O visual evita o "kit SaaS" genérico (cards arredondados com sombra, azul institucional puro, ícones decorativos). Em vez disso:

- **Tom de "ficha/dossiê"**: seções com regra à esquerda e divisórias horizontais, como um documento cadastral real — reforça que o site entrega dados oficiais, não uma venda de produto.
- **Tipografia**: serifada (Source Serif 4) para títulos, que remete a documentos formais; monoespaçada (IBM Plex Mono) para números de CNPJ/IE, como em formulários e recibos reais; Inter para o restante da interface.
- **Paleta**: papel claro, azul-marinho institucional para ações, verde discreto para status "ativa" e terracota/tijolo apenas para alertas — nada de gradientes ou cores decorativas.
- **Anúncios claramente diferenciados**: bordas tracejadas e textura sutil para que o usuário nunca confunda um anúncio com um dado da consulta.
