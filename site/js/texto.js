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

// distancia de edicao (Levenshtein) -- a busca usa so quando a palavra nao
// existe na cidade, pra tolerar erro de digitacao ("Pinheros" -> "Pinheiros")
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

// quantos erros aceitar numa palavra desse tamanho. Curta demais e quase tudo
// "parece" com quase tudo; ate 8 letras, um erro so ("augusta" nao vira
// "Augustin").
export function toleranciaFuzzy(len) {
  if (len <= 3) return 0;
  if (len <= 8) return 1;
  return 2;
}
