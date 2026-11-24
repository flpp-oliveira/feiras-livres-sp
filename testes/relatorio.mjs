// Resumo do uso do site, lido do banco de produção (só leitura):
//
//   cd testes && npm run relatorio              (últimos 30 dias)
//   cd testes && npm run relatorio -- --dias 7
//   cd testes && npm run relatorio -- --local   (o banco de teste desta máquina)
//
// Mostra quantas vezes cada botão foi usado e as buscas que o mapa não soube
// responder. Usa o wrangler já logado (npx wrangler login, uma vez).

import { execSync } from "node:child_process";
import { EVENTOS } from "../site/js/contagem.js";

const args = process.argv.slice(2);
const i = args.indexOf("--dias");
const DIAS = i !== -1 ? Math.max(1, parseInt(args[i + 1], 10) || 30) : 30;
const ONDE = args.includes("--local") ? "--local" : "--remote";

// o SQL vai entre aspas duplas numa linha só (no Windows o npx passa pelo
// cmd); as consultas daqui só usam aspas simples
function consulta(sql) {
  const linha = sql.replace(/\s+/g, " ");
  const saida = execSync(`npx wrangler d1 execute feiras-livres-reports ${ONDE} --json --command "${linha}"`,
    { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  return JSON.parse(saida)[0].results;
}

const desde = `date('now', '-${DIAS} days')`;

const botoes = consulta(`SELECT evento, SUM(vezes) AS vezes, COUNT(*) AS dias FROM contagens
  WHERE dia >= ${desde} GROUP BY evento ORDER BY vezes DESC`);
const porDia = consulta(`SELECT dia, n FROM contagens_dia WHERE dia >= ${desde} ORDER BY dia`);
const buscas = consulta(`SELECT termo, tipo, SUM(vezes) AS vezes FROM buscas
  WHERE dia >= ${desde} GROUP BY termo, tipo ORDER BY vezes DESC, termo LIMIT 60`);

const larg = (s, n) => String(s).padEnd(n);
const num = (s, n) => String(s).padStart(n);

console.log(`\nÚltimos ${DIAS} dias (${ONDE === "--local" ? "banco local" : "produção"})`);
console.log(`Visitas que usaram algum botão: ${porDia.reduce((t, d) => t + d.n, 0)} envios em ${porDia.length} dia(s)\n`);

console.log("BOTÕES");
if (!botoes.length) console.log("  (nada ainda)");
for (const b of botoes) console.log("  " + num(b.vezes, 6) + "  " + larg(b.evento, 16) + (EVENTOS[b.evento] || ""));
const nunca = Object.keys(EVENTOS).filter(e => !botoes.some(b => b.evento === e));
if (nunca.length && botoes.length) console.log("  nunca usados: " + nunca.join(", "));

console.log("\nBUSCAS SEM RESPOSTA  (nada = não achou nada; parecido = só nomes parecidos; endereco = só o endereço)");
if (!buscas.length) console.log("  (nada ainda)");
for (const b of buscas) console.log("  " + num(b.vezes, 5) + "  " + larg(b.tipo, 9) + b.termo);
console.log("");
