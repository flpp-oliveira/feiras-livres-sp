// A busca da barra do topo. Só a conta: a caixa de sugestões fica em
// caixa-busca.js. Sem página nem mapa: testável no Node.
//
// O que se digita passa por três etapas:
//
//  1. Intenção. Dia ("sábado", "hoje", "amanhã", "fim de semana"), tipo
//     ("orgânica", "noite"), "perto de mim" e CEP saem do texto e viram filtro.
//     Um dia que faz parte de um nome da base ("Quarta Parada") continua nome.
//  2. Palavras. O resto vira palavras sem acento. Abreviação vale pela palavra
//     inteira ("av" = avenida, "jd" = jardim), palavras vazias saem ("feira",
//     "na", "de"), e "rua"/"avenida" só contam como bônus: a base guarda o nome
//     da rua sem o tipo ("Teixeira Leite", não "Rua Teixeira Leite").
//  3. Cada feira ou área precisa ter TODAS as palavras, em qualquer ordem e em
//     qualquer campo (rua, bairro, distrito, subprefeitura, zona, CEP). Cada
//     palavra vale exata, pelo começo ("pinh") ou, só se nenhuma feira da
//     cidade tiver a palavra, com erro de digitação ("pinheros").
//
// Quando a busca não acha de verdade (nada, só parecidos, ou "rua X" sem feira
// na rua X), o resultado pede para procurar o lugar num serviço de endereços
// (lugares.js) e diz o texto a usar. Aí o lugar vem antes dos parecidos.
//
// Cada item recebido é um "marcador" do app: { feira: <registro da base>, ... }.
// O que volta aponta para esses mesmos objetos.

import { norm, levenshtein, toleranciaFuzzy } from "./texto.js?v=76";
import { zonaDe, NOMES_JS } from "./dados.js?v=76";

export var MAX_SUGESTOES = 8;
export var MAX_AREAS = 4;

// ---- vocabulário ----

// abreviação -> palavra inteira. Vale para a base e para o que se digita.
var ABREV = {
  av: "avenida", ave: "avenida", avda: "avenida", r: "rua", al: "alameda",
  pc: "praca", pca: "praca", est: "estrada", estr: "estrada", tv: "travessa",
  trav: "travessa", lg: "largo", lgo: "largo",
  jd: "jardim", jdm: "jardim", jard: "jardim", vl: "vila", v: "vila",
  pq: "parque", pque: "parque", prq: "parque", sto: "santo", sta: "santa",
  s: "sao", cid: "cidade", cj: "conjunto", conj: "conjunto", res: "residencial",
  hab: "habitacional", chac: "chacara",
  prof: "professor", profa: "professora", dr: "doutor", dra: "doutora",
  eng: "engenheiro", gen: "general", gal: "general", cel: "coronel",
  mal: "marechal", pres: "presidente", dep: "deputado", cap: "capitao",
  ten: "tenente", brig: "brigadeiro", cons: "conselheiro", com: "comendador",
  maj: "major", sen: "senador", gov: "governador", ver: "vereador",
  pe: "padre", pde: "padre", fr: "frei", mons: "monsenhor", sgt: "sargento",
  alm: "almirante", sr: "senhor", sra: "senhora", nsra: "senhora", nsa: "senhora",
  ns: "senhora", dna: "dona"
};

// tipos de via: a base guarda à parte (campo "tipo"), então só dão bônus
var VIAS = ["rua", "avenida", "alameda", "praca", "estrada", "travessa", "largo",
  "calcadao", "acesso", "viela", "passagem"];

// palavras que não ajudam a achar nada
var VAZIAS = ["feira", "feiras", "livre", "livres", "de", "da", "do", "das", "dos",
  "d", "na", "no", "nas", "nos", "em", "a", "o", "e", "as", "os", "ao", "aos",
  "para", "pra", "pro", "bairro", "distrito", "regiao", "sp", "onde", "tem", "ha",
  "qual", "quais", "que", "mim", "aqui", "daqui", "me", "dia", "dias", "eu", "tal", "mais"];

var DIA_POR_PALAVRA = {
  domingo: "Domingo", segunda: "Segunda Feira", segundas: "Segunda Feira",
  terca: "Terça Feira", tercas: "Terça Feira", quarta: "Quarta Feira",
  quartas: "Quarta Feira", quinta: "Quinta Feira", quintas: "Quinta Feira",
  sexta: "Sexta Feira", sextas: "Sexta Feira", sabado: "Sábado", sabados: "Sábado"
  // "domingos" fica de fora: é nome de rua (Domingos de Morais)
};
var CATEGORIA_POR_PALAVRA = {
  organica: "Orgânica", organicas: "Orgânica", organico: "Orgânica", organicos: "Orgânica",
  noturna: "Noturna", noturnas: "Noturna", noturno: "Noturna", noite: "Noturna", noites: "Noturna",
  tradicional: "Tradicional", tradicionais: "Tradicional"
};
var PERTO = ["perto", "proximo", "proxima", "proximos", "proximas"];
var ZONA_CURTA = { zl: "leste", zs: "sul", zn: "norte", zo: "oeste" };

// as palavras de um texto, sem acento e sem pontuação
export function palavras(s) {
  var t = norm(s).replace(/[^a-z0-9]+/g, " ").trim();
  return t ? t.split(" ") : [];
}

// as palavras de um campo da base, prontas para comparar: sem as vazias e com
// a forma inteira das abreviações ao lado ("Jd" -> jd, jardim)
function palavrasDaBase(s) {
  var out = [];
  palavras(s).forEach(function (p) {
    if (VAZIAS.indexOf(p) !== -1) return;
    out.push(p);
    if (ABREV[p]) out.push(ABREV[p]);
  });
  return out;
}

// ---- 1. intenção ----

// "frases" (opcional): pares de palavras que existem na base e começam com
// uma palavra de intenção ("quarta parada"). Assim o bairro não vira filtro.
export function interpretar(termo, agora, frases) {
  agora = agora || new Date();
  frases = frases || [];
  var it = {
    dias: [], categorias: [], hoje: false, amanha: false, perto: false, cep: null,
    palavras: [], opcionais: [], textoLugar: "", vazio: true
  };
  var bruto = String(termo || "");
  var mCep = bruto.match(/(^|\D)(\d{5})-?(\d{3})(?!\d)/);
  if (mCep) {
    it.cep = mCep[2] + "-" + mCep[3];
    bruto = bruto.replace(mCep[0], mCep[1] + " ");
  }
  // a ultima palavra ainda esta sendo digitada (vale pelo comeco)
  var emCurso = /[a-z0-9À-ɏ]$/i.test(String(termo || ""));
  var t = palavras(bruto);
  var lugar = [];

  function frase(i) {
    if (i + 1 >= t.length) return false;
    var par = t[i] + " " + t[i + 1], ultimo = i + 1 === t.length - 1 && emCurso;
    return frases.some(function (f) { return ultimo ? f.indexOf(par) === 0 : f === par; });
  }
  function addDia(d) { if (it.dias.indexOf(d) === -1) it.dias.push(d); }

  for (var i = 0; i < t.length; i++) {
    var p = t[i];
    // "fim de semana", "final de semana", "fds"
    if ((p === "fim" || p === "final") && (t[i + 1] === "semana" || (t[i + 1] === "de" && t[i + 2] === "semana"))) {
      addDia("Sábado"); addDia("Domingo");
      i += t[i + 1] === "de" ? 2 : 1;
      continue;
    }
    if (p === "fds") { addDia("Sábado"); addDia("Domingo"); continue; }
    if (DIA_POR_PALAVRA[p] && !frase(i)) { addDia(DIA_POR_PALAVRA[p]); continue; }
    if (p === "hoje") { it.hoje = true; addDia(NOMES_JS[agora.getDay()]); continue; }
    if (p === "amanha") { it.amanha = true; addDia(NOMES_JS[(agora.getDay() + 1) % 7]); continue; }
    if (CATEGORIA_POR_PALAVRA[p] && !frase(i)) {
      var c = CATEGORIA_POR_PALAVRA[p];
      if (it.categorias.indexOf(c) === -1) it.categorias.push(c);
      continue;
    }
    if (PERTO.indexOf(p) !== -1) { it.perto = true; continue; }
    if (ZONA_CURTA[p]) {
      it.palavras.push({ q: "zona", alts: ["zona"], ultimo: false });
      it.palavras.push({ q: ZONA_CURTA[p], alts: [ZONA_CURTA[p]], ultimo: false });
      lugar.push("zona " + ZONA_CURTA[p]);
      continue;
    }
    if (VAZIAS.indexOf(p) !== -1) continue;
    var inteira = ABREV[p];
    if (VIAS.indexOf(inteira || p) !== -1) {
      it.opcionais.push(inteira || p);
      lugar.push(inteira || p);
      continue;
    }
    // numero de casa: so bonus (a feira raramente fica no mesmo numero)
    if (/^\d{1,4}$/.test(p)) { it.opcionais.push(p); lugar.push(p); continue; }
    it.palavras.push({
      q: p,
      alts: inteira ? [p, inteira] : [p],
      ultimo: i === t.length - 1 && emCurso
    });
    lugar.push(inteira || p);
  }
  // "perto" com um lugar junto ("perto do metrô santa cruz") e busca pelo lugar
  if (it.palavras.length || it.cep) it.perto = false;
  it.textoLugar = lugar.join(" ");
  it.vazio = !it.palavras.length && !it.dias.length && !it.categorias.length && !it.perto && !it.cep;
  return it;
}

// a feira passa nos dias e tipos pedidos?
export function passaIntencao(it, f) {
  if (it.dias.length && it.dias.indexOf(f.dia) === -1) return false;
  if (it.categorias.length && it.categorias.indexOf(f.categoria) === -1) return false;
  return true;
}

function nomeDia(d) { return d.replace(" Feira", "-feira").toLowerCase(); }
var PLURAL = { "Orgânica": "orgânicas", "Noturna": "noturnas", "Tradicional": "tradicionais" };

// "feiras orgânicas de sábado", "feiras de hoje (domingo)"
export function descreverIntencao(it) {
  var s = "feiras";
  if (it.categorias.length) s += " " + it.categorias.map(function (c) { return PLURAL[c] || c.toLowerCase(); }).join(" e ");
  if (it.dias.length) {
    var dias = it.dias.map(nomeDia);
    var lista = dias.length > 1 ? dias.slice(0, -1).join(", ") + " e " + dias[dias.length - 1] : dias[0];
    if (it.hoje && it.dias.length === 1) s += " de hoje (" + lista + ")";
    else if (it.amanha && it.dias.length === 1) s += " de amanhã (" + lista + ")";
    else s += " de " + lista;
  }
  return s;
}

// ---- 2 e 3. palavras e comparação ----

// indices p/ busca por area (bairro/distrito/zona) e p/ achar a feira pelo id
export function montarIndices(marcadores) {
  var porBairro = {}, porDistrito = {}, porZona = {}, porId = {};
  marcadores.forEach(function (m) {
    var f = m.feira;
    porId[f.id] = m;
    if (f.bairro) (porBairro[f.bairro] = porBairro[f.bairro] || []).push(m);
    if (f.distrito) (porDistrito[f.distrito] = porDistrito[f.distrito] || []).push(m);
    var z = zonaDe(f);
    if (z) (porZona[z] = porZona[z] || []).push(m);
  });
  return { porBairro: porBairro, porDistrito: porDistrito, porZona: porZona, porId: porId };
}

// 3 = exata, 2 = pelo comeco, 0 = nao tem
function nivel(p, tokens) {
  var melhor = 0;
  for (var a = 0; a < p.alts.length; a++) {
    var alt = p.alts[a];
    for (var k = 0; k < tokens.length; k++) {
      if (tokens[k] === alt) return 3;
      if (!melhor && (alt.length >= 3 || p.ultimo) && tokens[k].indexOf(alt) === 0) melhor = 2;
    }
  }
  return melhor;
}

export function criarBusca(marcadores, indices) {
  // Tudo que nao depende do termo sai aqui, uma vez so: a busca roda a cada
  // tecla e nao precisa refazer isso para as ~1000 feiras.
  var vocabulario = {};
  var frases = {};
  function registra(texto) {
    var t = palavras(texto);
    t.forEach(function (p, i) {
      if (i + 1 < t.length && (DIA_POR_PALAVRA[p] || CATEGORIA_POR_PALAVRA[p])) frases[p + " " + t[i + 1]] = true;
    });
    var toks = palavrasDaBase(texto);
    toks.forEach(function (p) { vocabulario[p] = true; });
    return toks;
  }
  var feiras = marcadores.map(function (m) {
    var f = m.feira;
    return {
      m: m, f: f,
      campos: [
        { peso: 3, t: registra(f.logradouro) },
        { peso: 2, t: registra(f.bairro) },
        { peso: 2, t: registra(f.distrito) },
        { peso: 1, t: registra(f.subprefeitura) },
        { peso: 1, t: registra(zonaDe(f)) },
        { peso: 3, t: f.cep ? [String(f.cep).replace(/\D/g, "")] : [] }
      ],
      rua: palavrasDaBase(f.logradouro),
      tipo: norm(f.tipo || ""),
      cep: f.cep ? String(f.cep).replace(/\D/g, "") : "",
      numero: String(f.numero || "")
    };
  });
  function listaAreas(rotulo, mapa) {
    return Object.keys(mapa).map(function (label) {
      return { tipo: rotulo, label: label, t: registra(label), marcadores: mapa[label] };
    });
  }
  var areas = [].concat(
    listaAreas("Zona", indices.porZona),
    listaAreas("Distrito", indices.porDistrito),
    listaAreas("Bairro", indices.porBairro)
  );
  var listaVocab = Object.keys(vocabulario);
  var listaFrases = Object.keys(frases);

  // palavra que nao existe na cidade (nem pelo comeco): as palavras da base
  // que chegam perto dela (erro de digitacao). null = a palavra existe.
  function parecidas(p) {
    if (listaVocab.some(function (v) { return nivel(p, [v]) > 0; })) return null;
    if (/^\d+$/.test(p.q)) return {};
    var perto = {};
    listaVocab.forEach(function (v) {
      var tol = Math.min(toleranciaFuzzy(p.q.length), toleranciaFuzzy(v.length));
      if (!tol || Math.abs(v.length - p.q.length) > tol) return;
      if (levenshtein(p.q, v) <= tol) perto[v] = true;
    });
    return perto;
  }
  function nivelDe(p, tokens) {
    if (!p.perto) return nivel(p, tokens);
    for (var k = 0; k < tokens.length; k++) if (p.perto[tokens[k]]) return 1;
    return 0;
  }

  function buscar(termo, agora) {
    var it = interpretar(termo, agora, listaFrases);
    var r = {
      intencao: it, feiras: [], areas: [], aproximado: false,
      totalIntencao: 0, procurarLugar: false
    };
    if (it.vazio) return r;
    var ps = it.palavras.map(function (p) {
      return { q: p.q, alts: p.alts, ultimo: p.ultimo, perto: parecidas(p) };
    });
    r.aproximado = ps.some(function (p) { return p.perto; });

    if (!ps.length && !it.cep) {
      // so intencao ("sabado", "organica"): quem chama oferece o filtro
      r.totalIntencao = feiras.filter(function (x) { return passaIntencao(it, x.f); }).length;
      return r;
    }

    // feiras: todas as palavras, cada uma em algum campo
    var pediuRua = it.opcionais.some(function (o) { return VIAS.indexOf(o) !== -1; });
    var achadas = [];
    feiras.forEach(function (x) {
      if (!passaIntencao(it, x.f)) return;
      if (it.cep && x.cep !== it.cep.replace("-", "")) return;
      var pontos = 0;
      // quantas palavras cada campo tem: todas no MESMO campo valem mais
      // ("zona sul" e a Zona Sul, nao a Rua Cachoeira do Sul na Zona Oeste)
      var porCampo = x.campos.map(function () { return 0; });
      for (var i = 0; i < ps.length; i++) {
        var melhor = 0;
        for (var c = 0; c < x.campos.length; c++) {
          var nv = nivelDe(ps[i], x.campos[c].t);
          if (nv) porCampo[c]++;
          if (nv * x.campos[c].peso > melhor) melhor = nv * x.campos[c].peso;
        }
        if (!melhor) return;
        pontos += melhor;
      }
      var umCampo = ps.length > 1 && porCampo.some(function (n) { return n === ps.length; });
      if (umCampo) pontos += 3 * ps.length;
      // bonus: o tipo da via e o numero batem; a rua comeca com a 1a palavra
      if (it.opcionais.indexOf(x.tipo) !== -1) pontos += 1;
      if (x.numero && it.opcionais.indexOf(x.numero) !== -1) pontos += 1;
      var comecaRua = ps.length && nivelDe(ps[0], x.rua.slice(0, 1)) > 0;
      if (comecaRua) pontos += 2;
      // e a rua que a pessoa digitou? (todas as palavras no nome, a 1a no
      // comeco, o tipo igual quando dito): "av paulista" nao e a Av. Cachoeira Paulista
      var naRua = comecaRua && porCampo[0] === ps.length && (!pediuRua || it.opcionais.indexOf(x.tipo) !== -1);
      achadas.push({ m: x.m, f: x.f, pontos: pontos, fuzzy: r.aproximado, naRua: naRua });
    });
    achadas.sort(function (a, b) {
      return b.pontos - a.pontos || a.f.logradouro.localeCompare(b.f.logradouro, "pt-BR");
    });
    r.feiras = achadas.slice(0, MAX_SUGESTOES);

    // areas: todas as palavras no nome da area (CEP nao e area)
    if (ps.length && !it.cep) {
      var comArea = [];
      areas.forEach(function (a) {
        var cobertas = 0;
        for (var i = 0; i < ps.length; i++) {
          if (!nivelDe(ps[i], a.t)) return;
        }
        a.t.forEach(function (tk) {
          if (ps.some(function (p) { return nivelDe(p, [tk]) > 0; })) cobertas++;
        });
        var ms = a.marcadores.filter(function (m) { return passaIntencao(it, m.feira); });
        if (!ms.length) return;
        comArea.push({
          tipo: a.tipo, label: a.label, marcadores: ms,
          inteira: cobertas >= new Set(a.t).size
        });
      });
      // nome inteiro digitado primeiro ("pinheiros" -> Pinheiros antes de Alto de Pinheiros)
      comArea.sort(function (a, b) {
        if (a.inteira !== b.inteira) return a.inteira ? -1 : 1;
        return b.marcadores.length - a.marcadores.length;
      });
      r.areas = comArea.slice(0, MAX_AREAS);
    }

    // Procurar o lugar fora quando a busca nao achou de verdade: nada, so
    // parecidos (erro de digitacao) ou, com "rua"/"avenida" digitado, nenhuma
    // feira naquela rua ("av paulista" nao e o Itaim Paulista).
    var nada = !r.feiras.length && !r.areas.length;
    var semRua = pediuRua && ps.length && !achadas.some(function (a) { return a.naRua; });
    r.procurarLugar = (nada || r.aproximado || semRua) && (!!it.cep || it.textoLugar.replace(/\s/g, "").length >= 3);
    return r;
  }

  return {
    buscar: buscar,
    feiras: function (termo, agora) { return buscar(termo, agora).feiras; },
    areas: function (termo, agora) { return buscar(termo, agora).areas; }
  };
}
