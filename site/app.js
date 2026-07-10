/* Mapa das Feiras Livres de São Paulo */
(function () {
  "use strict";

  var FEIRAS = window.FEIRAS || [];

  // cores por dia da semana
  var CORES = {
    "Domingo": "#e53935",
    "Terça Feira": "#fb8c00",
    "Quarta Feira": "#8e24aa",
    "Quinta Feira": "#00897b",
    "Sexta Feira": "#1e88e5",
    "Sábado": "#6d4c41"
  };
  var ORDEM_DIAS = ["Domingo", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira", "Sábado"];
  var NOMES_JS = ["Domingo", "Segunda Feira", "Terça Feira", "Quarta Feira", "Quinta Feira", "Sexta Feira", "Sábado"];

  // emoji por tipo (categoria) de feira
  var EMOJI = { "Tradicional": "🧺", "Orgânica": "🌱", "Noturna": "🌙" };
  function emojiCat(c) { return EMOJI[c] || "🛒"; }
  function corDia(dia) { return CORES[dia] || "#555"; }

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
  function zonaDe(f) { return ZONA_POR_SUBPREF[f.subprefeitura] || ""; }

  // normaliza texto p/ busca sem acento ("sao" acha "São")
  function norm(s) {
    return (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  // "Rua/Avenida... + nome + numero" (numero so quando existe e nao e "S/N")
  function nomeFeira(f) {
    var nome = ((f.tipo || "") + " " + (f.logradouro || "")).trim();
    var num = (f.numero == null ? "" : String(f.numero)).trim();
    if (num && num.toUpperCase() !== "S/N") nome += ", " + num;
    return nome;
  }

  // ---- mapa base ----
  var map = L.map("map", { zoomControl: false, maxBoundsViscosity: 1.0 }).setView([-23.5505, -46.6333], 11);
  L.control.zoom({ position: "bottomright" }).addTo(map);
  L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; CARTO',
    maxZoom: 19
  }).addTo(map);
  map.attributionControl.setPrefix(""); // remove o "Leaflet" (a lib nao exige credito)
  window.__mapa = map; // depuracao

  // camada unica com todos os pontos (sem clustering)
  var camada = L.layerGroup().addTo(map);

  // pino desenhado uma unica vez por combinacao (dia x tipo) e reutilizado
  // como imagem -> leve mesmo com ~1000 marcadores (sem CSS por marcador).
  var iconCache = {};
  function desenharPin(cor, emoji, escala) {
    escala = escala || 1;
    var esc2 = (window.devicePixelRatio || 1) >= 2 ? 2 : 1; // nitidez em telas retina
    var W = 30 * escala, H = 38 * escala, r = 11 * escala, cx = W / 2, cy = 13 * escala;
    var cv = document.createElement("canvas");
    cv.width = W * esc2; cv.height = H * esc2;
    var x = cv.getContext("2d");
    x.scale(esc2, esc2);
    // sombra assada na imagem (sem custo em tempo real)
    x.shadowColor = "rgba(0,0,0,.35)"; x.shadowBlur = 3 * escala; x.shadowOffsetY = 2 * escala;
    // ponta (triangulo)
    x.beginPath();
    x.moveTo(cx - 6 * escala, cy + 7 * escala); x.lineTo(cx + 6 * escala, cy + 7 * escala); x.lineTo(cx, H - 1); x.closePath();
    x.fillStyle = cor; x.fill();
    // corpo (circulo) por cima, com borda branca
    x.beginPath(); x.arc(cx, cy, r, 0, 2 * Math.PI);
    x.fillStyle = cor; x.fill();
    x.shadowColor = "transparent";
    x.lineWidth = Math.max(1, 2 * escala); x.strokeStyle = "#fff"; x.stroke();
    // emoji do tipo
    x.font = (15 * escala) + "px 'Segoe UI Emoji','Apple Color Emoji','Noto Color Emoji',sans-serif";
    x.textAlign = "center"; x.textBaseline = "middle";
    x.fillText(emoji, cx, cy + 1 * escala);
    return cv.toDataURL();
  }
  function iconeFeira(dia, categoria, escala) {
    escala = escala || 1;
    var key = dia + "|" + categoria + "|" + escala;
    if (!iconCache[key]) {
      var W = 30 * escala, H = 38 * escala;
      iconCache[key] = L.icon({
        iconUrl: desenharPin(corDia(dia), emojiCat(categoria), escala),
        iconSize: [W, H],
        iconAnchor: [W / 2, H - 1],
        popupAnchor: [0, -(H - 6)]
      });
    }
    return iconCache[key];
  }

  // pins menores na visao afastada (cidade toda); tamanho normal a partir deste zoom
  var ZOOM_PINS_NORMAIS = 13;
  var ESCALA_PIN_AFASTADO = 0.62;
  function escalaPins() { return map.getZoom() < ZOOM_PINS_NORMAIS ? ESCALA_PIN_AFASTADO : 1; }

  function esc(s) {
    return (s == null ? "" : String(s)).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function campo(v) {
    var s = (v == null ? "" : String(v)).trim();
    return s ? esc(s) : "N/A";
  }

  function popupHTML(f) {
    var rota = "https://www.google.com/maps/dir/?api=1&destination=" + f.lat + "," + f.lng;
    return '<div class="popup-feira">' +
      '<h3><span class="popup-emoji">' + emojiCat(f.categoria) + "</span>" + campo(nomeFeira(f)) + "</h3>" +
      '<span class="badge" style="background:' + corDia(f.dia) + '">' + esc(f.dia) + "</span> " +
      '<span class="badge badge-cat">' + emojiCat(f.categoria) + " " + esc(f.categoria) + "</span>" +
      "<dl>" +
      "<dt>Bairro</dt><dd>" + campo(f.bairro) + "</dd>" +
      "<dt>Distrito</dt><dd>" + campo(f.distrito) + "</dd>" +
      "<dt>Referência</dt><dd>" + campo(f.referencia) + "</dd>" +
      "<dt>Cep</dt><dd>" + campo(f.cep) + "</dd>" +
      "</dl>" +
      '<a class="btn-rota" href="' + rota + '" target="_blank" rel="noopener">🧭 Como chegar</a>' +
      "</div>";
  }

  // enquadra o mapa nas feiras logo ao abrir (antes de desenhar os pins, para
  // que a escala inicial ja considere o zoom final do enquadramento)
  var coords = [];
  FEIRAS.forEach(function (f) {
    if (f.lat == null || f.lng == null || f.lat === "" || f.lng === "") return;
    coords.push([+f.lat, +f.lng]);
  });
  var limites = coords.length ? L.latLngBounds(coords).pad(0.03) : null;
  if (limites) {
    map.fitBounds(limites);
    map.setMinZoom(map.getZoom()); // nao deixa afastar mais que a visao inicial
    map.setMaxBounds(L.latLngBounds(coords).pad(0.3)); // permite pan pelos arredores, sem sair da regiao
  }

  var escalaAtual = escalaPins();

  // constroi todos os markers uma vez
  var todos = [];
  FEIRAS.forEach(function (f) {
    if (f.lat == null || f.lng == null || f.lat === "" || f.lng === "") return;
    var m = L.marker([+f.lat, +f.lng], { icon: iconeFeira(f.dia, f.categoria, escalaAtual), riseOnHover: true });
    m.bindPopup(popupHTML(f), { autoPan: false }); // evita que o popup empurre o mapa e desfaça a centralizacao
    m.bindTooltip(esc(nomeFeira(f)) + " · " + esc(f.bairro), { direction: "top", offset: [0, -34], opacity: 0.95 });
    m.feira = f;
    todos.push(m);
  });

  // indices p/ busca por area (bairro/distrito/zona) -> markers daquela area
  var porBairro = {}, porDistrito = {}, porZona = {};
  todos.forEach(function (m) {
    var f = m.feira;
    if (f.bairro) (porBairro[f.bairro] = porBairro[f.bairro] || []).push(m);
    if (f.distrito) (porDistrito[f.distrito] = porDistrito[f.distrito] || []).push(m);
    var z = zonaDe(f);
    if (z) (porZona[z] = porZona[z] || []).push(m);
  });

  map.on("zoomend", function () {
    var nova = escalaPins();
    if (nova === escalaAtual) return;
    escalaAtual = nova;
    todos.forEach(function (m) { m.setIcon(iconeFeira(m.feira.dia, m.feira.categoria, escalaAtual)); });
  });

  // recalcula o tamanho do mapa quando a janela muda (evita tiles faltando)
  window.addEventListener("resize", function () { map.invalidateSize(); });
  setTimeout(function () {
    map.invalidateSize();
    // so re-enquadra a cidade se a localizacao ainda nao assumiu o mapa
    // (evita o mapa "pular" de volta depois de focar em voce)
    if (limites && !userPos) map.fitBounds(limites);
  }, 250);

  // ---- toast (mensagens rapidas) ----
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove("show"); }, 3200);
  }

  // ---- estado dos filtros ----
  var filtros = { dias: new Set(), categorias: new Set() };

  function passa(f) {
    if (filtros.dias.size && !filtros.dias.has(f.dia)) return false;
    if (filtros.categorias.size && !filtros.categorias.has(f.categoria)) return false;
    return true;
  }

  function aplicar() {
    camada.clearLayers();
    var visiveis = todos.filter(function (m) { return passa(m.feira); });
    visiveis.forEach(function (m) { camada.addLayer(m); });
    document.getElementById("vazio").hidden = visiveis.length !== 0;
    if (userPos) renderListaPerto();
  }

  // flag: true enquanto os chips sao clicados por codigo (nao pelo usuario)
  var sincronizando = false;
  function setBotaoAtivo(id, on) {
    var b = document.getElementById(id);
    b.classList.toggle("ativo", on);
    b.setAttribute("aria-pressed", on ? "true" : "false");
  }

  // ---- monta controles ----
  function montaChips(containerId, valores, set, comCor, emojiMap, contagens) {
    var box = document.getElementById(containerId);
    valores.forEach(function (v) {
      var chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.dataset.valor = v;
      chip.setAttribute("aria-pressed", "false");
      var top = document.createElement("span");
      top.className = "chip-top";
      if (comCor) {
        var dot = document.createElement("span");
        dot.className = "dot";
        dot.style.background = corDia(v);
        top.appendChild(dot);
        chip.style.setProperty("--chip-cor", corDia(v)); // ativo assume a cor do dia
      }
      var rotulo = emojiMap ? emojiMap(v) + " " + v : v.replace(" Feira", "");
      top.appendChild(document.createTextNode(rotulo));
      chip.appendChild(top);
      if (contagens && contagens[v] != null) {
        var q = document.createElement("span");
        q.className = "qtd";
        q.textContent = contagens[v];
        chip.appendChild(q);
      }
      chip.addEventListener("click", function () {
        if (set.has(v)) { set.delete(v); chip.classList.remove("ativo"); chip.setAttribute("aria-pressed", "false"); }
        else { set.add(v); chip.classList.add("ativo"); chip.setAttribute("aria-pressed", "true"); }
        aplicar();
      });
      box.appendChild(chip);
    });
  }

  function contar(campo) {
    var c = {};
    FEIRAS.forEach(function (f) { c[f[campo]] = (c[f[campo]] || 0) + 1; });
    return c;
  }

  var diasPresentes = ORDEM_DIAS.filter(function (d) {
    return FEIRAS.some(function (f) { return f.dia === d; });
  });
  var categorias = Array.from(new Set(FEIRAS.map(function (f) { return f.categoria; }))).sort();

  montaChips("filtro-dias", diasPresentes, filtros.dias, true, null, contar("dia"));
  montaChips("filtro-categorias", categorias, filtros.categorias, false, emojiCat, contar("categoria"));

  // se o usuario mexer nos chips de dia manualmente, "Feiras hoje" deixa de valer
  document.getElementById("filtro-dias").addEventListener("click", function (e) {
    if (!sincronizando && e.target.closest(".chip")) setBotaoAtivo("hoje", false);
  });

  // ---- busca com sugestoes clicaveis (rua, bairro, distrito, zona, etc.) ----
  var busca = document.getElementById("busca");
  var caixaSugestoes = document.getElementById("busca-sugestoes");
  var MAX_SUGESTOES = 8;
  var MAX_AREAS = 4;

  // navegacao por teclado nas sugestoes (setas + Enter)
  var idxRealce = -1;
  function opcoesSugestao() {
    return caixaSugestoes.querySelectorAll('li[role="option"]');
  }
  function setRealce(i) {
    var itens = opcoesSugestao();
    if (idxRealce >= 0 && itens[idxRealce]) itens[idxRealce].classList.remove("realce");
    idxRealce = i;
    if (i >= 0 && itens[i]) {
      itens[i].classList.add("realce");
      itens[i].scrollIntoView({ block: "nearest" });
      busca.setAttribute("aria-activedescendant", itens[i].id);
    } else {
      busca.removeAttribute("aria-activedescendant");
    }
  }

  function buscarFeiras(termo) {
    var q = norm(termo.trim());
    if (!q) return [];
    var resultados = [];
    todos.forEach(function (m) {
      var f = m.feira;
      // join() converte null/undefined em "" (evita casar a palavra "null")
      var alvo = norm([f.logradouro, f.bairro, f.referencia, f.subprefeitura, f.distrito, zonaDe(f)].join(" "));
      var pos = alvo.indexOf(q);
      if (pos === -1) return;
      resultados.push({ m: m, f: f, pos: pos, comecaComRua: norm(f.logradouro).indexOf(q) === 0 });
    });
    resultados.sort(function (a, b) {
      if (a.comecaComRua !== b.comecaComRua) return a.comecaComRua ? -1 : 1;
      if (a.pos !== b.pos) return a.pos - b.pos;
      return a.f.logradouro.localeCompare(b.f.logradouro, "pt-BR");
    });
    return resultados.slice(0, MAX_SUGESTOES);
  }

  // zonas, distritos e bairros que batem com o termo -> "atalho" p/ ver a area toda
  function buscarAreas(termo) {
    var q = norm(termo.trim());
    if (!q) return [];
    var areas = [];
    function addTipo(tipo, rotulo, mapa) {
      Object.keys(mapa).forEach(function (label) {
        if (norm(label).indexOf(q) !== -1) {
          areas.push({ tipo: rotulo, label: label, marcadores: mapa[label] });
        }
      });
    }
    addTipo("zona", "Zona", porZona);
    addTipo("distrito", "Distrito", porDistrito);
    addTipo("bairro", "Bairro", porBairro);
    areas.sort(function (a, b) { return b.marcadores.length - a.marcadores.length; });
    return areas.slice(0, MAX_AREAS);
  }

  function fecharSugestoes() {
    caixaSugestoes.hidden = true;
    caixaSugestoes.innerHTML = "";
    busca.setAttribute("aria-expanded", "false");
    idxRealce = -1;
    busca.removeAttribute("aria-activedescendant");
  }

  function irParaFeira(m) {
    var p = m.getLatLng();
    map.setView([p.lat, p.lng], ZOOM_LOCALIZACAO);
    m.openPopup();
    fecharSugestoes();
    busca.value = m.feira.logradouro;
    document.getElementById("app").classList.remove("sidebar-aberta");
  }

  function irParaArea(area) {
    var pontos = area.marcadores.map(function (m) { return m.getLatLng(); });
    map.fitBounds(L.latLngBounds(pontos).pad(0.15));
    fecharSugestoes();
    busca.value = area.label;
    document.getElementById("app").classList.remove("sidebar-aberta");
  }

  function mostrarSugestoes(termo) {
    var areas = buscarAreas(termo);
    var resultados = buscarFeiras(termo);
    caixaSugestoes.innerHTML = "";
    idxRealce = -1;
    busca.removeAttribute("aria-activedescendant");
    var seq = 0;
    if (!areas.length && !resultados.length) {
      if (!norm(termo.trim())) { fecharSugestoes(); return; }
      var vazio = document.createElement("li");
      vazio.className = "vazio";
      vazio.textContent = "Nenhuma feira encontrada";
      caixaSugestoes.appendChild(vazio);
      caixaSugestoes.hidden = false;
      busca.setAttribute("aria-expanded", "true");
      return;
    }
    areas.forEach(function (a, i) {
      var li = document.createElement("li");
      li.className = "area" + (i === areas.length - 1 && resultados.length ? " divisor" : "");
      li.id = "busca-opcao-" + (seq++);
      li.setAttribute("role", "option");
      li.innerHTML =
        '<span class="lp-dot area"></span>' +
        '<span class="lp-info"><span class="lp-nome">' + esc(a.label) + "</span>" +
        '<span class="lp-sub">' + a.tipo + " · " + a.marcadores.length + " feira" + (a.marcadores.length > 1 ? "s" : "") + "</span></span>";
      li.addEventListener("click", function () { irParaArea(a); });
      caixaSugestoes.appendChild(li);
    });
    resultados.forEach(function (r) {
      var f = r.f;
      var li = document.createElement("li");
      li.id = "busca-opcao-" + (seq++);
      li.setAttribute("role", "option");
      li.innerHTML =
        '<span class="lp-dot" style="background:' + corDia(f.dia) + '"></span>' +
        '<span class="lp-info"><span class="lp-nome">' + esc(nomeFeira(f)) + "</span>" +
        '<span class="lp-sub">' + esc(f.bairro) + " · " + esc(f.dia.replace(" Feira", "")) + "</span></span>";
      li.addEventListener("click", function () { irParaFeira(r.m); });
      caixaSugestoes.appendChild(li);
    });
    caixaSugestoes.hidden = false;
    busca.setAttribute("aria-expanded", "true");
  }

  var t;
  busca.addEventListener("input", function () {
    clearTimeout(t);
    var v = this.value;
    t = setTimeout(function () { mostrarSugestoes(v); }, 180);
  });
  busca.addEventListener("focus", function () {
    if (this.value.trim()) mostrarSugestoes(this.value);
  });
  busca.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { fecharSugestoes(); this.blur(); return; }
    if (caixaSugestoes.hidden) return;
    var itens = opcoesSugestao();
    if (!itens.length) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setRealce((idxRealce + 1) % itens.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setRealce((idxRealce - 1 + itens.length) % itens.length); }
    else if (e.key === "Enter") { e.preventDefault(); itens[idxRealce >= 0 ? idxRealce : 0].click(); }
  });
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".busca-wrap")) fecharSugestoes();
  });

  function limparTudo() {
    filtros.dias.clear(); filtros.categorias.clear();
    busca.value = "";
    fecharSugestoes();
    document.querySelectorAll(".chip.ativo").forEach(function (c) {
      c.classList.remove("ativo");
      c.setAttribute("aria-pressed", "false");
    });
    setBotaoAtivo("hoje", false);
    aplicar();
  }
  document.getElementById("vazio-limpar").addEventListener("click", limparTudo);

  // ---- feiras de hoje (toggle) ----
  document.getElementById("hoje").addEventListener("click", function () {
    var ativo = this.classList.contains("ativo");
    // limpa os dias atuais (por codigo, sem desligar o proprio botao)
    sincronizando = true;
    document.querySelectorAll("#filtro-dias .chip.ativo").forEach(function (c) { c.click(); });
    sincronizando = false;

    if (ativo) {                      // estava ligado -> desliga
      setBotaoAtivo("hoje", false);
      aplicar();
      return;
    }
    var hoje = NOMES_JS[new Date().getDay()];
    var chip = document.querySelector('#filtro-dias .chip[data-valor="' + hoje + '"]');
    if (!chip) {
      toast("Hoje (" + hoje.split(" ")[0] + ") não tem feira — planeje a de amanhã! 😉");
      return;
    }
    sincronizando = true;
    chip.click();                     // ativa so o dia de hoje
    sincronizando = false;
    setBotaoAtivo("hoje", true);
    toast("🗓️ Mostrando as feiras de hoje (" + hoje + ")");
  });

  // ---- perto de mim (toggle) ----
  var userMarker = null, userPos = null;
  function distKm(la1, lo1, la2, lo2) {
    var R = 6371, rad = Math.PI / 180;
    var dLa = (la2 - la1) * rad, dLo = (lo2 - lo1) * rad;
    var a = Math.sin(dLa / 2) * Math.sin(dLa / 2) +
            Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
  function fmtDist(km) {
    return km < 1 ? Math.round(km * 1000) + " m" : km.toFixed(1).replace(".", ",") + " km";
  }
  var painel = document.getElementById("lista-perto");
  var lpItens = document.getElementById("lp-itens");
  var lpTitulo = document.getElementById("lp-titulo");
  var RAIO = 2; // km considerado "perto"
  var MAX_LISTA = 30;
  var ZOOM_LOCALIZACAO = 15; // mesmo zoom usado ao achar a localizacao e ao focar um item da lista

  function renderListaPerto() {
    if (!userPos) { painel.hidden = true; return; }
    var arr = [];
    todos.forEach(function (m) {
      if (!passa(m.feira)) return;
      var p = m.getLatLng();
      arr.push({ m: m, f: m.feira, d: distKm(userPos.lat, userPos.lng, p.lat, p.lng) });
    });
    arr.sort(function (a, b) { return a.d - b.d; });
    var dentro = arr.filter(function (x) { return x.d <= RAIO; }).length;
    lpTitulo.innerHTML = dentro
      ? "🧺 <strong>" + dentro + "</strong> feira" + (dentro > 1 ? "s" : "") + " num raio de " + RAIO + " km"
      : "Nenhuma feira em " + RAIO + " km — veja as mais próximas:";

    lpItens.innerHTML = "";
    arr.slice(0, MAX_LISTA).forEach(function (x) {
      var f = x.f;
      var li = document.createElement("li");
      li.innerHTML =
        '<span class="lp-dot" style="background:' + corDia(f.dia) + '"></span>' +
        '<span class="lp-info"><span class="lp-nome">' + emojiCat(f.categoria) + " " + esc(nomeFeira(f)) + "</span>" +
        '<span class="lp-sub">' + esc(f.bairro) + " · " + esc(f.dia.replace(" Feira", "")) + "</span></span>" +
        '<span class="lp-dist">' + fmtDist(x.d) + "</span>";
      li.addEventListener("click", function () {
        var p = x.m.getLatLng();
        map.setView([p.lat, p.lng], ZOOM_LOCALIZACAO);
        x.m.openPopup();
        document.getElementById("app").classList.remove("sidebar-aberta");
      });
      lpItens.appendChild(li);
    });
    painel.hidden = false;
  }

  function desligarPerto() {
    if (userMarker) { map.removeLayer(userMarker); userMarker = null; }
    userPos = null;
    painel.hidden = true;
    painel.classList.remove("minimizado");
    btnLpMin.textContent = "–";
    btnLpMin.setAttribute("aria-label", "Minimizar lista");
    setBotaoAtivo("perto", false);
    btnVoltarLoc.classList.remove("ativo");
  }

  var btnVoltarLoc = document.getElementById("voltar-localizacao");
  btnVoltarLoc.addEventListener("click", function () {
    if (userPos) map.setView([userPos.lat, userPos.lng], ZOOM_LOCALIZACAO);
  });

  var btnLpMin = document.getElementById("lp-min");
  btnLpMin.addEventListener("click", function () {
    var minimizado = painel.classList.toggle("minimizado");
    btnLpMin.textContent = minimizado ? "+" : "–";
    btnLpMin.setAttribute("aria-label", minimizado ? "Expandir lista" : "Minimizar lista");
  });

  var btnPerto = document.getElementById("perto");
  var lblPerto = btnPerto.querySelector(".acao-label");
  function ativarPerto(auto) {
    if (!navigator.geolocation) { if (!auto) toast("Seu navegador não suporta geolocalização"); return; }
    btnPerto.disabled = true; lblPerto.textContent = "Localizando…";
    navigator.geolocation.getCurrentPosition(function (pos) {
      btnPerto.disabled = false; lblPerto.textContent = "Perto de mim";
      setBotaoAtivo("perto", true);
      userPos = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      if (userMarker) map.removeLayer(userMarker);
      userMarker = L.marker([userPos.lat, userPos.lng], {
        icon: L.divIcon({ className: "user-dot", html: "<span></span>", iconSize: [18, 18], iconAnchor: [9, 9] }),
        zIndexOffset: 1000,
        interactive: false
      }).addTo(map);
      map.setView([userPos.lat, userPos.lng], ZOOM_LOCALIZACAO);
      renderListaPerto();
      btnVoltarLoc.classList.add("ativo");
    }, function () {
      btnPerto.disabled = false; lblPerto.textContent = "Perto de mim";
      if (!auto) toast("Não foi possível obter sua localização");
    }, { timeout: 8000, enableHighAccuracy: false, maximumAge: 60000 });
  }
  btnPerto.addEventListener("click", function () {
    if (this.classList.contains("ativo")) { desligarPerto(); return; }
    ativarPerto(false);
  });

  // pede a localizacao automaticamente ao abrir (sem insistir com quem ja negou)
  function pedirLocalizacaoNoInicio() {
    if (!navigator.geolocation) return;
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: "geolocation" })
        .then(function (p) { if (p.state !== "denied") ativarPerto(true); })
        .catch(function () { ativarPerto(true); });
    } else {
      ativarPerto(true);
    }
  }

  document.getElementById("toggle-sidebar").addEventListener("click", function () {
    document.getElementById("app").classList.toggle("sidebar-aberta");
  });

  var btnColapsar = document.getElementById("colapsar-sidebar");
  btnColapsar.addEventListener("click", function () {
    var colapsada = document.getElementById("app").classList.toggle("sidebar-colapsada");
    btnColapsar.textContent = colapsada ? "›" : "‹";
    btnColapsar.setAttribute("aria-label", colapsada ? "Expandir filtros" : "Colapsar filtros");
  });

  aplicar();

  // ao abrir, ja pede a localizacao pra mostrar as feiras perto de voce
  pedirLocalizacaoNoInicio();
})();
