// O que se sabe de uma feira a partir dos campos dela: cor do dia, emoji do
// tipo, zona, nome e horário. Sem página nem mapa: testável no Node.

import { norm } from "./texto.js?v=76";

// cores por dia da semana
export var CORES = {
  "Domingo": "#e53935",
  "Terça Feira": "#fb8c00",
  "Quarta Feira": "#8e24aa",
  "Quinta Feira": "#00897b",
  "Sexta Feira": "#1e88e5",
  "Sábado": "#6d4c41"
};
export var ORDEM_DIAS = ["Domingo", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira", "Sábado"];
// na ordem de Date.getDay()
export var NOMES_JS = ["Domingo", "Segunda Feira", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira", "Sábado"];

// emoji por tipo (categoria) de feira
var EMOJI = { "Tradicional": "🧺", "Orgânica": "🌱", "Noturna": "🌙" };
export function emojiCat(c) { return EMOJI[c] || "🛒"; }
export function corDia(dia) { return CORES[dia] || "#555"; }

// zona da cidade a partir da subprefeitura (classificacao aproximada)
var ZONA_POR_SUBPREF = {
  "Sé": "Centro",
  "Casa Verde/Cachoeirinha": "Zona Norte", "Freguesia/Brasilândia": "Zona Norte",
  "Jaçanã/Tremembé": "Zona Norte", "Perus": "Zona Norte", "Pirituba/Jaraguá": "Zona Norte",
  "Santana/Tucuruvi": "Zona Norte", "Vila Maria/Vila Guilherme": "Zona Norte",
  "Butantã": "Zona Oeste", "Lapa": "Zona Oeste", "Pinheiros": "Zona Oeste",
  "Campo Limpo": "Zona Sul", "Capela do Socorro": "Zona Sul", "Cidade Ademar": "Zona Sul",
  "Ipiranga": "Zona Sul", "Jabaquara": "Zona Sul", "M'Boi Mirim": "Zona Sul",
  "Parelheiros": "Zona Sul", "Santo Amaro": "Zona Sul", "Vila Mariana": "Zona Sul",
  "Aricanduva/Formosa/Carrão": "Zona Leste", "Cidade Tiradentes": "Zona Leste",
  "Ermelino Matarazzo": "Zona Leste", "Guaianases": "Zona Leste", "Itaim Paulista": "Zona Leste",
  "Itaquera": "Zona Leste", "Mooca": "Zona Leste", "Penha": "Zona Leste",
  "São Mateus": "Zona Leste", "São Miguel": "Zona Leste", "Sapopemba": "Zona Leste",
  "Vila Prudente": "Zona Leste"
};
export function zonaDe(f) { return ZONA_POR_SUBPREF[f.subprefeitura] || ""; }

// "Rua/Avenida... + nome + numero" (numero so quando existe e nao e "S/N")
export function nomeFeira(f) {
  var nome = ((f.tipo || "") + " " + (f.logradouro || "")).trim();
  var num = (f.numero == null ? "" : String(f.numero)).trim();
  if (num && num.toUpperCase() !== "S/N") nome += ", " + num;
  return nome;
}

// Horario por tipo, como a Prefeitura publica (pagina "Feiras Livres" da
// SESANA): tradicional 8h-14h, noturna 16h-21h. A organica pode ser de manha
// ou a noite e a planilha nao diz qual: o site avisa que varia.
export function horarioDe(categoria) {
  if (/notur/i.test(categoria || "")) return "16h às 21h";
  if (/org/i.test(categoria || "")) return "Varia (manhã ou noite)";
  return "8h às 14h";
}

// dia/categoria como vai no endereco: "Terça Feira" -> "terca"
export function slugDia(v) { return norm(String(v).replace(" Feira", "")); }

// quantas feiras por valor de um campo: contar(feiras, "dia") -> {"Domingo": 170, ...}
export function contar(feiras, nomeCampo) {
  var c = {};
  feiras.forEach(function (f) { c[f[nomeCampo]] = (c[f[nomeCampo]] || 0) + 1; });
  return c;
}
