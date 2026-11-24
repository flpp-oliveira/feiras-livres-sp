// "Reportar erro nesta feira": a janela do formulário, a marcação do ponto
// certo no mapa e o envio. O envio fica registrado para conferência à mão
// (functions/api/report.js): nada muda no mapa sozinho. Ver README,
// "Conferência dos reports".
//
// Abre quando alguém avisa "reportar" (o botão da ficha da feira, em mapa.js).

import { nomeFeira } from "./dados.js?v=76";
import { ouvir } from "./estado.js?v=76";
import { abreDialogo, fechaDialogo } from "./pagina.js?v=76";
import { map, irPara, marcadorDe, fechaPopup } from "./mapa.js?v=76";
import { fechaGaveta } from "./barra.js?v=76";
import { marcar } from "./contagem.js?v=76";

var elApp = document.getElementById("app");
var dlgReporte = document.getElementById("reporte");
var formReporte = document.getElementById("reporte-form");
var msgReporte = document.getElementById("reporte-msg");
var boxPonto = document.getElementById("reporte-ponto");
var statusPonto = document.getElementById("reporte-ponto-status");
var btnMarcar = document.getElementById("reporte-marcar");
var btnEnviar = document.getElementById("reporte-enviar");
var btnCancelarReporte = document.getElementById("reporte-cancelar");
var barraMarcar = document.getElementById("marcar-barra");
var feiraReportada = null, pontoSugerido = null, marcadorSugerido = null;

function tipoEscolhido() {
  var r = formReporte.querySelector('input[name="tipo"]:checked');
  return r ? r.value : "";
}
function limpaPontoSugerido() {
  pontoSugerido = null;
  if (marcadorSugerido) { marcadorSugerido.remove(); marcadorSugerido = null; }
  statusPonto.textContent = "";
  btnMarcar.textContent = "📍 Marcar o ponto certo no mapa";
}
function mensagemReporte(texto, erro) {
  msgReporte.textContent = texto;
  msgReporte.className = "reporte-msg" + (texto ? (erro ? " erro" : " ok") : "");
}
function abrirReporte(f) {
  feiraReportada = f;
  formReporte.reset();
  limpaPontoSugerido();
  mensagemReporte("");
  boxPonto.hidden = true;
  btnEnviar.disabled = false; btnEnviar.hidden = false;
  btnCancelarReporte.textContent = "Cancelar";
  document.getElementById("reporte-feira").textContent =
    [nomeFeira(f), f.bairro, f.dia].filter(Boolean).join(" · ");
  fechaPopup();
  dlgReporte.returnValue = "";
  abreDialogo(dlgReporte);
}

// Marcar no mapa: a janela sai da frente, a pessoa toca no ponto certo e a
// janela volta com o que ja estava preenchido. Enquanto isso os pinos deixam
// o toque passar (CSS, #app.marcando): o ponto certo costuma ficar colado a
// outro pino, e o toque abriria o popup dele em vez de marcar.
function pararMarcacao() {
  elApp.classList.remove("marcando");
  barraMarcar.hidden = true;
  map.off("click", aoMarcar);
}
function aoMarcar(e) {
  pontoSugerido = { lat: e.lngLat.lat, lng: e.lngLat.lng };
  if (marcadorSugerido) marcadorSugerido.remove();
  marcadorSugerido = marcadorDe("ponto-sugerido", pontoSugerido.lat, pontoSugerido.lng);
  statusPonto.textContent = "Ponto marcado ✓";
  btnMarcar.textContent = "📍 Marcar outro ponto";
  pararMarcacao();
  abreDialogo(dlgReporte);
}

function enviar(e) {
  e.preventDefault();
  var f = feiraReportada;
  var tipo = tipoEscolhido();
  var texto = document.getElementById("reporte-detalhe").value.trim();
  if (!tipo) { mensagemReporte("Escolha o que está errado.", true); return; }
  if (tipo === "outro" && !texto) { mensagemReporte("Conte em poucas palavras qual é o problema.", true); return; }

  var fd = new FormData();
  fd.append("feira", f.id);
  fd.append("nome", [nomeFeira(f), f.bairro, f.dia].filter(Boolean).join(" · "));
  fd.append("tipo", tipo);
  fd.append("texto", texto);
  fd.append("lat", f.lat);   // onde o pino estava, nao sugestao
  fd.append("lon", f.lng);
  if (tipo === "local_errado" && pontoSugerido) {
    fd.append("lat_sugerida", pontoSugerido.lat.toFixed(6));
    fd.append("lon_sugerida", pontoSugerido.lng.toFixed(6));
  }

  btnEnviar.disabled = true;
  mensagemReporte("Enviando…");
  fetch("/api/report", { method: "POST", body: fd })
    .then(function (r) {
      // resposta que nao e JSON (pagina de erro, rota ausente) cai no aviso generico
      return r.json().catch(function () { return {}; }).then(function (d) {
        return { ok: r.ok && d.ok === true, erro: d.erro };
      });
    })
    .then(function (res) {
      if (!res.ok) {
        var motivo = res.erro
          ? res.erro.charAt(0).toUpperCase() + res.erro.slice(1) + "."
          : "Não foi possível enviar agora. Tente de novo em instantes.";
        mensagemReporte(motivo, true);
        btnEnviar.disabled = false;
        return;
      }
      mensagemReporte("Obrigado! O report foi registrado e será conferido.");
      marcar("report_enviado");
      btnEnviar.hidden = true;
      btnCancelarReporte.textContent = "Fechar";
    })
    .catch(function () {
      mensagemReporte("Sem conexão. Tente de novo em instantes.", true);
      btnEnviar.disabled = false;
    });
}

// ---- partida ----
export function iniciaReporte() {
  ouvir("reportar", abrirReporte);

  // marcar o ponto so faz sentido quando o erro e o lugar do pino
  formReporte.addEventListener("change", function (e) {
    if (e.target.name !== "tipo") return;
    boxPonto.hidden = tipoEscolhido() !== "local_errado";
    if (boxPonto.hidden) limpaPontoSugerido();
  });

  btnMarcar.addEventListener("click", function () {
    var f = feiraReportada;
    fechaDialogo(dlgReporte, "marcar");
    fechaGaveta();
    elApp.classList.add("marcando");
    barraMarcar.hidden = false;
    fechaPopup();
    irPara(+f.lat, +f.lng, Math.max(map.getZoom(), 16));
    map.on("click", aoMarcar);
  });
  document.getElementById("marcar-cancelar").addEventListener("click", function () {
    pararMarcacao();
    abreDialogo(dlgReporte);
  });
  btnCancelarReporte.addEventListener("click", function () { fechaDialogo(dlgReporte, ""); });
  dlgReporte.addEventListener("close", function () {
    // fechada so para marcar o ponto: o que foi preenchido continua valendo
    if (dlgReporte.returnValue === "marcar") { dlgReporte.returnValue = ""; return; }
    limpaPontoSugerido();
  });

  formReporte.addEventListener("submit", enviar);
}
