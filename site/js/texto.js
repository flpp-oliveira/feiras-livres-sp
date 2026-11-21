// Funções de texto, sem dependência de página nem de mapa: dá para testar
// no Node (ver testes/).

// normaliza texto p/ busca sem acento ("sao" acha "São")
export function norm(s) {
  return (s || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// escapa o que vai para innerHTML
export function esc(s) {
  return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
  });
}

// campo da ficha: escapado, ou "N/A" quando vazio
export function campo(v) {
  var s = (v == null ? "" : String(v)).trim();
  return s ? esc(s) : "N/A";
}

export function maiuscula(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

// distancia de edicao (Levenshtein) -- usada so como fallback quando a
// busca exata (indexOf) nao acha nada, pra tolerar erro de digitacao
// ("Pinheros" -> "Pinheiros"). Tolerancia cresce com o tamanho da palavra:
// curta demais e quase tudo "parece" com quase tudo (muito ruido).
export function levenshtein(a, b) {
  var m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  var prev = new Array(n + 1), curr = new Array(n + 1);
  for (var j = 0; j <= n; j++) prev[j] = j;
  for (var i = 1; i <= m; i++) {
    curr[0] = i;
    for (j = 1; j <= n; j++) {
      var custo = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + custo);
    }
    var tmp = prev; prev = curr; curr = tmp;
  }
  return prev[n];
}

export function toleranciaFuzzy(len) {
  if (len <= 3) return 0;   // palavra curta: so exata (senao vira ruido)
  if (len <= 6) return 1;
  return 2;
}

// menor distancia entre "q" e qualquer palavra de "alvo" (string com varias
// palavras separadas por espaco) -- null se nada ficar dentro da tolerancia
export function distanciaFuzzyMin(q, alvo) {
  var palavras = alvo.split(/\s+/).filter(Boolean);
  var melhor = null;
  for (var i = 0; i < palavras.length; i++) {
    var p = palavras[i];
    var tol = Math.min(toleranciaFuzzy(q.length), toleranciaFuzzy(p.length));
    if (tol === 0) continue;
    if (Math.abs(p.length - q.length) > tol) continue; // atalho, evita Levenshtein a toa
    var d = levenshtein(q, p);
    if (d <= tol && (melhor === null || d < melhor)) melhor = d;
  }
  return melhor;
}
