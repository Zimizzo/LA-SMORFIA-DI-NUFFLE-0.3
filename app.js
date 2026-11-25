(() => {
  const EVENTS = [
    "Un big guy attiva il suo negatrait",
    "Doppio Uno",
    "Doppio sei",
    "Fallisci un blocco tre dadi sopra",
    "Tira un blocco tre dadi sotto",
    "Surfa un pezzo",
    "Cadi su un rush",
    "Finisci i reroll",
    "Vieni visto dall’arbitro durante un fallo",
    "Autosubisci una casualty",
    "Subisci blitz come evento kickoff",
    "Il meteo è uno degli estremi, Sweltering Heat o Blizzard",
    "Finisci i reroll prima del turno 4",
    "Tutti i KO dell’avversario rientrano",
    "Tutti i blocchi sulla linea di scrimmage possibili mandano a terra i pezzi avversari",
    "Fallisci un passaggio",
    "Usi l’apotecario ma il giocatore rimane nelle cas",
    "Touchback",
    "Blitz in gabbia fa cadere la palla al portatore avversario",
    "Due reroll in un turno",
    "Doppio teschio",
    "Fallisci dopo aver usato un reroll",
    "Fallisci un dodge",
    "Subisci cas al primo turno",
    "Hai rimosso 0 giocatori al tuo avversario alla fine di un drive",
    "Meta in un turno",
    "Fallisci un pick up",
    "La palla rimbalza in mano ad un tuo pezzo e la prende",
    "Rischia la pietra per aver fatto stalling",
    "Doppio Flash"
  ];

  const cfg = window.NUFFLE_CONFIG || {};
  const configured = cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY &&
    !cfg.SUPABASE_URL.includes("INSERISCI-") && !cfg.SUPABASE_ANON_KEY.includes("INSERISCI-");
  const supabase = configured && window.supabase
    ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, {
        realtime: { params: { eventsPerSecond: 10 } }
      }) : null;

  let cards = [];
  let reservations = [];
  let marked = new Set();
  let currentCard = null;
  let adminCode = "";
  let channel = null;
  let toastTimer = null;

  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  const toast = (message) => {
    const el = $("toast"); el.textContent = message; el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  };
  const setNotice = (id, message, kind="") => {
    const el = $(id); if (!el) return;
    el.textContent = message; el.className = "notice" + (kind ? " " + kind : "");
  };
  const eventName = id => EVENTS[Number(id)-1] || "Evento sconosciuto";
  const getCard = id => cards.find(c => String(c.id) === String(id));

  function navigate(page) {
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    const target = $("page-" + page);
    if (target) target.classList.add("active");
    document.querySelectorAll("nav a").forEach(a => a.classList.toggle("active", a.dataset.page === page));
    $("main-nav").classList.remove("open");
    if (page === "cartelle") renderCards();
    if (page === "eventi") renderEvents();
    if (page === "organizzatore") renderAdminStats();
    window.scrollTo({top:0, behavior:"smooth"});
  }
  function route() {
    const hash = location.hash.slice(1);
    const [rawPage, query] = hash.split("?");
    if (rawPage.startsWith("cartella=")) {
      const id = decodeURIComponent(rawPage.slice("cartella=".length));
      openCard(id);
      return;
    }
    const page = ["home","cartelle","eventi","organizzatore"].includes(rawPage) ? rawPage : "home";
    navigate(page);
  }
  window.addEventListener("hashchange", route);
  document.querySelectorAll('a[href^="#"]').forEach(a => a.addEventListener("click", () => setTimeout(route, 0)));
  $("menu-toggle").addEventListener("click", () => $("main-nav").classList.toggle("open"));


  function renderCards() {
    const grid = $("cards-grid");

    if (!cards.length) {
      grid.innerHTML = `<div class="notice" style="grid-column:1/-1">Non ci sono ancora cartelle. L'organizzatore deve generare una partita.</div>`;
      return;
    }

    const term = $("card-search").value.trim();
    const list = cards.filter(c => !term || String(c.card_number).includes(term));

    grid.innerHTML = list.map(c => {
      const ids = (c.events || []).map(Number);
      const count = ids.filter(id => marked.has(id)).length;
      const reservation = reservations.find(r => String(r.card_id) === String(c.id));

      const reservationHtml = reservation
        ? `<div class="notice">🔒 Prenotata da <strong>${esc(reservation.player_name)}</strong></div>`
        : `<div class="notice success">🟢 Disponibile</div>`;

      const reservationButton = reservation
        ? ""
        : `<button class="btn btn-gold" data-reserve="${esc(c.id)}">Prenota cartella</button>`;

      return `<article class="card-tile">
        <div class="tile-top">
          <span class="tile-number">CARTELLA #${c.card_number}</span>
          <span class="tile-count">${count}/6 segnati</span>
        </div>
        ${reservationHtml}
        <div class="mini-events">
          ${ids.map(id => `<div class="mini-event ${marked.has(id)?"done":""}">
            <span class="event-badge">${String(id).padStart(2,"0")}</span>
            <span>${esc(eventName(id))}</span>
          </div>`).join("")}
        </div>
        <div class="tile-actions">
          ${reservationButton}
          <button class="btn btn-ghost" data-open="${esc(c.id)}">Apri cartella</button>
          <button class="btn btn-ghost" data-share="${esc(c.id)}" aria-label="Condividi cartella">↗</button>
        </div>
      </article>`;
    }).join("") || `<div class="notice" style="grid-column:1/-1">Nessuna cartella corrisponde alla ricerca.</div>`;

    grid.querySelectorAll("[data-open]").forEach(b =>
      b.addEventListener("click", () => {
        location.hash = "cartella=" + encodeURIComponent(b.dataset.open);
      })
    );

    grid.querySelectorAll("[data-share]").forEach(b =>
      b.addEventListener("click", () => shareCard(b.dataset.share))
    );

    grid.querySelectorAll("[data-reserve]").forEach(b =>
      b.addEventListener("click", () => reserveCard(b.dataset.reserve))
    );
  }

  async function reserveCard(cardId) {
    if (!supabase) return toast("Connessione a Supabase non disponibile.");

    const name = prompt("Inserisci il tuo nome per prenotare questa cartella:");

    if (name === null) return;

    const playerName = name.trim();

    if (playerName.length < 2 || playerName.length > 30) {
      return toast("Il nome deve contenere da 2 a 30 caratteri.");
    }

    try {
      const { error } = await supabase.rpc("reserve_nuffle_card", {
        p_card_id: cardId,
        p_player_name: playerName
      });

      if (error) throw error;

      await loadReservations();
      toast("Cartella prenotata con successo!");
    } catch (e) {
      console.error(e);
      toast(e.message?.includes("già prenotata") || e.message?.includes("nome già utilizzato")
        ? "Cartella già prenotata oppure nome già utilizzato."
        : "Non è stato possibile prenotare la cartella.");
    }
  }

  async function loadReservations() {
    if (!supabase) return;

    const { data, error } = await supabase
      .from("nuffle_reservations")
      .select("card_id,player_name,created_at");

    if (error) {
      console.error(error);
      return;
    }

    reservations = data || [];
    refreshViews();
  }


  function openCard(id) {
    const card = getCard(id);
    if (!card) {
      navigate("cartelle");
      toast("Questa cartella non esiste o la partita è stata rigenerata.");
      return;
    }
    currentCard = card;
    navigate("mia-cartella");
    $("my-card-title").textContent = "Cartella #" + card.card_number;
    const name = $("player-name").value.trim();
    $("my-card-subtitle").textContent = name ? "Giocatore: " + name + " · Segna gli eventi quando accadono." : "Segna gli eventi quando si verificano in partita.";
    renderSingleCard();
  }
  function renderSingleCard() {
    if (!currentCard) return;
    const ids = (currentCard.events || []).map(Number);
    const count = ids.filter(id => marked.has(id)).length;
    $("my-card").innerHTML = `<div class="single-card-head"><span>✦ BOLOGNABOWL · LA SMORFIA DI NUFFLE ✦</span><h2>CARTELLA #${currentCard.card_number}</h2><p>Sei eventi. Infinite possibilità di disastro.</p></div>
      <div class="big-events">${ids.map((id,i) => `<button class="event-cell ${marked.has(id)?"done":""}" data-event="${id}"><span class="event-badge">${String(id).padStart(2,"0")}</span><span class="cell-text">${esc(eventName(id))}</span><span class="check">${marked.has(id)?"✓":"○"}</span></button>`).join("")}</div>
      <div class="card-foot"><span>AVANZAMENTO</span><strong>${count} / 6 EVENTI</strong></div>`;
    $("my-card").querySelectorAll("[data-event]").forEach(b => b.addEventListener("click", () => toggleEvent(Number(b.dataset.event))));
  }
  function renderEvents() {
    $("events-grid").innerHTML = EVENTS.map((name,i) => {
      const id=i+1, done=marked.has(id);
      return `<button class="global-event ${done?"done":""}" data-event="${id}"><span class="event-badge">${String(id).padStart(2,"0")}</span><span class="event-name">${esc(name)}</span><span class="check">${done?"✓":"○"}</span></button>`;
    }).join("");
    $("events-grid").querySelectorAll("[data-event]").forEach(b => b.addEventListener("click", () => toggleEvent(Number(b.dataset.event))));
    $("event-progress-text").textContent = `${marked.size} / 30 eventi segnati`;
    $("event-progress-bar").style.width = `${marked.size/30*100}%`;
  }
  async function toggleEvent(id) {
    if (!supabase) return toast("Configura prima il collegamento a Supabase.");
    try {
      const {error} = await supabase.rpc("toggle_nuffle_event", {p_event_id:id});
      if (error) throw error;
      // L'aggiornamento definitivo arriva anche tramite Realtime; aggiorniamo subito la UI.
      if (marked.has(id)) marked.delete(id); else marked.add(id);
      refreshViews();
    } catch (e) {
      console.error(e); toast("Non è stato possibile aggiornare l'evento.");
      await loadMarks();
    }
  }
  function refreshViews() {
    renderCards(); renderEvents();
    if (currentCard) renderSingleCard();
    renderAdminStats();
  }

  async function loadData() {
    if (!supabase) {
      setNotice("cards-status","App pronta, ma non ancora collegata a Supabase. Segui SETUP.md per configurare il database.","error");
      renderCards();
      renderEvents();
      return;
    }

    try {
      const [
        {data:cardRows,error:cardErr},
        {data:markRows,error:markErr},
        {data:reservationRows,error:reservationErr}
      ] = await Promise.all([
        supabase.from("nuffle_cards").select("id,card_number,events").order("card_number"),
        supabase.from("nuffle_event_marks").select("event_id,marked"),
        supabase.from("nuffle_reservations").select("card_id,player_name,created_at")
      ]);

      if (cardErr) throw cardErr;
      if (markErr) throw markErr;
      if (reservationErr) throw reservationErr;

      cards = cardRows || [];
      reservations = reservationRows || [];
      marked = new Set((markRows || []).filter(m => m.marked).map(m => Number(m.event_id)));

      setNotice(
        "cards-status",
        cards.length
          ? `${cards.length} cartelle disponibili · eventi sincronizzati in tempo reale.`
          : "Nessuna cartella generata: l'organizzatore deve avviare la partita.",
        "success"
      );

      refreshViews();
      subscribeRealtime();

    } catch (e) {
      console.error(e);
      setNotice("cards-status","Errore di connessione al database. Controlla URL, chiave e configurazione SQL.","error");
    }
  }

  async function loadMarks() {
    if (!supabase) return;
    const {data,error} = await supabase.from("nuffle_event_marks").select("event_id,marked");
    if (!error) { marked = new Set((data||[]).filter(m=>m.marked).map(m=>Number(m.event_id))); refreshViews(); }
  }
  async function reloadCards() {
    if (!supabase) return;
    const {data,error} = await supabase.from("nuffle_cards").select("id,card_number,events").order("card_number");
    if (!error) { cards=data||[]; if (currentCard && !getCard(currentCard.id)) { currentCard=null; location.hash="cartelle"; } refreshViews(); }
  }
  function subscribeRealtime() {
    if (channel) supabase.removeChannel(channel);
    channel = supabase.channel("nuffle-shared-game")
      .on("postgres_changes",{event:"*",schema:"public",table:"nuffle_event_marks"}, payload => {
        const row = payload.new && payload.new.event_id ? payload.new : payload.old;
        if (row && row.event_id) {
          if (payload.eventType === "DELETE" || row.marked === false) marked.delete(Number(row.event_id));
          else marked.add(Number(row.event_id));
          refreshViews();
        } else loadMarks();
      })
      .on("postgres_changes",{event:"*",schema:"public",table:"nuffle_cards"}, () => reloadCards())
      .on("postgres_changes",{event:"*",schema:"public",table:"nuffle_reservations"}, () => loadReservations())
      .subscribe();
  }
 function renderAdminStats() {
  const el = $("admin-stats");
  if (!el) return;

  el.innerHTML = `
    <div class="stat"><b>${cards.length}</b><span>CARTELLE</span></div>
    <div class="stat"><b>${marked.size}/30</b><span>EVENTI SEGNATI</span></div>
    <div class="stat"><b>${cards.reduce((s,c)=>s+(c.events||[]).filter(id=>marked.has(Number(id))).length,0)}</b><span>SPUNTE TOTALI SULLE CARTELLE</span></div>
  `;

  renderAdminReservations();
}

function renderAdminReservations() {
  const tools = $("admin-tools");
  if (!tools) return;

  let panel = $("admin-reservations");

  if (!panel) {
    panel = document.createElement("section");
    panel.id = "admin-reservations";
    panel.className = "admin-reservations";
    tools.appendChild(panel);
  }

  const sorted = [...reservations].sort((a, b) => {
    const cardA = getCard(a.card_id)?.card_number || 0;
    const cardB = getCard(b.card_id)?.card_number || 0;
    return cardA - cardB;
  });

  panel.innerHTML = `
    <h3>Gestione prenotazioni</h3>
    ${
      sorted.length
        ? sorted.map(r => {
            const card = getCard(r.card_id);
            const number = card ? card.card_number : "?";

            return `
              <div class="notice reservation-admin-row">
                <span>
                  <strong>Cartella #${number}</strong>
                  — ${esc(r.player_name)}
                </span>
                <button
                  class="btn btn-ghost"
                  data-cancel-reservation="${esc(r.card_id)}">
                  Annulla prenotazione
                </button>
              </div>
            `;
          }).join("")
        : `<div class="notice">Non ci sono prenotazioni attive.</div>`
    }
  `;

  panel.querySelectorAll("[data-cancel-reservation]").forEach(button => {
    button.addEventListener("click", () => {
      const cardId = button.dataset.cancelReservation;
      const reservation = reservations.find(r => String(r.card_id) === String(cardId));
      if (!reservation) return;

      const card = getCard(cardId);
      const number = card ? card.card_number : "?";

      if (!confirm(
        `Vuoi annullare la prenotazione della cartella #${number}, intestata a ${reservation.player_name}?`
      )) return;

      adminAction({
        action: "cancel-reservation",
        card_id: cardId
      });
    });
  });
}
  async function shareCard(id) {
    const card=getCard(id); if (!card) return;
    const url = `${location.origin}${location.pathname}#cartella=${encodeURIComponent(card.id)}`;
    const title=`La Smorfia di Nuffle — Cartella #${card.card_number}`;
    const text=`La mia cartella della Smorfia di Nuffle: ${url}`;
    try {
      if (navigator.share) await navigator.share({title,text,url});
      else if (navigator.clipboard) { await navigator.clipboard.writeText(url); toast("Link della cartella copiato!"); }
      else prompt("Copia il link della cartella:",url);
    } catch(e) { if (e.name!=="AbortError") { try { await navigator.clipboard.writeText(url); toast("Link copiato!"); } catch(_) { prompt("Copia il link:",url); } } }
  }
  $("share-card").addEventListener("click",()=>currentCard&&shareCard(currentCard.id));
  $("card-search").addEventListener("input",renderCards);
  $("player-name").addEventListener("input",()=>{ if(currentCard) $("my-card-subtitle").textContent=$("player-name").value.trim()?`Giocatore: ${$("player-name").value.trim()} · Segna gli eventi quando accadono.`:"Segna gli eventi quando si verificano in partita."; });

  $("admin-login-form").addEventListener("submit", async e => {
    e.preventDefault();
    const code=$("admin-code").value.trim();
    if (!code) return;
    adminCode=code;
    // Il codice non viene salvato né verificato nel client: la verifica avviene solo nella Edge Function.
    const ok=await testAdminCode(code);
    if (ok) {
      $("admin-login").classList.add("hidden"); $("admin-tools").classList.remove("hidden");
      $("admin-code").value=""; renderAdminStats(); toast("Accesso organizzatore effettuato.");
    } else { adminCode=""; toast("Codice organizzatore non valido."); }
  });
  async function testAdminCode(code) {
    try {
      const response=await fetch(`${cfg.SUPABASE_URL}/functions/v1/generate-game`,{
        method:"POST",headers:{"Content-Type":"application/json","apikey":cfg.SUPABASE_ANON_KEY,"Authorization":`Bearer ${cfg.SUPABASE_ANON_KEY}`,"x-organizer-code":code},
        body:JSON.stringify({action:"check"})
      });
      return response.ok;
    } catch(e) { console.error(e); return false; }
  }
  $("admin-logout").addEventListener("click",()=>{adminCode="";$("admin-tools").classList.add("hidden");$("admin-login").classList.remove("hidden");toast("Sei uscito dall'area organizzatore.");});
  $("generate-form").addEventListener("submit", async e => {
    e.preventDefault();
    const count=Number($("card-count").value);
    if (!Number.isInteger(count)||count<1||count>100) return toast("Scegli un numero di cartelle da 1 a 100.");
    if (!confirm(`Generare ${count} nuove cartelle? Le cartelle e le spunte attuali verranno sostituite per tutti.`)) return;
    await adminAction({action:"generate",count});
  });
  $("reset-marks").addEventListener("click", async ()=>{
    if (!confirm("Vuoi azzerare tutti gli eventi segnati per tutti i partecipanti?")) return;
    await adminAction({action:"reset"});
  });
 
async function adminAction(payload) {
  if (!adminCode) return toast("Sessione organizzatore scaduta. Accedi di nuovo.");

  try {
    const response = await fetch(`${cfg.SUPABASE_URL}/functions/v1/generate-game`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": cfg.SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${cfg.SUPABASE_ANON_KEY}`,
        "x-organizer-code": adminCode
      },
      body: JSON.stringify(payload)
    });

    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || "Operazione non riuscita");
    }

    if (payload.action === "cancel-reservation") {
      await loadReservations();
    } else {
      await Promise.all([reloadCards(), loadMarks()]);
    }

    $("admin-message").classList.remove("hidden");

    let message = "Operazione completata.";

    if (payload.action === "generate") {
      message = `Nuova partita creata: ${result.count} cartelle generate.`;
    } else if (payload.action === "reset") {
      message = "Tutti gli eventi sono stati azzerati.";
    } else if (payload.action === "cancel-reservation") {
      message = "Prenotazione annullata. La cartella è nuovamente disponibile.";
    }

    setNotice("admin-message", message, "success");
    toast("Operazione completata.");

  } catch (e) {
    console.error(e);
    $("admin-message").classList.remove("hidden");
    setNotice("admin-message", e.message || "Errore durante l'operazione.", "error");
  }
}

  function renderAdminStatsInitial() { renderAdminStats(); }
  $("main-nav").addEventListener("click",e=>{const a=e.target.closest("a[data-page]");if(a){e.preventDefault();location.hash=a.getAttribute("href").slice(1);}});
  renderAdminStatsInitial();
  if (supabase) loadData(); else { setNotice("cards-status","Da configurare: inserisci le credenziali Supabase in config.js e completa SETUP.md.","error"); renderCards(); renderEvents(); }
  route();
})();
