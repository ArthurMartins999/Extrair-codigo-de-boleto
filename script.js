 const el = (id) => document.getElementById(id);

  const input = el("input");
  const output = el("output");
  const foundList = el("foundList");
  const hint = el("hint");
  const statusDot = el("statusDot");
  const statusText = el("statusText");

  let found = [];         // {type, raw, clean}
  let selectedIndex = -1; // index in found

  // ---- Helpers
  function setStatus(kind, text){
    statusDot.className = "dot" + (kind === "ok" ? " ok" : kind === "bad" ? " bad" : "");
    statusText.textContent = text;
  }

  function normalizeText(t){
    return (t || "").replace(/\u00A0/g, " ").trim();
  }

  function onlyDigits(s){
    return (s || "").replace(/\D+/g, "");
  }

  // Boleto "linha digitável" geralmente tem 47 (ou 48 em alguns casos, e 46 em variações).
  function findBoletoCandidates(text){
    const t = normalizeText(text);

    // 1) pega sequências longas com dígitos, espaços, pontos ou hífens
    const re = /(?:\d[\d\.\-\s]{35,}\d)/g;
    const matches = t.match(re) || [];

    // 2) limpa e filtra por tamanho típico
    const uniques = new Map();
    for (const m of matches){
      const clean = onlyDigits(m);
      if ([46,47,48].includes(clean.length)) {
        uniques.set(clean, { type:"BOLETO", raw:m, clean });
      }
    }

    // 3) extra: se a pessoa colou sem espaços e tem 47/48 direto
    const directDigits = t.match(/\d{46,48}/g) || [];
    for (const m of directDigits){
      if ([46,47,48].includes(m.length)){
        uniques.set(m, { type:"BOLETO", raw:m, clean:m });
      }
    }

    return [...uniques.values()];
  }

  // PIX copia e cola (EMV) costuma começar com "000201" e ser bem longo.
  function findPixCopiaECola(text){
    const t = normalizeText(text).replace(/\s+/g,"");
    const re = /000201[0-9A-Za-z]{20,}/g;
    const matches = t.match(re) || [];

    const uniques = new Map();
    for (const m of matches){
      // alguns pix vêm com caracteres não numéricos; vamos manter como está, mas limpar quebras
      const clean = m.trim();
      if (clean.length >= 30) uniques.set(clean, { type:"PIX", raw:clean, clean });
    }
    return [...uniques.values()];
  }

  function formatBoleto(digits){
    const s = onlyDigits(digits);
    // Formatação aproximada (visual). Mantém o valor original para copiar.
    // Tentando dividir em blocos comuns (5-5-5-6 etc) varia por banco;
    // aqui faz um espaçamento "seguro" por grupos de 5.
    return s.replace(/(.{5})/g, "$1 ").trim();
  }

  function renderFound(){
    foundList.innerHTML = "";
    hint.textContent = "";

    if (!found.length){
      setStatus("bad", "Não encontrei nenhum código. Tente colar a mensagem completa.");
      output.textContent = "(nada ainda)";
      selectedIndex = -1;
      return;
    }

    setStatus("ok", `Encontrei ${found.length} código(s). Selecione um abaixo.`);
    hint.textContent = found.length > 1
      ? "Achei mais de um possível código. Clique no correto (ex.: o que está perto de 'linha digitável', 'boleto' ou 'PIX')."
      : "Acho que este é o código certo. Se não for, cole mais contexto da mensagem.";

    found.forEach((item, idx) => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip" + (idx === selectedIndex ? " active" : "");
      const preview = item.type === "BOLETO"
        ? `${item.type} • ${item.clean.length} dígitos`
        : `${item.type} • ${item.clean.length} chars`;
      chip.textContent = preview;

      chip.addEventListener("click", () => {
        selectedIndex = idx;
        renderFound();
        showSelected();
      });

      foundList.appendChild(chip);
    });

    if (selectedIndex === -1) selectedIndex = 0;
    showSelected();
  }

  function showSelected(){
    const item = found[selectedIndex];
    if (!item) return;
    output.textContent = item.clean;
    // status extra
    if (item.type === "BOLETO" && ![46,47,48].includes(item.clean.length)){
      setStatus("warn", "Achei algo, mas o tamanho não parece padrão de boleto.");
    }
  }

  function extract(){
    const text = input.value || "";
    found = [];

    const boletos = findBoletoCandidates(text);
    const pix = findPixCopiaECola(text);

    found = [...boletos, ...pix];
    selectedIndex = found.length ? 0 : -1;
    renderFound();
  }

  // ---- Buttons
  el("btnExtract").addEventListener("click", extract);

  el("btnClear").addEventListener("click", () => {
    input.value = "";
    found = [];
    selectedIndex = -1;
    foundList.innerHTML = "";
    output.textContent = "(nada ainda)";
    hint.textContent = "";
    setStatus("warn", "Cole um texto e clique em “Extrair”.");
  });

  el("btnCopy").addEventListener("click", async () => {
    const txt = output.textContent.trim();
    if (!txt || txt === "(nada ainda)") return setStatus("bad", "Nada para copiar.");
    try{
      await navigator.clipboard.writeText(txt);
      setStatus("ok", "Copiado para a área de transferência!");
    }catch(e){
      // fallback simples
      const ta = document.createElement("textarea");
      ta.value = txt;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setStatus("ok", "Copiado (modo alternativo)!");
    }
  });

  el("btnFormat").addEventListener("click", () => {
    const item = found[selectedIndex];
    if (!item) return;
    if (item.type === "BOLETO"){
      output.textContent = formatBoleto(item.clean);
      setStatus("ok", "Formatação aplicada (visual). Para pagar, normalmente pode colar com ou sem espaços.");
    } else {
      setStatus("warn", "PIX copia e cola não costuma precisar de formatação.");
    }
  });

  el("btnExample").addEventListener("click", () => {
    input.value =
`Olá! Segue o boleto do seu seguro.
Linha digitável: 34191.79001 01043.510047 91020.150008 7 92110000031000
Vencimento: 15/01/2026
Ou pague via PIX copia e cola:
00020126580014BR.GOV.BCB.PIX0136chavepix-exemplo@seguro.com5204000053039865802BR5920SEGURADORA EXEMPLO6009SAO PAULO62100506ABC1236304BEEF
Obrigado(a)!`;
    setStatus("warn", "Exemplo colado. Clique em “Extrair códigos”.");
  });

  // auto-detect leve ao colar
  input.addEventListener("paste", () => {
    setTimeout(() => {
      // se tiver bastante texto, tenta extrair automaticamente
      if ((input.value || "").length > 30) extract();
    }, 20);
  });