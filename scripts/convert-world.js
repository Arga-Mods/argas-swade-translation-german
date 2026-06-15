const MODULE_ID = 'argas-swade-translation-german';
const ARGA_CONVERT_RESUME_KEY = 'argas-swade-run-convert';

async function argaConvertWorld() {
  if (!game.user.isGM) {
    ui.notifications.warn('Diese Funktion kann nur der Spielleiter ausführen.');
    return;
  }
  const babele = game.babele;
  if (!babele?.proposeActorTranslation || !babele?.sourceDataForUuid) {
    ui.notifications.error('Babele in Version 2.9 oder neuer wird benötigt.');
    return;
  }

  const TITLE = 'Akteure und Items konvertieren: Englisch \u2192 Deutsch';

  if (game.settings.get('core', 'language') !== 'de') {
    const hint = 'Klicke auf den Button zum Umstellen der Sprache. Danach wird die Welt neu geladen und die Konvertierung automatisch erneut geöffnet.';
    const choice = await foundry.applications.api.DialogV2.wait({
      window: { title: TITLE },
      position: { width: 480 },
      content: `<div style="display:flex;flex-direction:column;gap:0.6rem;">
        <div>Das Interface steht nicht auf <strong>Deutsch</strong>. Ohne deutsche Spracheinstellung kann dieser Konverter keine Übersetzungen vorschlagen.</div>
        <div>${hint}</div>
      </div>`,
      buttons: [
        { action: 'switch', label: 'Auf Deutsch umstellen', default: true },
        { action: 'cancel', label: 'Abbrechen' },
      ],
      rejectClose: false,
    });
    if (choice === 'switch') {
      try { sessionStorage.setItem('argas-swade-run-convert', '1'); } catch (e) {}
      try { await game.settings.set('core', 'language', 'de'); } catch (e) {}
      location.reload();
    }
    return;
  }

  try {
    const diag = babele.cacheDiagnostics?.();
    if (diag && !diag.dataLoaded) ui.notifications.info('Warte auf die Babele-Übersetzungen …');
    await babele.init?.();
  } catch (e) {}

  const RED = '#aa0000';
  const GREEN = '#1f6b35';
  const GAP = '1.0rem';
  const TOP_SUMMARY_STYLE = 'cursor:pointer;padding:0.35rem 0.6rem;font-weight:bold;font-size:1.1em;background:rgba(45,90,160,0.08);border:1px solid rgba(45,90,160,0.3);border-left:4px solid #2c5aa0;border-radius:6px;';
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const norm = (s) => String(s ?? '').trim().toLowerCase();
  const HTML_ENTITIES = { nbsp: ' ', ensp: ' ', emsp: ' ', thinsp: ' ', ndash: '\u2013', mdash: '\u2014', minus: '\u2212', ldquo: '"', rdquo: '"', bdquo: '"', ldquor: '"', rdquor: '"', laquo: '"', raquo: '"', lsquo: "'", rsquo: "'", sbquo: "'", lsquor: "'", apos: "'", quot: '"', hellip: '\u2026', deg: '\u00b0', Prime: '\u2033', prime: '\u2032', times: '\u00d7', shy: '', amp: '&', lt: '<', gt: '>' };
  const decodeEntities = (s) => String(s ?? '')
    .replace(/&#x([0-9a-fA-F]+);/g, (m, h) => { try { return String.fromCodePoint(parseInt(h, 16)); } catch (e) { return ''; } })
    .replace(/&#(\d+);/g, (m, d) => { try { return String.fromCodePoint(parseInt(d, 10)); } catch (e) { return ''; } })
    .replace(/&([a-zA-Z]+);/g, (m, name) => (Object.prototype.hasOwnProperty.call(HTML_ENTITIES, name) ? HTML_ENTITIES[name] : m));
  const normText = (s) => decodeEntities(String(s ?? '')
    .replace(/@(?:UUID|Compendium)\[[^\]]*\]/g, '')
    .replace(/<[^>]+>/g, ' '))
    .replace(/\u00ad/g, '')
    .replace(/[\u201c\u201d\u201e\u201f\u00ab\u00bb\u2033"]/g, '"')
    .replace(/[\u2018\u2019\u201a\u201b\u2032']/g, "'")
    .replace(/[\u2013\u2014\u2212]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u00a0/g, ' ')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  const word = (n, sg, pl) => (n === 1 ? sg : pl);
  const nWord = (n, sg, pl) => `${n} ${word(n, sg, pl)}`;

  const CATS = [
    { key: 'eigenschaften', label: 'Übersetzte Eigenschaften der Akteure', labelItems: 'Übersetzte Eigenschaften', types: ['skill', 'hindrance', 'ancestry'] },
    { key: 'talente', label: 'Übersetzte Talente, Mächte & Fähigkeiten', labelItems: 'Übersetzte Talente, Mächte & Fähigkeiten', types: ['edge', 'power', 'ability'] },
    { key: 'inventar', label: 'Übersetztes Inventar', labelItems: 'Übersetztes Inventar', types: ['weapon', 'armor', 'shield', 'gear', 'consumable'] },
    { key: 'effekte', label: 'Übersetzte Effekte & Aktionen', labelItems: 'Übersetzte Effekte & Aktionen', types: ['action'] },
  ];
  const catOf = (type) => (CATS.find((c) => c.types.includes(type)) ?? CATS[3]).key;
  const HEAD_LABELS = {
    name: 'Name',
    'prototypeToken.name': 'Token',
    'system.details.biography.value': 'Beschreibung',
    'system.description': 'Beschreibung',
  };
  const ACTOR_FIELDS = Object.keys(HEAD_LABELS);

  const isAlreadyTranslated = (item) =>
    item?.getFlag?.('babele', 'hasTranslation') === true
    || item?.getFlag?.('babele', 'translated') === true
    || item?.flags?.babele?.hasTranslation === true
    || item?.flags?.babele?.translated === true;

  const proposeFresh = async (items) =>
    babele.proposeActorTranslation({ items: { contents: items.filter((i) => !isAlreadyTranslated(i)) } });

  const sourceUuidOf = (doc) => {
    const uuid = doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? null;
    return (typeof uuid === 'string' && uuid.startsWith('Compendium.')) ? uuid : null;
  };

  const translatedCollections = new Map();
  const isTranslatedCollection = (collection) => {
    if (!collection || !game.packs.get(collection)) return false;
    if (translatedCollections.has(collection)) return translatedCollections.get(collection);
    let ok = false;
    try { ok = babele.isTranslated(collection) === true; } catch (e) {}
    translatedCollections.set(collection, ok);
    return ok;
  };

  const pairCache = new Map();
  const pairForUuid = async (uuid) => {
    if (pairCache.has(uuid)) return pairCache.get(uuid);
    let pair = null;
    const parts = String(uuid).split('.');
    if (parts.length >= 4 && isTranslatedCollection(`${parts[1]}.${parts[2]}`)) {
      try {
        const translated = (await fromUuid(uuid))?.toObject?.() ?? null;
        const original = await babele.sourceDataForUuid(uuid);
        if (translated && original) pair = { translated, original };
      } catch (e) {}
    }
    pairCache.set(uuid, pair);
    return pair;
  };
  const sourcePairFor = async (doc) => {
    const uuid = sourceUuidOf(doc);
    return uuid ? pairForUuid(uuid) : null;
  };

  const argaApi = game.modules.get('argas-swade-translation-german')?.api ?? null;
  const effectApiOk = !!(argaApi?.resolveEffectDescriptionFor && argaApi?.effectTranslations);
  if (!effectApiOk) ui.notifications.warn('Effekt-Übersetzungen werden übersprungen: Modul-API nicht gefunden. Bitte die aktualisierte register.js des Übersetzungsmoduls einspielen.');

  const effNameReverse = new Map();
  if (effectApiOk) {
    for (const [en, de] of Object.entries(argaApi.effectTranslations)) {
      if (!effNameReverse.has(de)) effNameReverse.set(de, en);
    }
  }

  const effDocCache = new Map();
  const effDocsFor = async (uuid) => {
    if (effDocCache.has(uuid)) return effDocCache.get(uuid);
    let res = null;
    if (isTranslatedCollection(collectionFromUuid(uuid))) {
      try {
        const de = (await fromUuid(uuid))?.toObject?.() ?? null;
        const en = (await babele.sourceDataForUuid(uuid)) ?? de;
        if (en) res = { en, de };
      } catch (e) {}
    }
    effDocCache.set(uuid, res);
    return res;
  };

  const effectPlanFor = async (item) => {
    if (!effectApiOk) return [];
    const effects = item.effects?.contents ?? [];
    if (!effects.length) return [];
    const uuid = sourceUuidOf(item);
    const docs = uuid ? await effDocsFor(uuid) : null;
    const enById = new Map((docs?.en?.effects ?? []).map((e) => [e._id, e]));
    const parentDesc = (typeof docs?.de?.system?.description === 'string' && docs.de.system.description.length)
      ? docs.de.system.description
      : null;
    const changes = [];
    for (const eff of effects) {
      let enEff = enById.get(eff.id) ?? null;
      if (!enEff && docs?.en?.effects?.length) {
        const cand = docs.en.effects.filter((e) => e.name === eff.name || (argaApi.effectTranslations[e.name] ?? null) === eff.name);
        if (cand.length === 1) enEff = cand[0];
      }
      const enName = enEff?.name
        ?? (argaApi.effectTranslations[eff.name] ? eff.name : null)
        ?? effNameReverse.get(eff.name)
        ?? null;
      const update = { _id: eff.id };
      let n = 0;
      const deName = enName ? (argaApi.effectTranslations[enName] ?? null) : null;
      if (deName && eff.name !== deName && eff.name === enName) {
        update.name = deName;
        n += 1;
      }
      const target = argaApi.resolveEffectDescriptionFor(eff.id, enName, parentDesc);
      const cur = typeof eff.description === 'string' ? eff.description : '';
      const enDesc = typeof enEff?.description === 'string' ? enEff.description : null;
      if (typeof target === 'string' && target.length && target !== cur && (!cur.length || (enDesc !== null && cur === enDesc))) {
        update.description = target;
        n += 1;
      }
      if (!n) continue;
      let from;
      let to;
      if (update.name) {
        from = `Effekt: ${eff.name}`;
        to = update.description ? `${update.name} (+ Beschreibung)` : update.name;
      } else {
        from = `Effekt: ${deName ?? eff.name} \u00b7 Beschreibung`;
        to = '(deutscher Text)';
      }
      changes.push({ itemId: item.id, update, from, to });
    }
    return changes;
  };

  const FLAT_SKIP = /^(_id|_key|sort|folder|img|type)$|^(_stats|flags|effects|ownership|permission|system\.actions)\./;
  const conservativeFields = (cur, orig, trans) => {
    const fc = foundry.utils.flattenObject(cur);
    const fo = foundry.utils.flattenObject(orig);
    const ft = foundry.utils.flattenObject(trans);
    const fields = {};
    let n = 0;
    for (const [k, tv] of Object.entries(ft)) {
      if (FLAT_SKIP.test(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
      const ov = fo[k];
      if (typeof tv !== 'string' || typeof ov !== 'string' || tv === ov) continue;
      const cv = fc[k];
      if (typeof cv !== 'string' || normText(cv) !== normText(ov)) continue;
      fields[k] = tv;
      n += 1;
    }
    return n ? fields : null;
  };

  let nameIndexPromise = null;
  const nameIndex = () => {
    nameIndexPromise ??= (async () => {
      ui.notifications.info('Lade Vergleichsdaten aus den deutschen Kompendien …');
      const map = new Map();
      for (const pack of game.packs) {
        if (pack.metadata?.type !== 'Item') continue;
        const collection = pack.collection ?? pack.metadata?.id;
        if (!isTranslatedCollection(collection)) continue;
        let docs = [];
        try { docs = await pack.getDocuments(); } catch (e) { continue; }
        for (const d of docs) {
          const en = d.flags?.babele?.originalName ?? d.name;
          const key = `${d.type}:${norm(en)}`;
          const list = map.get(key) ?? [];
          list.push(d.uuid);
          map.set(key, list);
        }
      }
      return map;
    })();
    return nameIndexPromise;
  };

  const collectionFromUuid = (uuid) => {
    const parts = String(uuid).split('.');
    return parts.length >= 3 ? `${parts[1]}.${parts[2]}` : null;
  };

  const idFields = async (item) => {
    const uuid = sourceUuidOf(item);
    if (!uuid) return { reason: 'keine Kompendium-Quelle' };
    return uuidFields(item, uuid);
  };

  const payloadField = (payload, k) => {
    if (!payload) return null;
    if (k === 'name') return typeof payload.name === 'string' ? payload.name : null;
    const direct = payload[k];
    if (typeof direct === 'string') return direct;
    const tail = k.split('.').pop();
    const v = payload[tail];
    return typeof v === 'string' ? v : null;
  };

  const uuidFields = async (item, uuid) => {
    const collection = collectionFromUuid(uuid);
    if (!isTranslatedCollection(collection)) return { reason: `Quelle '${collection}' nicht übersetzt` };
    let trans = null;
    try { trans = (await fromUuid(uuid))?.toObject?.() ?? null; } catch (e) {}
    let src = null;
    try { src = await babele.sourceDataForUuid(uuid); } catch (e) {}
    const base = src ?? trans;
    if (!base) return { reason: 'Quelldokument nicht ladbar' };
    let delta = null;
    try { delta = babele.translate(collection, base, true); } catch (e) {}
    if (!delta || delta === base) return { reason: 'kein Übersetzungseintrag für diese ID' };
    const fd = foundry.utils.flattenObject(delta);
    const fs = src ? foundry.utils.flattenObject(src) : {};
    if (trans && src) {
      const ftr = foundry.utils.flattenObject(trans);
      for (const [k, tv] of Object.entries(ftr)) {
        if (k in fd) continue;
        if (FLAT_SKIP.test(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
        if (typeof tv !== 'string' || !tv.length) continue;
        const ev = fs[k];
        if (typeof ev !== 'string' || ev === tv) continue;
        fd[k] = tv;
      }
    }
    const fc = foundry.utils.flattenObject(item.toObject());
    const payload = trans?.flags?.babele?.originalPayload ?? null;
    const srcName = typeof fs.name === 'string' && typeof fd.name === 'string' && fs.name !== fd.name ? fs.name : null;
    const origName = srcName ?? payloadField(payload, 'name') ?? trans?.flags?.babele?.originalName ?? null;
    const itemIsOriginal = origName != null && norm(item.name) === norm(origName);
    const fields = {};
    let n = 0;
    for (const [k, tv] of Object.entries(fd)) {
      if (FLAT_SKIP.test(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
      if (typeof tv !== 'string' || !tv.length) continue;
      const cv = fc[k];
      if (typeof cv !== 'string') continue;
      if (cv === tv || (cv.length && normText(cv) === normText(tv))) continue;
      fields[k] = tv;
      n += 1;
    }
    return n ? { fields, origName: origName ?? undefined } : { reason: 'Felder bereits deutsch oder angepasst' };
  };

  const pairItemMatch = (item, pair) => {
    const cur = item.toObject();
    let orig = (pair.original?.items ?? []).find((i) => i._id === item.id) ?? null;
    if (!orig) {
      const byName = (pair.original?.items ?? []).filter((i) => norm(i.name) === norm(cur.name) && i.type === cur.type);
      if (byName.length === 1) orig = byName[0];
    }
    if (!orig) return null;
    const trans = (pair.translated?.items ?? []).find((i) => i._id === orig._id) ?? null;
    if (!trans) return null;
    const fields = conservativeFields(cur, orig, trans);
    return fields ? { fields, origName: orig.name } : null;
  };

  const mkHit = (item, fields, origName, via) => {
    const update = { ...fields, _id: item.id };
    update['flags.babele.hasTranslation'] = true;
    update['flags.babele.translated'] = true;
    if (origName) update['flags.babele.originalName'] = origName;
    return { update, from: item.name, to: fields.name ?? item.name, cat: catOf(item.type), via };
  };

  const SYSTEM_PREFIX = `${game.system.id}.`;
  const isSystemCollection = (collection) => typeof collection === 'string' && collection.startsWith(SYSTEM_PREFIX);

  const distLE1 = (a, b) => {
    if (a === b) return true;
    const la = a.length;
    const lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    let i = 0;
    let j = 0;
    let edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i += 1; j += 1; continue; }
      edits += 1;
      if (edits > 1) return false;
      if (la === lb) { i += 1; j += 1; }
      else if (la > lb) i += 1;
      else j += 1;
    }
    return edits + (la - i) + (lb - j) <= 1;
  };

  const SYSTEM_NAME_OVERRIDES = {
    edge: {
      'Arcane Background': { name: 'Arkaner Hintergrund' },
    },
  };

  const systemFields = async (item, uuid) => {
    let sysDoc = null;
    try { sysDoc = (await fromUuid(uuid))?.toObject?.() ?? null; } catch (e) {}
    if (!sysDoc) return { reason: 'System-Quelldokument nicht ladbar' };
    const override = SYSTEM_NAME_OVERRIDES[item.type]?.[sysDoc.name];
    if (override) {
      const fc = foundry.utils.flattenObject(item.toObject());
      const fields = {};
      if (override.name && fc.name !== override.name) fields.name = override.name;
      if (override.description) {
        const cv = fc['system.description'];
        if (typeof cv !== 'string' || normText(cv) !== normText(override.description)) fields['system.description'] = override.description;
      }
      if (Object.keys(fields).length) return { fields, origName: sysDoc.name, via: 'System-Override' };
      return { reason: 'Felder bereits deutsch oder angepasst' };
    }
    const idx = await nameIndex();
    const wanted = norm(sysDoc.name);
    const prefix = `${item.type}:`;
    let list = idx.get(`${prefix}${wanted}`) ?? [];
    let variant = false;
    if (list.length !== 1) {
      if (list.length > 1) return { reason: 'GRW-Pendant mehrdeutig' };
      const cands = [];
      for (const key of idx.keys()) {
        if (!key.startsWith(prefix)) continue;
        const nm = key.slice(prefix.length);
        if (nm !== wanted && distLE1(nm, wanted)) cands.push(key);
      }
      if (cands.length === 1 && (idx.get(cands[0]) ?? []).length === 1) {
        list = idx.get(cands[0]);
        variant = true;
      } else if (cands.length > 1) {
        return { reason: 'GRW-Pendant mehrdeutig (Schreibvarianten)' };
      } else {
        let variants = 0;
        for (const key of idx.keys()) if (key.startsWith(`${prefix}${wanted} (`)) variants += 1;
        if (variants) return { reason: `im Übersetzungsmodul nur als ${variants} Varianten vorhanden \u2013 bitte manuell zuordnen` };
        return { reason: 'kein GRW-Pendant gefunden' };
      }
    }
    const pendantUuid = list[0];
    const collection = collectionFromUuid(pendantUuid);
    let trans = null;
    try { trans = (await fromUuid(pendantUuid))?.toObject?.() ?? null; } catch (e) {}
    let src = null;
    try { src = await babele.sourceDataForUuid(pendantUuid); } catch (e) {}
    const base = src ?? trans;
    if (!base) return { reason: 'GRW-Pendant nicht ladbar' };
    let delta = null;
    try { delta = babele.translate(collection, base, true); } catch (e) {}
    if (!delta || delta === base) return { reason: 'kein Übersetzungseintrag für das GRW-Pendant' };
    const fd = foundry.utils.flattenObject(delta);
    const fc = foundry.utils.flattenObject(item.toObject());
    const fo = foundry.utils.flattenObject(sysDoc);
    const fields = {};
    let n = 0;
    for (const [k, tv] of Object.entries(fd)) {
      if (FLAT_SKIP.test(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
      if (typeof tv !== 'string' || !tv.length) continue;
      const cv = fc[k];
      if (typeof cv !== 'string' || cv === tv) continue;
      const ov = fo[k];
      if (typeof ov === 'string') {
        if (normText(cv) !== normText(ov)) continue;
      } else if (cv.length) {
        continue;
      }
      fields[k] = tv;
      n += 1;
    }
    if (!n) return { reason: 'Felder bereits deutsch oder angepasst' };
    return { fields, origName: sysDoc.name, via: variant ? 'System-Pendant (Schreibvariante)' : 'System-Pendant' };
  };

  const tryFallback = async (item, pair) => {
    if (!item) return { hit: null, reason: 'kein Item' };
    const reasons = [];
    const byId = await idFields(item);
    if (byId.fields) return { hit: mkHit(item, byId.fields, byId.origName, 'Quell-ID'), reason: null };
    if (byId.reason) reasons.push(byId.reason);
    const srcUuid = sourceUuidOf(item);
    if (srcUuid && isSystemCollection(collectionFromUuid(srcUuid))) {
      try {
        const h = await systemFields(item, srcUuid);
        if (h.fields) return { hit: mkHit(item, h.fields, h.origName, h.via), reason: null };
        if (h.reason) reasons.push(`System-Pendant: ${h.reason}`);
      } catch (e) {}
    }
    if (pair) {
      try {
        const h = pairItemMatch(item, pair);
        if (h) return { hit: mkHit(item, h.fields, h.origName, 'Akteurs-Paar'), reason: null };
      } catch (e) {}
    }
    try {
      const idx = await nameIndex();
      const list = idx.get(`${item.type}:${norm(item.name)}`) ?? [];
      if (list.length === 1) {
        const h = await uuidFields(item, list[0]);
        if (h.fields) return { hit: mkHit(item, h.fields, h.origName, 'Namensindex'), reason: null };
        reasons.push(h.reason === 'Felder bereits deutsch oder angepasst' ? 'Namensindex-Treffer ohne übersetzbare Felder' : `Namensindex: ${h.reason}`);
      } else if (list.length > 1) {
        reasons.push('Namensindex mehrdeutig');
      } else {
        reasons.push('kein Namensindex-Treffer');
      }
    } catch (e) {}
    return { hit: null, reason: reasons.filter(Boolean).join('; ') || 'keine Übersetzung gefunden' };
  };

  const headPlanFor = (doc, pair) => {
    if (!pair) return null;
    const current = doc.toObject();
    const update = {};
    const fields = [];
    for (const field of ACTOR_FIELDS) {
      const cur = foundry.utils.getProperty(current, field);
      const orig = foundry.utils.getProperty(pair.original, field);
      const next = foundry.utils.getProperty(pair.translated, field);
      if (typeof next !== 'string' || !next.length) continue;
      if (typeof cur !== 'string' || cur !== orig || next === cur) continue;
      update[field] = next;
      fields.push(field);
    }
    return fields.length ? { update, fields } : null;
  };

  const DIAG = [];
  const diag = (owner, name, text) => DIAG.push(`[${owner}] "${name}" \u2192 ${text}`);

  ui.notifications.info(`Analysiere ${nWord(game.actors.size, 'Akteur', 'Akteure')} und ${nWord(game.items.size, 'Welt-Item', 'Welt-Items')} …`);

  const catView = { a: {}, i: {} };
  for (const s of ['a', 'i']) for (const c of CATS) catView[s][c.key] = { translations: new Map(), missing: new Map() };
  let lineIdSeq = 0;
  const aKeyToId = new Map();
  const aLineId = (cat, from, to) => {
    const k = `${cat}\u0001${from}\u0001${to}`;
    let id = aKeyToId.get(k);
    if (id == null) { id = `L${lineIdSeq++}`; aKeyToId.set(k, id); }
    return id;
  };
  const addTranslated = (scope, cat, from, to) => {
    const key = `${from}\u2192${to}`;
    const view = catView[scope][cat].translations;
    const cur = view.get(key);
    if (cur) { cur.count += 1; return; }
    view.set(key, { from, to, count: 1, id: scope === 'a' ? aLineId(cat, from, to) : null });
  };
  const addMissing = (scope, cat, name, owner, reason) => {
    const cur = catView[scope][cat].missing.get(name) ?? { count: 0, owners: new Set(), reason: null };
    cur.count += 1;
    if (owner) cur.owners.add(owner);
    if (reason && !cur.reason) cur.reason = reason;
    catView[scope][cat].missing.set(name, cur);
  };

  const plans = [];
  const world = { proposal: null, items: [] };
  let analyzeErrors = 0;
  let entryErrors = 0;

  const classify = async (item, entry, pair, sink, owner) => {
    const iname = entry?.currentName?.() || item?.name || '(unbenannt)';
    try {
      const { hit, reason } = await tryFallback(item, pair);
      if (hit) {
        sink.extra(hit);
        const nFields = Object.keys(hit.update).filter((k) => k !== '_id' && !k.startsWith('flags.')).length;
        diag(owner, iname, `ID-Zuordnung ${hit.via} \u2192 "${hit.to}" (${nWord(nFields, 'Feld', 'Felder')})`);
        return;
      }
      if (entry?.applicable?.()) {
        const uncertain = entry.reviewRequired?.() || entry.userChanged;
        sink.use(entry);
        diag(owner, iname, uncertain
          ? `Babele-Vorschlag (von Babele als unsicher markiert, aber übernommen) \u2192 "${entry.proposedName()}"`
          : `Babele-Übersetzung \u2192 "${entry.proposedName()}"`);
        return;
      }
      if (entry?.hasTranslation?.()) {
        diag(owner, iname, 'bereits vollständig deutsch \u2013 übersprungen');
        return;
      }
      if (reason === 'Felder bereits deutsch oder angepasst' || isAlreadyTranslated(item)) {
        diag(owner, iname, 'bereits deutsch/markiert \u2013 übersprungen');
        return;
      }
      sink.miss(item, iname, reason);
      diag(owner, iname, `GESCHEITERT (${reason})`);
    } catch (e) {
      entryErrors += 1;
      sink.miss(item, iname, 'Analysefehler, siehe Konsole (F12)');
      diag(owner, iname, 'GESCHEITERT (Analysefehler, siehe Konsole)');
      console.error(`Convert World | Analysefehler bei "${iname}" (${owner})`, e);
    }
  };

  const collectActor = async (actor) => {
    const flagged = actor.items.contents.filter(isAlreadyTranslated).length;
    if (flagged) diag(actor.name, '\u2013', `${flagged} bereits markierte Items werden erneut geprüft`);
    const proposal = await proposeFresh(actor.items.contents);
    const pair = await sourcePairFor(actor);
    const head = headPlanFor(actor, pair);
    const entriesByCat = Object.fromEntries(CATS.map((c) => [c.key, []]));
    const extrasByCat = Object.fromEntries(CATS.map((c) => [c.key, []]));
    let missingCount = 0;
    const sink = {
      use: (entry) => {
        const cat = catOf(entry.item?.type);
        entriesByCat[cat].push(entry);
        addTranslated('a', cat, entry.currentName(), entry.proposedName());
      },
      extra: (fb) => {
        extrasByCat[fb.cat].push(fb);
        addTranslated('a', fb.cat, fb.from, fb.to);
      },
      miss: (item, name, reason) => {
        addMissing('a', catOf(item?.type), name, actor.name, reason);
        missingCount += 1;
      },
    };
    const entryByItemId = new Map();
    for (const entry of (proposal?.entries ?? [])) {
      const id = entry.item?.id;
      if (id != null) entryByItemId.set(id, entry);
    }
    for (const item of actor.items.contents) {
      await classify(item, entryByItemId.get(item.id) ?? null, pair, sink, actor.name);
    }
    const effectChanges = [];
    if (effectApiOk) {
      for (const it of actor.items.contents) {
        try {
          for (const ch of await effectPlanFor(it)) {
            const lineId = aLineId('effekte', ch.from, ch.to);
            addTranslated('a', 'effekte', ch.from, ch.to);
            effectChanges.push({ itemId: ch.itemId, update: ch.update, lineId });
            diag(actor.name, it.name, `${ch.from} \u2192 "${ch.to}"`);
          }
        } catch (e) {
          entryErrors += 1;
          console.error(`Convert World | Effekt-Analyse fehlgeschlagen bei "${it.name}" (${actor.name})`, e);
        }
      }
    }
    let headCount = 0;
    if (head) {
      headCount = head.fields.length;
      for (const field of head.fields) {
        const label = HEAD_LABELS[field];
        const value = label === 'Beschreibung' ? '(deutscher Text)' : head.update[field];
        addTranslated('a', 'eigenschaften', `${actor.name} \u00b7 ${label}`, value);
      }
      diag(actor.name, actor.name, `Kopffelder: ${head.fields.map((f) => HEAD_LABELS[f]).join(', ')}`);
    }
    const itemCount = CATS.reduce((n, c) => n + entriesByCat[c.key].length + extrasByCat[c.key].length, 0);
    if (itemCount || headCount || missingCount || effectChanges.length) {
      plans.push({ id: actor.id, name: actor.name, actor, proposal, entriesByCat, extrasByCat, effectChanges, head, headCount, itemCount, missingCount });
    }
  };

  const collectWorld = async () => {
    const flagged = game.items.contents.filter(isAlreadyTranslated).length;
    if (flagged) diag('Welt-Items', '\u2013', `${flagged} bereits markierte Items werden erneut geprüft`);
    const proposal = await proposeFresh(game.items.contents);
    world.proposal = proposal;
    const sink = {
      use: (entry) => {
        world.items.push({ id: entry.item.id, from: entry.currentName(), to: entry.proposedName(), cat: catOf(entry.item?.type), entry, update: null });
      },
      extra: (fb) => {
        world.items.push({ id: fb.update._id, from: fb.from, to: fb.to, cat: fb.cat, entry: null, update: fb.update });
      },
      miss: (item, name, reason) => {
        addMissing('i', catOf(item?.type), name, null, reason);
      },
    };
    const entryByItemId = new Map();
    for (const entry of (proposal?.entries ?? [])) {
      const id = entry.item?.id;
      if (id != null) entryByItemId.set(id, entry);
    }
    for (const item of game.items.contents) {
      await classify(item, entryByItemId.get(item.id) ?? null, null, sink, 'Welt-Items');
    }
    if (effectApiOk) {
      for (const it of game.items.contents) {
        try {
          for (const ch of await effectPlanFor(it)) {
            world.items.push({ id: `${it.id}:eff:${ch.update._id}`, from: ch.from, to: ch.to, cat: 'effekte', entry: null, update: null, effect: { itemId: it.id, update: ch.update } });
            diag('Welt-Items', it.name, `${ch.from} \u2192 "${ch.to}"`);
          }
        } catch (e) {
          entryErrors += 1;
          console.error(`Convert World | Effekt-Analyse fehlgeschlagen bei "${it.name}" (Welt-Items)`, e);
        }
      }
    }
    const seenIds = new Set();
    world.items = world.items.filter((w) => {
      if (seenIds.has(w.id)) return false;
      seenIds.add(w.id);
      return true;
    });
  };

  for (const actor of game.actors.contents) {
    try {
      await collectActor(actor);
    } catch (e) {
      analyzeErrors += 1;
      console.error(`Convert World | Analyse fehlgeschlagen für Akteur "${actor.name}"`, e);
    }
  }
  try {
    await collectWorld();
  } catch (e) {
    analyzeErrors += 1;
    console.error('Convert World | Analyse der Welt-Items fehlgeschlagen', e);
  }

  if (DIAG.length) {
    console.groupCollapsed(`Convert World | Diagnose (${DIAG.length} Einträge)`);
    for (const line of DIAG) console.log(line);
    console.groupEnd();
  }

  const state = {
    actors: new Map(plans.map((p) => [p.id, true])),
    items: new Map(world.items.map((w) => [w.id, true])),
    catsA: Object.fromEntries(CATS.map((c) => [c.key, true])),
    catsI: Object.fromEntries(CATS.map((c) => [c.key, true])),
    linesA: new Map(),
    journal: false,
  };
  const lineOn = (id) => state.linesA.get(id) !== false;

  const headDisplay = (f, head) => (HEAD_LABELS[f] === 'Beschreibung' ? '(deutscher Text)' : head.update[f]);

  const catTotalA = (cat) => plans.reduce((n, p) => n + p.entriesByCat[cat].length + p.extrasByCat[cat].length + (cat === 'eigenschaften' ? p.headCount : 0) + (cat === 'effekte' ? p.effectChanges.length : 0), 0);
  const catTotalI = (cat) => world.items.filter((w) => w.cat === cat).length;
  const scopeMissing = (scope) => CATS.reduce((n, c) => n + [...catView[scope][c.key].missing.values()].reduce((a, v) => a + v.count, 0), 0);

  const actorUnits = function* () {
    for (const p of plans) {
      for (const c of CATS) {
        for (const e of p.entriesByCat[c.key]) yield { plan: p, cat: c.key, lineId: aLineId(c.key, e.currentName(), e.proposedName()) };
        for (const fb of p.extrasByCat[c.key]) yield { plan: p, cat: c.key, lineId: aLineId(c.key, fb.from, fb.to) };
      }
      if (p.head) for (const f of p.head.fields) yield { plan: p, cat: 'eigenschaften', lineId: aLineId('eigenschaften', `${p.name} \u00b7 ${HEAD_LABELS[f]}`, headDisplay(f, p.head)) };
      for (const ec of p.effectChanges) yield { plan: p, cat: 'effekte', lineId: ec.lineId };
    }
  };

  const totalSelected = () => {
    let n = 0;
    for (const u of actorUnits()) if (state.actors.get(u.plan.id) && state.catsA[u.cat] && lineOn(u.lineId)) n += 1;
    for (const w of world.items) if (state.items.get(w.id) && state.catsI[w.cat]) n += 1;
    return n;
  };

  const missingTotal = scopeMissing('a') + scopeMissing('i');
  const initialTotal = totalSelected();

  const pill = (n, bg, fg = '#fff') =>
    `<span style="display:inline-block;min-width:1.6em;text-align:center;padding:0 0.5em;margin-left:0.4em;border-radius:1em;background:${bg};color:${fg};font-size:0.85em;font-weight:bold;vertical-align:middle;">${n}</span>`;
  const statBox = (n, label, color) => `
    <div style="flex:1;text-align:center;border:1px solid rgba(0,0,0,0.25);border-radius:6px;padding:0.4rem 0.2rem;">
      <div style="font-size:1.4em;font-weight:bold;color:${color};line-height:1.2;">${n}</div>
      <div style="font-size:0.8em;opacity:0.8;">${label}</div>
    </div>`;
  const listBox = (inner, ml = '1.1rem') =>
    `<div style="margin:0.3rem 0 0.3rem ${ml};padding:0.35rem 0.55rem;border:1px solid rgba(0,0,0,0.25);border-radius:4px;font-size:0.92em;line-height:1.6;">${inner}</div>`;
  const bullet = (attrName, value, checked = true) =>
    `<input type="checkbox" class="arga-bullet" ${attrName}="${esc(value)}"${checked ? ' checked' : ''}>`;
  const catCheckbox = (attrName, value) =>
    `<input type="checkbox" ${attrName}="${esc(value)}" checked style="margin-right:0.45em;vertical-align:middle;">`;

  const groupSummary = (countText, missing) =>
    `<summary style="${TOP_SUMMARY_STYLE}">${countText}${pill(nWord(missing, 'Problem', 'Probleme'), missing > 0 ? RED : GREEN)}</summary>`;

  const missingList = (missingEntries) => missingEntries
    .map(([n, v]) => `<div>${esc(n)}${v.count > 1 ? ` <span style="opacity:0.55;">(\u00d7${v.count})</span>` : ''}${v.owners && v.owners.size ? ` <span style="opacity:0.6;">\u2013 ${esc([...v.owners].join(', '))}</span>` : ''}${v.reason ? `<br><span style="opacity:0.65;font-size:0.88em;">\u21b3 ${esc(v.reason)}</span>` : ''}</div>`)
    .join('');

  const missingBlock = (cat, scope, interactive) => {
    const view = catView[scope][cat.key];
    const missingEntries = [...view.missing.entries()].sort((a, b) => a[0].localeCompare(b[0], 'de'));
    const missingSum = missingEntries.reduce((n, [, v]) => n + v.count, 0);
    if (!missingSum) return { html: '', sum: 0 };
    const html = `<details style="margin-left:1.1rem;"${interactive ? '' : ' open'}>
          <summary style="cursor:pointer;color:${RED};">Keine passende Übersetzung gefunden (oder bereits übersetzt)${pill(missingSum, RED)}</summary>
          ${listBox(missingList(missingEntries), '0.9rem')}
        </details>`;
    return { html, sum: missingSum };
  };

  const renderActorCategory = (cat, interactive) => {
    const view = catView.a[cat.key];
    const total = catTotalA(cat.key);
    const miss = missingBlock(cat, 'a', interactive);
    if (!total && !miss.sum) return '';
    const lines = [...view.translations.values()]
      .sort((a, b) => a.from.localeCompare(b.from, 'de'))
      .map((t) => `<label style="cursor:pointer;display:block;padding:0.06rem 0;">${interactive ? bullet('data-arga-line', t.id) : ''}${esc(t.from)} <span style="opacity:0.55;">\u2192</span> <strong>${esc(t.to)}</strong>${t.count > 1 ? ` <span style="opacity:0.55;">(\u00d7${t.count})</span>` : ''}</label>`)
      .join('');
    const box = interactive && total ? catCheckbox('data-arga-cat', cat.key) : '';
    return `<details data-arga-acc="a">
      <summary style="cursor:pointer;padding:0.25rem 0;font-weight:bold;">${box}${cat.label}${pill(total, GREEN)}</summary>
      ${lines ? listBox(lines, '1.1rem') : ''}
    </details>${miss.html}`;
  };

  const renderItemCategory = (cat, interactive) => {
    const itemsOfCat = world.items.filter((w) => w.cat === cat.key).sort((a, b) => a.from.localeCompare(b.from, 'de'));
    const total = itemsOfCat.length;
    const miss = missingBlock(cat, 'i', interactive);
    if (!total && !miss.sum) return '';
    const lines = itemsOfCat
      .map((w) => `<label style="cursor:pointer;display:block;padding:0.06rem 0;">${interactive ? bullet('data-arga-item', w.id) : ''}${esc(w.from)} <span style="opacity:0.55;">\u2192</span> <strong>${esc(w.to)}</strong></label>`)
      .join('');
    const box = interactive && total ? catCheckbox('data-arga-icat', cat.key) : '';
    return `<details data-arga-acc="i">
      <summary style="cursor:pointer;padding:0.25rem 0;font-weight:bold;">${box}${cat.labelItems}${pill(total, GREEN)}</summary>
      ${lines ? listBox(lines, '1.1rem') : ''}
    </details>${miss.html}`;
  };

  const renderActorGroup = (interactive) => {
    const actorRows = plans.map((p) => {
      const b = interactive ? bullet('data-arga-actor', p.id) : '';
      const possible = p.itemCount + p.headCount + p.effectChanges.length;
      const counts = [`${nWord(possible, 'Übersetzung', 'Übersetzungen')} möglich`];
      if (p.missingCount) counts.push(`<span style="color:${RED};">${p.missingCount} gescheitert</span>`);
      return `<div style="display:flex;justify-content:space-between;gap:0.6rem;padding:0.1rem 0;">
        <label style="cursor:pointer;">${b}${esc(p.name)}</label>
        <span style="white-space:nowrap;font-size:0.9em;opacity:0.9;">${counts.join(' \u00b7 ')}</span>
      </div>`;
    }).join('');
    const rowsBlock = plans.length
      ? `<details data-arga-rows="a" open>
          <summary style="cursor:pointer;padding:0.2rem 0 0.1rem 0;font-weight:bold;opacity:0.85;">Akteursliste</summary>
          ${listBox(actorRows, '0.9rem')}
        </details>`
      : '<div style="opacity:0.7;">Keine Akteure mit offenen Übersetzungen.</div>';
    const open = !interactive || plans.length || scopeMissing('a') ? ' open' : '';
    return `<details${open} data-arga-acc="top">
      ${groupSummary(`-${plans.length}- ${word(plans.length, 'Akteur', 'Akteure')} gefunden`, scopeMissing('a'))}
      <div style="padding-left:1.5rem;">${rowsBlock}</div>
      <div style="padding-left:2.8rem;">${CATS.map((c) => renderActorCategory(c, interactive)).join('')}</div>
    </details>`;
  };

  const renderItemGroup = (interactive) => {
    const found = world.items.length + scopeMissing('i');
    const open = !interactive || (!plans.length && found) ? ' open' : '';
    const body = found
      ? CATS.map((c) => renderItemCategory(c, interactive)).join('')
      : '<div style="opacity:0.7;">Keine Welt-Items mit offenen Übersetzungen.</div>';
    return `<details${open} data-arga-acc="top">
      ${groupSummary(`-${found}- ${word(found, 'Item', 'Items')} gefunden`, scopeMissing('i'))}
      <div style="padding-left:1.5rem;">${body}</div>
    </details>`;
  };

  const renderReport = (interactive, withIntro) => `
    <div style="display:flex;flex-direction:column;gap:${GAP};">
      ${withIntro ? '<div>Dies ist zunächst nur eine Bestandsaufnahme. Es wurden noch <strong>keine Änderungen</strong> in der Welt vorgenommen. <strong>Bitte prüfe</strong> die vorgeschlagenen Übersetzungen und deaktiviere ggf. unpassende.<br><br><strong>HINWEIS:</strong> Wurde der Name eines Items verändert, ist eine Konvertierung nicht möglich. Ein individueller Beschreibungstext eines Items bleibt jedoch erhalten.</div>' : ''}
      <div style="display:flex;gap:0.5rem;">
        ${statBox(plans.length, `${word(plans.length, 'Akteur', 'Akteure')} gefunden`, 'inherit')}
        ${statBox(world.items.length, `${word(world.items.length, 'Item', 'Items')} gefunden`, 'inherit')}
        ${statBox(initialTotal, `${word(initialTotal, 'Übersetzung', 'Übersetzungen')} möglich`, GREEN)}
        ${statBox(missingTotal, `${word(missingTotal, 'Übersetzung', 'Übersetzungen')} gescheitert`, missingTotal ? RED : 'inherit')}
      </div>
      ${analyzeErrors || entryErrors ? `<div style="color:${RED};font-size:0.85em;">Analysefehler: ${analyzeErrors + entryErrors} (Details in der Konsole, F12)</div>` : ''}
      <hr style="width:100%;margin:0;">
      ${renderActorGroup(interactive)}
      ${renderItemGroup(interactive)}
    </div>`;

  if (!initialTotal) {
    await foundry.applications.api.DialogV2.wait({
      window: { title: TITLE },
      classes: ['arga-retranslate-dialog'],
      position: { width: 640 },
      content: `${renderReport(false, true)}<hr style="width:100%;margin:0.5rem 0;"><div style="text-align:center;">Es gibt nichts zu übersetzen.</div>`,
      buttons: [{ action: 'cancel', label: 'Schließen', default: true }],
      rejectClose: false,
    });
    return;
  }

  const content = `
    <div style="display:flex;flex-direction:column;gap:${GAP};">
      ${renderReport(true, true)}
      <hr style="width:100%;margin:0;">
      <label style="display:block;cursor:pointer;"><input type="checkbox" name="arga-journal" style="margin-right:0.4em;vertical-align:middle;">Ergebnis nach dem Übersetzen als Journaleintrag speichern</label>
      <div style="color:${RED};font-weight:bold;text-align:center;">Die Benutzung des Konverters erfolgt auf eigene Gefahr.<br>Bitte sicherheitshalber vorher ein BACKUP der Welt anlegen!</div>
    </div>
  `;

  const onRender = (app) => {
    const el = app?.element;
    if (!el?.classList?.contains('arga-retranslate-dialog')) return;
    Hooks.off('renderDialogV2', onRender);
    const STYLE_ID = 'arga-retranslate-style';
    if (!document.getElementById(STYLE_ID)) {
      const styleEl = document.createElement('style');
      styleEl.id = STYLE_ID;
      styleEl.textContent = `
.arga-retranslate-dialog input.arga-bullet{-webkit-appearance:none!important;-moz-appearance:none!important;appearance:none!important;box-sizing:border-box!important;width:13px!important;height:13px!important;min-width:13px!important;max-width:13px!important;min-height:13px!important;max-height:13px!important;aspect-ratio:1/1!important;flex:0 0 13px!important;font-size:13px!important;line-height:13px!important;margin:0 6px 0 0!important;padding:0!important;vertical-align:-2px!important;border:1px solid var(--color-text-primary,#222)!important;border-radius:50%!important;background:transparent!important;background-image:none!important;background-color:transparent!important;box-shadow:none!important;outline:none!important;cursor:pointer;position:relative;display:inline-block!important;}
.arga-retranslate-dialog input.arga-bullet::before{content:none!important;display:none!important;background:none!important;}
.arga-retranslate-dialog input.arga-bullet:checked{background:transparent!important;background-color:transparent!important;}
.arga-retranslate-dialog input.arga-bullet:checked::after{content:""!important;display:block!important;position:absolute!important;top:50%!important;left:50%!important;width:5px!important;height:5px!important;transform:translate(-50%,-50%)!important;border-radius:50%!important;background:var(--color-text-primary,#222)!important;}
.arga-retranslate-dialog .window-content{max-height:80vh;overflow-y:auto;padding-bottom:1.0rem;}
.arga-retranslate-dialog .dialog-buttons,.arga-retranslate-dialog .form-footer{margin-top:0!important;padding-top:0!important;}
.arga-retranslate-dialog details[data-arga-acc="top"]{margin:0!important;padding:0!important;}
.arga-retranslate-dialog details[data-arga-acc="top"][open]>div{margin:0 0 -0.3rem 0!important;}
.arga-retranslate-dialog details[data-arga-acc="top"]:not([open])>div{margin:0!important;}`;
      document.head.appendChild(styleEl);
    }
    const wc = el.querySelector('.window-content');
    if (wc) { wc.style.maxHeight = '80vh'; wc.style.overflowY = 'auto'; }
    const accGroups = new Map();
    for (const d of el.querySelectorAll('details[data-arga-acc]')) {
      const g = d.dataset.argaAcc;
      if (!accGroups.has(g)) accGroups.set(g, []);
      accGroups.get(g).push(d);
    }
    for (const list of accGroups.values()) {
      for (const d of list) {
        d.addEventListener('toggle', () => {
          if (!d.open) return;
          for (const other of list) if (other !== d && other.open) other.open = false;
        });
      }
    }
    const rowsA = el.querySelector('details[data-arga-rows="a"]');
    const catListA = accGroups.get('a') ?? [];
    if (rowsA && catListA.length) {
      for (const d of catListA) {
        d.addEventListener('toggle', () => {
          rowsA.open = !catListA.some((x) => x.open);
        });
      }
    }
    const applyBtn = el.querySelector('button[data-action="apply"]');
    const refresh = () => {
      const n = totalSelected();
      if (applyBtn) {
        applyBtn.textContent = `Jetzt übersetzen (${nWord(n, 'Änderung', 'Änderungen')})`;
        applyBtn.disabled = n === 0;
      }
    };
    const wire = (selector, handler) => {
      el.querySelectorAll(selector).forEach((cb) => {
        cb.addEventListener('click', (ev) => ev.stopPropagation());
        cb.addEventListener('change', () => { handler(cb); refresh(); });
      });
    };
    wire('input[data-arga-actor]', (cb) => state.actors.set(cb.dataset.argaActor, cb.checked));
    wire('input[data-arga-item]', (cb) => state.items.set(cb.dataset.argaItem, cb.checked));
    wire('input[data-arga-line]', (cb) => state.linesA.set(cb.dataset.argaLine, cb.checked));
    const wireCat = (selector, scope) => {
      el.querySelectorAll(selector).forEach((cb) => {
        cb.addEventListener('click', (ev) => ev.stopPropagation());
        cb.addEventListener('change', () => {
          const cat = scope === 'a' ? cb.dataset.argaCat : cb.dataset.argaIcat;
          if (scope === 'a') state.catsA[cat] = cb.checked;
          else state.catsI[cat] = cb.checked;
          const det = cb.closest('details[data-arga-acc]');
          if (det) {
            const childSel = scope === 'a' ? 'input[data-arga-line]' : 'input[data-arga-item]';
            det.querySelectorAll(childSel).forEach((child) => {
              child.checked = cb.checked;
              if (scope === 'a') state.linesA.set(child.dataset.argaLine, cb.checked);
              else state.items.set(child.dataset.argaItem, cb.checked);
            });
          }
          refresh();
        });
      });
    };
    wireCat('input[data-arga-cat]', 'a');
    wireCat('input[data-arga-icat]', 'i');
    const journalBox = el.querySelector('input[name="arga-journal"]');
    journalBox?.addEventListener('change', () => { state.journal = journalBox.checked; });
  };
  Hooks.on('renderDialogV2', onRender);

  let choice = null;
  try {
    choice = await foundry.applications.api.DialogV2.wait({
      window: { title: TITLE },
      classes: ['arga-retranslate-dialog'],
      position: { width: 640 },
      content,
      buttons: [
        { action: 'apply', label: `Jetzt übersetzen (${nWord(initialTotal, 'Änderung', 'Änderungen')})` },
        { action: 'cancel', label: 'Abbrechen', default: true },
      ],
      rejectClose: false,
    });
  } catch (e) {
    choice = null;
  } finally {
    Hooks.off('renderDialogV2', onRender);
  }
  if (choice !== 'apply') return;

  const HINT_SECONDS = 12;
  const startHint = ui.notifications.warn('Die Konvertierung benötigt etwas Zeit. Bitte warte auf die Abschlussmeldung.', { permanent: true });
  const clearStartHint = () => { try { ui.notifications.remove?.(startHint); } catch (e) {} };
  setTimeout(clearStartHint, HINT_SECONDS * 1000);

  let doneItems = 0;
  let doneHeads = 0;
  let doneEffects = 0;
  let applyErrors = 0;
  const processed = [];

  for (const plan of plans) {
    if (!state.actors.get(plan.id)) continue;
    const entries = [];
    const extras = [];
    for (const c of CATS) {
      if (!state.catsA[c.key]) continue;
      for (const e of plan.entriesByCat[c.key]) if (lineOn(aLineId(c.key, e.currentName(), e.proposedName()))) entries.push(e);
      for (const fb of plan.extrasByCat[c.key]) if (lineOn(aLineId(c.key, fb.from, fb.to))) extras.push(fb);
    }
    try {
      const updates = [
        ...(entries.length ? plan.proposal.updates(entries) : []),
        ...extras.map((e) => e.update),
      ];
      if (updates.length) {
        await plan.actor.updateEmbeddedDocuments('Item', updates);
        doneItems += updates.length;
      }
      let effDone = 0;
      if (state.catsA.effekte && plan.effectChanges.length) {
        const byItem = new Map();
        for (const ec of plan.effectChanges) {
          if (!lineOn(ec.lineId)) continue;
          const list = byItem.get(ec.itemId) ?? [];
          list.push(ec.update);
          byItem.set(ec.itemId, list);
        }
        for (const [itemId, ups] of byItem) {
          const it = plan.actor.items.get(itemId);
          if (!it) continue;
          await it.updateEmbeddedDocuments('ActiveEffect', ups);
          effDone += ups.length;
        }
        doneEffects += effDone;
      }
      let headDone = 0;
      if (plan.head && state.catsA.eigenschaften) {
        const selFields = plan.head.fields.filter((f) => lineOn(aLineId('eigenschaften', `${plan.name} \u00b7 ${HEAD_LABELS[f]}`, headDisplay(f, plan.head))));
        if (selFields.length) {
          const headUpdate = {};
          for (const f of selFields) headUpdate[f] = plan.head.update[f];
          await plan.actor.update(headUpdate);
          headDone = selFields.length;
          doneHeads += selFields.length;
        }
      }
      if (updates.length || headDone || effDone) processed.push(plan.name);
    } catch (e) {
      applyErrors += 1;
      console.error(`Convert World | Übersetzen fehlgeschlagen für "${plan.name}"`, e);
    }
  }

  const worldSel = world.items.filter((w) => state.items.get(w.id) && state.catsI[w.cat]);
  const worldNormal = worldSel.filter((w) => !w.effect);
  const worldEffects = worldSel.filter((w) => w.effect);
  if (worldNormal.length) {
    try {
      const wEntries = worldNormal.filter((w) => w.entry).map((w) => w.entry);
      const wUpdates = [
        ...(wEntries.length && world.proposal ? world.proposal.updates(wEntries) : []),
        ...worldNormal.filter((w) => w.update).map((w) => w.update),
      ];
      if (wUpdates.length) {
        await Item.updateDocuments(wUpdates);
        doneItems += wUpdates.length;
        processed.push('Welt-Items');
      }
    } catch (e) {
      applyErrors += 1;
      console.error('Convert World | Übersetzen der Welt-Items fehlgeschlagen', e);
    }
  }
  if (worldEffects.length) {
    try {
      const byItem = new Map();
      for (const w of worldEffects) {
        const list = byItem.get(w.effect.itemId) ?? [];
        list.push(w.effect.update);
        byItem.set(w.effect.itemId, list);
      }
      let effDone = 0;
      for (const [itemId, ups] of byItem) {
        const it = game.items.get(itemId);
        if (!it) continue;
        await it.updateEmbeddedDocuments('ActiveEffect', ups);
        effDone += ups.length;
      }
      if (effDone) {
        doneEffects += effDone;
        if (!processed.includes('Welt-Items')) processed.push('Welt-Items');
      }
    } catch (e) {
      applyErrors += 1;
      console.error('Convert World | Übersetzen der Welt-Item-Effekte fehlgeschlagen', e);
    }
  }

  let journalNote = '';
  if (state.journal) {
    try {
      const when = new Date().toLocaleString('de-DE');
      const journalHtml = `
        <p><strong>Akteure und Items konvertieren</strong> \u00b7 ${esc(when)}</p>
        <p>Übersetzt: ${nWord(doneItems, 'Item', 'Items')}, ${nWord(doneEffects, 'Effekt', 'Effekte')}, ${nWord(doneHeads, 'Akteur-Feld', 'Akteur-Felder')}${applyErrors ? ` \u00b7 Fehler: ${applyErrors}` : ''}</p>
        <p>Bearbeitete Akteure: ${esc(processed.join(', ') || 'keine')}</p>
        ${renderReport(false, false)}
      `;
      await JournalEntry.create({
        name: `Übersetzungsbericht ${when}`,
        pages: [{ name: 'Akteure und Items konvertieren', type: 'text', text: { content: journalHtml, format: CONST?.JOURNAL_ENTRY_PAGE_FORMATS?.HTML ?? 1 } }],
      });
      journalNote = ` \u00b7 Bericht "Übersetzungsbericht ${when}" im Journal abgelegt.`;
    } catch (e) {
      console.error('Convert World | Journaleintrag fehlgeschlagen', e);
    }
  }

  clearStartHint();
  const result = `Konvertierung abgeschlossen: ${nWord(doneItems, 'Item', 'Items')}, ${nWord(doneEffects, 'Effekt', 'Effekte')} und ${nWord(doneHeads, 'Akteur-Feld', 'Akteur-Felder')} übersetzt.${journalNote}`;
  if (applyErrors) {
    ui.notifications.warn(`${result} ${applyErrors} Fehler \u2013 Details in der Konsole (F12).`);
  } else {
    ui.notifications.warn(result);
  }
}

Hooks.once('init', () => {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = Object.assign(mod.api ?? {}, { convertWorld: argaConvertWorld });
});

class ArgaConvertSettingsMenu extends foundry.applications.api.ApplicationV2 {
  async render() {
    try {
      await argaConvertWorld();
    } catch (e) {
      console.error('Convert World | settings menu:', e);
    }
    return this;
  }
}

Hooks.once('init', () => {
  game.settings.registerMenu(MODULE_ID, 'convertWorldMenu', {
    name: 'Akteure und Items konvertieren',
    hint: 'Nach klicken des Buttons wird zunächst nur eine Bestandsaufnahme durchgeführt. Die Konvertierung erfolgt dann in einem nächsten Schritt.',
    label: 'Konvertieren',
    icon: 'fa-solid fa-language',
    type: ArgaConvertSettingsMenu,
    restricted: true,
  });
});

Hooks.once('ready', () => {
  try {
    if (sessionStorage.getItem(ARGA_CONVERT_RESUME_KEY) !== '1') return;
    sessionStorage.removeItem(ARGA_CONVERT_RESUME_KEY);
    if (game.user?.isGM) argaConvertWorld();
  } catch (e) {}
});
