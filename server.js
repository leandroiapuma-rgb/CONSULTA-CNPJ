// ============================================================
// Consulta CNPJ — backend
//
// Why this exists: the brief requires that no API key ever be
// exposed in frontend code. This tiny Express server is the only
// place credentials live (via environment variables) and the only
// place that talks to third-party data providers.
//
// Swap providers by editing fetchCNPJData() / fetchIEData() below —
// the frontend never needs to change.
// ============================================================

require("dotenv").config();
const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static(__dirname));

// ------------------------------------------------------------
// GET /api/cnpj/:cnpj
//
// Real, working integration: BrasilAPI (https://brasilapi.com.br)
// is a free, public, no-key-required source for CNPJ registration
// data (Receita Federal data mirrored from public sources). No key
// is needed for this provider, but the call still goes through our
// backend so it's trivial to swap in a paid/rate-limited provider
// later without touching the frontend, and so any future provider
// key stays server-side only.
// ------------------------------------------------------------
app.get("/api/cnpj/:cnpj", async (req, res) => {
  const cnpj = String(req.params.cnpj).replace(/\D/g, "");

  if (cnpj.length !== 14) {
    return res.status(400).json({ error: "CNPJ inválido." });
  }

  try {
    const data = await fetchCNPJData(cnpj);
    if (!data) return res.status(404).json({ error: "CNPJ não encontrado." });
    return res.json(data);
  } catch (err) {
    console.error("Erro ao consultar CNPJ:", err.message);
    return res.status(502).json({ error: "Serviço de dados indisponível." });
  }
});

// ------------------------------------------------------------
// GET /api/ie?cnpj=...&inscricao=...&uf=...
//
// There is no single free, national, real-time API for Inscrição
// Estadual — each state (SEFAZ) exposes its own system, and
// aggregators that unify them are paid services (e.g. CNPJá,
// Casa dos Dados, IE Fácil, ReceitaWS Pro, etc). This endpoint is
// wired to call one such provider IF configured via environment
// variables. Until a provider is configured, it honestly reports
// that no data is available instead of inventing anything.
// ------------------------------------------------------------
app.get("/api/ie", async (req, res) => {
  const { cnpj, inscricao, uf } = req.query;

  if (!cnpj && !inscricao && !uf) {
    return res.status(400).json({ error: "Informe ao menos um parâmetro de consulta." });
  }

  try {
    const inscricoes = await fetchIEData({ cnpj, inscricao, uf });
    return res.json({ inscricoes });
  } catch (err) {
    console.error("Erro ao consultar Inscrição Estadual:", err.message);
    return res.status(502).json({ error: "Serviço de dados indisponível." });
  }
});

// ------------------------------------------------------------
// Provider: CNPJ data (BrasilAPI — real, free, no key required)
// ------------------------------------------------------------
async function fetchCNPJData(cnpj) {
  const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`);

  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`BrasilAPI respondeu ${response.status}`);

  const raw = await response.json();

  return {
    cnpj: raw.cnpj,
    razaoSocial: raw.razao_social || null,
    nomeFantasia: raw.nome_fantasia || null,
    situacaoCadastral: raw.descricao_situacao_cadastral || raw.situacao_cadastral || null,
    dataAbertura: raw.data_inicio_atividade || null,
    naturezaJuridica: raw.natureza_juridica || null,
    porte: raw.porte || raw.descricao_porte || null,
    capitalSocial: raw.capital_social ?? null,
    dataSituacaoCadastral: raw.data_situacao_cadastral || null,
    endereco: {
      logradouro: [raw.descricao_tipo_de_logradouro, raw.logradouro].filter(Boolean).join(" ") || raw.logradouro || null,
      numero: raw.numero || null,
      complemento: raw.complemento || null,
      bairro: raw.bairro || null,
      municipio: raw.municipio || null,
      uf: raw.uf || null,
      cep: raw.cep || null,
    },
    cnaePrincipal: raw.cnae_fiscal
      ? { codigo: String(raw.cnae_fiscal), descricao: raw.cnae_fiscal_descricao || "" }
      : null,
    cnaesSecundarios: (raw.cnaes_secundarios || []).map((c) => ({
      codigo: String(c.codigo),
      descricao: c.descricao,
    })),
    socios: (raw.qsa || []).map((s) => ({
      nome: s.nome_socio || null,
      qualificacao: s.qualificacao_socio || null,
    })),
  };
}

// ------------------------------------------------------------
// Provider: Inscrição Estadual (plug in a real provider here)
//
// Expected env vars, once you have a provider:
//   IE_PROVIDER_URL       e.g. https://api.seuprovedor.com/v1/ie
//   IE_PROVIDER_API_KEY   the provider's secret key (never sent to the browser)
// ------------------------------------------------------------
async function fetchIEData({ cnpj, inscricao, uf }) {
  const providerUrl = process.env.IE_PROVIDER_URL;
  const providerKey = process.env.IE_PROVIDER_API_KEY;

  if (!providerUrl || !providerKey) {
    // No provider configured yet — return "not available" honestly,
    // never fabricated data.
    return [];
  }

  const params = new URLSearchParams();
  if (cnpj) params.set("cnpj", cnpj);
  if (inscricao) params.set("inscricao", inscricao);
  if (uf) params.set("uf", uf);

  const response = await fetch(`${providerUrl}?${params.toString()}`, {
    headers: { Authorization: `Bearer ${providerKey}` },
  });

  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Provedor de IE respondeu ${response.status}`);

  const raw = await response.json();

  // NOTE: adapt this mapping to whatever shape your chosen provider returns.
  return (raw.inscricoes || []).map((ie) => ({
    uf: ie.uf,
    numero: ie.numero || ie.inscricao,
    situacao: ie.situacao || null,
    contribuinteICMS: typeof ie.contribuinte_icms === "boolean" ? ie.contribuinte_icms : null,
    dataSituacao: ie.data_situacao || null,
  }));
}

app.listen(PORT, () => {
  console.log(`Consulta CNPJ backend rodando em http://localhost:${PORT}`);
});
