/**
 * Gewichts-Umrechnung lb -> kg.
 *
 * Bei "weightUnit": "metric" rechnet SWADE die Traglast um (Faktor /2), laesst aber
 * "system.weight" der Gegenstaende unveraendert -> ein 10-lb-Item zeigt faelschlich
 * "10 kg" statt 5 kg. Beim Ziehen aus dem Kompendium wird daher das Originalgewicht
 * (lb) als Flag gesichert und bei metrisch halbiert; das Flag macht das Umschalten
 * verlustfrei reversibel. Nur Kompendium-Items (immer in lb); manuell angelegte
 * bleiben unberuehrt, bereits markierte werden nicht erneut halbiert.
 */

const MODULE_ID = 'argas-swade-translation-german';
const WEIGHT_FLAG = 'weightLbs'; // Originalgewicht in Pfund (lb), als Flag am Item

/** Modul aktiv? (Sprache Deutsch + nicht deaktiviert) - analog register.js */
function argaActive() {
  try {
    if (game.settings.get('core', 'language') !== 'de') return false;
    return game.settings.get(MODULE_ID, 'moduleDisabled') !== true;
  } catch (e) { return false; }
}

/** Ist die SWADE-Gewichtseinheit auf metrisch gestellt? */
function isMetric() {
  try { return game.settings.get('swade', 'weightUnit') === 'metric'; }
  catch (e) { return false; }
}

/** Saubere Rundung (vermeidet Float-Artefakte wie 0.30000000004). */
function roundWeight(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Zielgewicht je Modus.
 * metrisch = lb / 2 (exakt derselbe Faktor, den das System bei der Traglast nutzt),
 * imperial = lb (unveraendert).
 */
function weightForMode(lb, metric) {
  const v = Number(lb);
  if (!Number.isFinite(v)) return lb;
  return metric ? roundWeight(v / 2) : roundWeight(v);
}

/** Stammt das Item aus einem Kompendium (Drag&Drop / Makro-Import)? */
function compendiumSourceOf(item, data) {
  return item?._stats?.compendiumSource
      ?? data?._stats?.compendiumSource
      ?? item?.flags?.core?.sourceId
      ?? data?.flags?.core?.sourceId
      ?? null;
}

/**
 * Drag&Drop-Hook: Ein Item wird auf einen Akteur gelegt.
 * Laeuft VOR dem Anlegen; die Werte lassen sich daher per updateSource() setzen.
 */
Hooks.on('preCreateItem', (item, data, options, userId) => {
  if (!argaActive()) return;
  if (!item.parent) return; // nur Items auf einem Akteur (Charakterbogen), kein Welt-/Kompendium-Item

  // Bereits markiert? -> nichts tun (verhindert Doppel-Halbierung,
  // z. B. beim Kopieren von Akteur zu Akteur).
  if (foundry.utils.getProperty(item, `flags.${MODULE_ID}.${WEIGHT_FLAG}`) != null) return;

  // Nur Items mit echtem (numerischem) Gewicht.
  const lb = item.system?.weight;
  if (typeof lb !== 'number' || !Number.isFinite(lb)) return;

  // Nur aus dem Kompendium gezogene Items (deren Gewicht ist immer in lb).
  // Manuell auf dem Bogen angelegte Items haben keine Kompendium-Quelle -> unberuehrt.
  if (!compendiumSourceOf(item, data)) return;

  const updates = { [`flags.${MODULE_ID}.${WEIGHT_FLAG}`]: lb };
  if (isMetric()) updates['system.weight'] = weightForMode(lb, true);
  item.updateSource(updates);
});

/**
 * Baut fuer EIN (bereits existierendes) Item das passende Update-Objekt zum
 * Modus oder null (wenn nichts zu tun ist). Idempotent:
 *   - lb-Originalwert kommt aus dem Flag; fehlt das Flag, ist der aktuelle
 *     Gewichtswert der lb-Wert (das System aendert die Zahl ja nie selbst).
 *   - Zielwert = weightForMode(lb, metric).
 * Nur aus dem Kompendium stammende Items mit numerischem Gewicht; manuell
 * angelegte Items bleiben unberuehrt.
 */
function buildItemWeightUpdate(item, metric) {
  if (!compendiumSourceOf(item, null)) return null;
  const current = item.system?.weight;
  if (typeof current !== 'number' || !Number.isFinite(current)) return null;

  const flagged = foundry.utils.getProperty(item, `flags.${MODULE_ID}.${WEIGHT_FLAG}`);
  const lb = (typeof flagged === 'number' && Number.isFinite(flagged)) ? flagged : current;
  const target = weightForMode(lb, metric);

  const needFlag = (flagged !== lb);
  const needWeight = (current !== target);
  if (!needFlag && !needWeight) return null;

  const upd = { _id: item.id };
  if (needWeight) upd['system.weight'] = target;
  if (needFlag) upd[`flags.${MODULE_ID}.${WEIGHT_FLAG}`] = lb;
  return upd;
}

/**
 * Rechnet die Item-Gewichte ALLER Welt-Akteure auf den gewuenschten Modus um.
 * Idempotent und nur fuer den Spielleiter. Liefert die Anzahl geaenderter Items.
 * (Erfasst Welt-Akteure in game.actors; nicht-verknuepfte Token-Akteure auf
 *  Szenen bleiben aussen vor – seltener Sonderfall.)
 */
async function convertAllItemWeights(metric = isMetric()) {
  if (!game.user?.isGM) {
    ui.notifications?.warn('Die Gewichts-Umrechnung kann nur der Spielleiter ausführen.');
    return 0;
  }
  let changed = 0;
  for (const actor of game.actors) {
    const updates = [];
    for (const item of actor.items) {
      const upd = buildItemWeightUpdate(item, metric);
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
  return changed;
}

/**
 * Automatik: Reagiert auf das Umschalten der SWADE-Einstellung "weightUnit"
 * (scope world, kein Reload noetig) und rechnet den Bestand passend um.
 * Nur EIN Spielleiter fuehrt aus (vermeidet doppelte Updates bei mehreren GMs).
 */
Hooks.on('updateSetting', async (setting) => {
  if (!argaActive()) return;
  const key = setting?.key ?? `${setting?.namespace ?? ''}.${setting?.name ?? ''}`;
  if (key !== 'swade.weightUnit') return;

  const activeGM = game.users?.activeGM ?? null;
  if (activeGM ? (game.user !== activeGM) : !game.user?.isGM) return;

  const metric = isMetric();
  ui.notifications?.info(`Gewichtseinheit geändert – Item-Gewichte werden auf ${metric ? 'metrisch (kg)' : 'imperial (lb)'} umgerechnet …`);
  const n = await convertAllItemWeights(metric);
  ui.notifications?.info(`Gewichts-Umrechnung abgeschlossen: ${n} Gegenstände aktualisiert.`);
});

// API fuer das Begruessungsfenster und zum Anstossen in der Konsole:
// game.modules.get('argas-swade-translation-german').api.weight
Hooks.once('init', () => {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = Object.assign(mod.api ?? {}, {
    weight: { isMetric, weightForMode, WEIGHT_FLAG, convertAllItemWeights },
  });
});
