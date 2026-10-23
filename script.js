"use strict";

/* ===== Estado global ===== */
const API = "https://jsonplaceholder.typicode.com";
const CHAVE = "sma-chamados-v1";
const STATUS = ["Aberto", "Em atendimento", "Resolvido"];
const PRIORIDADES = ["Baixa", "Média", "Alta"];
const SECRETARIAS = ["Administração", "Agricultura", "Assistência Social", "Educação", "Finanças", "Meio Ambiente", "Obras e Serviços", "Saúde", "Gabinete do Prefeito"];
const CATEGORIAS = ["Computador", "Impressora", "Internet e rede", "Sistema da Prefeitura", "E-mail", "Acesso e senha", "Telefonia"];

const estado = {
  chamados: [],        // dados da API + chamados cadastrados
  carregado: false,
  proximoId: 1000,
  filtroStatus: "todos",
  filtroSetor: "todos",
  busca: "",
  salvos: { novos: [], status: {} } // o que fica guardado no navegador
};

/* Chamados simulados: os textos abaixo descrevem problemas típicos de TI.
   A API fornece os registros (id e solicitante); o conteúdo do chamado vem desta lista. */
const SIMULADOS = [
  { titulo: "Impressora da recepção não imprime", descricao: "A impressora da recepção da Saúde mostra erro de papel atolado, mas não há papel preso. Os atendimentos estão sendo feitos sem comprovante impresso.", categoria: "Impressora", setor: "Saúde", prioridade: "Alta" },
  { titulo: "Sem acesso ao sistema de protocolo", descricao: "Ao entrar no sistema de protocolo, aparece a mensagem de usuário ou senha inválidos. A senha foi trocada ontem e o acesso parou de funcionar.", categoria: "Acesso e senha", setor: "Administração", prioridade: "Média" },
  { titulo: "Internet muito lenta na Secretaria de Educação", descricao: "Desde a manhã as páginas demoram a abrir e o envio de arquivos para o portal do governo estadual falha. Todos os computadores da sala estão afetados.", categoria: "Internet e rede", setor: "Educação", prioridade: "Alta" },
  { titulo: "Computador reinicia sozinho", descricao: "O computador da tesouraria reinicia várias vezes ao dia, às vezes durante o lançamento de pagamentos. Já perdi trabalho que não tinha sido salvo.", categoria: "Computador", setor: "Finanças", prioridade: "Alta" },
  { titulo: "Instalar leitor de PDF no computador novo", descricao: "O computador recebido esta semana não tem programa para abrir PDF. Preciso dele para conferir os processos enviados por e-mail.", categoria: "Computador", setor: "Meio Ambiente", prioridade: "Baixa" },
  { titulo: "E-mail institucional com caixa cheia", descricao: "O e-mail avisa que a caixa de entrada está cheia e não recebo mais mensagens. Preciso de ajuda para liberar espaço sem apagar o que é importante.", categoria: "E-mail", setor: "Gabinete do Prefeito", prioridade: "Média" },
  { titulo: "Ramal do setor de obras sem sinal", descricao: "O telefone do setor não dá sinal de discagem e não recebe ligações desde segunda. Os munícipes estão ligando para o celular dos servidores.", categoria: "Telefonia", setor: "Obras e Serviços", prioridade: "Média" },
  { titulo: "Sistema de folha de pagamento travando", descricao: "O sistema fecha sozinho ao gerar o relatório mensal da folha. O prazo para envio ao contador termina na sexta-feira.", categoria: "Sistema da Prefeitura", setor: "Administração", prioridade: "Alta" },
  { titulo: "Monitor com a tela piscando", descricao: "A tela do monitor pisca e fica listrada após alguns minutos ligado. Já tentei trocar o cabo de vídeo, sem resultado.", categoria: "Computador", setor: "Assistência Social", prioridade: "Baixa" },
  { titulo: "Wi-Fi não conecta no balcão de atendimento", descricao: "O notebook do balcão enxerga a rede da Prefeitura, mas não conecta e pede senha. Os outros aparelhos do prédio conectam normalmente.", categoria: "Internet e rede", setor: "Agricultura", prioridade: "Média" },
  { titulo: "Configurar assinatura digital do certificado", descricao: "Recebi o certificado digital novo, mas o computador não reconhece o token. Preciso assinar documentos do setor de licitações ainda hoje.", categoria: "Acesso e senha", setor: "Finanças", prioridade: "Alta" },
  { titulo: "Scanner não aparece no computador", descricao: "O scanner do arquivo municipal parou de ser reconhecido depois da atualização do Windows. Estamos digitalizando documentos antigos e o trabalho está parado.", categoria: "Impressora", setor: "Administração", prioridade: "Baixa" }
];

/* ===== Utilidades ===== */
const $ = (sel) => document.querySelector(sel);
const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const classe = (t) => t.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
const protocolo = (id) => `SMA-${new Date().getFullYear()}-${String(id).padStart(4, "0")}`;

function lerSalvos() {
  try {
    const dados = JSON.parse(localStorage.getItem(CHAVE));
    if (dados && Array.isArray(dados.novos)) estado.salvos = { novos: dados.novos, status: dados.status || {} };
  } catch (e) { /* sem armazenamento: segue só em memória */ }
  const maior = Math.max(999, ...estado.salvos.novos.map((c) => c.id));
  estado.proximoId = maior + 1;
}
function gravarSalvos() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado.salvos)); } catch (e) { /* ignora */ }
}

/* ===== Navegação SPA ===== */
function mostrarSecao(id) {
  if (!document.getElementById(id)) id = "inicio";
  document.querySelectorAll(".secao").forEach((s) => s.classList.toggle("ativa", s.id === id));
  document.querySelectorAll(".menu a").forEach((a) => a.classList.toggle("ativo", a.dataset.secao === id));
  window.scrollTo({ top: 0 });
  if (id === "listagem" && !estado.carregado) carregarChamados();
}

document.addEventListener("click", (e) => {
  const link = e.target.closest("[data-secao]");
  if (!link) return;
  e.preventDefault();
  history.pushState(null, "", "#" + link.dataset.secao);
  mostrarSecao(link.dataset.secao);
});
window.addEventListener("popstate", () => mostrarSecao(location.hash.slice(1)));

/* ===== API: fetch + async/await ===== */
async function carregarChamados() {
  const area = $("#estado-lista");
  area.innerHTML = '<div class="estado">Carregando chamados…</div>';
  try {
    const [rPosts, rUsers] = await Promise.all([fetch(`${API}/posts?_limit=12`), fetch(`${API}/users`)]);
    if (!rPosts.ok || !rUsers.ok) throw new Error("Resposta inválida da API");
    const posts = await rPosts.json();
    const users = await rUsers.json();

    const daApi = posts.map((p, i) => {
      const u = users.find((x) => x.id === p.userId);
      const sim = SIMULADOS[i % SIMULADOS.length];
      return {
        id: p.id,
        titulo: sim.titulo,
        descricao: sim.descricao,
        solicitante: u ? u.name : "Não identificado",
        setor: sim.setor,
        status: estado.salvos.status[p.id] || STATUS[p.id % 3],
        prioridade: sim.prioridade,
        categoria: sim.categoria,
        novo: false
      };
    });
    estado.chamados = [...estado.chamados.filter((c) => c.id >= 1000), ...daApi];
    estado.carregado = true;
    area.innerHTML = "";
    renderizar();
  } catch (erro) {
    console.error(erro);
    area.innerHTML = '<div class="estado">Não foi possível carregar os chamados. Verifique a conexão e tente de novo.<br><button type="button" class="btn" id="tentar">Tentar de novo</button></div>';
    $("#tentar").addEventListener("click", carregarChamados);
  }
}

/* ===== Renderização ===== */
function renderizar() {
  const termo = estado.busca.trim().toLowerCase();
  const lista = estado.chamados.filter((c) =>
    (estado.filtroStatus === "todos" || c.status === estado.filtroStatus) &&
    (estado.filtroSetor === "todos" || c.setor === estado.filtroSetor) &&
    (!termo || c.titulo.toLowerCase().includes(termo) || c.solicitante.toLowerCase().includes(termo) || protocolo(c.id).toLowerCase().includes(termo))
  );
  $("#contador").textContent = `${lista.length} de ${estado.chamados.length} chamados`;
  const grade = $("#grade");

  if (!lista.length) {
    grade.innerHTML = '<div class="estado" style="grid-column:1/-1">Nenhum chamado encontrado. Mude a busca ou os filtros.</div>';
    return;
  }
  grade.innerHTML = lista.map((c) => {
    const i = STATUS.indexOf(c.status);
    const acao = i < STATUS.length - 1
      ? `<button type="button" class="card__acao" data-avancar="${c.id}">Marcar como ${STATUS[i + 1].toLowerCase()}</button>` : "";
    return `
    <article class="card card--${classe(c.prioridade)}${c.novo ? " card--novo" : ""}">
      <div class="card__topo"><span>${protocolo(c.id)}</span><span class="selo selo--${classe(c.status)}">${esc(c.status)}</span></div>
      <h3>${esc(c.titulo)}</h3>
      <p>${esc(c.descricao)}</p>
      <div class="card__rodape">
        <span><strong>${esc(c.solicitante)}</strong> · ${esc(c.setor)}</span>
        <span>${esc(c.categoria)} · Prioridade ${esc(c.prioridade)}</span>
      </div>
      ${acao}
    </article>`;
  }).join("");
  estado.chamados.forEach((c) => (c.novo = false)); // a animação roda só uma vez
}

/* avançar o status de um chamado */
$("#grade").addEventListener("click", (e) => {
  const btn = e.target.closest("[data-avancar]");
  if (!btn) return;
  const c = estado.chamados.find((x) => x.id === Number(btn.dataset.avancar));
  if (!c) return;
  c.status = STATUS[Math.min(STATUS.indexOf(c.status) + 1, STATUS.length - 1)];
  const salvo = estado.salvos.novos.find((x) => x.id === c.id);
  if (salvo) salvo.status = c.status; else estado.salvos.status[c.id] = c.status;
  gravarSalvos();
  renderizar();
});

/* filtros */
SECRETARIAS.forEach((s) => $("#filtro-setor").insertAdjacentHTML("beforeend", `<option>${esc(s)}</option>`));
$("#busca").addEventListener("input", (e) => { estado.busca = e.target.value; renderizar(); });
$("#filtro-status").addEventListener("change", (e) => { estado.filtroStatus = e.target.value; renderizar(); });
$("#filtro-setor").addEventListener("change", (e) => { estado.filtroSetor = e.target.value; renderizar(); });

/* ===== Formulário ===== */
const form = $("#form");
const campos = ["nome", "email", "setor", "categoria", "titulo", "descricao"];

function erroCampo(id, msg) {
  $("#erro-" + id).textContent = msg;
  const el = document.getElementById(id);
  if (el) el.classList.toggle("invalido", !!msg);
}

function validar() {
  const v = Object.fromEntries(campos.map((c) => [c, document.getElementById(c).value.trim()]));
  v.prioridade = (form.querySelector('input[name="prioridade"]:checked') || {}).value || "";
  const erros = {};
  if (v.nome.length < 3) erros.nome = "Informe seu nome completo (mínimo 3 letras).";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.email)) erros.email = "Informe um e-mail válido, como nome@sma.sp.gov.br.";
  if (!v.setor) erros.setor = "Escolha a sua secretaria.";
  if (!v.categoria) erros.categoria = "Escolha o tipo de problema.";
  if (!v.prioridade) erros.prioridade = "Escolha a prioridade.";
  if (v.titulo.length < 5) erros.titulo = "Dê um título com pelo menos 5 caracteres.";
  if (v.descricao.length < 20) erros.descricao = "Descreva o problema com pelo menos 20 caracteres.";
  [...campos, "prioridade"].forEach((c) => erroCampo(c, erros[c] || ""));
  return { v, erros };
}

form.addEventListener("submit", (e) => {
  e.preventDefault();
  const msg = $("#msg-form");
  const { v, erros } = validar();
  const primeiro = Object.keys(erros)[0];
  if (primeiro) {
    msg.className = "msg msg--erro";
    msg.textContent = "Corrija os campos destacados e envie de novo.";
    (document.getElementById(primeiro) || form.querySelector('input[name="prioridade"]')).focus();
    return;
  }
  const novo = {
    id: estado.proximoId++,
    titulo: v.titulo,
    descricao: v.descricao,
    solicitante: v.nome,
    setor: v.setor,
    status: "Aberto",
    prioridade: v.prioridade,
    categoria: v.categoria,
    novo: true
  };
  estado.chamados.unshift(novo);
  estado.salvos.novos.unshift({ ...novo, novo: false });
  gravarSalvos();
  renderizar();
  form.reset();
  msg.className = "msg msg--ok";
  msg.innerHTML = `Chamado ${protocolo(novo.id)} aberto com sucesso. <a href="#listagem" data-secao="listagem">Ver na listagem</a>`;
});

campos.forEach((c) => document.getElementById(c).addEventListener("input", () => erroCampo(c, "")));
form.querySelectorAll('input[name="prioridade"]').forEach((r) => r.addEventListener("change", () => erroCampo("prioridade", "")));

/* ===== Início ===== */
lerSalvos();
estado.chamados = estado.salvos.novos.map((c) => ({ ...c, novo: false })); // chamados já cadastrados aparecem mesmo antes da API
mostrarSecao(location.hash.slice(1) || "inicio");
