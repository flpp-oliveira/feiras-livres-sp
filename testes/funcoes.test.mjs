// Testes das funções puras do site (site/js/). Rodar da raiz do projeto:
//
//   node --test testes/
//
// Não precisa instalar nada: usa só o Node (22 ou mais novo).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { norm, esc, campo, maiuscula, levenshtein, toleranciaFuzzy } from "../site/js/texto.js";
import { corDia, emojiCat, zonaDe, nomeFeira, horarioDe, slugDia, contar, NOMES_JS, ORDEM_DIAS } from "../site/js/dados.js";
import { distKm, fmtDist, limitesDe } from "../site/js/geo.js";
import { montarIndices, criarBusca, interpretar, descreverIntencao, palavras, MAX_SUGESTOES, MAX_AREAS } from "../site/js/busca.js";
import { lerPhoton, escolherDoCep, urlPhoton } from "../site/js/lugares.js";

// a base de verdade, como o navegador a recebe (window.FEIRAS = [...])
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(new URL("../site/feiras-data.js", import.meta.url), "utf8"), ctx);
// copia para o "mundo" do teste (arrays do vm nao passam no deepEqual)
const FEIRAS = JSON.parse(JSON.stringify(ctx.window.FEIRAS));
const todos = FEIRAS.filter(f => f.lat != null && f.lng != null && f.lat !== "" && f.lng !== "")
  .map((f, idx) => ({ feira: f, idx }));
const indices = montarIndices(todos);
const busca = criarBusca(todos, indices);

// ---- texto ----

test("norm tira acento e caixa", () => {
  assert.equal(norm("São PAULO"), "sao paulo");
  assert.equal(norm("Jaçanã"), "jacana");
  assert.equal(norm(null), "");
});

test("esc neutraliza HTML", () => {
  assert.equal(esc('<img src=x onerror="a&b">'), "&lt;img src=x onerror=&quot;a&amp;b&quot;&gt;");
  assert.equal(esc(null), "");
  assert.equal(esc(0), "0");
});

test("campo vazio vira N/A", () => {
  assert.equal(campo("  "), "N/A");
  assert.equal(campo(null), "N/A");
  assert.equal(campo(" Lapa "), "Lapa");
});

test("maiuscula só na primeira letra", () => {
  assert.equal(maiuscula("esquina com rua x"), "Esquina com rua x");
  assert.equal(maiuscula(""), "");
});

test("levenshtein conta edições", () => {
  assert.equal(levenshtein("pinheros", "pinheiros"), 1);
  assert.equal(levenshtein("", "abc"), 3);
  assert.equal(levenshtein("lapa", "lapa"), 0);
});

test("erro de digitação: tolerância cresce com a palavra", () => {
  assert.equal(toleranciaFuzzy(3), 0);   // 3 letras: só exata
  assert.equal(toleranciaFuzzy(7), 1);
  assert.equal(toleranciaFuzzy(9), 2);
});

// ---- dados ----

test("cor e emoji têm valor padrão", () => {
  assert.equal(corDia("Domingo"), "#e53935");
  assert.equal(corDia("Segunda Feira"), "#555");
  assert.equal(emojiCat("Orgânica"), "🌱");
  assert.equal(emojiCat("outra"), "🛒");
});

test("NOMES_JS segue Date.getDay()", () => {
  assert.equal(NOMES_JS[new Date(2026, 10, 22).getDay()], "Domingo"); // 22/11/2026
  assert.equal(NOMES_JS[new Date(2026, 10, 23).getDay()], "Segunda Feira");
});

test("zona pela subprefeitura", () => {
  assert.equal(zonaDe({ subprefeitura: "Sé" }), "Centro");
  assert.equal(zonaDe({ subprefeitura: "Itaquera" }), "Zona Leste");
  assert.equal(zonaDe({ subprefeitura: "inexistente" }), "");
});

test("nomeFeira junta tipo, rua e número (sem S/N)", () => {
  assert.equal(nomeFeira({ tipo: "Rua", logradouro: "Teixeira Leite", numero: "553" }), "Rua Teixeira Leite, 553");
  assert.equal(nomeFeira({ tipo: "Praça", logradouro: "da Sé", numero: "s/n" }), "Praça da Sé");
  assert.equal(nomeFeira({ logradouro: "Sem Tipo", numero: null }), "Sem Tipo");
});

test("horário por categoria", () => {
  assert.equal(horarioDe("Tradicional"), "8h às 14h");
  assert.equal(horarioDe("Noturna"), "16h às 21h");
  assert.equal(horarioDe("Orgânica"), "Varia (manhã ou noite)");
  assert.equal(horarioDe(undefined), "8h às 14h");
});

test("slugDia é o valor que vai no endereço", () => {
  assert.equal(slugDia("Terça Feira"), "terca");
  assert.equal(slugDia("Sábado"), "sabado");
  assert.equal(slugDia("Orgânica"), "organica");
});

test("contar soma por campo", () => {
  assert.deepEqual(contar([{ dia: "A" }, { dia: "B" }, { dia: "A" }], "dia"), { A: 2, B: 1 });
});

// ---- geo ----

test("distKm: Sé até a Paulista dá uns 2,7 km", () => {
  const d = distKm(-23.5505, -46.6333, -23.5614, -46.6559);
  assert.ok(d > 2.4 && d < 2.9, String(d));
  assert.equal(distKm(-23.5, -46.6, -23.5, -46.6), 0);
});

test("fmtDist em metros ou km com vírgula", () => {
  assert.equal(fmtDist(0.35), "350 m");
  assert.equal(fmtDist(2.345), "2,3 km");
});

test("limitesDe faz a caixa com folga", () => {
  assert.deepEqual(limitesDe([[0, 0], [10, 20]], 0.1), [[-1, -2], [11, 22]]);
});

// ---- a base ----

test("a base tem feiras e todas com dia e categoria conhecidos", () => {
  assert.ok(todos.length > 900, String(todos.length));
  for (const m of todos) {
    assert.ok(ORDEM_DIAS.includes(m.feira.dia), m.feira.id + " dia " + m.feira.dia);
    assert.notEqual(emojiCat(m.feira.categoria), "🛒", m.feira.id + " categoria " + m.feira.categoria);
  }
});

test("todo id é único e achável pelo link ?feira=", () => {
  assert.equal(Object.keys(indices.porId).length, todos.length);
  for (const m of todos) assert.equal(indices.porId[m.feira.id], m);
});

// o estrago de 09/2026: "Paulista" virou "PauliSanta" e "José" virou "JoSé"
test("nenhum texto da base com caractere perdido ou maiúscula no meio da palavra", () => {
  const ruins = [];
  for (const m of todos) for (const [k, v] of Object.entries(m.feira)) {
    if (typeof v === "string" && (v.includes("�") || /[a-zà-ÿ][A-ZÀ-Þ]/.test(v))) ruins.push(`${m.feira.id} ${k}: ${v}`);
  }
  assert.deepEqual(ruins, []);
});

test("toda feira cai numa zona", () => {
  const semZona = todos.filter(m => !zonaDe(m.feira)).map(m => m.feira.id + " " + m.feira.subprefeitura);
  assert.deepEqual(semZona, []);
});

// ---- busca ----

test("busca vazia não devolve nada", () => {
  assert.deepEqual(busca.feiras("   "), []);
  assert.deepEqual(busca.areas(""), []);
});

test("busca ignora acento: 'sao' acha 'São'", () => {
  const r = busca.areas("sao miguel");
  assert.ok(r.some(a => norm(a.label).includes("sao miguel")), JSON.stringify(r.map(a => a.label)));
});

test("busca tolera erro de digitação: 'pinheros' acha Pinheiros", () => {
  assert.ok(busca.areas("pinheros").some(a => a.label === "Pinheiros"));
  assert.ok(busca.feiras("pinheros").length > 0);
});

test("termo sem sentido não acha nada", () => {
  assert.deepEqual(busca.feiras("xqzwvk"), []);
  assert.deepEqual(busca.areas("xqzwvk"), []);
});

test("busca respeita os limites e a ordem", () => {
  const f = busca.feiras("vila");
  assert.equal(f.length, MAX_SUGESTOES);
  const a = busca.areas("vila");
  assert.equal(a.length, MAX_AREAS);
  // area com mais feiras primeiro
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].marcadores.length >= a[i].marcadores.length);
});

test("rua que começa com o termo vem antes", () => {
  const r = busca.feiras("teixeira leite");
  assert.ok(r.length > 0);
  assert.ok(norm(r[0].f.logradouro).startsWith("teixeira leite"));
});

test("zona inteira aparece como área", () => {
  const z = busca.areas("zona leste");
  assert.equal(z[0].tipo, "Zona");
  assert.equal(z[0].label, "Zona Leste");
  assert.ok(z[0].marcadores.length > 100);
});

// ---- busca: as formas de escrever ----
// Cada linha é um jeito real de procurar. "rua" vem sem o tipo na base
// ("Teixeira Leite"), dia e tipo viram filtro, abreviação vale a palavra.

const SABADO = new Date("2026-11-21T12:00:00-03:00");
const DOMINGO_T = new Date("2026-11-22T12:00:00-03:00");
const buscar = (q, quando) => busca.buscar(q, quando || SABADO);
const primeiraRua = (q) => { const r = buscar(q).feiras[0]; return r && r.f.logradouro; };
const primeiraArea = (q) => { const a = buscar(q).areas[0]; return a && a.label; };

test("a mesma feira, escrita de vários jeitos", () => {
  for (const q of ["teixeira leite", "rua teixeira leite", "r. teixeira leite", "R Teixeira Leite",
    "feira na rua teixeira leite", "teixeira leite liberdade", "liberdade teixeira", "TEIXEIRA LEITE",
    "rua teixeira leite 553", "teixeira lei", "01514-010", "01514010"]) {
    assert.equal(primeiraRua(q), "Teixeira Leite", q);
  }
});

test("abreviações valem a palavra inteira", () => {
  assert.equal(primeiraArea("jd paulista"), "Jardim Paulista");
  assert.equal(primeiraArea("vl mariana"), "Vila Mariana");
  assert.equal(primeiraArea("sto amaro"), "Santo Amaro");
  assert.equal(primeiraArea("zl"), "Zona Leste");
});

test("o nome inteiro vem antes do nome que só o contém", () => {
  assert.equal(primeiraArea("pinheiros"), "Pinheiros");
  assert.equal(primeiraArea("mooca"), "Mooca");
});

test("começo de palavra e erro de digitação", () => {
  assert.equal(primeiraArea("pinh"), "Pinheiros");
  assert.equal(primeiraArea("pinheros"), "Pinheiros");
  assert.ok(buscar("pinheros").aproximado);
  assert.ok(!buscar("pinheiros").aproximado);
  // "rua v": o v ainda sendo digitado vale pelo começo (Vergueiro, não só Vila)
  assert.ok(buscar("rua v").feiras.length > 0);
});

test("zona inteira: as feiras da zona vêm antes da rua com o mesmo nome", () => {
  const r = buscar("zona sul");
  assert.equal(r.areas[0].label, "Zona Sul");
  assert.equal(zonaDe(r.feiras[0].f), "Zona Sul");
});

test("dia, tipo e hoje viram filtro", () => {
  const casos = [
    ["sexta", ["Sexta Feira"], []], ["sabado", ["Sábado"], []], ["sábado", ["Sábado"], []],
    ["feira de domingo", ["Domingo"], []], ["terça-feira", ["Terça Feira"], []],
    ["orgânica", [], ["Orgânica"]], ["feira organica", [], ["Orgânica"]],
    ["noite", [], ["Noturna"]], ["feiras noturnas", [], ["Noturna"]],
    ["orgânica sábado", ["Sábado"], ["Orgânica"]],
    ["fim de semana", ["Sábado", "Domingo"], []], ["fds", ["Sábado", "Domingo"], []],
    ["hoje", ["Sábado"], []], ["amanhã", ["Domingo"], []]
  ];
  for (const [q, dias, cats] of casos) {
    const r = buscar(q);
    assert.deepEqual(r.intencao.dias, dias, q);
    assert.deepEqual(r.intencao.categorias, cats, q);
    assert.ok(r.totalIntencao > 0, q);
    assert.deepEqual(r.feiras, [], q + ": só filtro, nenhuma feira solta");
  }
  assert.ok(buscar("hoje").intencao.hoje);
  assert.deepEqual(buscar("amanhã", DOMINGO_T).intencao.dias, ["Segunda Feira"]);
  assert.equal(buscar("amanhã", DOMINGO_T).totalIntencao, 0); // segunda não tem feira
});

test("todo dia e tipo que a busca entende existe na base", () => {
  const dias = new Set(FEIRAS.map(f => f.dia)), cats = new Set(FEIRAS.map(f => f.categoria));
  for (const q of ["domingo", "terca", "quarta", "quinta", "sexta", "sabado"]) {
    for (const d of interpretar(q).dias) assert.ok(dias.has(d), d);
  }
  for (const q of ["organica", "noturna", "tradicional"]) {
    for (const c of interpretar(q).categorias) assert.ok(cats.has(c), c);
  }
});

test("o filtro junto de um lugar: só as feiras daquele dia ali", () => {
  const r = buscar("lapa sabado");
  assert.ok(r.feiras.length > 0);
  for (const x of r.feiras) assert.equal(x.f.dia, "Sábado");
  for (const a of r.areas) for (const m of a.marcadores) assert.equal(m.feira.dia, "Sábado");
});

test("um dia dentro de um nome da base continua nome", () => {
  const r = buscar("quarta parada");
  assert.deepEqual(r.intencao.dias, []);
  assert.equal(r.areas[0].label, "Quarta Parada");
});

test("nada de falso acerto: dia não vira Sabão, noite não vira Norte", () => {
  assert.ok(!buscar("sabado").feiras.some(x => /sab[aã]o/i.test(x.f.logradouro)));
  assert.ok(!buscar("noite").areas.some(a => /norte/i.test(a.label)));
  // "augusta" aceita no máximo um erro: Augusto sim, Augustin não
  assert.ok(!buscar("augusta").feiras.some(x => /augustin/i.test(x.f.logradouro)));
});

test("perto de mim", () => {
  for (const q of ["perto de mim", "feiras perto", "feira mais próxima"]) assert.ok(buscar(q).intencao.perto, q);
  // com um lugar junto, é o lugar que se procura
  const r = buscar("perto do metrô santa cruz");
  assert.ok(!r.intencao.perto);
  assert.equal(r.intencao.textoLugar, "metro santa cruz");
});

test("quando procurar o endereço fora", () => {
  // não acha nada: procura
  for (const q of ["metro santa cruz", "shopping ibirapuera", "rua harmonia", "04101-300"]) {
    assert.ok(buscar(q).procurarLugar, q);
  }
  // só parecidos (erro de digitação): procura também
  assert.ok(buscar("pinheros").procurarLugar);
  // "av paulista": há "Paulista" em bairros, mas nenhuma feira na Av. Paulista
  assert.ok(buscar("av paulista").procurarLugar);
  // achou de verdade: não procura
  for (const q of ["pinheiros", "rua teixeira leite", "01514-010", "zona sul", "av cachoeira paulista", "sabado"]) {
    assert.ok(!buscar(q).procurarLugar, q);
  }
  assert.equal(buscar("04101-300").intencao.cep, "04101-300");
  assert.equal(buscar("av. paulista").intencao.textoLugar, "avenida paulista");
});

test("palavras vazias sozinhas não buscam nada", () => {
  assert.ok(buscar("feira").intencao.vazio);
  assert.ok(buscar("de").intencao.vazio);
});

test("a descrição do filtro", () => {
  assert.equal(descreverIntencao(interpretar("sabado")), "feiras de sábado");
  assert.equal(descreverIntencao(interpretar("orgânica sexta")), "feiras orgânicas de sexta-feira");
  assert.equal(descreverIntencao(interpretar("fim de semana")), "feiras de sábado e domingo");
  assert.equal(descreverIntencao(interpretar("hoje", SABADO)), "feiras de hoje (sábado)");
  assert.equal(descreverIntencao(interpretar("amanhã", SABADO)), "feiras de amanhã (domingo)");
});

test("palavras: sem acento, sem pontuação", () => {
  assert.deepEqual(palavras("R. São Bento, 380"), ["r", "sao", "bento", "380"]);
  assert.deepEqual(palavras("  "), []);
});

// ---- lugares (serviço de endereços) ----

const PHOTON_EXEMPLO = { features: [
  { properties: { type: "house", osm_key: "railway", osm_value: "stop", name: "Santa Cruz", street: "Rua Domingos de Morais", district: "Vila Mariana", city: "São Paulo", postcode: "04038-040" },
    geometry: { coordinates: [-46.6366725, -23.5990533] } },
  { properties: { type: "city", name: "São Paulo" }, geometry: { coordinates: [-46.63, -23.55] } },
  { properties: { type: "street", name: "Rua Augusta", district: "Consolação", city: "São Paulo" }, geometry: { coordinates: [-46.65, -23.55] } },
  { properties: { type: "street", name: "Rua Augusta", district: "Consolação", city: "São Paulo" }, geometry: { coordinates: [-46.66, -23.56] } },
  { properties: { type: "street", name: "Rua Augusta", district: "Centro", city: "Campinas" }, geometry: { coordinates: [-47.06, -22.9] } }
] };

test("lerPhoton: só pontos dentro de SP, sem a cidade inteira e sem trechos repetidos", () => {
  const l = lerPhoton(PHOTON_EXEMPLO);
  assert.deepEqual(l.map(x => x.nome), ["Estação Santa Cruz", "Rua Augusta"]);
  assert.equal(l[0].sub, "Rua Domingos de Morais · Vila Mariana");
  assert.equal(l[0].lat, -23.5990533);
  assert.deepEqual(lerPhoton(null), []);
  assert.deepEqual(lerPhoton({}), []);
});

test("CEP: o trecho do próprio CEP, senão o do bairro", () => {
  const trechos = [
    { nome: "Rua Vergueiro", bairro: "Liberdade", cep: "01504-001", lat: 1, lng: 1 },
    { nome: "Rua Vergueiro", bairro: "Vila Mariana", cep: "", lat: 2, lng: 2 },
    { nome: "Rua Vergueiro", bairro: "Ipiranga", cep: "04101-300", lat: 3, lng: 3 }
  ];
  assert.equal(escolherDoCep(trechos, "04101-300", "Vila Mariana").lat, 3);
  assert.equal(escolherDoCep(trechos, "04101-999", "Vila Mariana").lat, 2);
  assert.equal(escolherDoCep(trechos, "04101-999", "Sé").lat, 1);
  assert.equal(escolherDoCep([], "04101-300", ""), null);
});

test("a consulta ao Photon fica presa à cidade", () => {
  const u = new URL(urlPhoton("metrô santa cruz"));
  assert.equal(u.hostname, "photon.komoot.io");
  assert.equal(u.searchParams.get("q"), "metrô santa cruz");
  assert.equal(u.searchParams.get("bbox"), "-46.83,-24.01,-46.36,-23.36");
});
