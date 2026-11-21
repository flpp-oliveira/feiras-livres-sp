// Contas de posição: distância, formato da distância e caixa que contém
// pontos. Sem página nem mapa: testável no Node.

// distancia em km entre dois pontos (formula de haversine)
export function distKm(la1, lo1, la2, lo2) {
  var R = 6371, rad = Math.PI / 180;
  var dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
  var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
          Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// 0,35 -> "350 m"; 2,345 -> "2,3 km"
export function fmtDist(km) {
  return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km";
}

// caixa [[oeste, sul], [leste, norte]] com folga proporcional (como o pad do Leaflet)
// pontos: [[lng, lat], ...]
export function limitesDe(pontos, folga) {
  var w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  pontos.forEach(function (p) {
    if (p[0] < w) w = p[0]; if (p[0] > e) e = p[0];
    if (p[1] < s) s = p[1]; if (p[1] > n) n = p[1];
  });
  var dx = (e - w) * folga, dy = (n - s) * folga;
  return [[w - dx, s - dy], [e + dx, n + dy]];
}
