const MODULE_ID = 'argas-swade-translation-german';
const ARGA_CONVERT_RESUME_KEY = 'argas-swade-run-convert';

// Manche Stellen werden erst zuordenbar, nachdem ein erster Durchlauf
// geschrieben hat - aus mehreren, voneinander unabhaengigen Gruenden. Der
// Konverter sieht deshalb nach dem Schreiben selbst nach, statt an der
// Sperrlogik zu drehen.
//
// optionen.runde      - 1 = normaler Start, >1 = automatische Nachpruefung
// optionen.abgewaehlt - in frueheren Runden Abgewaehltes; wird erneut
//                       abgewaehlt, sonst schriebe die Nachpruefung genau das,
//                       was der Spielleiter stehen lassen wollte
async function argaConvertWorld(optionen = {}) {
  if (!game.user.isGM) {
    ui.notifications.warn('Diese Funktion kann nur der Spielleiter ausführen.');
    return;
  }
  const RUNDE = Math.max(1, Number(optionen?.runde) || 1);
  const MAX_RUNDEN = 3;
  const VORAUSWAHL = optionen?.abgewaehlt ?? null;
  const babele = game.babele;
  if (!babele?.proposeActorTranslation || !babele?.sourceDataForUuid) {
    ui.notifications.error('Babele in Version 2.9 oder neuer wird benötigt.');
    return;
  }

  const TITLE = `Akteure und Items konvertieren: Englisch \u2192 Deutsch${RUNDE > 1 ? ` \u2013 Nachpr\u00fcfung (Runde ${RUNDE})` : ''}`;

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

  // Nur in Runde 1: in der Nachpruefung ist der Lauf bereits bestaetigt.
  if (RUNDE === 1) {
    const startChoice = await foundry.applications.api.DialogV2.wait({
      window: { title: TITLE },
      position: { width: 520 },
      content: '<div style="line-height:1.5;">Der Konverter wird zunächst eine Bestandsaufnahme der Welt vornehmen, <strong><em>ohne etwas zu verändern</em></strong>. Je nach Anzahl der vorhandenen Akteure und Items kann dies mehrere Minuten dauern.</div>',
      buttons: [
        { action: 'start', label: 'Starten', default: true },
        { action: 'cancel', label: 'Abbrechen' },
      ],
      rejectClose: false,
    });
    if (startChoice !== 'start') return;
  }

  try {
    const diag = babele.cacheDiagnostics?.();
    if (diag && !diag.dataLoaded) ui.notifications.info('Warte auf die Babele-Übersetzungen …');
    await babele.init?.();
  } catch (e) {}

  // Analyse und Schreiben werden getrennt gemessen: die Analysezeit entsteht
  // fast vollstaendig beim ersten Zugriff auf die Kompendien einer Sitzung.
  // performance ist ein Host-Objekt und in einer vm-Sandbox nicht zwingend da.
  const jetzt = () => (typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now());
  const ZEIT = { start: jetzt(), analyse: 0, anwenden: 0, teile: {} };
  const messeTeil = (name, fn) => {
    const t0 = jetzt();
    const fertig = () => { ZEIT.teile[name] = (ZEIT.teile[name] ?? 0) + (jetzt() - t0); };
    return Promise.resolve().then(fn).then(
      (v) => { fertig(); return v; },
      (e) => { fertig(); throw e; },
    );
  };
  const dauerText = (ms) => {
    if (!(ms > 0)) return '0 s';
    const s = ms / 1000;
    if (s < 90) return `${s.toFixed(1)} s`;
    // Erst runden, dann aufteilen - sonst zeigt 59:59,5 min als "59:60 min" an.
    const ganz = Math.round(s);
    return `${Math.floor(ganz / 60)}:${String(ganz % 60).padStart(2, '0')} min`;
  };

  // Standardwert aus einer Messung an einer grossen Welt (147 ms je Aenderung).
  // Weil das stark vom Rechner abhaengt, merkt sich der Konverter nach groesseren
  // Laeufen den selbst gemessenen Wert. localStorage ist ein Host-Objekt und im
  // Testrahmen nicht vorhanden, jeder Zugriff faellt auf den Standard zurueck.
  const MS_JE_AENDERUNG_STANDARD = 150;
  const TEMPO_KEY = 'arga-convert-ms-je-aenderung';
  const WARNSCHWELLE_MS = 120000;   // erst ab ~2 min fragen, sonst nervt es
  const TEMPO_MINDESTMENGE = 200;   // kleine Laeufe verzerren den Messwert
  const msJeAenderung = () => {
    try {
      const v = Number(globalThis.localStorage?.getItem(TEMPO_KEY));
      if (v > 0 && v < 5000) return v;
    } catch (e) {}
    return MS_JE_AENDERUNG_STANDARD;
  };
  const merkeTempo = (anzahl, ms) => {
    try {
      if (anzahl >= TEMPO_MINDESTMENGE && ms > 0) {
        globalThis.localStorage?.setItem(TEMPO_KEY, String(Math.round(ms / anzahl)));
      }
    } catch (e) {}
  };
  // Bewusst grob gerundet - genauer waere die Schaetzung ohnehin nicht.
  const schaetzText = (ms) => {
    const min = Math.round(ms / 60000);
    if (min < 1) return 'weniger als eine Minute';
    if (min === 1) return 'etwa eine Minute';
    if (min < 90) return `etwa ${min} Minuten`;
    const std = Math.round((ms / 3600000) * 2) / 2;
    return `etwa ${String(std).replace('.', ',')} Stunden`;
  };

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
  // Ein Feld, in dem bereits genau das steht, was geschrieben wuerde, darf gar
  // nicht erst angeboten werden - sonst bietet der Konverter es in JEDER Runde
  // erneut an. Byte-genauer Vergleich, geduldet wird nur EINE umschliessende
  // Absatzhuelle. Bewusst nicht ueber normText: das entfernt Tags und Links,
  // damit ginge eine hinzugekommene Formatierung verloren.
  const ohneAbsatzhuelle = (s) => {
    const t = String(s ?? '').trim();
    const m = /^<p>([\s\S]*)<\/p>$/i.exec(t);
    if (!m || /<\/p>/i.test(m[1])) return t;   // mehrere Absaetze: unangetastet
    return m[1].trim();
  };
  const bereitsGesetzt = (cv, tv) => cv === tv || ohneAbsatzhuelle(cv) === ohneAbsatzhuelle(tv);
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
    // Archetyp-Freitext im Bogen-Kopf; in den Packs ein direktes Eintrags-Feld,
    // pair.translated traegt also die deutsche Fassung.
    'system.details.archetype': 'Archetyp',
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

  // Babeles sourceDataForUuid liefert fuer UEBERSETZTE Pack-Dokumente nicht das
  // englische Original, sondern die deutsche Fassung samt Schnappschuss in
  // flags.babele.originalPayload. Erst rollbackDocument stellt daraus die
  // englischen Werte aller gemappten Felder wieder her.
  const enSourceForUuid = async (uuid, docType) => {
    let raw = null;
    try { raw = await babele.sourceDataForUuid(uuid); } catch (e) {}
    if (!raw) return null;
    if (!raw.flags?.babele?.originalPayload) return raw;
    try {
      const rolled = babele.rollbackDocument?.(docType, raw, { pack: collectionFromUuid(uuid) });
      if (rolled && typeof rolled === 'object') return rolled;
    } catch (e) {}
    // Die deutsche Fassung nie als Original ausgeben - lieber keine Quelle.
    return null;
  };

  const pairCache = new Map();
  const pairForUuid = async (uuid) => {
    if (pairCache.has(uuid)) return pairCache.get(uuid);
    let pair = null;
    const parts = String(uuid).split('.');
    if (parts.length >= 4 && isTranslatedCollection(`${parts[1]}.${parts[2]}`)) {
      try {
        const translated = (await fromUuid(uuid))?.toObject?.() ?? null;
        // Erst die Synthese Dokument fuer Dokument (stellt auch die Namen der
        // eingebetteten Items her), dann der Rollback als Rueckfall fuer
        // unuebersetzte Packs ohne Schnappschuesse.
        const original = (translated ? enActorFromTranslated(translated) : null) ?? await enSourceForUuid(uuid, 'Actor');
        if (translated && original) pair = { translated, original };
      } catch (e) {}
    }
    pairCache.set(uuid, pair);
    return pair;
  };

  // Englische Fassung eines uebersetzten Akteurs zusammensetzen: Babele haengt
  // an JEDES uebersetzte Dokument - auch an eingebettete Items und Effekte -
  // einen eigenen Schnappschuss seiner englischen Werte. Der wird hier Dokument
  // fuer Dokument auf eine Kopie der deutschen Fassung zurueckgespielt. Damit
  // ist gleichgueltig, wie der Sammel-Schnappschuss des Elterndokuments
  // geschluesselt ist; der Dokument-Rollback erreicht verschachtelte Dokumente
  // ohnehin nicht.
  const enActorFromTranslated = (deActor) => {
    if (!deActor || typeof deActor !== 'object') return null;
    const orig = foundry.utils.deepClone(deActor);
    const put = (obj, path, v) => { if (obj && typeof v === 'string' && v.length) foundry.utils.setProperty(obj, path, v); };
    let n = 0;
    const top = orig.flags?.babele?.originalPayload ?? null;
    if (top && typeof top === 'object') {
      put(orig, 'name', top.name);
      put(orig, 'prototypeToken.name', top.tokenName);
      put(orig, 'system.details.biography.value', top.description);
      n += 1;
    }
    for (const it of (orig.items ?? [])) {
      const p = it?.flags?.babele?.originalPayload ?? null;
      if (p && typeof p === 'object') {
        put(it, 'name', p.name);
        put(it, 'system.description', p.description);
        n += 1;
      }
      for (const ef of (it?.effects ?? [])) {
        const q = ef?.flags?.babele?.originalPayload ?? null;
        if (!q || typeof q !== 'object') continue;
        put(ef, 'name', q.name);
        put(ef, 'description', q.description);
        n += 1;
      }
    }
    for (const ef of (orig.effects ?? [])) {
      const p = ef?.flags?.babele?.originalPayload ?? null;
      if (!p || typeof p !== 'object') continue;
      put(ef, 'name', p.name);
      put(ef, 'description', p.description);
      n += 1;
    }
    return n ? orig : null;
  };

  let adventureIndexPromise = null;
  const adventureIndex = () => {
    adventureIndexPromise ??= messeTeil('Abenteuer-Kompendien laden', async () => {
      const map = new Map();
      for (const pack of game.packs) {
        if (pack.metadata?.type !== 'Adventure') continue;
        const collection = pack.collection ?? pack.metadata?.id;
        if (!isTranslatedCollection(collection)) continue;
        let docs = [];
        try { docs = await pack.getDocuments(); } catch (e) { continue; }
        for (const adv of docs) {
          let translated = adv?.toObject?.() ?? null;
          if (!translated) continue;
          // Foundry laedt Kompendium-Dokumente einmal je Sitzung. War die
          // Babele-Uebersetzung dabei nicht greifbar, haengt bis zum Neustart
          // die englische Fassung ohne Schnappschuesse im Zwischenspeicher und
          // der Abenteuer-Index bleibt leer. Deshalb hier selbst uebersetzen.
          if (translated.flags?.babele?.translated !== true) {
            try {
              const frisch = babele.translate(collection, translated, false);
              if (frisch && frisch !== translated && frisch.flags?.babele) translated = frisch;
            } catch (e) {}
          }
          for (const deActor of (translated.actors ?? [])) {
            if (!deActor?._id || map.has(deActor._id)) continue;
            const original = enActorFromTranslated(deActor);
            if (original) map.set(deActor._id, { original, translated: deActor });
          }
        }
      }
      return map;
    });
    return adventureIndexPromise;
  };
  const adventurePairFor = async (doc) => {
    // Zuerst die EIGENE ID des Welt-Akteurs: der Abenteuer-Import uebernimmt
    // die IDs unveraendert, das ist die exakte Identitaet. Dann eine
    // abenteuerinterne Quelle "Actor.<id>". Der Kompendium-Verweis ist
    // nachrangig - er zeigt oft nur auf die Vorlage, aus der die Autoren ihren
    // Akteur gebaut und dann umbenannt haben.
    const kandidaten = [];
    if (typeof doc?.id === 'string' && doc.id.length) kandidaten.push(doc.id);
    const raw = doc?._stats?.compendiumSource ?? doc?.flags?.core?.sourceId ?? null;
    const m = typeof raw === 'string' ? raw.match(/^Actor\.([A-Za-z0-9]{16})$/) : null;
    if (m && !kandidaten.includes(m[1])) kandidaten.push(m[1]);
    if (!kandidaten.length) return null;
    try {
      const idx = await adventureIndex();
      for (const id of kandidaten) {
        const pair = idx.get(id);
        if (pair) return pair;
      }
    } catch (e) {}
    return null;
  };
  const sourcePairFor = async (doc) => {
    // Abenteuer-Zuordnung zuerst: sie traegt Namen und Items der tatsaechlich
    // importierten Fassung. Der Kompendium-Verweis bleibt Rueckfall.
    const advPair = await adventurePairFor(doc);
    if (advPair) return advPair;
    const uuid = sourceUuidOf(doc);
    return uuid ? pairForUuid(uuid) : null;
  };

  // Effekte kommen zuerst aus dem uebersetzten Quell-Kompendium des Items
  // (Zuordnung ueber die Effekt-ID). Die Tabelle dieses Moduls ist nur Rueckfall
  // fuer Items ohne uebersetzte Quelle: Schwestermodule uebersetzen gleichnamige
  // Effekte teils anders, und die Tabelle kennt nur die GRW-Effekte.
  const argaApi = game.modules.get('argas-swade-translation-german')?.api ?? null;
  const effectApiOk = !!(argaApi?.resolveEffectDescriptionFor && argaApi?.effectTranslations);
  if (!effectApiOk) ui.notifications.warn('Effekt-Tabelle des Übersetzungsmoduls nicht gefunden – Effekte werden allein aus den Kompendien übersetzt.');

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
        // en darf nie die deutsche Fassung sein (siehe enSourceForUuid) -
        // notfalls null, dann greifen die Namens-/Tabellen-Rueckfaelle.
        const en = await enSourceForUuid(uuid, 'Item');
        if (en || de) res = { en, de };
      } catch (e) {}
    }
    effDocCache.set(uuid, res);
    return res;
  };

  // Verliehene Items haben KEINE Kompendium-Quelle: SWADE legt bei
  // system.grants eine Kopie an, deren _stats.compendiumSource null bleibt; das
  // verleihende Item merkt sich die erzeugten IDs in flags.swade.hasGranted.
  // Dieser Rueckfall rekonstruiert die Quelle ueber die Verleih-Kette - Traeger
  // am selben Akteur suchen, dessen grants[].uuid laden, ueber den englischen
  // Namen zuordnen. Nur bei genau einem Treffer.
  const grantUuidCache = new Map();
  const grantUuidFor = async (item) => {
    const actor = item?.parent;
    if (!actor?.items?.contents || !item?.id) return null;
    const cacheKey = `${actor.id ?? '?'}.${item.id}`;
    if (grantUuidCache.has(cacheKey)) return grantUuidCache.get(cacheKey);
    const kandidaten = new Set();
    for (const traeger of actor.items.contents) {
      const verliehen = traeger?.flags?.swade?.hasGranted;
      if (!Array.isArray(verliehen) || !verliehen.includes(item.id)) continue;
      for (const g of (traeger?.system?.grants ?? [])) {
        if (typeof g?.uuid === 'string' && g.uuid.startsWith('Compendium.')) kandidaten.add(g.uuid);
      }
    }
    let treffer = null;
    if (kandidaten.size) {
      const enName = item?.flags?.babele?.originalName ?? null;
      const gefunden = [];
      for (const uuid of kandidaten) {
        // effDocsFor statt fromUuid: liefert die Daten-Fassung und nutzt
        // denselben Zwischenspeicher.
        const docs = await effDocsFor(uuid);
        const de = docs?.de ?? null;
        if (!de) continue;
        const docEn = de.flags?.babele?.originalName
          ?? de.flags?.babele?.originalPayload?.name
          ?? docs?.en?.name
          ?? null;
        const passt = (enName && docEn && docEn === enName)
          || (enName && de.name === enName)
          || (de.name && de.name === item.name);
        if (passt) gefunden.push(uuid);
      }
      if (gefunden.length === 1) treffer = gefunden[0];
    }
    grantUuidCache.set(cacheKey, treffer);
    return treffer;
  };

  // Quell-Fassungen (englisch/deutsch) eines Welt-Items: Kompendium-Quelle
  // zuerst, dann das Quellpaar des Akteurs, zuletzt die Verleih-Kette.
  const docsForItem = async (item, pair = null) => {
    const uuid = sourceUuidOf(item);
    const ausQuelle = uuid ? await effDocsFor(uuid) : null;
    if (ausQuelle) return ausQuelle;
    const ausPaar = pairItemDocsFor(item, pair);
    if (ausPaar) return ausPaar;
    const grantUuid = await grantUuidFor(item);
    return grantUuid ? await effDocsFor(grantUuid) : null;
  };

  const effectPlanFor = async (item, pair = null) => {
    const effects = item.effects?.contents ?? [];
    if (!effects.length) return [];
    const docs = await docsForItem(item, pair);
    const enById = new Map((docs?.en?.effects ?? []).map((e) => [e._id, e]));
    // Uebersetzte Fassung desselben Eintrags: gleiche Effekt-IDs, Texte bereits
    // von Babele uebersetzt. Primaere Quelle fuer deutsche Effekt-Texte.
    const deById = new Map((docs?.de?.effects ?? []).map((e) => [e._id, e]));
    const parentDesc = (typeof docs?.de?.system?.description === 'string' && docs.de.system.description.length)
      ? docs.de.system.description
      : null;
    const changes = [];
    for (const eff of effects) {
      let enEff = enById.get(eff.id) ?? null;
      if (!enEff && docs?.en?.effects?.length) {
        const cand = docs.en.effects.filter((e) => e.name === eff.name || (argaApi?.effectTranslations?.[e.name] ?? null) === eff.name);
        if (cand.length === 1) enEff = cand[0];
      }
      const deEff = deById.get(enEff?._id ?? eff.id) ?? null;
      // Die uebersetzte Pack-Fassung traegt an JEDEM Effekt einen eigenen
      // Schnappschuss des englischen Originals. Das ist hier die einzige
      // verlaessliche EN-Referenz: der Rollback in docs.en stellt eingebettete
      // Effekte nicht zurueck, ein Vergleich damit waere deutsch gegen deutsch.
      const deFlags = deEff?.flags?.babele ?? null;
      const deOrigName = (typeof deFlags?.originalName === 'string' && deFlags.originalName.length)
        ? deFlags.originalName
        : (typeof deFlags?.originalPayload?.name === 'string' && deFlags.originalPayload.name.length)
          ? deFlags.originalPayload.name
          : null;
      const enRef = deOrigName ?? enEff?.name ?? null;
      const enName = enRef
        ?? (argaApi?.effectTranslations?.[eff.name] ? eff.name : null)
        ?? effNameReverse.get(eff.name)
        ?? null;
      const update = { _id: eff.id };
      let n = 0;
      // Nur uebernehmen, wenn dort wirklich uebersetzt wurde.
      const dePackName = (typeof deEff?.name === 'string' && deEff.name.length && enRef && deEff.name !== enRef)
        ? deEff.name
        : null;
      const deName = dePackName ?? (enName ? (argaApi?.effectTranslations?.[enName] ?? null) : null);
      if (deName && eff.name !== deName && eff.name === enName) {
        update.name = deName;
        n += 1;
      } else if (dePackName && eff.name !== dePackName && eff.name !== enRef) {
        // Passt weder zum englischen Original noch zur deutschen Fassung -
        // vermutlich von Hand geaendert, deshalb melden statt auslassen.
        changes.push({ miss: { name: `Effekt: ${eff.name}`, reason: `weicht vom englischen Original "${enRef}" ab – nicht angefasst` } });
        continue;
      } else if (!enRef && deEff && typeof deEff.name === 'string' && deEff.name.length && deEff.name !== eff.name && !deName) {
        // Uebersetzung vorhanden, aber kein Schnappschuss - ausweisen.
        changes.push({ miss: { name: `Effekt: ${eff.name}`, reason: 'englisches Original nicht rekonstruierbar – bitte manuell pruefen' } });
        continue;
      }
      // Ebenfalls zuerst aus dem uebersetzten Kompendium, sonst Tabelle.
      const enDesc = (typeof deFlags?.originalPayload?.description === 'string' && deFlags.originalPayload.description.length)
        ? deFlags.originalPayload.description
        : (typeof enEff?.description === 'string' ? enEff.description : null);
      const dePackDesc = (typeof deEff?.description === 'string' && deEff.description.length && deEff.description !== (enDesc ?? ''))
        ? deEff.description
        : null;
      const target = dePackDesc ?? (effectApiOk ? argaApi.resolveEffectDescriptionFor(eff.id, enName, parentDesc) : null);
      const cur = typeof eff.description === 'string' ? eff.description : '';
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

  // Auswahl-Pakete (system.choiceSets) sind ein Array und fallen deshalb durch
  // den Feld-Abgleich, der Ziffern-Pfade ueberspringt. Uebernommen werden nur
  // Text-Felder, deren aktueller Wert noch dem englischen Original entspricht;
  // Mechanik und Auswahl-Status bleiben unberuehrt. Rueckgabe: { update } bei
  // Aenderungen, { reason } bei bewusster Auslassung, sonst null.
  const csWalk = (node, path, strings, struct) => {
    if (Array.isArray(node)) {
      struct.push(`${path}#${node.length}`);
      node.forEach((v, i) => csWalk(v, `${path}.${i}`, strings, struct));
    } else if (node && typeof node === 'object') {
      for (const [k, v] of Object.entries(node)) csWalk(v, `${path}.${k}`, strings, struct);
    } else if (typeof node === 'string') {
      strings.set(path, node);
    }
  };
  const csIndex = (arr) => {
    const strings = new Map();
    const struct = [];
    csWalk(arr, 'cs', strings, struct);
    return { strings, struct: struct.sort().join('|') };
  };
  // Uebersetzte Item-Kompendien als "Spender" fuer die Auswahl-Paket-
  // Woerterbuecher (einmal je Lauf ermittelt, alphabetisch stabil).
  let donorCollectionsPromise = null;
  const donorCollections = () => {
    donorCollectionsPromise ??= (async () => {
      const liste = [];
      for (const pack of game.packs) {
        if (pack.metadata?.type !== 'Item') continue;
        const collection = pack.collection ?? pack.metadata?.id;
        if (isTranslatedCollection(collection)) liste.push(collection);
      }
      return liste.sort((a, b) => a.localeCompare(b));
    })();
    return donorCollectionsPromise;
  };
  const choicePlanFor = async (item, pair = null) => {
    const cur = item.system?.choiceSets;
    if (!Array.isArray(cur) || !cur.length) return null;
    const uuid = sourceUuidOf(item);
    // Die Woerterbuch-Converter der Module direkt auf die AKTUELLE Fassung des
    // Welt-Items anwenden. Das braucht kein rekonstruiertes englisches Original
    // - noetig, weil der Schnappschuss fuer Converter-Felder leer ist. Sie
    // ersetzen nur exakt bekannte englische Texte, alles andere bleibt stehen.
    // Da sie dank usesConverters auch ohne eigenen Uebersetzungseintrag laufen,
    // werden Items ohne verwertbare Quelle durch die Woerterbuecher ALLER
    // uebersetzten Item-Kompendien gereicht ("Spender").
    const ownCollection = uuid ? collectionFromUuid(uuid) : null;
    const kette = [ownCollection, ...(await donorCollections()).filter((c) => c !== ownCollection)]
      .filter((c) => c && isTranslatedCollection(c));
    if (kette.length) {
      try {
        let arbeit = cur;
        let geaendert = 0;
        for (const collection of kette) {
          const obj = item.toObject();
          obj.system = obj.system ?? {};
          obj.system.choiceSets = foundry.utils.deepClone(arbeit);
          const delta = babele.translate(collection, obj, true);
          const deSets = (delta && delta !== obj) ? foundry.utils.getProperty(delta, 'system.choiceSets') : null;
          if (!Array.isArray(deSets)) continue;
          const vi = csIndex(arbeit);
          const ni = csIndex(deSets);
          if (vi.struct !== ni.struct) continue;
          let n = 0;
          for (const [p, nv] of ni.strings) if (vi.strings.get(p) !== nv) n += 1;
          if (n) { arbeit = deSets; geaendert += n; }
        }
        if (geaendert) return { update: { _id: item.id, 'system.choiceSets': arbeit }, count: geaendert };
        // Kein Woerterbuch kannte einen einzigen Text - dann ist nichts
        // erkennbar Englisches mehr da: schon deutsch, durch die Mutation
        // umgebaut oder Handtext. Der Pack-Vergleich unten kann das Original
        // hier nicht rekonstruieren und meldete deshalb Fehlalarme.
        return null;
      } catch (e) {}
    }
    const docs = await docsForItem(item, pair);   // inkl. Verleih-Kette
    if (!docs) return { reason: 'Auswahl-Paket: keine Kompendium-Quelle' };
    const en = docs.en?.system?.choiceSets;
    const de = docs.de?.system?.choiceSets;
    if (!Array.isArray(en) || !Array.isArray(de)) return { reason: 'Auswahl-Paket: Quelle nicht übersetzt oder ohne Auswahl-Paket' };
    const ci = csIndex(cur);
    const ei = csIndex(en);
    const di = csIndex(de);
    // Gleiche EN- und DE-Fassung heisst: kein rekonstruierbares Original oder
    // keine Uebersetzung. Dann laesst sich nichts verlaesslich pruefen.
    if (ei.struct === di.struct) {
      let enDeGleich = ei.strings.size === di.strings.size;
      if (enDeGleich) for (const [p, ev] of ei.strings) { if (di.strings.get(p) !== ev) { enDeGleich = false; break; } }
      if (enDeGleich) {
        let curGleich = ci.struct === di.struct && ci.strings.size === di.strings.size;
        if (curGleich) for (const [p, dv] of di.strings) { if (normText(ci.strings.get(p) ?? '') !== normText(dv)) { curGleich = false; break; } }
        if (curGleich) return null;
        return { reason: 'Auswahl-Paket: englisches Original nicht rekonstruierbar – bitte manuell prüfen' };
      }
    }
    if (ei.struct !== di.struct) return { reason: 'Auswahl-Paket: Übersetzung strukturell abweichend – nicht angefasst' };
    if (ci.struct !== ei.struct) return { reason: 'Auswahl-Paket: Aufbau weicht vom Original ab (verändert?) – nicht angefasst' };
    for (const [p, ev] of ei.strings) {
      const cv = ci.strings.get(p);
      if (typeof cv !== 'string') return { reason: 'Auswahl-Paket: Aufbau weicht vom Original ab (verändert?) – nicht angefasst' };
      const dv = di.strings.get(p);
      // Unveraendert englisch oder bereits deutsch ist in Ordnung – alles
      // andere ist eine Handaenderung, dann Finger weg vom ganzen Paket.
      if (normText(cv) !== normText(ev) && !(typeof dv === 'string' && normText(cv) === normText(dv))) {
        return { reason: 'Auswahl-Paket: Texte wurden verändert – nicht angefasst' };
      }
    }
    const wrap = { cs: foundry.utils.deepClone(cur) };
    let n = 0;
    for (const [p, dv] of di.strings) {
      const ev = ei.strings.get(p);
      if (typeof ev !== 'string' || dv === ev) continue;
      const cv = ci.strings.get(p);
      if (typeof cv !== 'string' || cv === dv) continue;
      foundry.utils.setProperty(wrap, p, dv);
      n += 1;
    }
    if (!n) return null;
    return { update: { _id: item.id, 'system.choiceSets': wrap.cs }, count: n };
  };

  // Aktions-Texte, Notizen und Statblock-Werte werden in den Packs von
  // WOERTERBUCH-Convertern uebersetzt. Fuer solche Felder ist der
  // Original-Schnappschuss leer - der Feld-Abgleich unten saehe "Sm" (Welt)
  // gegen "Verstand" (vermeintliches Original) und hielte das fuer eine
  // Handaenderung. Loesung wie bei den Auswahl-Paketen: die aktuelle Fassung
  // direkt durch die Woerterbuecher aller uebersetzten Item-Packs schicken, die
  // nur exakt bekannte englische Texte ersetzen.
  //
  // WICHTIG: Jedes Converter-Feld ohne extract MUSS in einer dieser Listen (oder
  // in einem eigenen Plan) stehen; die Feld-Inventur des Testrahmens prueft das
  // bei jedem Lauf maschinell.
  const STAT_FELDER = ['system.rank', 'system.range', 'system.duration', 'system.trapping',
    'system.category', 'system.source', 'system.ammo', 'system.arcane'];
  // Array-Felder: die Converter aendern nur Text-Teile, die Struktur bleibt.
  // Uebernommen wird nur bei gleicher Laenge.
  const ARRAY_FELDER = ['system.requirements', 'system.grants', 'system.charges.charges'];
  const actionsNotesPlanFor = async (item) => {
    const src = item.toObject();
    const curActions = src.system?.actions ?? null;
    const curNotes = typeof src.system?.notes === 'string' && src.system.notes.length ? src.system.notes : null;
    const curTrait = typeof curActions?.trait === 'string' && curActions.trait.length ? curActions.trait : null;
    const addIds = Object.keys(curActions?.additional ?? {});
    const curStat = {};
    for (const f of STAT_FELDER) {
      const v = foundry.utils.getProperty(src, f);
      if (typeof v === 'string' && v.length) curStat[f] = v;
    }
    const statFelder = Object.keys(curStat);
    const curArr = {};
    for (const f of ARRAY_FELDER) {
      const v = foundry.utils.getProperty(src, f);
      if (Array.isArray(v) && v.length) curArr[f] = v;
    }
    const arrFelder = Object.keys(curArr);
    if (curTrait == null && curNotes == null && !addIds.length && !statFelder.length && !arrFelder.length) return null;
    const uuid = sourceUuidOf(item);
    const ownCollection = uuid ? collectionFromUuid(uuid) : null;
    const kette = [ownCollection, ...(await donorCollections()).filter((c) => c !== ownCollection)]
      .filter((c) => c && isTranslatedCollection(c));
    if (!kette.length) return null;
    let trait = curTrait;
    let notes = curNotes;
    const stat = { ...curStat };
    const arr = {};
    for (const f of arrFelder) arr[f] = foundry.utils.deepClone(curArr[f]);
    const addWerte = {};
    for (const id of addIds) {
      const a = curActions.additional[id] ?? {};
      addWerte[id] = {
        name: typeof a.name === 'string' ? a.name : null,
        override: typeof a.override === 'string' ? a.override : null,
        description: typeof a.description === 'string' ? a.description : null,
      };
    }
    let n = 0;
    // Je Feld entscheidet der erste Spender der Kette, der es TATSAECHLICH
    // AENDERT. Ohne die Sperre ueberschriebe ein spaeterer Spender mit eigenem
    // Eintrag zum gleichnamigen Dokument den Wert des eigenen Packs; wo zwei
    // Module verschieden uebersetzen, pendelte das Feld je Lauf hin und her.
    //
    // NIE auf "geliefert" sperren, immer nur auf "geaendert": Viele
    // Woerterbuch-Converter geben Unbekanntes per `map[x] ?? x` unveraendert
    // zurueck. Weil die GRW-Packs in der alphabetischen Kette vor den uebrigen
    // stehen, wuerde ein solches Echo den ENGLISCHEN Wert festsperren, bevor das
    // zustaendige Woerterbuch drankommt - und kein weiterer Lauf koennte das
    // noch heilen, weil der Bericht "0 offen" meldet.
    const fest = new Set();
    // Zuerst die EIGENE Pack-Fassung ueber die Quell-ID: sie ist die gepflegte
    // Uebersetzung genau dieses Dokuments. Die Spender-Kette unten erreicht
    // ID-geschluesselte Eintraege nicht, ohne diesen Schritt gewaenne ein
    // namensgeschluesselter Fremdeintrag zum gleichnamigen Dokument.
    try {
      const eigene = uuid ? await effDocsFor(uuid) : null;
      const basis = eigene?.en ?? eigene?.de ?? null;
      // Uebersetzung des QUELLDOKUMENTS: traegt die Pack-ID, findet also auch
      // ID-geschluesselte Eintraege - dieselbe Quelle wie uuidFields, damit
      // beide Wege denselben Wert schreiben.
      const deltaEigen = (basis && ownCollection && isTranslatedCollection(ownCollection))
        ? babele.translate(ownCollection, basis, true)
        : null;
      if (deltaEigen && deltaEigen !== basis) {
        const uebernimm = (schluessel, pfad, aktuell, setze) => {
          if (fest.has(schluessel)) return;
          const dv = foundry.utils.getProperty(deltaEigen, pfad);
          if (typeof dv !== 'string' || !dv.length) return;
          if (dv !== aktuell) { setze(dv); n += 1; }
          fest.add(schluessel);
        };
        if (trait != null) uebernimm('trait', 'system.actions.trait', trait, (v) => { trait = v; });
        for (const id of addIds) {
          const w = addWerte[id];
          if (w.name != null) uebernimm(`add.${id}.name`, `system.actions.additional.${id}.name`, w.name, (v) => { w.name = v; });
          if (w.override != null) uebernimm(`add.${id}.override`, `system.actions.additional.${id}.override`, w.override, (v) => { w.override = v; });
          if (w.description != null) uebernimm(`add.${id}.description`, `system.actions.additional.${id}.description`, w.description, (v) => { w.description = v; });
        }
        if (notes != null) uebernimm('notes', 'system.notes', notes, (v) => { notes = v; });
        for (const f of statFelder) uebernimm(`stat.${f}`, f, stat[f], (v) => { stat[f] = v; });
        // ARRAY-Felder bewusst NICHT aus der Pack-Fassung uebernehmen: die
        // Woerterbuch-Converter reichern sie an, die rohe Pack-Fassung fuehrt
        // diese Zusaetze nicht - eine Uebernahme wuerde sie entfernen. Arrays
        // bleiben Sache der Spender-Kette unten.
      }
    } catch (e) {}
    try {
      for (const collection of kette) {
        const obj = item.toObject();
        // Eintrags-Zuordnung neutralisieren: die Kette soll ausschliesslich die
        // WOERTERBUCH-Converter anwenden - die laufen dank usesConverters auch
        // ohne Eintrag, ersetzen nur exakt bekannte englische Texte und sind
        // damit idempotent. Mit Identitaet faende ein namensgeschluesselter
        // Fremdeintrag zum gleichnamigen Dokument seine Eintragswerte und
        // schriebe bereits uebersetzte Felder bei jedem Lauf um.
        delete obj._id;
        obj.name = '␀spender-stub␀';
        if (obj.flags?.babele) delete obj.flags.babele;
        obj.system = obj.system ?? {};
        if (obj.system.actions) {
          if (trait != null) obj.system.actions.trait = trait;
          for (const id of addIds) {
            const ziel = obj.system.actions.additional?.[id];
            if (!ziel) continue;
            const w = addWerte[id];
            if (w.name != null) ziel.name = w.name;
            if (w.override != null) ziel.override = w.override;
            if (w.description != null) ziel.description = w.description;
          }
        }
        if (notes != null) obj.system.notes = notes;
        for (const f of statFelder) foundry.utils.setProperty(obj, f, stat[f]);
        for (const f of arrFelder) foundry.utils.setProperty(obj, f, foundry.utils.deepClone(arr[f]));
        const delta = babele.translate(collection, obj, true);
        if (!delta || delta === obj) continue;
        const dTrait = foundry.utils.getProperty(delta, 'system.actions.trait');
        if (trait != null && !fest.has('trait') && typeof dTrait === 'string' && dTrait.length) {
          if (dTrait !== trait) { trait = dTrait; n += 1; fest.add('trait'); }
        }
        const dAdd = foundry.utils.getProperty(delta, 'system.actions.additional');
        if (dAdd && typeof dAdd === 'object') {
          for (const id of addIds) {
            const da = dAdd[id];
            const w = addWerte[id];
            if (!da || !w) continue;
            if (w.name != null && !fest.has(`add.${id}.name`) && typeof da.name === 'string' && da.name.length) {
              if (da.name !== w.name) { w.name = da.name; n += 1; fest.add(`add.${id}.name`); }
            }
            if (w.override != null && !fest.has(`add.${id}.override`) && typeof da.override === 'string' && da.override.length) {
              if (da.override !== w.override) { w.override = da.override; n += 1; fest.add(`add.${id}.override`); }
            }
            if (w.description != null && !fest.has(`add.${id}.description`) && typeof da.description === 'string' && da.description.length) {
              if (da.description !== w.description) { w.description = da.description; n += 1; fest.add(`add.${id}.description`); }
            }
          }
        }
        const dNotes = foundry.utils.getProperty(delta, 'system.notes');
        if (notes != null && !fest.has('notes') && typeof dNotes === 'string' && dNotes.length) {
          if (dNotes !== notes) { notes = dNotes; n += 1; fest.add('notes'); }
        }
        // Statblock-Werte (Rang/Reichweite/Dauer/Auspraegung/Kategorie/Quelle/Munition).
        for (const f of statFelder) {
          if (fest.has(`stat.${f}`)) continue;
          const dv = foundry.utils.getProperty(delta, f);
          if (typeof dv !== 'string' || !dv.length) continue;
          if (dv !== stat[f]) { stat[f] = dv; n += 1; fest.add(`stat.${f}`); }
        }
        // Array-Felder: die Sperre gilt je ELEMENT, nicht je Feld. Die
        // Woerterbuecher reichern einzelne Listeneintraege an, und zwar
        // verschiedene je Spender - eine Feld-Sperre liesse den ersten
        // aendernden Spender gewinnen und alle uebrigen Elemente fuer diesen
        // Lauf englisch stehen.
        for (const f of arrFelder) {
          const dv = foundry.utils.getProperty(delta, f);
          if (!Array.isArray(dv) || dv.length !== arr[f].length) continue;
          for (let i = 0; i < dv.length; i += 1) {
            const schluessel = `arr.${f}.${i}`;
            if (fest.has(schluessel)) continue;
            if (JSON.stringify(dv[i]) === JSON.stringify(arr[f][i])) continue;
            arr[f][i] = dv[i];
            n += 1;
            fest.add(schluessel);
          }
        }
      }
    } catch (e) { return null; }
    if (!n) return null;
    const update = { _id: item.id };
    if (trait != null && trait !== curTrait) update['system.actions.trait'] = trait;
    for (const id of addIds) {
      const w = addWerte[id];
      const orig = curActions.additional[id] ?? {};
      if (w.name != null && w.name !== orig.name) update[`system.actions.additional.${id}.name`] = w.name;
      if (w.override != null && w.override !== orig.override) update[`system.actions.additional.${id}.override`] = w.override;
      if (w.description != null && w.description !== orig.description) update[`system.actions.additional.${id}.description`] = w.description;
    }
    if (notes != null && notes !== curNotes) update['system.notes'] = notes;
    for (const f of statFelder) if (stat[f] !== curStat[f]) update[f] = stat[f];
    for (const f of arrFelder) if (JSON.stringify(arr[f]) !== JSON.stringify(curArr[f])) update[f] = arr[f];
    if (Object.keys(update).length <= 1) return null;
    return { update, count: n };
  };

  // Aufstiegs-Notizen des AKTEURS: ebenfalls ein Woerterbuch-Converter ohne
  // extract, deshalb derselbe Weg - hier aber ueber die Woerterbuecher der
  // uebersetzten AKTEUR-Kompendien.
  let donorActorCollectionsPromise = null;
  const donorActorCollections = () => {
    donorActorCollectionsPromise ??= (async () => {
      const liste = [];
      for (const pack of game.packs) {
        if (pack.metadata?.type !== 'Actor') continue;
        const collection = pack.collection ?? pack.metadata?.id;
        if (isTranslatedCollection(collection)) liste.push(collection);
      }
      return liste.sort((a, b) => a.localeCompare(b));
    })();
    return donorActorCollectionsPromise;
  };
  const advancesPlanFor = async (actor) => {
    const src = actor.toObject();
    const liste = foundry.utils.getProperty(src, 'system.advances.list');
    if (!Array.isArray(liste) || !liste.length) return null;
    const kette = (await donorActorCollections()).filter((c) => isTranslatedCollection(c));
    if (!kette.length) return null;
    let arbeit = foundry.utils.deepClone(liste);
    let n = 0;
    try {
      for (const collection of kette) {
        const obj = actor.toObject();
        foundry.utils.setProperty(obj, 'system.advances.list', foundry.utils.deepClone(arbeit));
        const delta = babele.translate(collection, obj, true);
        if (!delta || delta === obj) continue;
        const dv = foundry.utils.getProperty(delta, 'system.advances.list');
        if (!Array.isArray(dv) || dv.length !== arbeit.length) continue;
        let geaendert = 0;
        for (let i = 0; i < dv.length; i += 1) {
          if (JSON.stringify(dv[i]) !== JSON.stringify(arbeit[i])) geaendert += 1;
        }
        if (geaendert) { arbeit = dv; n += geaendert; }
      }
    } catch (e) { return null; }
    if (!n) return null;
    return { update: { 'system.advances.list': arbeit }, count: n };
  };

  // Rang-Freitext, Zusatzwert-Beschriftungen und Machtpunkte-Pool-Schluessel des
  // AKTEURS - gleicher Weg wie advancesPlanFor. Beim Pool bleibt der englische
  // Alt-Schluessel absichtlich stehen: er ist im Bogen unsichtbar und traegt
  // den alten Stand.
  const KOPFWERT_FELDER = ['system.advances.rank', 'system.additionalStats', 'system.powerPoints'];
  const kopfWertePlanFor = async (actor) => {
    const src = actor.toObject();
    const cur = {};
    for (const f of KOPFWERT_FELDER) {
      const v = foundry.utils.getProperty(src, f);
      const belegt = typeof v === 'string' ? v.length : (v && typeof v === 'object' && Object.keys(v).length);
      if (belegt) cur[f] = foundry.utils.deepClone(v);
    }
    const felder = Object.keys(cur);
    if (!felder.length) return null;
    const kette = (await donorActorCollections()).filter((c) => isTranslatedCollection(c));
    if (!kette.length) return null;
    const arbeit = foundry.utils.deepClone(cur);
    let n = 0;
    try {
      for (const collection of kette) {
        const obj = actor.toObject();
        for (const f of felder) foundry.utils.setProperty(obj, f, foundry.utils.deepClone(arbeit[f]));
        const delta = babele.translate(collection, obj, true);
        if (!delta || delta === obj) continue;
        for (const f of felder) {
          const dv = foundry.utils.getProperty(delta, f);
          if (dv == null) continue;
          if (typeof arbeit[f] === 'string') {
            if (typeof dv === 'string' && dv.length && dv !== arbeit[f]) { arbeit[f] = dv; n += 1; }
          } else if (typeof dv === 'object' && JSON.stringify(dv) !== JSON.stringify(arbeit[f])) {
            arbeit[f] = foundry.utils.deepClone(dv);
            n += 1;
          }
        }
      }
    } catch (e) { return null; }
    if (!n) return null;
    const update = {};
    for (const f of felder) if (JSON.stringify(arbeit[f]) !== JSON.stringify(cur[f])) update[f] = arbeit[f];
    if (!Object.keys(update).length) return null;
    return { update, count: Object.keys(update).length };
  };

  // system.actions.* bleibt unangetastet (Typ, Modifikatoren, Schaden), ausser
  // den Klartext-Feldern, die auch Babele beim Ziehen aus dem Kompendium
  // uebersetzt: trait sowie Name und override jeder Zusatz-Aktion.
  const FLAT_SKIP = /^(_id|_key|sort|folder|img|type)$|^(_stats|flags|effects|ownership|permission)\.|^system\.actions\./;
  const ACTIONS_TRANSLATABLE = /^system\.actions\.(trait|additional\.[^.]+\.(name|override))$/;
  const skipFlat = (k) => FLAT_SKIP.test(k) && !ACTIONS_TRANSLATABLE.test(k);
  const conservativeFields = (cur, orig, trans) => {
    const fc = foundry.utils.flattenObject(cur);
    const fo = foundry.utils.flattenObject(orig);
    const ft = foundry.utils.flattenObject(trans);
    const fields = {};
    let n = 0;
    for (const [k, tv] of Object.entries(ft)) {
      if (skipFlat(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
      const ov = fo[k];
      if (typeof tv !== 'string' || typeof ov !== 'string' || tv === ov) continue;
      const cv = fc[k];
      if (typeof cv !== 'string' || normText(cv) !== normText(ov)) continue;
      if (bereitsGesetzt(cv, tv)) continue;
      fields[k] = tv;
      n += 1;
    }
    return n ? fields : null;
  };

  let nameIndexPromise = null;
  const nameIndex = () => {
    nameIndexPromise ??= messeTeil('Item-Kompendien laden (Namensindex)', async () => {
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
    });
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
    try { src = await enSourceForUuid(uuid, 'Item'); } catch (e) {}
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
        if (skipFlat(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
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
      if (skipFlat(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
      if (typeof tv !== 'string' || !tv.length) continue;
      const cv = fc[k];
      if (typeof cv !== 'string') continue;
      if (bereitsGesetzt(cv, tv) || (cv.length && normText(cv) === normText(tv))) continue;
      fields[k] = tv;
      n += 1;
    }
    return n ? { fields, origName: origName ?? undefined } : { reason: 'Felder bereits deutsch oder angepasst' };
  };

  // EN/DE-Fassung eines Items aus dem Akteurs-Paar (fuer Items ohne eigene
  // Kompendium-Quelle, z. B. in Abenteuer-Akteuren): Zuordnung per Item-ID,
  // sonst ueber eindeutigen Namen gleichen Typs.
  const pairItemDocsFor = (item, pair) => {
    if (!pair) return null;
    let orig = (pair.original?.items ?? []).find((i) => i._id === item.id) ?? null;
    if (!orig) {
      const byName = (pair.original?.items ?? []).filter((i) => norm(i.name) === norm(item.name) && i.type === item.type);
      if (byName.length === 1) orig = byName[0];
    }
    if (!orig) return null;
    const trans = (pair.translated?.items ?? []).find((i) => i._id === orig._id) ?? null;
    if (!trans) return null;
    return { en: orig, de: trans };
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

  // Fuehren mehrere Kompendien denselben englischen Namen mit verschiedenen
  // Regeltexten, entscheidet der Inhalt: englischer Text des Welt-Items gegen
  // die englischen Originalfassungen der Kandidaten. Genau ein Treffer gewinnt;
  // bei wortgleichen Treffern das GRW-Pack; sonst passiert nichts und der
  // Bericht nennt die Kandidaten.
  const GRW_COLLECTION_PREFIX = 'swade-core-rules.';
  const candSrcCache = new Map();
  const candSourceFor = async (uuid) => {
    if (candSrcCache.has(uuid)) return candSrcCache.get(uuid);
    let src = null;
    try { src = await enSourceForUuid(uuid, 'Item'); } catch (e) {}
    // Uebersetzte Quellen ohne rekonstruierbares Original nicht durch die
    // deutsche Fassung ersetzen - der Inhaltsvergleich braucht Englisch.
    if (!src && !isTranslatedCollection(collectionFromUuid(uuid))) {
      try { src = (await fromUuid(uuid))?.toObject?.() ?? null; } catch (e) {}
    }
    candSrcCache.set(uuid, src);
    return src;
  };
  const CONTENT_FIELDS = ['system.description', 'system.notes'];
  const matchCandidatesByContent = async (docObj, uuids) => {
    const matches = [];
    for (const uuid of uuids) {
      const en = await candSourceFor(uuid);
      if (!en) continue;
      let ok = true;
      let strong = false;
      for (const f of CONTENT_FIELDS) {
        const a = normText(foundry.utils.getProperty(docObj, f) ?? '');
        const b = normText(foundry.utils.getProperty(en, f) ?? '');
        if (a !== b) { ok = false; break; }
        if (a.length) strong = true;
      }
      if (ok) matches.push({ uuid, strong });
    }
    const strongOnly = matches.filter((m) => m.strong);
    return (strongOnly.length ? strongOnly : matches).map((m) => m.uuid);
  };
  const candList = (uuids) => [...new Set(uuids.map((u) => collectionFromUuid(u)))].join(', ');

  const systemFields = async (item, uuid) => {
    let sysDoc = null;
    try { sysDoc = await enSourceForUuid(uuid, 'Item'); } catch (e) {}
    if (!sysDoc) {
      try { sysDoc = (await fromUuid(uuid))?.toObject?.() ?? null; } catch (e) {}
      // Germanisierte Fassungen taugen nicht als System-Original.
      if (sysDoc?.flags?.babele) sysDoc = null;
    }
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
    if (list.length > 1) {
      // Bei Items aus System-Packs hat das GRW-Pack Vorrang, auch wenn ein
      // Companion denselben Namen fuehrt.
      const grw = list.filter((u) => (collectionFromUuid(u) ?? '').startsWith(GRW_COLLECTION_PREFIX));
      if (grw.length === 1) {
        list = grw;
      } else {
        const matched = await matchCandidatesByContent(sysDoc, list);
        if (matched.length === 1) list = matched;
        else return { reason: `System-Pendant mehrdeutig (Kandidaten: ${candList(list)})` };
      }
    }
    if (list.length !== 1) {
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
        return { reason: 'System-Pendant mehrdeutig (Schreibvarianten)' };
      } else {
        let variants = 0;
        for (const key of idx.keys()) if (key.startsWith(`${prefix}${wanted} (`)) variants += 1;
        if (variants) return { reason: `im Übersetzungsmodul nur als ${variants} Varianten vorhanden \u2013 bitte manuell zuordnen` };
        return { reason: 'kein System-Pendant im Übersetzungsbestand gefunden' };
      }
    }
    const pendantUuid = list[0];
    const collection = collectionFromUuid(pendantUuid);
    let trans = null;
    try { trans = (await fromUuid(pendantUuid))?.toObject?.() ?? null; } catch (e) {}
    let src = null;
    try { src = await enSourceForUuid(pendantUuid, 'Item'); } catch (e) {}
    const base = src ?? trans;
    if (!base) return { reason: 'System-Pendant nicht ladbar' };
    let delta = null;
    try { delta = babele.translate(collection, base, true); } catch (e) {}
    if (!delta || delta === base) return { reason: 'kein Übersetzungseintrag für das System-Pendant' };
    const fd = foundry.utils.flattenObject(delta);
    const fc = foundry.utils.flattenObject(item.toObject());
    const fo = foundry.utils.flattenObject(sysDoc);
    const fields = {};
    let n = 0;
    for (const [k, tv] of Object.entries(fd)) {
      if (skipFlat(k) || k.split('.').some((s) => /^\d+$/.test(s))) continue;
      if (typeof tv !== 'string' || !tv.length) continue;
      const cv = fc[k];
      if (typeof cv !== 'string' || bereitsGesetzt(cv, tv)) continue;
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
        // Gleicher Name in mehreren uebersetzten Kompendien: der Inhalt
        // entscheidet (siehe matchCandidatesByContent). Nur bei wortgleichen
        // Mehrfach-Treffern gewinnt das GRW-Pack; sonst wird das Item nicht
        // angefasst und der Bericht nennt die Kandidaten.
        const matched = await matchCandidatesByContent(item.toObject(), list);
        let pick = null;
        let via = null;
        if (matched.length === 1) {
          pick = matched[0];
          via = 'Namensindex (Inhaltsvergleich)';
        } else if (matched.length > 1) {
          const grw = matched.filter((u) => (collectionFromUuid(u) ?? '').startsWith(GRW_COLLECTION_PREFIX));
          if (grw.length === 1) {
            pick = grw[0];
            via = 'Namensindex (wortgleich in mehreren Kompendien, GRW-Fassung)';
          }
        }
        if (pick) {
          const h = await uuidFields(item, pick);
          if (h.fields) return { hit: mkHit(item, h.fields, h.origName, via), reason: null };
          reasons.push(h.reason === 'Felder bereits deutsch oder angepasst' ? 'Namensindex-Treffer ohne übersetzbare Felder' : `Namensindex: ${h.reason}`);
        } else if (matched.length) {
          reasons.push(`Name in mehreren Kompendien, Text wortgleich in: ${candList(matched)} – bitte manuell zuordnen`);
        } else {
          reasons.push(`Name in mehreren Kompendien, Text passt zu keinem (verändert?) – Kandidaten: ${candList(list)}`);
        }
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
      if (typeof cur !== 'string' || next === cur) continue;
      let istOriginal = cur === orig;
      // prototypeToken.name hat keinen Original-Schnappschuss (der tokenName-
      // Converter definiert kein extract) - `orig` traegt hier die DEUTSCHE
      // Fassung, der uebliche Vergleich liesse das Feld bei allen Akteuren aus.
      // Als englisches Original gilt der Wert deshalb auch dann, wenn er dem
      // EN-Akteursnamen entspricht oder der Akteursname in diesem Lauf selbst
      // noch englisch war. Die Zeile ist im Bericht einzeln abwaehlbar.
      if (!istOriginal && field === 'prototypeToken.name') {
        const enAct = pair.original?.name;
        istOriginal = (typeof enAct === 'string' && enAct.length && cur === enAct) || ('name' in update);
      }
      // Gleiche Luecke wie beim Token-Namen moeglich. Bei Archetyp-Akteuren ist
      // der englische Archetyp wortgleich mit dem EN-Akteursnamen - das dient
      // als zweiter Beleg fuer ein unveraendertes Original.
      if (!istOriginal && field === 'system.details.archetype') {
        const enAct = pair.original?.name;
        istOriginal = (typeof enAct === 'string' && enAct.length && cur === enAct) || ('name' in update);
      }
      if (!istOriginal) continue;
      update[field] = next;
      fields.push(field);
    }
    return fields.length ? { update, fields } : null;
  };

  // Diagnose-Zeilen als Objekt statt als fertiger Text, damit sich zwei Laeufe
  // ueber die IDs vergleichen lassen - der Name taugt dafuer nicht, er ist
  // genau das, was der Konverter aendert.
  const DIAG = [];
  const diag = (owner, name, text) => DIAG.push({ owner, name, text });
  const diagZeile = (d) => `[${d.owner}] "${d.name}" \u2192 ${d.text}`;
  // Eine Zeile je geprueftem Item, mit ID und Entscheidungsweg.
  const INV = [];

  ui.notifications.info(`Analysiere ${nWord(game.actors.size, 'Akteur', 'Akteure')} und ${nWord(game.items.size, 'Welt-Item', 'Welt-Items')} …`);

  const catView = { a: {}, i: {} };
  for (const s of ['a', 'i']) for (const c of CATS) catView[s][c.key] = { translations: new Map(), missing: new Map() };
  let lineIdSeq = 0;
  const aKeyToId = new Map();
  // Zeilen-ID -> Textpaar: die Plaene merken sich nur die ID.
  const aLineInfo = new Map();
  const aLineId = (cat, from, to) => {
    const k = `${cat}\u0001${from}\u0001${to}`;
    let id = aKeyToId.get(k);
    if (id == null) { id = `L${lineIdSeq++}`; aKeyToId.set(k, id); aLineInfo.set(id, { cat, von: from, nach: to }); }
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
    // Auch fuer uebersprungene Items eine Zeile, sonst laesst sich nicht
    // pruefen, ob ein zweiter Lauf dasselbe Item anders bewertet.
    const inv = (weg, mehr) => INV.push({ owner, id: item?.id ?? null, name: iname, typ: item?.type ?? null, paar: !!pair, weg, ...(mehr ?? {}) });
    try {
      const { hit, reason } = await tryFallback(item, pair);
      if (hit) {
        sink.extra(hit);
        const nFields = Object.keys(hit.update).filter((k) => k !== '_id' && !k.startsWith('flags.')).length;
        inv('id-zuordnung', { via: hit.via, nach: hit.to, felder: nFields });
        diag(owner, iname, `ID-Zuordnung ${hit.via} \u2192 "${hit.to}" (${nWord(nFields, 'Feld', 'Felder')})`);
        return;
      }
      if (entry?.applicable?.()) {
        const uncertain = entry.reviewRequired?.() || entry.userChanged;
        sink.use(entry);
        inv('babele', { unsicher: !!uncertain, nach: entry.proposedName() });
        diag(owner, iname, uncertain
          ? `Babele-Vorschlag (von Babele als unsicher markiert, aber übernommen) \u2192 "${entry.proposedName()}"`
          : `Babele-Übersetzung \u2192 "${entry.proposedName()}"`);
        return;
      }
      if (entry?.hasTranslation?.()) {
        inv('schon-deutsch', null);
        diag(owner, iname, 'bereits vollständig deutsch \u2013 übersprungen');
        return;
      }
      if (reason === 'Felder bereits deutsch oder angepasst' || isAlreadyTranslated(item)) {
        inv('schon-markiert', { grund: reason ?? null, markiert: isAlreadyTranslated(item) });
        diag(owner, iname, 'bereits deutsch/markiert \u2013 übersprungen');
        return;
      }
      sink.miss(item, iname, reason);
      inv('gescheitert', { grund: reason ?? null });
      diag(owner, iname, `GESCHEITERT (${reason})`);
    } catch (e) {
      entryErrors += 1;
      sink.miss(item, iname, 'Analysefehler, siehe Konsole (F12)');
      inv('analysefehler', { grund: String(e?.message ?? e) });
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
    for (const it of actor.items.contents) {
      try {
        for (const ch of await effectPlanFor(it, pair)) {
          if (ch.miss) {
            addMissing('a', 'effekte', `${it.name} \u00b7 ${ch.miss.name}`, actor.name, ch.miss.reason);
            missingCount += 1;
            diag(actor.name, it.name, `EFFEKT AUSGELASSEN (${ch.miss.reason})`);
            continue;
          }
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
    const choiceChanges = [];
    for (const it of actor.items.contents) {
      try {
        const cp = await choicePlanFor(it, pair);
        if (cp?.update) {
          const from = `Auswahl-Paket: ${it.name}`;
          const to = `${nWord(cp.count, 'Text', 'Texte')} deutsch`;
          const lineId = aLineId(catOf(it.type), from, to);
          addTranslated('a', catOf(it.type), from, to);
          choiceChanges.push({ itemId: it.id, update: cp.update, lineId, cat: catOf(it.type) });
          diag(actor.name, it.name, `Auswahl-Paket \u2192 ${to}`);
        } else if (cp?.reason) {
          addMissing('a', catOf(it.type), `${it.name} \u00b7 Auswahl-Paket`, actor.name, cp.reason);
          missingCount += 1;
          diag(actor.name, it.name, `AUSGELASSEN (${cp.reason})`);
        }
      } catch (e) {
        entryErrors += 1;
        console.error(`Convert World | Auswahl-Paket-Analyse fehlgeschlagen bei "${it.name}" (${actor.name})`, e);
      }
    }
    for (const it of actor.items.contents) {
      try {
        const ap = await actionsNotesPlanFor(it);
        if (ap?.update) {
          const from = `Aktionen/Notizen/Werte: ${it.name}`;
          const to = `${nWord(ap.count, 'Text', 'Texte')} deutsch`;
          const lineId = aLineId('effekte', from, to);
          addTranslated('a', 'effekte', from, to);
          choiceChanges.push({ itemId: it.id, update: ap.update, lineId, cat: 'effekte' });
          diag(actor.name, it.name, `Aktionen/Notizen/Werte → ${to}`);
        }
      } catch (e) {
        entryErrors += 1;
        console.error(`Convert World | Aktions-/Notiz-Analyse fehlgeschlagen bei "${it.name}" (${actor.name})`, e);
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
    let advances = null;
    try {
      const ap = await advancesPlanFor(actor);
      if (ap) {
        const to = `${nWord(ap.count, 'Text', 'Texte')} deutsch`;
        advances = { ...ap, lineId: aLineId('eigenschaften', `${actor.name} \u00b7 Aufstiege`, to) };
        addTranslated('a', 'eigenschaften', `${actor.name} \u00b7 Aufstiege`, to);
        diag(actor.name, actor.name, `Aufstiege \u2192 ${to}`);
      }
    } catch (e) {
      entryErrors += 1;
      console.error(`Convert World | Aufstiegs-Analyse fehlgeschlagen f\u00fcr "${actor.name}"`, e);
    }
    let kopfwerte = null;
    try {
      const kp = await kopfWertePlanFor(actor);
      if (kp) {
        const to = `${nWord(kp.count, 'Wert', 'Werte')} deutsch`;
        kopfwerte = { ...kp, lineId: aLineId('eigenschaften', `${actor.name} \u00b7 Rang/Werte`, to) };
        addTranslated('a', 'eigenschaften', `${actor.name} \u00b7 Rang/Werte`, to);
        diag(actor.name, actor.name, `Rang/Werte \u2192 ${to}`);
      }
    } catch (e) {
      entryErrors += 1;
      console.error(`Convert World | Rang-/Werte-Analyse fehlgeschlagen f\u00fcr "${actor.name}"`, e);
    }
    const itemCount = CATS.reduce((n, c) => n + entriesByCat[c.key].length + extrasByCat[c.key].length, 0);
    if (itemCount || headCount || missingCount || effectChanges.length || choiceChanges.length || advances || kopfwerte) {
      plans.push({ id: actor.id, name: actor.name, actor, proposal, entriesByCat, extrasByCat, effectChanges, choiceChanges, head, headCount, advances, kopfwerte, itemCount, missingCount });
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
    for (const it of game.items.contents) {
      try {
        for (const ch of await effectPlanFor(it)) {
          if (ch.miss) {
            addMissing('i', 'effekte', `${it.name} \u00b7 ${ch.miss.name}`, null, ch.miss.reason);
            diag('Welt-Items', it.name, `EFFEKT AUSGELASSEN (${ch.miss.reason})`);
            continue;
          }
          world.items.push({ id: `${it.id}:eff:${ch.update._id}`, from: ch.from, to: ch.to, cat: 'effekte', entry: null, update: null, effect: { itemId: it.id, update: ch.update } });
          diag('Welt-Items', it.name, `${ch.from} \u2192 "${ch.to}"`);
        }
      } catch (e) {
        entryErrors += 1;
        console.error(`Convert World | Effekt-Analyse fehlgeschlagen bei "${it.name}" (Welt-Items)`, e);
      }
    }
    for (const it of game.items.contents) {
      try {
        const cp = await choicePlanFor(it);
        if (cp?.update) {
          const to = `${nWord(cp.count, 'Text', 'Texte')} deutsch`;
          world.items.push({ id: `${it.id}:cs`, from: `Auswahl-Paket: ${it.name}`, to, cat: catOf(it.type), entry: null, update: null, choice: { itemId: it.id, update: cp.update } });
          diag('Welt-Items', it.name, `Auswahl-Paket \u2192 ${to}`);
        } else if (cp?.reason) {
          addMissing('i', catOf(it.type), `${it.name} \u00b7 Auswahl-Paket`, null, cp.reason);
          diag('Welt-Items', it.name, `AUSGELASSEN (${cp.reason})`);
        }
      } catch (e) {
        entryErrors += 1;
        console.error(`Convert World | Auswahl-Paket-Analyse fehlgeschlagen bei "${it.name}" (Welt-Items)`, e);
      }
    }
    for (const it of game.items.contents) {
      try {
        const ap = await actionsNotesPlanFor(it);
        if (ap?.update) {
          const to = `${nWord(ap.count, 'Text', 'Texte')} deutsch`;
          world.items.push({ id: `${it.id}:an`, from: `Aktionen/Notizen/Werte: ${it.name}`, to, cat: 'effekte', entry: null, update: null, choice: { itemId: it.id, update: ap.update } });
          diag('Welt-Items', it.name, `Aktionen/Notizen/Werte → ${to}`);
        }
      } catch (e) {
        entryErrors += 1;
        console.error(`Convert World | Aktions-/Notiz-Analyse fehlgeschlagen bei "${it.name}" (Welt-Items)`, e);
      }
    }
    const seenIds = new Set();
    world.items = world.items.filter((w) => {
      if (seenIds.has(w.id)) return false;
      seenIds.add(w.id);
      return true;
    });
  };

  // ─── Marken auf Szenen ───────────────────────────────────────────────
  // Eine Marke traegt eigene Kopien, die der Akteurs-Durchlauf nicht erreicht:
  // den Namen immer, bei nicht verknuepften Marken zusaetzlich ein Akteur-Delta.
  // Foundry ersetzt beim Zusammensetzen des Marken-Akteurs ein Basis-Item
  // KOMPLETT durch den Delta-Datensatz - ein Delta-Item ist also eine volle
  // Kopie und muss selbst uebersetzt werden. Geerbte Items bleiben unangetastet,
  // sonst wuerden sie als Delta-Kopie materialisieren und spaetere Aenderungen
  // des Basis-Akteurs nicht mehr mitbekommen.

  // Statuseffekte tragen den Namen der Sprache, in der sie gesetzt wurden. Die
  // EN→DE-Karte kommt aus dem System selbst: CONFIG.statusEffects nennt die
  // Sprachschluessel, game.i18n uebersetzt sie, und Foundrys Rueckfall-
  // Woerterbuch liefert das englische Original.
  let statusNamePairs = null;
  const statusEnDe = () => {
    if (statusNamePairs) return statusNamePairs;
    statusNamePairs = new Map();
    try {
      for (const cfg of (CONFIG.statusEffects ?? [])) {
        const key = cfg?.name ?? cfg?.label;
        if (typeof key !== 'string' || !key.length) continue;
        const de = game.i18n.localize(key);
        const en = key.includes('.') ? foundry.utils.getProperty(game.i18n._fallback ?? {}, key) : key;
        if (typeof en !== 'string' || typeof de !== 'string' || !en.length || !de.length) continue;
        if (en !== de && !statusNamePairs.has(en)) statusNamePairs.set(en, de);
      }
    } catch (e) {}
    return statusNamePairs;
  };

  // Nur uebersetzen, wenn der Name EXAKT einem englischen Namen des
  // Basis-Akteurs entspricht; handvergebene Namen bleiben unangetastet.
  // Als EN-Referenz dient der Welt-Stand des Basis-Akteurs: im Schnappschuss
  // fehlt prototypeToken.name (Converter ohne extract), pair.original traegt
  // dort die deutsche Fassung. Ist die Basis schon deutsch, laeuft der
  // Vergleich ins Leere und die Marke bleibt unangetastet.
  const tokenNameTarget = (tokenName, pair, base) => {
    if (!pair || typeof tokenName !== 'string' || !tokenName.length) return null;
    const deTokRaw = pair.translated?.prototypeToken?.name;
    const deAct = pair.translated?.name;
    const deTok = (typeof deTokRaw === 'string' && deTokRaw.length) ? deTokRaw : deAct;
    const enTokKandidaten = [pair.original?.prototypeToken?.name, base?.prototypeToken?.name]
      .filter((v) => typeof v === 'string' && v.length);
    if (enTokKandidaten.includes(tokenName)) {
      return (typeof deTok === 'string' && deTok.length && deTok !== tokenName) ? deTok : null;
    }
    const enAct = pair.original?.name;
    if (typeof enAct === 'string' && enAct.length && tokenName === enAct) {
      return (typeof deAct === 'string' && deAct.length && deAct !== tokenName) ? deAct : null;
    }
    return null;
  };

  const tokenPlans = [];
  const tokenUnits = (tp) => (tp.nameUpdate ? 1 : 0) + tp.entries.length + tp.itemUpdates.length
    + tp.choiceUpdates.length + tp.itemEffectUpdates.length + tp.actorEffectUpdates.length;

  const collectToken = async (scene, token) => {
    if (!token.actorId) return; // reines Deko-Token ohne Akteur
    const tp = {
      key: `${scene.id}.${token.id}`, scene, token, name: token.name ?? '(unbenannt)',
      nameUpdate: null, proposal: null, entries: [], itemUpdates: [], choiceUpdates: [],
      itemEffectUpdates: [], actorEffectUpdates: [], lines: [], missing: [],
    };
    const owner = `Szene "${scene.name}" · Token "${tp.name}"`;
    const base = token.baseActor ?? game.actors.get(token.actorId) ?? null;
    if (!base) {
      tp.missing.push({ name: tp.name, reason: 'Basis-Akteur fehlt (gelöscht?) – Token nicht übersetzbar' });
      diag(owner, tp.name, 'GESCHEITERT (Basis-Akteur fehlt)');
      tokenPlans.push(tp);
      return;
    }
    const pair = await sourcePairFor(base);
    const zielName = tokenNameTarget(token.name, pair, base);
    if (zielName) {
      tp.nameUpdate = { _id: token.id, name: zielName };
      tp.lines.push({ from: `Name: ${tp.name}`, to: zielName });
      diag(owner, tp.name, `Token-Name → "${zielName}"`);
    }
    // Delta nur bei nicht verknuepften Token mit eigenem Token-Akteur.
    const synActor = (!token.actorLink && token.actor) ? token.actor : null;
    const rawDelta = synActor ? (token.delta?.toObject?.() ?? null) : null;
    if (synActor && rawDelta) {
      const deltaItems = (rawDelta.items ?? []).filter((d) => d && !d._tombstone);
      const synItems = deltaItems.map((d) => synActor.items.get(d._id)).filter(Boolean);
      if (synItems.length) {
        tp.proposal = await proposeFresh(synItems);
        const entryById = new Map();
        for (const entry of (tp.proposal?.entries ?? [])) {
          const id = entry.item?.id;
          if (id != null) entryById.set(id, entry);
        }
        const sink = {
          use: (entry) => { tp.entries.push(entry); tp.lines.push({ from: entry.currentName(), to: entry.proposedName() }); },
          extra: (fb) => { tp.itemUpdates.push(fb.update); tp.lines.push({ from: fb.from, to: fb.to }); },
          miss: (item, name, reason) => { tp.missing.push({ name, reason }); },
        };
        for (const it of synItems) {
          await classify(it, entryById.get(it.id) ?? null, pair, sink, owner);
        }
        for (const it of synItems) {
          try {
            for (const ch of await effectPlanFor(it, pair)) {
              if (ch.miss) {
                tp.missing.push({ name: `${it.name} · ${ch.miss.name}`, reason: ch.miss.reason });
                diag(owner, it.name, `EFFEKT AUSGELASSEN (${ch.miss.reason})`);
                continue;
              }
              tp.itemEffectUpdates.push({ itemId: ch.itemId, update: ch.update });
              tp.lines.push({ from: ch.from, to: ch.to });
              diag(owner, it.name, `${ch.from} → "${ch.to}"`);
            }
          } catch (e) {
            entryErrors += 1;
            console.error(`Convert World | Effekt-Analyse fehlgeschlagen bei "${it.name}" (${owner})`, e);
          }
        }
        for (const it of synItems) {
          try {
            const cp = await choicePlanFor(it, pair);
            if (cp?.update) {
              const to = `${nWord(cp.count, 'Text', 'Texte')} deutsch`;
              tp.choiceUpdates.push(cp.update);
              tp.lines.push({ from: `Auswahl-Paket: ${it.name}`, to });
              diag(owner, it.name, `Auswahl-Paket → ${to}`);
            } else if (cp?.reason) {
              tp.missing.push({ name: `${it.name} · Auswahl-Paket`, reason: cp.reason });
              diag(owner, it.name, `AUSGELASSEN (${cp.reason})`);
            }
          } catch (e) {
            entryErrors += 1;
            console.error(`Convert World | Auswahl-Paket-Analyse fehlgeschlagen bei "${it.name}" (${owner})`, e);
          }
          try {
            const ap = await actionsNotesPlanFor(it);
            if (ap?.update) {
              const to = `${nWord(ap.count, 'Text', 'Texte')} deutsch`;
              tp.choiceUpdates.push(ap.update);
              tp.lines.push({ from: `Aktionen/Notizen/Werte: ${it.name}`, to });
              diag(owner, it.name, `Aktionen/Notizen/Werte → ${to}`);
            }
          } catch (e) {
            entryErrors += 1;
            console.error(`Convert World | Aktions-/Notiz-Analyse fehlgeschlagen bei "${it.name}" (${owner})`, e);
          }
        }
      }
      // Zustaende und andere Effekte direkt auf dem Token-Akteur.
      for (const eff of (rawDelta.effects ?? [])) {
        if (!eff || eff._tombstone) continue;
        const nm = typeof eff.name === 'string' ? eff.name : '';
        if (!nm) continue; // reine Zustandsaenderung ohne Namen: nichts zu uebersetzen
        const de = statusEnDe().get(nm) ?? (effectApiOk ? argaApi.effectTranslations[nm] : null) ?? null;
        if (de && de !== nm) {
          tp.actorEffectUpdates.push({ _id: eff._id, name: de });
          tp.lines.push({ from: `Zustand: ${nm}`, to: de });
          diag(owner, nm, `Zustand → "${de}"`);
        }
      }
    }
    if (tokenUnits(tp) || tp.missing.length) tokenPlans.push(tp);
  };

  const collectTokens = async () => {
    for (const scene of game.scenes.contents) {
      for (const token of scene.tokens.contents) {
        try {
          await collectToken(scene, token);
        } catch (e) {
          analyzeErrors += 1;
          console.error(`Convert World | Analyse fehlgeschlagen für Token "${token?.name}" (Szene "${scene?.name}")`, e);
        }
      }
    }
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
  try {
    await collectTokens();
  } catch (e) {
    analyzeErrors += 1;
    console.error('Convert World | Analyse der Token fehlgeschlagen', e);
  }

  ZEIT.analyse = jetzt() - ZEIT.start;
  // Teilzeiten der Analyse festhalten, bevor die Schreibphase beginnt.
  const teileAnalyse = { ...ZEIT.teile };

  if (DIAG.length) {
    console.groupCollapsed(`Convert World | Diagnose (${DIAG.length} Einträge)`);
    for (const d of DIAG) console.log(diagZeile(d));
    console.groupEnd();
  }
  console.log(`Convert World | Bestandsaufnahme ${dauerText(ZEIT.analyse)}`, ZEIT.teile);

  // Ablegen, BEVOR der Bericht erscheint: bricht der Spielleiter ab, sind die
  // Analyse-Daten trotzdem da.
  const angebotDaten = () => ({
    // Die Zeilen-IDs verweisen auf "zeilen", damit die Datei nicht dieselben
    // Texte hundertfach wiederholt.
    akteure: plans.map((p) => ({
      id: p.id,
      name: p.name,
      itemAnzahl: p.itemCount,
      fehlend: p.missingCount,
      eintraege: CATS.flatMap((c) => p.entriesByCat[c.key].map((e) => ({
        id: e.item?.id ?? null, cat: c.key, von: e.currentName(), nach: e.proposedName(), weg: 'babele',
      }))),
      zusaetze: CATS.flatMap((c) => p.extrasByCat[c.key].map((fb) => ({
        id: fb.update?._id ?? null, cat: c.key, von: fb.from, nach: fb.to, weg: `id:${fb.via ?? '?'}`,
        felder: Object.keys(fb.update ?? {}).filter((k) => k !== '_id'),
      }))),
      effekte: p.effectChanges.map((ec) => ({ itemId: ec.itemId, id: ec.update?._id ?? null, zeile: ec.lineId })),
      auswahl: p.choiceChanges.map((cc) => ({ itemId: cc.itemId, cat: cc.cat, zeile: cc.lineId, felder: Object.keys(cc.update ?? {}).filter((k) => k !== '_id') })),
      kopf: p.head?.fields ?? [],
      aufstiege: !!p.advances,
      kopfwerte: !!p.kopfwerte,
    })),
    weltItems: world.items.map((w) => ({
      id: w.id, cat: w.cat, von: w.from, nach: w.to,
      art: w.effect ? 'effekt' : (w.choice ? 'auswahl' : (w.entry ? 'babele' : 'id-zuordnung')),
      felder: Object.keys(w.update ?? w.choice?.update ?? w.effect?.update ?? {}).filter((k) => k !== '_id'),
    })),
    token: tokenPlans.map((tp) => ({
      key: tp.key, name: tp.name, szene: tp.scene?.name ?? null, einheiten: tokenUnits(tp),
      neuerName: tp.nameUpdate?.name ?? null, fehlend: tp.missing.length,
    })),
    zeilen: [...aLineInfo].map(([id, v]) => ({ id, cat: v.cat, von: v.von, nach: v.nach })),
    fehlend: ['a', 'i'].flatMap((scope) => CATS.flatMap((c) => [...catView[scope][c.key].missing].map(([name, v]) => ({
      bereich: scope === 'a' ? 'Akteure' : 'Welt-Items', cat: c.key, name, anzahl: v.count, grund: v.reason ?? null, besitzer: [...v.owners],
    })))),
  });
  const state = {
    actors: new Map(plans.map((p) => [p.id, true])),
    items: new Map(world.items.map((w) => [w.id, true])),
    tokens: new Map(tokenPlans.map((tp) => [tp.key, true])),
    catsA: Object.fromEntries(CATS.map((c) => [c.key, true])),
    catsI: Object.fromEntries(CATS.map((c) => [c.key, true])),
    linesA: new Map(),
    journal: true,   // standardmaessig angehakt
  };
  // Frueher Abgewaehltes bleibt abgewaehlt, sonst schriebe die Nachpruefung
  // genau die Stellen, die stehen bleiben sollten.
  if (VORAUSWAHL) {
    for (const id of VORAUSWAHL.akteure ?? []) if (state.actors.has(id)) state.actors.set(id, false);
    for (const id of VORAUSWAHL.weltItems ?? []) if (state.items.has(id)) state.items.set(id, false);
    for (const key of VORAUSWAHL.token ?? []) if (state.tokens.has(key)) state.tokens.set(key, false);
    for (const id of VORAUSWAHL.zeilen ?? []) state.linesA.set(id, false);
    for (const k of VORAUSWAHL.katA ?? []) if (k in state.catsA) state.catsA[k] = false;
    for (const k of VORAUSWAHL.katI ?? []) if (k in state.catsI) state.catsI[k] = false;
  }

  const lineOn = (id) => state.linesA.get(id) !== false;

  const headDisplay = (f, head) => (HEAD_LABELS[f] === 'Beschreibung' ? '(deutscher Text)' : head.update[f]);

  const catTotalA = (cat) => plans.reduce((n, p) => n + p.entriesByCat[cat].length + p.extrasByCat[cat].length + (cat === 'eigenschaften' ? p.headCount + (p.advances ? 1 : 0) + (p.kopfwerte ? 1 : 0) : 0) + (cat === 'effekte' ? p.effectChanges.length : 0) + p.choiceChanges.filter((c) => c.cat === cat).length, 0);
  const catTotalI = (cat) => world.items.filter((w) => w.cat === cat).length;
  const scopeMissing = (scope) => CATS.reduce((n, c) => n + [...catView[scope][c.key].missing.values()].reduce((a, v) => a + v.count, 0), 0);

  const actorUnits = function* () {
    for (const p of plans) {
      for (const c of CATS) {
        for (const e of p.entriesByCat[c.key]) yield { plan: p, cat: c.key, lineId: aLineId(c.key, e.currentName(), e.proposedName()) };
        for (const fb of p.extrasByCat[c.key]) yield { plan: p, cat: c.key, lineId: aLineId(c.key, fb.from, fb.to) };
      }
      if (p.head) for (const f of p.head.fields) yield { plan: p, cat: 'eigenschaften', lineId: aLineId('eigenschaften', `${p.name} \u00b7 ${HEAD_LABELS[f]}`, headDisplay(f, p.head)) };
      if (p.advances) yield { plan: p, cat: 'eigenschaften', lineId: p.advances.lineId };
      if (p.kopfwerte) yield { plan: p, cat: 'eigenschaften', lineId: p.kopfwerte.lineId };
      for (const ec of p.effectChanges) yield { plan: p, cat: 'effekte', lineId: ec.lineId };
      for (const cc of p.choiceChanges) yield { plan: p, cat: cc.cat, lineId: cc.lineId };
    }
  };

  const totalSelected = () => {
    let n = 0;
    for (const u of actorUnits()) if (state.actors.get(u.plan.id) && state.catsA[u.cat] && lineOn(u.lineId)) n += 1;
    for (const w of world.items) if (state.items.get(w.id) && state.catsI[w.cat]) n += 1;
    for (const tp of tokenPlans) if (state.tokens.get(tp.key)) n += tokenUnits(tp);
    return n;
  };

  const tokenMissingTotal = tokenPlans.reduce((n, tp) => n + tp.missing.length, 0);
  const missingTotal = scopeMissing('a') + scopeMissing('i') + tokenMissingTotal;
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
  // Haken aus dem Zustand lesen statt fest anzuhaken: in Runde 1 ist alles
  // true, in der Nachpruefung erscheinen die frueheren Abwahlen wieder.
  const istAn = (attrName, value) => {
    switch (attrName) {
      case 'data-arga-actor': return state.actors.get(value) !== false;
      case 'data-arga-item':  return state.items.get(value) !== false;
      case 'data-arga-token': return state.tokens.get(value) !== false;
      case 'data-arga-line':  return state.linesA.get(value) !== false;
      case 'data-arga-cat':   return state.catsA[value] !== false;
      case 'data-arga-icat':  return state.catsI[value] !== false;
      default: return true;
    }
  };
  const bullet = (attrName, value, checked = istAn(attrName, value)) =>
    `<input type="checkbox" class="arga-bullet" ${attrName}="${esc(value)}"${checked ? ' checked' : ''}>`;
  const catCheckbox = (attrName, value) =>
    `<input type="checkbox" ${attrName}="${esc(value)}"${istAn(attrName, value) ? ' checked' : ''} style="margin-right:0.45em;vertical-align:middle;">`;

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
      const possible = p.itemCount + p.headCount + (p.advances ? 1 : 0) + (p.kopfwerte ? 1 : 0) + p.effectChanges.length + p.choiceChanges.length;
      const counts = [`${nWord(possible, 'Übersetzung', 'Übersetzungen')} möglich`];
      if (p.missingCount) counts.push(`<span style="color:${RED};">${p.missingCount} gescheitert</span>`);
      return `<div style="display:flex;justify-content:space-between;gap:0.6rem;padding:0.1rem 0;">
        <label style="cursor:pointer;">${b}${esc(p.name)}</label>
        <span style="white-space:nowrap;font-size:0.9em;opacity:0.9;">${counts.join(' \u00b7 ')}</span>
      </div>`;
    }).join('');
    const rowsBlock = plans.length
      ? `<details data-arga-rows="a">
          <summary style="cursor:pointer;padding:0.2rem 0 0.1rem 0;font-weight:bold;opacity:0.85;">Akteursliste <span style="font-weight:normal;opacity:0.75;">(Anklicken zum Aufklappen)</span></summary>
          ${listBox(actorRows, '0.9rem')}
        </details>`
      : '<div style="opacity:0.7;">Keine Akteure mit offenen Übersetzungen.</div>';
    const open = !interactive ? ' open' : '';
    return `<details${open} data-arga-acc="top">
      ${groupSummary(`-${plans.length}- ${word(plans.length, 'Akteur', 'Akteure')} gefunden`, scopeMissing('a'))}
      <div style="padding-left:1.5rem;">${rowsBlock}</div>
      <div style="padding-left:2.8rem;">${CATS.map((c) => renderActorCategory(c, interactive)).join('')}</div>
    </details>`;
  };

  const renderItemGroup = (interactive) => {
    const found = world.items.length + scopeMissing('i');
    const open = !interactive ? ' open' : '';
    const body = found
      ? CATS.map((c) => renderItemCategory(c, interactive)).join('')
      : '<div style="opacity:0.7;">Keine Welt-Items mit offenen Übersetzungen.</div>';
    return `<details${open} data-arga-acc="top">
      ${groupSummary(`-${found}- ${word(found, 'Item', 'Items')} gefunden`, scopeMissing('i'))}
      <div style="padding-left:1.5rem;">${body}</div>
    </details>`;
  };

  // Probleme einer Szene als eigener roter Punkt unter dem Szenen-Eintrag,
  // gleiche Optik wie der missingBlock der Akteurs-Kategorien.
  const tokenMissBlock = (tps, interactive) => {
    const eintraege = [];
    for (const tp of tps) for (const m of tp.missing) eintraege.push({ marke: tp.name, name: m.name, reason: m.reason });
    if (!eintraege.length) return '';
    const zeilen = eintraege
      .sort((a, b) => a.name.localeCompare(b.name, 'de'))
      .map((m) => `<div data-arga-token-miss>${esc(m.name)} <span style="opacity:0.6;">– Token „${esc(m.marke)}“</span><br><span style="opacity:0.65;font-size:0.88em;">↳ ${esc(m.reason)}</span></div>`)
      .join('');
    return `<details style="margin-left:1.1rem;"${interactive ? '' : ' open'}>
          <summary style="cursor:pointer;color:${RED};">Keine passende Übersetzung gefunden (oder bereits übersetzt)${pill(eintraege.length, RED)}</summary>
          ${listBox(zeilen, '0.9rem')}
        </details>`;
  };

  const renderTokenGroup = (interactive) => {
    const open = !interactive ? ' open' : '';
    let body;
    if (!tokenPlans.length) {
      body = '<div style="opacity:0.7;">Keine Token mit offenen Übersetzungen.</div>';
    } else {
      const szenen = new Map();
      for (const tp of tokenPlans) {
        const s = szenen.get(tp.scene.id) ?? { name: tp.scene.name, tps: [] };
        s.tps.push(tp);
        szenen.set(tp.scene.id, s);
      }
      body = [...szenen.values()].map((s) => {
        const zeilen = s.tps.map((tp) => {
          const n = tokenUnits(tp);
          const b = interactive && n ? bullet('data-arga-token', tp.key) : '';
          const details = tp.lines
            .map((l) => `<div style="margin-left:1.4rem;">${esc(l.from)} <span style="opacity:0.55;">→</span> <strong>${esc(l.to)}</strong></div>`)
            .join('');
          const counts = [`${nWord(n, 'Übersetzung', 'Übersetzungen')} möglich`];
          if (tp.missing.length) counts.push(`<span style="color:${RED};">${tp.missing.length} gescheitert</span>`);
          return `<div style="padding:0.1rem 0;">
            <div style="display:flex;justify-content:space-between;gap:0.6rem;">
              <label style="cursor:pointer;">${b}Token „${esc(tp.name)}“</label>
              <span style="white-space:nowrap;font-size:0.9em;opacity:0.9;">${counts.join(' · ')}</span>
            </div>${details}</div>`;
        }).join('');
        const missSum = s.tps.reduce((n, tp) => n + tp.missing.length, 0);
        return `<details data-arga-acc="t">
          <summary style="cursor:pointer;padding:0.25rem 0;font-weight:bold;">Szene „${esc(s.name)}“${pill(s.tps.length, GREEN)}${missSum ? pill(missSum, RED) : ''}</summary>
          ${listBox(zeilen, '1.1rem')}
        </details>${tokenMissBlock(s.tps, interactive)}`;
      }).join('');
    }
    return `<details${open} data-arga-acc="top">
      ${groupSummary(`-${tokenPlans.length}- Unverlinkte Token auf einer Szene gefunden`, tokenMissingTotal)}
      <div style="padding-left:1.5rem;">${body}</div>
    </details>`;
  };

  const renderReport = (interactive, withIntro) => `
    <div style="display:flex;flex-direction:column;gap:${GAP};">
      ${withIntro ? (RUNDE > 1
        ? '<div>Einige Stellen lassen sich erst nach einem zweiten oder auch dritten Durchlauf zuordnen. Die beiden Nachprüfungen dauern jeweils nur wenige Sekunden. Im aktuellen Durchlauf wurden noch <strong>keine Änderungen</strong> vorgenommen. Was du vorhin abgewählt hast, ist auch hier abgewählt.</div>'
        : '<div>Dies ist zunächst nur eine Bestandsaufnahme. Es wurden noch <strong>keine Änderungen</strong> in der Welt vorgenommen. <strong>Bitte prüfe</strong> die vorgeschlagenen Übersetzungen und deaktiviere ggf. unpassende.<br><br><strong>HINWEIS:</strong> Eigene Item-Namen oder Beschreibungstexte werden beim Konvertieren mit dem Standard überschrieben.</div>') : ''}
      <div style="display:flex;gap:0.5rem;">
        ${statBox(plans.length, `${word(plans.length, 'Akteur', 'Akteure')} gefunden`, 'inherit')}
        ${statBox(world.items.length, `${word(world.items.length, 'Item', 'Items')} gefunden`, 'inherit')}
        ${statBox(tokenPlans.length, 'Token gefunden', 'inherit')}
        ${statBox(initialTotal, `${word(initialTotal, 'Übersetzung', 'Übersetzungen')} möglich`, GREEN)}
        ${statBox(missingTotal, `${word(missingTotal, 'Übersetzung', 'Übersetzungen')} gescheitert`, missingTotal ? RED : 'inherit')}
      </div>
      ${analyzeErrors || entryErrors ? `<div style="color:${RED};font-size:0.85em;">Analysefehler: ${analyzeErrors + entryErrors} (Details in der Konsole, F12)</div>` : ''}
      <hr style="width:100%;margin:0;">
      ${renderActorGroup(interactive)}
      ${renderItemGroup(interactive)}
      ${renderTokenGroup(interactive)}
    </div>`;

  if (!initialTotal) {
    // In der Nachpruefung gibt es nichts zu entscheiden - eine Meldung statt
    // eines Dialogs mit "nichts zu tun".
    if (RUNDE > 1) {
      (ui.notifications.success ?? ui.notifications.info).call(
        ui.notifications,
        `Nachprüfung abgeschlossen: Es ist nichts mehr offen – ein weiterer Durchlauf ist nicht nötig.${missingTotal ? ` (${nWord(missingTotal, 'Übersetzung', 'Übersetzungen')} ließ sich nicht zuordnen – siehe Bericht des vorigen Durchlaufs.)` : ''}`,
        { permanent: true },
      );
      return;
    }
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
      <label style="display:block;cursor:pointer;"><input type="checkbox" name="arga-journal" checked style="margin-right:0.4em;vertical-align:middle;">Ergebnis nach dem Übersetzen als Journaleintrag speichern</label>
      <div style="color:${RED};font-weight:bold;text-align:center;">Die Benutzung des Konverters erfolgt auf eigene Gefahr.<br>Bitte auf jeden Fall vorher ein BACKUP der Welt anlegen!</div>
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
    wire('input[data-arga-token]', (cb) => state.tokens.set(cb.dataset.argaToken, cb.checked));
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

  // Vor dem Schreiben Umfang und geschaetzte Dauer nennen: der erste Lauf an
  // einer grossen Welt kann eine Dreiviertelstunde beschaeftigt sein und sieht
  // ohne Vorwarnung wie ein haengendes Foundry aus. Erst ab der Schwelle
  // fragen, bei wenigen Aenderungen waere die Rueckfrage nur laestig.
  const ausgewaehltJetzt = totalSelected();
  const geschaetztMs = ausgewaehltJetzt * msJeAenderung();
  if (geschaetztMs >= WARNSCHWELLE_MS) {
    const bestand = [
      `${nWord(plans.filter((p) => state.actors.get(p.id)).length, 'Akteur', 'Akteure')}`,
      `${nWord(world.items.filter((w) => state.items.get(w.id)).length, 'Welt-Item', 'Welt-Items')}`,
    ].join(' und ');
    const weiter = await foundry.applications.api.DialogV2.wait({
      window: { title: TITLE },
      position: { width: 520 },
      content: `<div style="display:flex;flex-direction:column;gap:0.7rem;line-height:1.5;">
        <div>Es werden jetzt <strong>${ausgewaehltJetzt}</strong> Änderungen an ${bestand} geschrieben.</div>
        <div>Das dauert nach dem bisherigen Erfahrungswert <strong>${schaetzText(geschaetztMs)}</strong>. Die Schätzung ist grob und hängt stark vom Rechner ab.</div>
        <div>Foundry sollte in dieser Zeit geöffnet bleiben und nicht neu geladen werden. <strong>Hast du ein Backup der Welt?</strong></div>
      </div>`,
      buttons: [
        { action: 'weiter', label: 'Ja, jetzt übersetzen' },
        { action: 'cancel', label: 'Abbrechen', default: true },
      ],
      rejectClose: false,
    });
    if (weiter !== 'weiter') return;
  }

  const startHint = ui.notifications.warn(`Die Konvertierung läuft (${nWord(ausgewaehltJetzt, 'Änderung', 'Änderungen')}, ${schaetzText(geschaetztMs)}). Bitte warte auf die Abschlussmeldung.`, { permanent: true });
  const clearStartHint = () => { try { ui.notifications.remove?.(startHint); } catch (e) {} };
  // Ab hier wird geschrieben - die Pruefzeit am Bericht zaehlt nicht mit.
  const tAnwenden = jetzt();

  let doneItems = 0;
  let doneHeads = 0;
  let doneEffects = 0;
  let doneChoices = 0;
  let applyErrors = 0;
  const processed = [];

  // Foundry verarbeitet die Update-Liste eines Aufrufs als Objekt je _id: bei
  // zwei Update-Objekten mit derselben _id ueberschreibt das SPAETERE das
  // fruehere vollstaendig und still. choicePlanFor und actionsNotesPlanFor
  // liefern getrennte Updates desselben Items, ihre Feldmengen sind aber
  // disjunkt - deshalb vor jedem Schreiben je _id zusammenlegen.
  const mergeById = (updates) => {
    const byId = new Map();
    for (const u of updates) {
      if (!u || !u._id) continue;
      const alt = byId.get(u._id);
      byId.set(u._id, alt ? { ...alt, ...u } : u);
    }
    return [...byId.values()];
  };

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
      // Woerterbuch-Updates ZUERST, Eintrags-Updates DANACH: teilen sich beide
      // ein Feld, gewinnt so die gepflegte Eintrags-Uebersetzung.
      let choiceDone = 0;
      if (plan.choiceChanges.length) {
        const csListe = plan.choiceChanges
          .filter((cc) => state.catsA[cc.cat] && lineOn(cc.lineId))
          .map((cc) => cc.update);
        const csUpdates = mergeById(csListe);
        if (csUpdates.length) {
          await plan.actor.updateEmbeddedDocuments('Item', csUpdates);
          choiceDone = csListe.length;
          doneChoices += csListe.length;
        }
      }
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
      if (plan.advances && state.catsA.eigenschaften && lineOn(plan.advances.lineId)) {
        await plan.actor.update(plan.advances.update);
        doneChoices += 1;
        headDone += 1;
      }
      if (plan.kopfwerte && state.catsA.eigenschaften && lineOn(plan.kopfwerte.lineId)) {
        await plan.actor.update(plan.kopfwerte.update);
        doneChoices += 1;
        headDone += 1;
      }
      if (updates.length || headDone || effDone || choiceDone) processed.push(plan.name);
    } catch (e) {
      applyErrors += 1;
      console.error(`Convert World | Übersetzen fehlgeschlagen für "${plan.name}"`, e);
    }
  }

  const worldSel = world.items.filter((w) => state.items.get(w.id) && state.catsI[w.cat]);
  const worldNormal = worldSel.filter((w) => !w.effect && !w.choice);
  const worldEffects = worldSel.filter((w) => w.effect);
  const worldChoices = worldSel.filter((w) => w.choice);
  // Wie beim Akteurs-Pfad: Woerterbuch-Updates zuerst, Eintrags-Updates danach.
  if (worldChoices.length) {
    try {
      // Beide Update-Arten treffen dieselbe Item-_id -> mergeById.
      const csListe = worldChoices.map((w) => w.choice.update);
      const csUpdates = mergeById(csListe);
      if (csUpdates.length) {
        await Item.updateDocuments(csUpdates);
        doneChoices += csListe.length;
        if (!processed.includes('Welt-Items')) processed.push('Welt-Items');
      }
    } catch (e) {
      applyErrors += 1;
      console.error('Convert World | Übersetzen der Welt-Item-Auswahl-Pakete fehlgeschlagen', e);
    }
  }
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
  // Erst die Deltas der Marken-Akteure, danach die Namen gesammelt je Szene.
  let doneTokenNames = 0;
  const processedTokens = [];
  const sceneNameUpdates = new Map();
  for (const tp of tokenPlans) {
    if (!state.tokens.get(tp.key)) continue;
    try {
      let getan = 0;
      // Woerterbuch-Updates zuerst, Eintrags-Updates danach - wie beim Akteur.
      if (tp.choiceUpdates.length) {
        await tp.token.actor.updateEmbeddedDocuments('Item', mergeById(tp.choiceUpdates));
        doneChoices += tp.choiceUpdates.length;
        getan += tp.choiceUpdates.length;
      }
      const updates = [
        ...(tp.entries.length && tp.proposal ? tp.proposal.updates(tp.entries) : []),
        ...tp.itemUpdates,
      ];
      if (updates.length) {
        await tp.token.actor.updateEmbeddedDocuments('Item', updates);
        doneItems += updates.length;
        getan += updates.length;
      }
      if (tp.itemEffectUpdates.length) {
        const byItem = new Map();
        for (const ec of tp.itemEffectUpdates) {
          const list = byItem.get(ec.itemId) ?? [];
          list.push(ec.update);
          byItem.set(ec.itemId, list);
        }
        for (const [itemId, ups] of byItem) {
          const it = tp.token.actor?.items?.get?.(itemId);
          if (!it) continue;
          await it.updateEmbeddedDocuments('ActiveEffect', ups);
          doneEffects += ups.length;
          getan += ups.length;
        }
      }
      if (tp.actorEffectUpdates.length) {
        await tp.token.actor.updateEmbeddedDocuments('ActiveEffect', tp.actorEffectUpdates);
        doneEffects += tp.actorEffectUpdates.length;
        getan += tp.actorEffectUpdates.length;
      }
      if (tp.nameUpdate) {
        const list = sceneNameUpdates.get(tp.scene) ?? [];
        list.push(tp.nameUpdate);
        sceneNameUpdates.set(tp.scene, list);
        getan += 1;
      }
      if (getan) processedTokens.push(`${tp.name} (${tp.scene.name})`);
    } catch (e) {
      applyErrors += 1;
      console.error(`Convert World | Übersetzen fehlgeschlagen für Token "${tp.name}" (Szene "${tp.scene?.name}")`, e);
    }
  }
  for (const [scene, ups] of sceneNameUpdates) {
    try {
      await scene.updateEmbeddedDocuments('Token', ups);
      doneTokenNames += ups.length;
    } catch (e) {
      applyErrors += 1;
      console.error(`Convert World | Umbenennen der Token fehlgeschlagen (Szene "${scene?.name}")`, e);
    }
  }

  // Die Uebersetzung oben fasst nur Texte an; die Gewichte blieben sonst in Pfund.
  let weightNote = '';
  try {
    const weightApi = game.modules.get(MODULE_ID)?.api?.weight;
    if (weightApi?.isMetric?.() && weightApi.convertAllItemWeights) {
      const nW = await weightApi.convertAllItemWeights(true);
      if (nW) weightNote = ` · ${nW} Item-Gewicht${nW === 1 ? '' : 'e'} auf kg umgerechnet.`;
    }
  } catch (e) {
    console.error('Convert World | Gewichts-Umrechnung fehlgeschlagen', e);
  }

  ZEIT.anwenden = jetzt() - tAnwenden;
  // Teilzeiten nur nennen, wenn sie ins Gewicht fallen - beim zweiten Lauf sind
  // die Kompendien warm und die Angabe waere Ballast.
  const teileText = Object.entries(teileAnalyse)
    .filter(([, ms]) => ms > 1000 && ms > ZEIT.analyse * 0.05)
    .sort((a, b) => b[1] - a[1])
    .map(([name, ms]) => `${name} ${dauerText(ms)}`)
    .join(', ');
  const zeitText = `Bestandsaufnahme ${dauerText(ZEIT.analyse)}${teileText ? ` (davon ${teileText})` : ''}, Übersetzen ${dauerText(ZEIT.anwenden)}`;
  console.log(`Convert World | ${zeitText}`);

  // Zweite Diagnose-Datei: was tatsaechlich geschrieben wurde. Zusammen mit der
  // Analyse-Datei zeigt sie, ob ein Rest in Lauf 2 aus einer nicht gesehenen
  // Stelle stammt oder aus einer gesehenen, die nicht ankam.
  const abgewaehlt = {
    akteure: plans.filter((p) => !state.actors.get(p.id)).map((p) => p.id),
    weltItems: world.items.filter((w) => !state.items.get(w.id)).map((w) => w.id),
    token: tokenPlans.filter((tp) => !state.tokens.get(tp.key)).map((tp) => tp.key),
    zeilen: [...state.linesA].filter(([, an]) => an === false).map(([id]) => id),
    katA: Object.entries(state.catsA).filter(([, an]) => !an).map(([k]) => k),
    katI: Object.entries(state.catsI).filter(([, an]) => !an).map(([k]) => k),
  };
  let journalNote = '';
  if (state.journal) {
    try {
      const when = new Date().toLocaleString('de-DE');
      const journalHtml = `
        <p><strong>Akteure und Items konvertieren</strong> \u00b7 ${esc(when)}</p>
        <p>Übersetzt: ${nWord(doneItems, 'Item', 'Items')}, ${nWord(doneEffects, 'Effekt', 'Effekte')}, ${nWord(doneChoices, 'Text-Update (Auswahl-Pakete/Aktionen/Notizen/Werte)', 'Text-Updates (Auswahl-Pakete/Aktionen/Notizen/Werte)')}, ${nWord(doneHeads, 'Akteur-Feld', 'Akteur-Felder')}, ${nWord(doneTokenNames, 'Token-Name', 'Token-Namen')}${applyErrors ? ` \u00b7 Fehler: ${applyErrors}` : ''}</p>
        <p>Dauer: ${esc(zeitText)}</p>
        <p>Bearbeitete Akteure: ${esc(processed.join(', ') || 'keine')}</p>
        <p>Bearbeitete Token: ${esc(processedTokens.join(', ') || 'keine')}</p>
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
  merkeTempo(ausgewaehltJetzt, ZEIT.anwenden);
  const kopf = RUNDE > 1 ? `Nachprüfung (Runde ${RUNDE}) abgeschlossen` : 'Konvertierung abgeschlossen';
  const result = `${kopf}: ${nWord(doneItems, 'Item', 'Items')}, ${nWord(doneEffects, 'Effekt', 'Effekte')}, ${nWord(doneChoices, 'Text-Update (Auswahl-Pakete/Aktionen/Notizen/Werte)', 'Text-Updates (Auswahl-Pakete/Aktionen/Notizen/Werte)')}, ${nWord(doneHeads, 'Akteur-Feld', 'Akteur-Felder')} und ${nWord(doneTokenNames, 'Token-Name', 'Token-Namen')} übersetzt.${journalNote}${weightNote}`;
  if (applyErrors) {
    ui.notifications.warn(`${result} ${applyErrors} Fehler \u2013 Details in der Konsole (F12).`, { permanent: true });
  } else {
    // success gibt es seit Foundry v12, sonst info.
    (ui.notifications.success ?? ui.notifications.info).call(ui.notifications, result, { permanent: true });
  }

  // Nach Fehlern bewusst NICHT automatisch weiter: kein zweiter Durchlauf auf
  // einem halb geschriebenen Stand. MAX_RUNDEN ist die Notbremse, falls eine
  // Stelle in jeder Runde erneut auftaucht.
  if (applyErrors || RUNDE >= MAX_RUNDEN) {
    if (!applyErrors && RUNDE >= MAX_RUNDEN) {
      // Gruen, nicht gelb: das Ende der Kette ist der Normalfall.
      (ui.notifications.success ?? ui.notifications.info).call(
        ui.notifications,
        `Der Konverter hat ${MAX_RUNDEN} Durchläufe gemacht und prüft nicht weiter automatisch nach. Ob noch etwas offen ist, zeigt ein Start von Hand.`,
        { permanent: true },
      );
    }
    return;
  }
  // Was in dieser und in frueheren Runden abgewaehlt wurde, gilt weiter.
  const vereinige = (feld) => [...new Set([...(VORAUSWAHL?.[feld] ?? []), ...(abgewaehlt[feld] ?? [])])];
  const abgewaehltGesamt = {
    akteure: vereinige('akteure'),
    weltItems: vereinige('weltItems'),
    token: vereinige('token'),
    zeilen: vereinige('zeilen'),
    katA: vereinige('katA'),
    katI: vereinige('katI'),
  };
  const nachHint = ui.notifications.info('Nachprüfung: der Konverter sieht nach, ob durch diesen Durchlauf weitere Übersetzungen zuordenbar geworden sind …', { permanent: true });
  try {
    await argaConvertWorld({ runde: RUNDE + 1, abgewaehlt: abgewaehltGesamt });
  } catch (e) {
    console.error('Convert World | Nachprüfung fehlgeschlagen', e);
    ui.notifications.warn('Die Nachprüfung ist fehlgeschlagen (Details in der Konsole, F12). Der Durchlauf selbst ist davon unberührt.', { permanent: true });
  } finally {
    try { ui.notifications.remove?.(nachHint); } catch (e) {}
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
