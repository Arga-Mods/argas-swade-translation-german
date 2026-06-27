const MODULE_ID = 'argas-swade-translation-german';

async function argaToggleLanguage() {
  const cur = game.settings.get("core", "language");
  const next = cur === "de" ? "en" : "de";
  const label = next === "de" ? "DEUTSCH" : "ENGLISCH";
  const langWord = next === "de" ? "Deutsch" : "Englisch";
  const choice = await foundry.applications.api.DialogV2.wait({
    window: { title: `Umschalten auf → ${label}` },
    content: `<p style="text-align:center;margin:0;">Die Sprache des Interfaces wird <b>auf ${langWord}</b> umgeschaltet.</p><p style="text-align:center;margin:0.4rem 0 0;">Möchtest du, dass in der neuen Sprache alle derzeit offenen Fenster ebenfalls<br>geöffnet werden und der Zustand der Seitenleiste übertragen wird?</p>`,
    buttons: [
      { action: "plain", label: "Nur die Sprache umschalten" },
      { action: "keep", label: "Zustand von Fenstern und Seitenleiste beibehalten", default: true }
    ],
    rejectClose: false
  });
  if (!choice) return;
  if (choice === "keep") {
    const seen = new Set();
    const list = [];
    const collect = (app) => {
      try {
        const el = app?.element instanceof HTMLElement ? app.element : app?.element?.[0];
        if (!el || !el.isConnected) return;
        const z = Number(el.style?.zIndex) || Number(app.position?.zIndex) || 0;
        const p = app.position ?? {};
        const pos = {};
        for (const k of ["left", "top", "width", "height", "scale"]) {
          if (p[k] !== undefined && p[k] !== null) pos[k] = p[k];
        }
        const entry = { z, pos, min: !!app.minimized };
        const uuid = app.document?.uuid;
        const packId = app.collection?.metadata?.id;
        if (uuid) {
          // Eingebettete Journal-Seiten (die Kapitelseiten eines geöffneten
          // Regel-Journals) nicht als eigenes Fenster merken: sonst öffnet das
          // Wiederherstellen beim Sprachwechsel jede Seite einzeln als Editor.
          // Der Journal-Eintrag selbst wird weiter normal gemerkt.
          if (uuid.includes(".JournalEntryPage.") || app.document?.documentName === "JournalEntryPage") return;
          if (seen.has("u:" + uuid)) return;
          seen.add("u:" + uuid);
          entry.uuid = uuid;
          if (app.pageId) entry.pageId = app.pageId;
        } else if (packId && app.collection === game.packs.get(packId)) {
          if (seen.has("p:" + packId)) return;
          seen.add("p:" + packId);
          entry.pack = packId;
        } else {
          return;
        }
        list.push(entry);
      } catch (e) {}
    };
    for (const app of foundry.applications.instances.values()) collect(app);
    for (const app of Object.values(ui.windows)) collect(app);
    list.sort((a, b) => a.z - b.z);
    let sidebarExpanded = true;
    let sidebarTab = null;
    try {
      const sb = ui.sidebar;
      if (typeof sb?.expanded === "boolean") sidebarExpanded = sb.expanded;
      else if (typeof sb?._collapsed === "boolean") sidebarExpanded = !sb._collapsed;
      sidebarTab = sb?.tabGroups?.primary ?? sb?.activeTab ?? null;
    } catch (e) {}
    try {
      sessionStorage.setItem(
        "argas-swade-translation-german.windows",
        JSON.stringify({ windows: list, sidebarExpanded, sidebarTab })
      );
    } catch (e) {}
  }
  ui.notifications.info(`Umschalten zu: ${label}`);
  await new Promise((r) => setTimeout(r, 1500));
  // Markierung fuer register.js: nach dem Neuladen das Begrüßungsfenster einmal
  // ueberspringen, da der Sprachwechsel hier bewusst ausgeloest wurde.
  try { sessionStorage.setItem("argas-swade-translation-german.suppressWelcome", "1"); } catch (e) {}
  await game.settings.set("core", "language", next);
  location.reload();
}

Hooks.once('init', () => {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = Object.assign(mod.api ?? {}, { toggleLanguage: argaToggleLanguage });
});
