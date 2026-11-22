// Testes da montagem dos arquivos do site (não do comportamento). Pegam os
// esquecimentos que quebram o site só para quem tem cache: versão ?v=
// diferente entre arquivos, módulo sem versão, módulo sem pré-carregamento.

import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { arquivosVersionados, versaoAtual, impressaoDigital, registro } from "./versao.mjs";

const SITE = new URL("../site/", import.meta.url);
const ler = (p) => fs.readFileSync(new URL(p, SITE), "utf8");
const modulos = fs.readdirSync(new URL("js/", SITE)).filter(n => n.endsWith(".js"));
const index = ler("index.html");
const codigos = { "app.js": ler("app.js"), ...Object.fromEntries(modulos.map(n => ["js/" + n, ler("js/" + n)])) };

test("o mesmo ?v= em todos os arquivos", () => {
  const versoes = new Set();
  for (const texto of [index, ...Object.values(codigos)]) {
    for (const m of texto.matchAll(/\?v=(\d+)/g)) versoes.add(m[1]);
  }
  assert.equal(versoes.size, 1, "versões encontradas: " + [...versoes].join(", "));
});

test("todo import local leva ?v= e aponta para arquivo que existe", () => {
  for (const [nome, texto] of Object.entries(codigos)) {
    for (const m of texto.matchAll(/^import .* from "(\.[^"]+)";/gm)) {
      assert.match(m[1], /\?v=\d+$/, `${nome}: import sem versão: ${m[1]}`);
      const alvo = new URL(m[1].replace(/\?.*$/, ""), new URL(nome, SITE));
      assert.ok(fs.existsSync(alvo), `${nome}: importa arquivo que não existe: ${m[1]}`);
    }
  }
});

test("todo módulo de js/ é pré-carregado pelo index.html", () => {
  for (const n of modulos) {
    assert.ok(index.includes(`<link rel="modulepreload" href="js/${n}?v=`), `js/${n} sem modulepreload`);
  }
});

test("arquivo com cache longo que mudou veio com ?v= novo", () => {
  const reg = registro();
  assert.ok(reg, "falta testes/versao-arquivos.json (rode: cd testes && npm run versao)");
  assert.equal(reg.versao, versaoAtual(),
    "a versão do site não é a registrada (rode: cd testes && npm run versao)");
  assert.equal(reg.impressaoDigital, impressaoDigital(),
    "arquivos do site mudaram mas o ?v= continua " + versaoAtual() +
    ": quem já visitou ficaria com a versão velha no cache. Rode: cd testes && npm run versao");
});

test("todo arquivo com ?v= existe", () => {
  for (const nome of arquivosVersionados()) assert.ok(fs.existsSync(new URL(nome, SITE)), nome);
});

test("app.js entra como módulo", () => {
  assert.match(index, /<script type="module" src="app\.js\?v=\d+"><\/script>/);
});
