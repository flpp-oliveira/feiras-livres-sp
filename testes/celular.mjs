// Roteiro do site no celular: abre o site como um Android e como um iPhone,
// faz o que uma pessoa faz (tocar num pino, buscar, "Feiras hoje", "Perto de
// mim", link de uma feira) e fotografa cada passo em testes/capturas/.
//
// Uso (na pasta testes/, com o site rodando em http://localhost:8788):
//   npm run celular                      # Android e iPhone simulados
//   npm run celular -- --android         # o Chrome do celular ligado no USB
//   npm run celular -- --url https://feiraslivresp.com.br
//
// O celular de verdade precisa do ADB (Android platform-tools) e da
// "Depuração USB" ligada nas opções de desenvolvedor (ver README).

import { chromium, webkit, devices, _android } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);
const URL_BASE = (args.includes("--url") ? args[args.indexOf("--url") + 1] : "http://localhost:8788").replace(/\/$/, "");
const NO_APARELHO = args.includes("--android");
const PASTA = path.join(import.meta.dirname, "capturas");
// cada rodada comeca do zero: foto de erro antigo confundiria
fs.rmSync(PASTA, { recursive: true, force: true });
fs.mkdirSync(PASTA, { recursive: true });

// Av. Paulista (dentro da cidade) e Rio de Janeiro (fora dela)
const PAULISTA = { latitude: -23.5614, longitude: -46.6559 };
const RIO = { latitude: -22.9068, longitude: -43.1729 };
// um domingo e uma segunda, ao meio-dia de SP
const DOMINGO = new Date("2026-11-22T12:00:00-03:00");
const SEGUNDA = new Date("2026-11-23T12:00:00-03:00");

let falhas = 0;
function ok(nome, msg) { console.log(`  ✔ ${nome}${msg ? " — " + msg : ""}`); }
function falhou(nome, e) { falhas++; console.log(`  ✖ ${nome} — ${e && e.message ? e.message.split("\n")[0] : e}`); }

// ---- ajudas ----

// o mapa carregou a carta e a camada dos pinos tem algo desenhado na tela
async function esperaMapa(page) {
  await page.waitForFunction(() => {
    var m = window.__mapa;
    return m && m.loaded() && m.getLayer("feiras") && m.queryRenderedFeatures({ layers: ["feiras"] }).length > 0;
  }, null, { timeout: 30000 });
}
// sem o aviso dos dados e sem o convite de localizacao (cada um tem cenario proprio)
async function pulaJanelas(context) {
  await context.addInitScript(() => {
    try { localStorage.setItem("feirasp:aviso-dados", "1"); sessionStorage.setItem("feirasp:convite-localizacao", "1"); } catch (e) {}
  });
}
async function foto(page, aparelho, nome) {
  await page.screenshot({ path: path.join(PASTA, `${aparelho}-${nome}.png`) });
}

// ---- cenarios ----
// Cada um recebe um contexto NOVO (sem nada guardado de outro cenario).

const CENARIOS = [
  ["abre e desenha o mapa", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    const n = await page.evaluate(() => window.__mapa.queryRenderedFeatures({ layers: ["feiras"] }).length);
    await foto(page, ap, "1-abre");
    return n + " pinos na tela";
  }],

  ["primeira visita: aviso e depois o convite", async (page, ap) => {
    await page.goto(URL_BASE + "/");
    await page.locator("#aviso-dados").waitFor({ state: "visible", timeout: 8000 });
    await foto(page, ap, "2-aviso");
    await page.locator("#aviso-ok").tap();
    await page.locator("#convite-localizacao").waitFor({ state: "visible", timeout: 5000 });
    await foto(page, ap, "2-convite");
    await page.locator("#convite-nao").tap();
    await page.locator("#dica-localizacao").waitFor({ state: "visible", timeout: 5000 });
    await foto(page, ap, "2-dica");
  }],

  ["tocar num pino abre a ficha", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    // aproxima na Liberdade, onde os pinos nao ficam empilhados
    await page.evaluate(() => window.__mapa.jumpTo({ center: [-46.6285565, -23.5571922], zoom: 16 }));
    await page.waitForFunction(() => window.__mapa.loaded());
    const ponto = await page.evaluate(() => {
      var m = window.__mapa, f = m.queryRenderedFeatures({ layers: ["feiras"] })[0];
      if (!f) return null;
      var p = m.project(f.geometry.coordinates), r = m.getContainer().getBoundingClientRect();
      return { x: r.left + p.x, y: r.top + p.y - 22 }; // a cabeca do pino fica acima da ponta
    });
    if (!ponto) throw new Error("nenhum pino na tela");
    await page.touchscreen.tap(ponto.x, ponto.y);
    await page.locator(".popup-feira").waitFor({ state: "visible", timeout: 5000 });
    await foto(page, ap, "3-ficha");
    return await page.locator(".popup-feira .pi-rua").textContent();
  }],

  ["busca com erro de digitação", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    await page.locator("#busca").tap();
    await page.locator("#busca").fill("pinheros");
    // com erro de digitacao a busca consulta o servico de enderecos (bloqueado
    // aqui): espera a resposta, e ficam as sugestoes daqui
    await page.locator("#busca-sugestoes li:not(.buscando)").first().waitFor({ state: "visible", timeout: 8000 });
    await foto(page, ap, "4-busca");
    const primeira = await page.locator("#busca-sugestoes li").first().textContent();
    if (!/pinheiros/i.test(primeira)) throw new Error("primeira sugestão: " + primeira);
    await page.locator("#busca-sugestoes li").first().tap();
    await page.waitForTimeout(800);
    await foto(page, ap, "4-busca-area");
    return primeira;
  }],

  ["Feiras hoje num domingo", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.clock.setFixedTime(DOMINGO);
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    await page.locator("#hoje").tap();
    await page.waitForFunction(() => document.getElementById("hoje").classList.contains("ativo"));
    // o endereco e atualizado logo depois do clique, nao no mesmo instante
    await page.waitForFunction(() => location.search.includes("dia=hoje"), null, { timeout: 3000 })
      .catch(() => { throw new Error("endereço sem dia=hoje: " + page.url()); });
    const dom = await page.locator('#filtro-dias .chip[data-valor="Domingo"]');
    if (!(await dom.evaluate(c => c.classList.contains("ativo")))) throw new Error("o chip Domingo não ligou");
    await foto(page, ap, "5-hoje-domingo");
    return page.url().replace(URL_BASE, "");
  }],

  ["Feiras hoje numa segunda (não tem feira)", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.clock.setFixedTime(SEGUNDA);
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    await page.locator("#hoje").tap();
    await page.locator("#toast.show").waitFor({ timeout: 3000 });
    await foto(page, ap, "6-hoje-segunda");
    return await page.locator("#toast").textContent();
  }],

  ["Perto de mim na Paulista e a folha", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.context().grantPermissions(["geolocation"], { origin: URL_BASE });
    await page.context().setGeolocation(PAULISTA);
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    if (!(await page.locator("#perto").evaluate(b => b.classList.contains("ativo")))) await page.locator("#perto").tap();
    await page.locator("#lp-itens li").first().waitFor({ state: "visible", timeout: 10000 });
    const itens = await page.locator("#lp-itens li").count();
    await foto(page, ap, "7-perto");
    // arrasta a folha pelo cabecalho, para cima
    const cab = await page.locator("#lp-cabecalho").boundingBox();
    const antes = await page.locator("#lista-perto").evaluate(e => e.offsetHeight);
    await page.mouse.move(cab.x + cab.width / 2, cab.y + 10);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(cab.x + cab.width / 2, cab.y + 10 - i * 40);
    await page.mouse.up();
    await page.waitForTimeout(500);
    const depois = await page.locator("#lista-perto").evaluate(e => e.offsetHeight);
    await foto(page, ap, "7-folha-aberta");
    if (!(depois > antes)) throw new Error(`a folha não subiu (${antes}px → ${depois}px)`);
    return `${itens} feiras na lista, folha ${antes}px → ${depois}px`;
  }],

  ["fora de São Paulo avisa", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.context().grantPermissions(["geolocation"], { origin: URL_BASE });
    await page.context().setGeolocation(RIO);
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    await page.locator("#perto").tap();
    await page.locator("#toast.show").waitFor({ timeout: 10000 });
    const t = await page.locator("#toast").textContent();
    await foto(page, ap, "8-fora-de-sp");
    if (!/fora de São Paulo/.test(t)) throw new Error("aviso: " + t);
  }],

  ["reportar erro: marcar o ponto no mapa", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.goto(URL_BASE + "/?feira=1001-4");
    await esperaMapa(page);
    await page.locator(".popup-feira .btn-reportar").waitFor({ state: "visible", timeout: 8000 });
    await page.locator(".popup-feira .btn-reportar").tap();
    await page.locator("#reporte").waitFor({ state: "visible", timeout: 3000 });
    await page.locator('input[name="tipo"][value="local_errado"]').check();
    await page.locator("#reporte-marcar").tap();
    await page.locator("#marcar-barra").waitFor({ state: "visible", timeout: 3000 });
    await page.waitForFunction(() => window.__mapa.loaded());
    const caixa = await page.locator("#map").boundingBox();
    await page.touchscreen.tap(caixa.x + caixa.width / 2 + 30, caixa.y + caixa.height / 2 + 40);
    await page.locator("#reporte").waitFor({ state: "visible", timeout: 3000 });
    const status = await page.locator("#reporte-ponto-status").textContent();
    if (!/Ponto marcado/.test(status)) throw new Error("ponto não marcado: " + status);
    await foto(page, ap, "10-reporte");
    // Envia so no site local (o banco D1 local, de teste). No ar, isso criaria
    // um report falso no banco de verdade.
    if (!URL_BASE.startsWith("http://localhost")) return "ponto marcado (sem enviar: site no ar)";
    await page.locator("#reporte-enviar").tap();
    // "Enviando…" usa o mesmo estilo do sucesso: espera a resposta de fato
    await page.waitForFunction(() => {
      var t = document.getElementById("reporte-msg").textContent;
      return t && !/Enviando/.test(t);
    }, null, { timeout: 10000 });
    const msg = await page.locator("#reporte-msg").textContent();
    await foto(page, ap, "10-reporte-enviado");
    if (!/Obrigado/.test(msg)) throw new Error("envio: " + msg);
    return "ponto marcado e enviado ao banco local";
  }],

  ["link de uma feira abre a ficha dela", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.goto(URL_BASE + "/?feira=1001-4");
    await esperaMapa(page);
    await page.locator(".popup-feira").waitFor({ state: "visible", timeout: 8000 });
    const rua = await page.locator(".popup-feira .pi-rua").textContent();
    await foto(page, ap, "9-link-feira");
    if (!/Teixeira Leite/.test(rua)) throw new Error("abriu outra feira: " + rua);
    return rua;
  }],
  ["busca por dia vira filtro", async (page, ap) => {
    await pulaJanelas(page.context());
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    await page.locator("#busca").tap();
    await page.locator("#busca").fill("feira de sábado");
    const acao = page.locator("#busca-sugestoes li.acao");
    await acao.waitFor({ state: "visible", timeout: 5000 });
    await foto(page, ap, "11-busca-dia");
    await acao.tap();
    await page.waitForFunction(() => location.search.includes("dia=sabado"), null, { timeout: 3000 })
      .catch(() => { throw new Error("endereço sem dia=sabado: " + page.url()); });
    const sab = page.locator('#filtro-dias .chip[data-valor="Sábado"]');
    if (!(await sab.evaluate(c => c.classList.contains("ativo")))) throw new Error("o chip Sábado não ligou");
    await foto(page, ap, "11-busca-dia-filtro");
    return await page.locator("#toggle-sidebar").textContent();
  }],

  ["busca por um lugar sem feira (endereço simulado)", async (page, ap) => {
    await pulaJanelas(page.context());
    // o servico de enderecos responde daqui: o teste nao depende da internet
    await page.route(/photon\.komoot\.io/, r => r.fulfill({ contentType: "application/json", body: JSON.stringify({ features: [
      { properties: { type: "house", osm_key: "railway", osm_value: "stop", name: "Santa Cruz", street: "Rua Domingos de Morais", district: "Vila Mariana", city: "São Paulo" },
        geometry: { coordinates: [-46.6366725, -23.5990533] } }
    ] }) }));
    await page.goto(URL_BASE + "/");
    await esperaMapa(page);
    await page.locator("#busca").tap();
    await page.locator("#busca").fill("metrô santa cruz");
    const lugar = page.locator("#busca-sugestoes li.lugar").first();
    await lugar.waitFor({ state: "visible", timeout: 6000 });
    await foto(page, ap, "12-busca-lugar");
    await lugar.tap();
    await page.locator("#lista-perto").waitFor({ state: "visible", timeout: 5000 });
    const titulo = await page.locator("#lp-titulo").textContent();
    if (!/Santa Cruz/.test(titulo)) throw new Error("título da lista: " + titulo);
    if (!(await page.locator("#lp-itens li").count())) throw new Error("lista sem feiras");
    await page.waitForTimeout(600);
    await foto(page, ap, "12-busca-lugar-lista");
    await page.locator("#lp-fechar").tap();
    await page.locator("#lista-perto").waitFor({ state: "hidden", timeout: 3000 });
    return titulo.trim();
  }],
];

CENARIOS.push(["busca sem resposta é anotada, sem número", async (page, ap) => {
  await pulaJanelas(page.context());
  await page.goto(URL_BASE + "/");
  await esperaMapa(page);
  await page.locator("#busca").tap();
  await page.locator("#busca").fill("xyzqw plimpo 45");
  await page.locator("#busca-sugestoes li:not(.buscando)").first().waitFor({ state: "visible", timeout: 10000 });
  if (page.context().buscas.length) throw new Error("foi antes de fechar: " + page.context().buscas[0]);
  await page.locator("#busca").press("Escape");
  for (let i = 0; i < 20 && !page.context().buscas.length; i++) await page.waitForTimeout(100);
  const corpo = JSON.parse(page.context().buscas[0] || "null");
  if (!corpo || corpo.termo !== "xyzqw plimpo #" || corpo.tipo !== "nada") throw new Error("registro: " + JSON.stringify(corpo));
  return JSON.stringify(corpo);
}]);

CENARIOS.push(["toques nos botões são contados, só os totais", async (page, ap) => {
  await pulaJanelas(page.context());
  await page.goto(URL_BASE + "/?feira=1001-4");
  await esperaMapa(page);
  await page.locator(".popup-feira .btn-compartilhar").waitFor({ state: "visible", timeout: 8000 });
  await page.locator(".popup-feira .btn-compartilhar").tap();
  // a página sai da tela: os totais da visita vão de uma vez
  await page.evaluate(() => dispatchEvent(new PageTransitionEvent("pagehide")));
  for (let i = 0; i < 20 && !page.context().contagens.length; i++) await page.waitForTimeout(100);
  const corpo = JSON.parse(page.context().contagens[0] || "null");
  const ev = corpo && corpo.eventos;
  if (!ev || ev.ficha_aberta !== 1 || ev.compartilhar !== 1) throw new Error("contagem: " + JSON.stringify(corpo));
  return JSON.stringify(ev);
}]);

async function rodaCenarios(nomeAparelho, novoContexto) {
  console.log(`\n${nomeAparelho}`);
  for (const [nome, fn] of CENARIOS) {
    const context = await novoContexto();
    // o contador de visitas do Cloudflare fica de fora: teste nao e visita (e
    // ele recusa localhost, o que o WebKit registra como erro da pagina)
    await context.route(/cloudflareinsights\.com/, r => r.abort());
    // servico de enderecos: so o cenario que o simula responde (page.route
    // vem antes deste); os outros nao saem para a internet
    await context.route(/photon\.komoot\.io|viacep\.com\.br/, r => r.abort());
    // registro das buscas sem resposta: nunca chega ao banco (no ar, seria uma
    // busca falsa no banco de verdade). Sem sendBeacon o site usa fetch, que o
    // teste intercepta com certeza; o corpo fica em context.buscas.
    context.buscas = [];
    context.contagens = [];
    await context.addInitScript(() => { Navigator.prototype.sendBeacon = function () { return false; }; });
    await context.route(/\/api\/busca/, r => {
      context.buscas.push(r.request().postData());
      r.fulfill({ status: 204 });
    });
    // a contagem dos botoes, idem
    await context.route(/\/api\/contagem/, r => {
      context.contagens.push(r.request().postData());
      r.fulfill({ status: 204 });
    });
    const page = context.pages()[0] || await context.newPage();
    const erros = [];
    page.on("pageerror", e => erros.push(e.message));
    try {
      const msg = await fn(page, nomeAparelho.split(" ")[0].toLowerCase());
      if (erros.length) throw new Error("erro de JavaScript na página: " + erros[0]);
      ok(nome, msg);
    } catch (e) {
      falhou(nome, e);
      try { await foto(page, nomeAparelho.split(" ")[0].toLowerCase(), "ERRO-" + nome.replace(/\W+/g, "-")); } catch (e2) {}
    }
    await context.close();
  }
}

const opcoesComuns = { locale: "pt-BR", timezoneId: "America/Sao_Paulo", reducedMotion: "reduce" };

if (NO_APARELHO) {
  const [aparelho] = await _android.devices();
  if (!aparelho) { console.log("Nenhum Android encontrado. Cabo ligado e \"Depuração USB\" ativa?"); process.exit(1); }
  console.log(`Celular: ${aparelho.model()} (${aparelho.serial()})`);
  // No aparelho o endereco local do PC nao existe: localhost:8788 chega pelo
  // proprio cabo (adb reverse), sem expor nada na rede.
  if (URL_BASE.startsWith("http://localhost:")) {
    const porta = new URL(URL_BASE).port;
    execFileSync("adb", ["-s", aparelho.serial(), "reverse", `tcp:${porta}`, `tcp:${porta}`]);
  }
  await rodaCenarios(`android-real ${aparelho.model()}`, () => aparelho.launchBrowser(opcoesComuns));
  await aparelho.close();
} else {
  const navChrome = await chromium.launch();
  await rodaCenarios("android (Pixel 7, Chrome)", () => navChrome.newContext({ ...devices["Pixel 7"], ...opcoesComuns }));
  await navChrome.close();
  const navSafari = await webkit.launch();
  await rodaCenarios("iphone (iPhone 15, WebKit/Safari)", () => navSafari.newContext({ ...devices["iPhone 15"], ...opcoesComuns }));
  await navSafari.close();
}

console.log(falhas ? `\n${falhas} falha(s). Fotos em testes/capturas/` : "\nTudo certo. Fotos em testes/capturas/");
process.exit(falhas ? 1 : 0);
