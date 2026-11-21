// Testes das funções puras do site (site/js/). Rodar da raiz do projeto:
//
//   node --test testes/
//
// Não precisa instalar nada: usa só o Node (22 ou mais novo).

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

import { norm, esc, campo, maiuscula, levenshtein, distanciaFuzzyMin } from "../site/js/texto.js";
import { corDia, emojiCat, zonaDe, nomeFeira, horarioDe, slugDia, contar, NOMES_JS, ORDEM_DIAS } from "../site/js/dados.js";
import { distKm, fmtDist, limitesDe } from "../site/js/geo.js";
import { montarIndices, criarBusca, MAX_SUGESTOES, MAX_AREAS } from "../site/js/busca.js";

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
  assert.equal(distanciaFuzzyMin("pinheros", "largo da batata pinheiros"), 1);
  assert.equal(distanciaFuzzyMin("lpa", "lapa"), null);      // 3 letras: só exata
  assert.equal(distanciaFuzzyMin("xqzwvk", "pinheiros"), null);
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
