/*
 * Gewichts-Umrechnung lb -> kg.
 *
 * Bei "weightUnit": "metric" rechnet SWADE die Traglast um (Faktor /2), laesst
 * "system.weight" der Gegenstaende aber unveraendert - ein 10-lb-Item zeigt dann
 * "10 kg" statt 5 kg. Der Pfund-Wert wird deshalb als Flag am Item gesichert und
 * "system.weight" auf die eingestellte Einheit umgerechnet. Das Flag macht das
 * Umschalten verlustfrei umkehrbar und verhindert doppeltes Halbieren.
 */

const MODULE_ID = 'argas-swade-translation-german';
const WEIGHT_FLAG = 'weightLbs'; // Originalgewicht in Pfund (lb), als Flag am Item

function argaActive() {
  try {
    if (game.settings.get('core', 'language') !== 'de') return false;
    return game.settings.get(MODULE_ID, 'moduleDisabled') !== true;
  } catch (e) { return false; }
}

function isMetric() {
  try { return game.settings.get('swade', 'weightUnit') === 'metric'; }
  catch (e) { return false; }
}

function roundWeight(n) {
  return Math.round(n * 1000) / 1000;
}

function weightForMode(lb, metric) {
  const v = Number(lb);
  if (!Number.isFinite(v)) return lb;
  return metric ? roundWeight(v / 2) : roundWeight(v);
}

function compendiumSourceOf(item, data) {
  return item?._stats?.compendiumSource
      ?? data?._stats?.compendiumSource
      ?? item?.flags?.core?.sourceId
      ?? data?.flags?.core?.sourceId
      ?? null;
}

// preCreate laeuft vor dem Anlegen, die Werte lassen sich daher per
// updateSource() setzen.
Hooks.on('preCreateItem', (item, data, options, userId) => {
  if (!argaActive()) return;

  // Nur Weltdaten, nie Kompendiums-Inhalte.
  if (item.pack ?? item.parent?.pack ?? options?.pack) return;

  // Bereits markiert (z. B. Kopie von Akteur zu Akteur) -> nicht erneut halbieren.
  if (foundry.utils.getProperty(item, `flags.${MODULE_ID}.${WEIGHT_FLAG}`) != null) return;

  const value = item.system?.weight;
  if (typeof value !== 'number' || !Number.isFinite(value)) return;

  const metric = isMetric();

  // Aus dem Kompendium gezogen: die Zahl ist immer Pfund.
  if (compendiumSourceOf(item, data)) {
    const updates = { [`flags.${MODULE_ID}.${WEIGHT_FLAG}`]: value };
    if (metric) updates['system.weight'] = weightForMode(value, true);
    item.updateSource(updates);
    return;
  }

  // Selbst angelegt: die Zahl steht schon in der eingestellten Einheit; gemerkt
  // wird nur der Pfund-Gegenwert.
  item.updateSource({
    [`flags.${MODULE_ID}.${WEIGHT_FLAG}`]: metric ? roundWeight(value * 2) : value,
  });
});

// `sourceMetric` = Einheit, in der Gegenstaende OHNE Flag derzeit stehen (beim
// Umschalten also die vorherige). Liefert null, wenn nichts zu tun ist.
function buildItemWeightUpdate(item, metric, sourceMetric = metric) {
  const current = item.system?.weight;
  if (typeof current !== 'number' || !Number.isFinite(current)) return null;

  const flagged = foundry.utils.getProperty(item, `flags.${MODULE_ID}.${WEIGHT_FLAG}`);
  const hasFlag = (typeof flagged === 'number' && Number.isFinite(flagged));

  // Ohne Flag und ohne Einheitenwechsel ist die gemeinte Einheit unbekannt -
  // unberuehrt lassen statt raten.
  if (!hasFlag && sourceMetric === metric) return null;

  const lb = hasFlag ? flagged : (sourceMetric ? roundWeight(current * 2) : current);
  const target = weightForMode(lb, metric);

  const needFlag = (flagged !== lb);
  const needWeight = (current !== target);
  if (!needFlag && !needWeight) return null;

  const upd = { _id: item.id };
  if (needWeight) upd['system.weight'] = target;
  if (needFlag) upd[`flags.${MODULE_ID}.${WEIGHT_FLAG}`] = lb;
  return upd;
}

// Erfasst Gegenstaende der Welt-Akteure und des Gegenstands-Verzeichnisses;
// Kompendien und nicht-verknuepfte Token-Akteure bleiben unberuehrt.
async function convertAllItemWeights(metric = isMetric(), sourceMetric = metric) {
  if (!game.user?.isGM) {
    ui.notifications?.warn('Die Gewichts-Umrechnung kann nur der Spielleiter ausführen.');
    return 0;
  }
  let changed = 0;

  for (const actor of game.actors) {
    const updates = [];
    for (const item of actor.items) {
      const upd = buildItemWeightUpdate(item, metric, sourceMetric);
      if (upd) updates.push(upd);
    }
    if (updates.length) {
      try {
        await actor.updateEmbeddedDocuments('Item', updates);
        changed += updates.length;
      } catch (e) {
        console.error(`${MODULE_ID} | Gewichts-Umrechnung bei Akteur "${actor.name}":`, e);
      }
    }
  }

  const freie = [];
  for (const item of game.items ?? []) {
    const upd = buildItemWeightUpdate(item, metric, sourceMetric);
    if (upd) freie.push(upd);
  }
  if (freie.length) {
    try {
      await CONFIG.Item.documentClass.updateDocuments(freie);
      changed += freie.length;
    } catch (e) {
      console.error(`${MODULE_ID} | Gewichts-Umrechnung im Gegenstands-Verzeichnis:`, e);
    }
  }

  return changed;
}

// Deutung fuer Gegenstaende ohne Flag beim Umschalten: stand die Welt vorher auf
// imperial, ist deren Zahl ein Pfund-Wert.
let lastKnownMetric = false;
Hooks.once('ready', () => { lastKnownMetric = isMetric(); });

Hooks.on('updateSetting', async (setting) => {
  if (!argaActive()) return;
  const key = setting?.key ?? `${setting?.namespace ?? ''}.${setting?.name ?? ''}`;
  if (key !== 'swade.weightUnit') return;

  const previousMetric = lastKnownMetric;
  const metric = isMetric();
  lastKnownMetric = metric;
  if (previousMetric === metric) return; // Einstellung neu geschrieben, aber gleicher Wert

  // Nur ein Spielleiter rechnet um, sonst laufen die Updates doppelt.
  const activeGM = game.users?.activeGM ?? null;
  if (activeGM ? (game.user !== activeGM) : !game.user?.isGM) return;

  ui.notifications?.info(`Gewichtseinheit geändert – Item-Gewichte werden auf ${metric ? 'metrisch (kg)' : 'imperial (lb)'} umgerechnet …`);
  const n = await convertAllItemWeights(metric, previousMetric);
  ui.notifications?.info(`Gewichts-Umrechnung abgeschlossen: ${n} Gegenstände aktualisiert.`);
});

Hooks.once('init', () => {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = Object.assign(mod.api ?? {}, {
    weight: { isMetric, weightForMode, WEIGHT_FLAG, convertAllItemWeights },
  });
});
