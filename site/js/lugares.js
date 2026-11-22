// Lugares que não são feira ("metrô Santa Cruz", "Shopping Ibirapuera", um
// CEP, a rua de casa): a busca procura o ponto num serviço de endereços
// aberto, e a lista mostra as feiras mais próximas dele.
//
//  - Photon (photon.komoot.io), feito sobre o OpenStreetMap: gratuito, sem chave.
//  - ViaCEP (viacep.com.br): o CEP vira rua e bairro, que o Photon localiza.
//
// Só é chamado quando a busca daqui não acha de verdade (busca.js,
// procurarLugar). Vai só o texto digitado: nada de quem digitou, e o site não
// conta de que página veio (Referrer-Policy: no-referrer). Fora do ar ou lento
// demais, a busca fica como antes.
//
// lerPhoton e escolherDoCep são só a conta (testáveis no Node); buscarLugares
// é a parte que vai à rede.

import { norm } from "./texto.js?v=74";

// a cidade de Sao Paulo, com folga: oeste, sul, leste, norte
export var CAIXA_SP = [-46.83, -24.01, -46.36, -23.36];
var PHOTON = "https://photon.komoot.io/api/";
var VIACEP = "https://viacep.com.br/ws/";
var ESPERA_MS = 6000;
export var MAX_LUGARES = 4;

// o centro de SP puxa os resultados para perto (com "Santa Cruz" a estacao
// daqui vem antes de qualquer Santa Cruz do pais)
export function urlPhoton(texto, limite) {
  return PHOTON + "?q=" + encodeURIComponent(texto) + "&limit=" + (limite || 8) +
    "&bbox=" + CAIXA_SP.join(",") + "&lat=-23.55&lon=-46.63";
}

function dentroDeSP(lng, lat) {
  return lng >= CAIXA_SP[0] && lng <= CAIXA_SP[2] && lat >= CAIXA_SP[1] && lat <= CAIXA_SP[3];
}

// resposta do Photon -> [{ nome, sub, lat, lng, cep, bairro }], sem repetidos
export function lerPhoton(json) {
  var out = [];
  ((json && json.features) || []).forEach(function (ft) {
    var p = ft.properties || {}, c = ft.geometry && ft.geometry.coordinates;
    if (!c || !dentroDeSP(c[0], c[1])) return;
    // a cidade, o estado ou o pais inteiro nao sao um ponto
    if (["country", "state", "county", "city"].indexOf(p.type) !== -1) return;
    var nome = p.name || [p.street, p.housenumber].filter(Boolean).join(", ");
    if (!nome) return;
    // estacao de metro/trem diz que e estacao ("Santa Cruz" sozinho e o bairro)
    if (p.osm_key === "railway" || p.osm_value === "station") {
      if (!/^(esta[cç][aã]o|metr[oô]|terminal)/i.test(nome)) nome = "Estação " + nome;
    }
    var bairro = p.district || p.locality || "";
    var sub = [
      p.name && p.street && p.street !== p.name ? p.street + (p.housenumber ? ", " + p.housenumber : "") : "",
      bairro,
      p.city && norm(p.city) !== "sao paulo" ? p.city : ""
    ].filter(Boolean).join(" · ");
    // a mesma rua vem em varios trechos, a mesma estacao em varias entradas:
    // fica o primeiro (o mais relevante) de cada nome no mesmo bairro ou a
    // menos de ~1,5 km
    var chave = norm(nome);
    var repetido = out.some(function (o) {
      return norm(o.nome) === chave &&
        (norm(o.bairro) === norm(bairro) || (Math.abs(o.lat - c[1]) < 0.014 && Math.abs(o.lng - c[0]) < 0.014));
    });
    if (repetido) return;
    out.push({ nome: nome, sub: sub, lat: c[1], lng: c[0], cep: p.postcode || "", bairro: bairro });
  });
  return out;
}

// dos trechos da rua do CEP, o do proprio CEP; senao, o do bairro; senao, o 1o
export function escolherDoCep(lugares, cep, bairro) {
  var digitos = cep.replace(/\D/g, "");
  return lugares.filter(function (l) { return l.cep.replace(/\D/g, "") === digitos; })[0] ||
    lugares.filter(function (l) { return bairro && norm(l.bairro) === norm(bairro); })[0] ||
    lugares[0] || null;
}

function pega(url, sinal) {
  return fetch(url, { signal: sinal, credentials: "omit", referrerPolicy: "no-referrer" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
}

// texto ou CEP -> Promise<{ lugares: [...], foraDeSP: "Osasco" | undefined }>
// sinal: AbortSignal de quem pediu (a pessoa continuou digitando)
export function buscarLugares(texto, cep, sinal) {
  var ctrl = new AbortController();
  var prazo = setTimeout(function () { ctrl.abort(); }, ESPERA_MS);
  if (sinal) sinal.addEventListener("abort", function () { ctrl.abort(); });
  var s = ctrl.signal;

  var conta;
  if (cep) {
    conta = pega(VIACEP + cep.replace(/\D/g, "") + "/json/", s).then(function (d) {
      if (!d || d.erro) return { lugares: [] };
      if (norm(d.localidade) !== "sao paulo") return { lugares: [], foraDeSP: d.localidade };
      // CEP de uma cidade inteira (sem rua) nao da um ponto
      if (!d.logradouro) return { lugares: [] };
      var q = [d.logradouro, d.bairro, "São Paulo"].filter(Boolean).join(", ");
      return pega(urlPhoton(q, 10), s).then(function (j) {
        var l = escolherDoCep(lerPhoton(j), d.cep, d.bairro);
        if (!l) return { lugares: [] };
        return { lugares: [{
          nome: d.logradouro, sub: "CEP " + d.cep + (d.bairro ? " · " + d.bairro : ""),
          lat: l.lat, lng: l.lng
        }] };
      });
    });
  } else {
    conta = pega(urlPhoton(texto), s).then(function (j) {
      return { lugares: lerPhoton(j).slice(0, MAX_LUGARES) };
    });
  }
  return conta.then(
    function (r) { clearTimeout(prazo); return r; },
    function (e) { clearTimeout(prazo); throw e; }
  );
}
