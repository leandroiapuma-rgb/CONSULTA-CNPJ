// ============================================================
// Consulta CNPJ — frontend logic
// The frontend NEVER calls third-party data providers directly
// with credentials. All real lookups go through our own backend
// (see /backend/server.js), which is the only place API keys live.
// ============================================================

const API_BASE = ""; // same-origin. Point this at your deployed backend URL if served separately.

// ---------- helpers: CNPJ mask + validation ----------

function onlyDigits(str) {
  return (str || "").replace(/\D/g, "");
}

function maskCNPJ(value) {
  const d = onlyDigits(value).slice(0, 14);
  let out = d;
  if (d.length > 2) out = d.slice(0, 2) + "." + d.slice(2);
  if (d.length > 5) out = out.slice(0, 6) + "." + out.slice(6);
  if (d.length > 8) out = out.slice(0, 10) + "/" + out.slice(10);
  if (d.length > 12) out = out.slice(0, 15) + "-" + out.slice(15);
  return out;
}

function isValidCNPJ(raw) {
  const cnpj = onlyDigits(raw);
  if (cnpj.length !== 14) return false;
  if (/^(\d)\1{13}$/.test(cnpj)) return false;

  const calcCheckDigit = (base) => {
    const weights = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += parseInt(base[i], 10) * weights[i];
    const rest = sum % 11;
    return rest < 2 ? 0 : 11 - rest;
  };

  const base12 = cnpj.slice(0, 12);
  const d1 = calcCheckDigit(base12);
  const d2 = calcCheckDigit(base12 + d1);
  return cnpj.slice(12) === `${d1}${d2}`;
}

function formatCurrencyBRL(value) {
  const n = Number(value);
  if (!value || Number.isNaN(n)) return "Não informado";
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDateBR(isoOrNull) {
  if (!isoOrNull) return "Não informado";
  const d = new Date(isoOrNull);
  if (Number.isNaN(d.getTime())) return isoOrNull;
  return d.toLocaleDateString("pt-BR");
}

function textOr(value, fallback = "Não informado") {
  if (value === null || value === undefined || value === "") return fallback;
  return value;
}

// ---------- tabs ----------

const tabCnpj = document.getElementById("tab-cnpj");
const tabIe = document.getElementById("tab-ie");
const panelCnpj = document.getElementById("panel-cnpj");
const panelIe = document.getElementById("panel-ie");

function activateTab(which) {
  const cnpjActive = which === "cnpj";
  tabCnpj.classList.toggle("is-active", cnpjActive);
  tabIe.classList.toggle("is-active", !cnpjActive);
  tabCnpj.setAttribute("aria-selected", String(cnpjActive));
  tabIe.setAttribute("aria-selected", String(!cnpjActive));
  panelCnpj.classList.toggle("is-active", cnpjActive);
  panelIe.classList.toggle("is-active", !cnpjActive);
}
tabCnpj.addEventListener("click", () => activateTab("cnpj"));
tabIe.addEventListener("click", () => activateTab("ie"));

// ---------- CNPJ input mask ----------

const inputCnpj = document.getElementById("input-cnpj");
inputCnpj.addEventListener("input", (e) => {
  e.target.value = maskCNPJ(e.target.value);
});

const ieInputCnpj = document.getElementById("ie-input-cnpj");
ieInputCnpj.addEventListener("input", (e) => {
  e.target.value = maskCNPJ(e.target.value);
});

// ---------- state helpers ----------

function hideAll(ids) {
  ids.forEach((id) => document.getElementById(id).classList.add("is-hidden"));
}
function show(id) {
  document.getElementById(id).classList.remove("is-hidden");
}

const CNPJ_STATES = ["state-loading", "state-invalid", "state-notfound", "state-apierror", "ad-mid", "result"];

// ---------- CNPJ lookup flow ----------

const formCnpj = document.getElementById("form-cnpj");
let lastResultData = null; // kept for PDF export

formCnpj.addEventListener("submit", async (e) => {
  e.preventDefault();
  const raw = inputCnpj.value;

  hideAll(CNPJ_STATES);

  if (!isValidCNPJ(raw)) {
    show("state-invalid");
    return;
  }

  show("state-loading");

  try {
    const digits = onlyDigits(raw);
    const res = await fetch(`${API_BASE}/api/cnpj/${digits}`);

    if (res.status === 404) {
      hideAll(CNPJ_STATES);
      show("state-notfound");
      return;
    }
    if (!res.ok) {
      hideAll(CNPJ_STATES);
      document.getElementById("apierror-detail").textContent =
        "O serviço de dados está indisponível no momento. Tente novamente em alguns instantes.";
      show("state-apierror");
      return;
    }

    const data = await res.json();
    hideAll(CNPJ_STATES);
    show("ad-mid");
    renderResult(data);
    show("result");

    // Inscrição Estadual is fetched as part of the same consultation flow
    fetchIEForResult(digits);

  } catch (err) {
    hideAll(CNPJ_STATES);
    document.getElementById("apierror-detail").textContent =
      "Não conseguimos nos conectar ao serviço de dados. Verifique sua conexão e tente novamente.";
    show("state-apierror");
  }
});

document.getElementById("btn-new").addEventListener("click", () => {
  formCnpj.reset();
  hideAll(CNPJ_STATES);
  lastResultData = null;
  inputCnpj.focus();
});

function renderResult(data) {
  lastResultData = data;

  const set = (id, value) => (document.getElementById(id).textContent = value);

  set("res-razao", textOr(data.razaoSocial, "Empresa"));
  set("res-fantasia", data.nomeFantasia ? data.nomeFantasia : "");
  document.getElementById("res-fantasia").classList.toggle("is-hidden", !data.nomeFantasia);

  const pill = document.getElementById("res-situacao");
  pill.textContent = textOr(data.situacaoCadastral, "Situação não informada");
  pill.className = "status-pill";
  const sit = (data.situacaoCadastral || "").toUpperCase();
  if (sit.includes("BAIXADA")) pill.classList.add("is-baixa");
  else if (sit.includes("INAPTA")) pill.classList.add("is-inapta");

  set("d-cnpj", maskCNPJ(data.cnpj));
  set("d-razao", textOr(data.razaoSocial));
  set("d-fantasia", textOr(data.nomeFantasia));
  set("d-situacao", textOr(data.situacaoCadastral));
  set("d-abertura", formatDateBR(data.dataAbertura));
  set("d-natureza", textOr(data.naturezaJuridica));
  set("d-porte", textOr(data.porte));
  set("d-capital", formatCurrencyBRL(data.capitalSocial));
  set("d-data-situacao", formatDateBR(data.dataSituacaoCadastral));

  const end = data.endereco || {};
  set("e-logradouro", textOr(end.logradouro));
  set("e-numero", textOr(end.numero));
  set("e-complemento", textOr(end.complemento));
  set("e-bairro", textOr(end.bairro));
  set("e-municipio", textOr(end.municipio));
  set("e-uf", textOr(end.uf));
  set("e-cep", textOr(end.cep));

  set("a-cnae-principal", textOr(data.cnaePrincipal && data.cnaePrincipal.codigo));
  set("a-cnae-principal-desc", textOr(data.cnaePrincipal && data.cnaePrincipal.descricao));

  const secWrap = document.getElementById("a-secundarios-wrap");
  const secList = document.getElementById("a-secundarios");
  secList.innerHTML = "";
  const secundarios = data.cnaesSecundarios || [];
  if (secundarios.length > 0) {
    secundarios.forEach((c) => {
      const li = document.createElement("li");
      li.textContent = `${c.codigo} — ${c.descricao}`;
      secList.appendChild(li);
    });
    secWrap.classList.remove("is-hidden");
  } else {
    secWrap.classList.add("is-hidden");
  }

  const sociosList = document.getElementById("socios-list");
  const sociosEmpty = document.getElementById("socios-empty");
  sociosList.innerHTML = "";
  const socios = data.socios || [];
  if (socios.length > 0) {
    socios.forEach((s) => {
      const li = document.createElement("li");
      const nome = document.createElement("span");
      nome.className = "socio-nome";
      nome.textContent = textOr(s.nome, "Nome não informado");
      const qual = document.createElement("span");
      qual.className = "socio-qual";
      qual.textContent = textOr(s.qualificacao, "Qualificação não informada");
      li.appendChild(nome);
      li.appendChild(qual);
      sociosList.appendChild(li);
    });
    sociosEmpty.classList.add("is-hidden");
  } else {
    sociosEmpty.classList.remove("is-hidden");
  }

  // reset IE sub-section to loading until fetchIEForResult resolves
  hideAll(["ie-loading", "ie-found", "ie-empty"]);
  show("ie-loading");
}

async function fetchIEForResult(cnpjDigits) {
  try {
    const res = await fetch(`${API_BASE}/api/ie?cnpj=${cnpjDigits}`);
    hideAll(["ie-loading", "ie-found", "ie-empty"]);

    if (!res.ok) {
      show("ie-empty");
      return;
    }
    const data = await res.json();
    const inscricoes = data.inscricoes || [];
    if (lastResultData) lastResultData._inscricoesEstaduais = inscricoes; // used by PDF export
    renderIEList(inscricoes, "ie-list", "ie-found", "ie-empty");
  } catch (err) {
    hideAll(["ie-loading", "ie-found"]);
    show("ie-empty");
  }
}

function renderIEList(inscricoes, listId, foundId, emptyId) {
  const list = document.getElementById(listId);
  list.innerHTML = "";

  if (!inscricoes || inscricoes.length === 0) {
    show(emptyId);
    return;
  }

  inscricoes.forEach((ie) => {
    const li = document.createElement("li");

    const uf = document.createElement("span");
    uf.className = "ie-uf";
    uf.textContent = textOr(ie.uf, "UF não informada");
    li.appendChild(uf);

    const rows = [
      ["Inscrição", ie.numero],
      ["Situação", ie.situacao],
      ["Contribuinte de ICMS", ie.contribuinteICMS === true ? "Sim" : ie.contribuinteICMS === false ? "Não" : null],
      ["Data da situação", ie.dataSituacao ? formatDateBR(ie.dataSituacao) : null],
    ];
    rows.forEach(([label, value]) => {
      if (value === null || value === undefined || value === "") return;
      const row = document.createElement("div");
      row.className = "ie-row";
      const l = document.createElement("span");
      l.textContent = label;
      const v = document.createElement("span");
      v.textContent = value;
      row.appendChild(l);
      row.appendChild(v);
      li.appendChild(row);
    });

    list.appendChild(li);
  });

  show(foundId);
}

// ---------- Aba 2: consulta direta de Inscrição Estadual ----------

const formIe = document.getElementById("form-ie");
const IE2_STATES = ["ie2-loading", "ie2-invalid", "ie2-apierror", "ie2-found", "ie2-empty"];

formIe.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideAll(IE2_STATES);

  const cnpj = onlyDigits(ieInputCnpj.value);
  const insc = document.getElementById("ie-input-insc").value.trim();
  const uf = document.getElementById("ie-input-uf").value;

  if (!cnpj && !insc && !uf) {
    show("ie2-invalid");
    return;
  }

  show("ie2-loading");

  try {
    const params = new URLSearchParams();
    if (cnpj) params.set("cnpj", cnpj);
    if (insc) params.set("inscricao", insc);
    if (uf) params.set("uf", uf);

    const res = await fetch(`${API_BASE}/api/ie?${params.toString()}`);
    hideAll(IE2_STATES);

    if (!res.ok) {
      show("ie2-apierror");
      return;
    }
    const data = await res.json();
    renderIEList(data.inscricoes || [], "ie2-list", "ie2-found", "ie2-empty");
  } catch (err) {
    hideAll(IE2_STATES);
    show("ie2-apierror");
  }
});

// ---------- PDF export ----------

document.getElementById("btn-pdf").addEventListener("click", () => {
  if (!lastResultData) return;
  generatePDF(lastResultData);
});

function generatePDF(data) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const marginX = 48;
  let y = 56;

  const now = new Date();
  const timestamp = now.toLocaleString("pt-BR");

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Consulta Cadastral da Empresa", marginX, y);
  y += 20;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(`Consulta realizada em ${timestamp}`, marginX, y);
  doc.setTextColor(0);
  y += 24;

  const addSectionTitle = (title) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(title, marginX, y);
    y += 6;
    doc.setDrawColor(200);
    doc.line(marginX, y, 547, y);
    y += 16;
  };

  const addLine = (label, value) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9.5);
    doc.text(`${label}:`, marginX, y);
    doc.setFont("helvetica", "normal");
    const text = doc.splitTextToSize(String(value ?? "Não informado"), 380);
    doc.text(text, marginX + 140, y);
    y += 14 * text.length;
  };

  const ensureSpace = (needed = 100) => {
    if (y + needed > 780) {
      doc.addPage();
      y = 56;
    }
  };

  addSectionTitle("Dados cadastrais");
  addLine("CNPJ", maskCNPJ(data.cnpj));
  addLine("Razão social", data.razaoSocial);
  addLine("Nome fantasia", data.nomeFantasia);
  addLine("Situação cadastral", data.situacaoCadastral);
  addLine("Data de abertura", formatDateBR(data.dataAbertura));
  addLine("Natureza jurídica", data.naturezaJuridica);
  addLine("Porte", data.porte);
  addLine("Capital social", formatCurrencyBRL(data.capitalSocial));
  y += 8;

  ensureSpace();
  addSectionTitle("Endereço");
  const end = data.endereco || {};
  addLine("Logradouro", end.logradouro);
  addLine("Número", end.numero);
  addLine("Complemento", end.complemento);
  addLine("Bairro", end.bairro);
  addLine("Município / UF", `${textOr(end.municipio)} / ${textOr(end.uf)}`);
  addLine("CEP", end.cep);
  y += 8;

  ensureSpace();
  addSectionTitle("Atividades (CNAE)");
  addLine("CNAE principal", data.cnaePrincipal ? `${data.cnaePrincipal.codigo} — ${data.cnaePrincipal.descricao}` : null);
  (data.cnaesSecundarios || []).forEach((c, i) => {
    ensureSpace(30);
    addLine(i === 0 ? "CNAEs secundários" : "", `${c.codigo} — ${c.descricao}`);
  });
  y += 8;

  if (data.socios && data.socios.length > 0) {
    ensureSpace();
    addSectionTitle("Quadro societário");
    data.socios.forEach((s) => {
      ensureSpace(30);
      addLine(textOr(s.nome), textOr(s.qualificacao));
    });
    y += 8;
  }

  ensureSpace();
  addSectionTitle("Inscrição estadual");
  const inscricoes = (data._inscricoesEstaduais || []);
  if (inscricoes.length > 0) {
    inscricoes.forEach((ie) => {
      ensureSpace(40);
      addLine(`IE (${ie.uf})`, `${ie.numero} — ${ie.situacao}`);
    });
  } else {
    addLine("Situação", "Não foi localizada Inscrição Estadual disponível para este CNPJ.");
  }

  // footer on every page
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(120);
    doc.text("Consulta realizada através do Consulta CNPJ.", marginX, 815);
    doc.text(
      "Esta ficha tem caráter informativo e não substitui o documento oficial emitido pelos órgãos governamentais.",
      marginX, 826
    );
    doc.setTextColor(0);
  }

  doc.save(`consulta-cnpj-${onlyDigits(data.cnpj)}.pdf`);
}
