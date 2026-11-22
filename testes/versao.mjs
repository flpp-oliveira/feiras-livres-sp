// A versão (?v=) dos arquivos do site e a "impressão digital" deles.
//
// Os arquivos que o index.html chama com ?v= ficam 1 ano no cache do
// navegador (site/_headers): quem volta não baixa nem pergunta nada de novo.
// Isso só é seguro se TODA mudança num deles vier com um ?v= novo — senão quem
// já visitou fica com o arquivo velho por até 1 ano.
//
// versao-arquivos.json guarda a versão atual e a impressão digital (SHA-256)
// do conteúdo desses arquivos. O teste em estrutura.test.mjs falha se o
// conteúdo mudou e a versão não. Para subir a versão em todos os lugares de
// uma vez e registrar a nova impressão digital:
//
//   npm run versao          (na pasta testes/)

import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const SITE = new URL("../site/", import.meta.url);
const REGISTRO = new URL("./versao-arquivos.json", import.meta.url);

// arquivos chamados com ?v= pelo index.html e pelos imports dos modulos
export function arquivosVersionados() {
  const index = fs.readFileSync(new URL("index.html", SITE), "utf8");
  const nomes = new Set([...index.matchAll(/(?:href|src)="([^"?]+)\?v=\d+"/g)].map(m => m[1]));
  return [...nomes].sort();
}

// os arquivos de texto onde o numero da versao aparece
function arquivosComVersao() {
  const js = fs.readdirSync(new URL("js/", SITE)).filter(n => n.endsWith(".js")).map(n => "js/" + n);
  return ["index.html", "app.js", ...js];
}

export function versaoAtual() {
  const index = fs.readFileSync(new URL("index.html", SITE), "utf8");
  return index.match(/\?v=(\d+)/)[1];
}

export function impressaoDigital() {
  const h = crypto.createHash("sha256");
  for (const nome of arquivosVersionados()) {
    // o numero da versao dentro dos arquivos nao conta: muda-lo nao e mudar o conteudo
    const texto = fs.readFileSync(new URL(nome, SITE), "utf8").replace(/\?v=\d+/g, "?v=");
    h.update(nome + "\0" + texto.replace(/\r\n/g, "\n") + "\0");
  }
  return h.digest("hex");
}

export function registro() {
  try { return JSON.parse(fs.readFileSync(REGISTRO, "utf8")); } catch (e) { return null; }
}

function grava(versao) {
  fs.writeFileSync(REGISTRO, JSON.stringify({ versao, impressaoDigital: impressaoDigital() }, null, 2) + "\n");
}

// rodado direto: sobe a versao (ou so registra, com --registrar)
if (process.argv[1] && fileURLToPath(import.meta.url) === fs.realpathSync(process.argv[1])) {
  const atual = versaoAtual();
  if (process.argv.includes("--registrar")) {
    grava(atual);
    console.log(`registrada a versão ${atual}`);
  } else {
    const nova = String(+atual + 1);
    for (const nome of arquivosComVersao()) {
      const url = new URL(nome, SITE);
      const texto = fs.readFileSync(url, "utf8");
      fs.writeFileSync(url, texto.replace(/\?v=\d+/g, "?v=" + nova));
    }
    grava(nova);
    console.log(`versão ${atual} → ${nova} em ${arquivosComVersao().length} arquivos`);
  }
}
