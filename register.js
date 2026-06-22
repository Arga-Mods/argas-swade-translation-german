const MODULE_ID = 'argas-swade-translation-german';

function argaModuleDisabled() {
  try { return game.settings.get(MODULE_ID, 'moduleDisabled') === true; } catch (e) { return false; }
}

// Originalmodul (kostenpflichtig) aktiv? HARTE Voraussetzung – ohne das Original
// findet keine Übersetzung statt. Die `requires`-Angabe in module.json lässt sich
// leicht entfernen, daher zusätzlich dieser Laufzeit-Check.
function coreRulesActive() {
  try { return game.modules.get('swade-core-rules')?.active === true; } catch (e) { return false; }
}

function argaActive() {
  if (game.settings.get('core', 'language') !== 'de') return false;
  if (!coreRulesActive()) return false;
  return !argaModuleDisabled();
}

let argaSettingsRegistered = false;
function argaRegisterSettings() {
  if (argaSettingsRegistered) return;
  argaSettingsRegistered = true;
  game.settings.register(MODULE_ID, 'moduleDisabled', {
    name: 'Modul deaktivieren',
    hint: 'Deaktiviert die deutsche Übersetzung, unabhängig von der eingestellten Sprache. Charaktere und Items, die unter Nutzung der übersetzten Kompendien in der Spielwelt erstellt wurden, bleiben jedoch weiterhin deutsch. Zum schnellen Wechsel zwischen Deutsch und Englisch wird das bereitgestellte Makro empfohlen.',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    requiresReload: true,
  });
  game.settings.register(MODULE_ID, 'hideMacroPack', {
    name: '"Makros (Arga)" ausblenden',
    hint: 'Die Anzeige des Kompendiums mit Arga\'s Makros in der Sidebar wird unterbunden. Bereits in die Makroleiste gezogene Makros stehen aber weiterhin zur Verfügung.',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
    onChange: () => { try { ui.compendium?.render(); } catch (e) {} },
  });
  game.settings.register(MODULE_ID, 'welcomeDismissed', {
    name: 'Begrüßungsfenster ausblenden',
    hint: 'Das Begrüßungsfenster wird nur noch bei Vorliegen wichtiger Neuerungen angezeigt.',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
  });
}

const converters = {
  // system.actions bei Rüstungen/Schilden komplett übersetzen.
  // Babele 2.9.1 lehnt Objekt-Payloads bei statischen Pfad-Mappings ab
  // (primitive-converter.js: Grund "structural"). Daher läuft das
  // Aktionen-Feld jetzt über diesen Converter. Verhalten entspricht
  // exakt dem alten statischen Mapping: kompletter Ersatz durch den
  // deutschen Wert aus der JSON.
  "armorActions": (original, translation) => {
    return (translation && typeof translation === 'object') ? translation : original;
  },

  "edgeCategory": (category) => {
    const map = {
      "Background": "Hintergrund",
      "Combat": "Kampf",
      "Leadership": "Anführer",
      "Power": "Macht",
      "Professional": "Experte",
      "Social": "Sozial",
      "Weird": "Übersinnlich",
      "Legendary": "Legendär",
      "Edge Actions": "Vorteilsaktionen",
      "": ""
    };
    return map[category] ?? category;
  },

  "actionCategory": (category) => {
    const map = {
      "Adventure Toolkit": "Informationsbeschaffung",
      "Edges": "Talente",
      "Healing": "Heilung",
      "Situational Rules": "Situative Regeln",
      "Special Ability Actions": "Spezialfähigkeiten",
      "Weapon Actions": "Waffenaktionen",
      "": ""
    };
    return map[category] ?? category;
  },

  "armorCategory": (category) => {
    const map = {
      "Futuristic": "Futuristisch",
      "Modern": "Modern",
      "Medieval & Ancient": "Mittelalterlich & Antik",
      "Shields": "Schilde",
      "": ""
    };
    return map[category] ?? category;
  },

  "firearmsCategory": (category) => {
    const map = {
      "Lasers (Futuristic)": "Laser (Futuristisch)",
      "Rifles": "Gewehre",
      "Shotguns": "Schrotflinten",
      "Machine Guns": "Maschinengewehre",
      "Pistols": "Pistolen",
      "Submachine Guns": "Maschinenpistolen",
      "Vehicular Weapons": "Fahrzeugwaffen",
      "": ""
    };
    return map[category] ?? category;
  },

  "abilityCategory": (category) => {
    const map = {
      "Special Ability": "Spezialfähigkeit",
      "": ""
    };
    return map[category] ?? category;
  },

  "equipmentCategory": (category) => {
    const map = {
      "Adventuring Gear": "Ausrüstung (Allg.)",
      "Computers & Electronics": "Computer & Elektronik",
      "Firearms Accessories": "Feuerwaffenzubehör",
      "Food": "Nahrung",
      "Laser Battery": "Muni (Laser)",
      "Personal Defense": "Selbstverteidigung",
      "Shotgun": "Muni (Schrot)",
      "Surveillance": "Überwachung",
      "Ammo": "Muni (primitiv)",
      "Animals and Tack": "Tiere und Zubehör",
      "Weapon Magazine": "Muni (Magazine)",
      "Bullet": "Muni (Patronen)",
      "Cannon": "Muni (Kanonen)",
      "Clothing": "Kleidung",
      "": ""
    };
    return map[category] ?? category;
  },

  "ancestralCategory": (category) => {
    const map = {
      "Core Ancestry": "Abstammung (Grundeigenarten)",
      "Negative": "Abstammung (negativ)",
      "Positive": "Abstammung (positiv)",
      "": ""
    };
    return map[category] ?? category;
  },

  "rankRequirement": (requirements) => {
    if (!Array.isArray(requirements)) return requirements;

    const RANK = {
      0: "Anfänger",
      1: "Fortgeschritten",
      2: "Veteran",
      3: "Heroisch",
      4: "Legendär"
    };

    const ATTR = {
      "agility":  "Geschicklichkeit",
      "smarts":   "Verstand",
      "spirit":   "Willenskraft",
      "strength": "Stärke",
      "vigor":    "Konstitution"
    };

    const SKILL = {
      "academics":       "Akademisches Wissen",
      "athletics":       "Athletik",
      "battle":          "Kriegskunst",
      "boating":         "Seefahrt",
      "commonKnowledge": "Allgemeinwissen",
      "driving":         "Fahren",
      "electronics":     "Elektronik",
      "faith":           "Glaube",
      "fighting":        "Kämpfen",
      "focus":           "Fokus",
      "gambling":        "Glücksspiel",
      "hacking":         "Hacken",
      "healing":         "Heilen",
      "intimidation":    "Einschüchtern",
      "language":        "Sprache",
      "notice":          "Wahrnehmung",
      "occult":          "Okkultismus",
      "performance":     "Auftreten",
      "persuasion":      "Überreden",
      "piloting":        "Pilot",
      "psionics":        "Psionik",
      "repair":          "Reparieren",
      "research":        "Recherche",
      "riding":          "Reiten",
      "science":         "Wissenschaft",
      "shooting":        "Schießen",
      "spellcasting":    "Zaubern",
      "stealth":         "Heimlichkeit",
      "survival":        "Überleben",
      "taunt":           "Provozieren",
      "thievery":        "Diebeskunst",
      "weirdScience":    "Verrückte Wissenschaft",
      "weird-science":   "Verrückte Wissenschaft"
    };

    const EDGE_LABEL = {
      "Acrobat": "Akrobat",
      "Arcane Background (Gifted)": "Arkaner Hintergrund (Begabt)",
      "Arcane Background (Magic)": "Arkaner Hintergrund (Magie)",
      "Arcane Background (Miracles)": "Arkaner Hintergrund (Wunder)",
      "Arcane Background (Psionics)": "Arkaner Hintergrund (Psionik)",
      "Arcane Background (Weird Science)": "Arkaner Hintergrund (Verrückte Wissenschaft)",
      "Arcane Resistance": "Arkane Resistenz",
      "Attractive": "Attraktiv",
      "Block": "Block",
      "Brave": "Mutig",
      "Brawler": "Raufbold",
      "Command": "Anführer",
      "Counterattack": "Riposte",
      "Dodge": "Ausweichen",
      "Expert in affected Trait": "Experte in betr. Fertigkeit",
      "Extraction": "Rückzug",
      "Fame": "Bekannt",
      "First Strike": "Erstschlag",
      "Frenzy": "Schneller Angriff",
      "Hard To Kill": "Schwer zu töten",
      "Level Headed": "Kühler Kopf",
      "Luck": "Glück",
      "Martial Artist": "Kampfkünstler",
      "Martial Warrior": "Kampfkunstmeister",
      "Nerves of Steel": "Schmerzresistenz",
      "Professional in affected Trait": "Profi in betr. Fertigkeit",
      "Rapid Fire": "Schnellfeuer",
      "Rapid Recharge": "Schnelle Machtregeneration",
      "Rich": "Reich",
      "Strong Willed": "Starker Wille",
      "Sweep": "Rundumschlag",
      "Tactician": "Taktiker",
      "Tough as Nails": "Zäh wie Leder",
      "Trademark Weapon": "Lieblingswaffe",
      "Weapon Master": "Waffenmeister",
      "Work the Room": "Rampensau"
    };

    const HINDRANCE = {
      "Bloodthirsty": "Blutrünstig",
      "Mean": "Gemein",
      "Ruthless": "Skrupellos",
      "Ugly": "Hässlich"
    };

    const OTHER = {
      "Arcane Background (Any)": "Arkaner Hintergrund (beliebig)",
      "arcane skill W10+": "Arkane Fertigkeit W10+",
      "arcane skill W8+": "Arkane Fertigkeit W8+",
      "arcane skill d10+": "Arkane Fertigkeit W10+",
      "arcane skill d8+": "Arkane Fertigkeit W8+",
      "maximum die type possible in affected Trait": "Maximaler Würfeltyp in betr. Fertigkeit",
      "skill with the chosen weapon of W8+": "Fertigkeit in betr. Waffe W8+",
      "skill with the chosen weapon of d8+": "Fertigkeit in betr. Waffe W8+",
      "Wild Card": "Wildcard",
      "Any Arcane Background": "Beliebiger Arkaner Hintergrund"
    };

    const RANK_LABEL = {
      "Novice": "Anfänger",
      "Seasoned": "Fortgeschritten",
      "Veteran": "Veteran",
      "Heroic": "Heroisch",
      "Legendary": "Legendär"
    };

    const ATTR_LABEL = {
      "Agility": "Geschicklichkeit",
      "Smarts": "Verstand",
      "Spirit": "Willenskraft",
      "Strength": "Stärke",
      "Vigor": "Konstitution"
    };

    const SKILL_LABEL = {
      "Academics": "Akademisches Wissen",
      "Athletics": "Athletik",
      "Battle": "Kriegskunst",
      "Boating": "Seefahrt",
      "Common Knowledge": "Allgemeinwissen",
      "Driving": "Fahren",
      "Electronics": "Elektronik",
      "Faith": "Glaube",
      "Fighting": "Kämpfen",
      "Focus": "Fokus",
      "Gambling": "Glücksspiel",
      "Hacking": "Hacken",
      "Healing": "Heilen",
      "Intimidation": "Einschüchtern",
      "Language": "Sprache",
      "Notice": "Wahrnehmung",
      "Occult": "Okkultismus",
      "Performance": "Auftreten",
      "Persuasion": "Überreden",
      "Piloting": "Pilot",
      "Psionics": "Psionik",
      "Repair": "Reparieren",
      "Research": "Recherche",
      "Riding": "Reiten",
      "Science": "Wissenschaft",
      "Shooting": "Schießen",
      "Spellcasting": "Zaubern",
      "Stealth": "Heimlichkeit",
      "Survival": "Überleben",
      "Taunt": "Provozieren",
      "Thievery": "Diebeskunst",
      "Weird Science": "Verrückte Wissenschaft"
    };

    return requirements.map(req => {
      const t = {...req};
      switch (req.type) {

        case "rank":
          if (RANK[req.value] !== undefined) t.label = RANK[req.value];
          break;

        case "attribute":
          if (ATTR[req.selector]) t.label = ATTR[req.selector];
          break;

        case "skill":
          if (SKILL[req.selector]) t.label = SKILL[req.selector];
          break;

        case "edge":
          // IDs sind im SWADE-Original oft leer → Fallback auf Label
          if (EDGE_LABEL[req.label]) {
            t.label = EDGE_LABEL[req.label];
          }
          break;

        case "hindrance":
          if (HINDRANCE[req.label]) t.label = HINDRANCE[req.label];
          break;

        case "wildCard":
          t.label = "Wildcard";
          break;

        case "other":
          if (req.label) {
            let label = req.label;
            // 1. Exakte Treffer (Ränge, Sonderbegriffe, bekannte Freitexte)
            if (RANK_LABEL[label]) { t.label = RANK_LABEL[label]; break; }
            if (OTHER[label]) { t.label = OTHER[label]; break; }
            // 2. Attribut + Würfel: "Agility d8+" → "Geschicklichkeit W8+"
            for (const [en, de] of Object.entries(ATTR_LABEL)) {
              if (label.startsWith(en)) { label = label.replace(en, de); break; }
            }
            // 3. Fertigkeit + Würfel: "Fighting d6+" → "Kämpfen W6+"
            for (const [en, de] of Object.entries(SKILL_LABEL)) {
              if (label.startsWith(en)) { label = label.replace(en, de); break; }
            }
            // 4. Würfelnotation: d4 → W4, d6 → W6, etc.
            label = label.replace(/\bd(\d+)/g, "W$1");
            t.label = label;
          }
          break;
      }
      return t;
    });
  },

  "powerRank": (rank) => {
    const map = {
      "Novice": "Anfänger",
      "Seasoned": "Fortgeschritten",
      "Veteran": "Veteran",
      "Heroic": "Heroisch",
      "Legendary": "Legendär"
    };
    return map[rank] ?? rank;
  },

  "weaponCategory": (cat) => {
    const map = {
      "Blackpowder Weapons": "Schwarzpulver",
      "Melee Weapons, Futuristic": "Nahkampf (futuristisch)",
      "Melee Weapons, Modern": "Nahkampf (modern)",
      "Melee Weapons, Medieval": "Nahkampf (mittelalterlich)",
      "Natural/Improvised Weapons": "Improvisiert / Natürlich",
      "Ranged Weapons, Medieval": "Fernkampf (mittelalterlich)",
      "Ranged Weapons, Modern": "Fernkampf (modern)"
    };
    return map[cat] ?? cat;
  },

  "specialWeaponCategory": (cat) => {
    const map = {
      "Cannons": "Kanonen",
      "Catapults": "Katapulte",
      "Flamethrowers": "Flammenwerfer",
      "Grenades": "Granaten",
      "Mines": "Minen",
      "Missiles": "Raketen",
      "Rocket Launchers & Torpedoes": "Werfer & Torpedos",
      "Vehicular Weapons": "Fahrzeugwaffen"
    };
    return map[cat] ?? cat;
  },

  // Reichweite bei Mächten übersetzen (system.range)
  // "Sm"/"Smarts" → "Verstand", "x 2" → "x2" normalisieren
  "powerRange": (range) => {
    if (!range) return range;
    return range
      .replace(/Smarts/g, "Verstand")
      .replace(/\bSm\b/g, "Verstand")
      .replace(/x\s+(\d)/g, "x$1")
      .replace(/\bTouch\b/g, "Berührung")
      .replace(/\bSelf\b/g, "Selbst")
      .replace(/\bCone Template\b/g, "Kegelschablone")
      .replace(/Sound/g, "Geräusch")
      .replace(/Silence/g, "Stille");
  },

  "powerDuration": (duration) => {
    if (!duration) return duration;
    const fullMap = {
      "A brief conversation of about five minutes": "Ein kurzes Gespräch von etwa fünf Minuten",
      "Until the end of the victim's next turn": "Bis zum Ende des nächsten Zugs des Opfers",
    };
    if (fullMap[duration]) return fullMap[duration];
    return duration
      .replace(/\bInstant\b/g, "Sofort")
      .replace(/\bSpecial\b/g, "Speziell")
      .replace(/\bOne Hour\b/g, "Eine Stunde")
      .replace(/\bOne hour\b/g, "Eine Stunde")
      .replace(/\bone hour\b/g, "eine Stunde")
      .replace(/\b[Mm]inutes\b/g, "Minuten")
      .replace(/\bdetect\b/g, "Entdecken")
      .replace(/\bconceal\b/g, "Verbergen")
      .replace(/\bboost\b/g, "Erhöhen")
      .replace(/\blower\b/g, "Senken")
      .replace(/\bSound\b/g, "Geräusch")
      .replace(/\bSilence\b/g, "Stille")
      .replace(/\bslot\b/g, "Trägheit")
      .replace(/\bspeed\b/g, "Beschleunigung");
  },

  // Trait-Feld in Actions (system.actions.trait) übersetzen
  // Damit der Skill-/Attribut-Lookup auf dem Charakterbogen funktioniert
  "actionTrait": (trait) => {
    if (!trait) return trait;
    const map = {
      "Persuasion": "Überreden",
      "Intimidation": "Einschüchtern",
      "Fighting": "Kämpfen",
      "Athletics": "Athletik",
      "Vigor": "Konstitution",
      "Strength": "Stärke",
      "Shooting": "Schießen",
      "Healing": "Heilen",
      "Notice": "Wahrnehmung",
      "Stealth": "Heimlichkeit",
      "Common Knowledge": "Allgemeinwissen",
      "Academics": "Akademisches Wissen",
      "Battle": "Kriegskunst",
      "Boating": "Seefahrt",
      "Driving": "Fahren",
      "Electronics": "Elektronik",
      "Faith": "Glaube",
      "Focus": "Fokus",
      "Gambling": "Glücksspiel",
      "Hacking": "Hacken",
      "Occult": "Okkultismus",
      "Performance": "Auftreten",
      "Piloting": "Pilot",
      "Psionics": "Psionik",
      "Repair": "Reparieren",
      "Research": "Recherche",
      "Riding": "Reiten",
      "Science": "Wissenschaft",
      "Spellcasting": "Zaubern",
      "Survival": "Überleben",
      "Taunt": "Provozieren",
      "Thievery": "Diebeskunst",
      "Weird Science": "Verrückte Wissenschaft",
      "Agility": "Geschicklichkeit",
      "Smarts": "Verstand",
      "Spirit": "Willenskraft",
    };
    return map[trait] ?? trait;
  },

  "actionButtons": (additional) => {
    const nameMap = {
      "Damage": "Schaden",
      "Disarm Limb (Strength)": "Entwaffnen vermeiden (Treffer Gliedmaße)",
      "Disarm Hand (Strength)": "Entwaffnen vermeiden (Treffer Hand)",
      "Fear Check": "Furchtprobe",
      "Fear Roll": "Wurf auf Furchttabelle",
      "Frenzy": "Schneller Angriff",
      "Oppose Grapple": "Verteidigen",
      "Crush": "Zerquetschen",
      "Improved Frenzy": "Blitzschneller Angriff",
      "Heal Self": "Heilung anwenden (Token auswählen)",
      "Money Talks": "Lass Geld fließen (+2)",
      "Busting Heads": "Schädel einschlagen (+2)",
      "Resist (Vigor)": "Widerstehen (Konstitution)",
      "Knockout Poison": "Betäubendes Gift (K.O.)",
      "Lethal Poison": "Tödliches Gift",
      "Mild Poison": "Leichtes Gift",
      "Paralyzing Poison": "Lähmendes Gift",
      "Athletics": "Athletik",
      "Oppose (Strength)": "Verteidigen (Stärke)",
      "Oppose (Athletics)": "Verteidigen (Athletik)",
      "Avoid Prone": "Sturz vermeiden",
      "Avoid Prone (raise)": "Sturz vermeiden (gg. Steigerung)",
      "Heal Selected": "Heilung anwenden (Token auswählen)",
      "Resist": "Widerstehen",
      "Unwilling Target": "Unwilliges Ziel",
      "Apply Status": "Status anwenden",
      "Apply Effect": "Effekt anwenden",
      "Remove Status": "Status entfernen",
      "Shake Off": "Effekt abschütteln",
      "Shake Off (Strong)": "Effekt abschütteln (gg. Steigerung)",
      "Spirit": "Willenskraft",
      "Spirit (Raise)": "Willenskraft (gg. Steigerung)",
      "Vigor": "Konstitution",
      "Vigor (Raise)": "Konstitution (gg. Steigerung)",
      "Touch Attack": "Berührungsangriff",
      "Damage (3d6)": "Schaden (3W6)",
      "Smite Weapons": "Waffen verzaubern",
      "Add Edges": "Talent hinzufügen",
      "Bash (d12)": "Rammen (W12+W6) - [Steigerung]",
      "d10+d6": "Stoßen (W10+W6)",
      "Push": "Stoßen",
      "RoF 2 Attack": "FR 2 Angriff",
      "RoF 3 Attack": "FR 3 Angriff",
      "RoF 4 Attack": "FR 4 Angriff",
      "RoF 5 Attack": "FR 5 Angriff",
      "RoF 2 Reaction Fire": "FR 2 Reaktionsfeuer",
      "RoF 3 Reaction Fire": "FR 3 Reaktionsfeuer",
      "RoF 4 Reaction Fire": "FR 4 Reaktionsfeuer",
      "Snapfire": "Schnellfeuer",
      "Snapfire RoF 2": "Schnellfeuer FR 2",
      "Snapfire RoF 3": "Schnellfeuer FR 3",
      "Snapfire RoF 4": "Schnellfeuer FR 4",
      "Snapfire RoF 5": "Schnellfeuer FR 5",
      "Short Range": "Kurze Reichweite",
      "Medium Range": "Mittlere Reichweite",
      "Long Range": "Lange Reichweite",
      "Close Range": "Kurze Reichweite",
      "Close Range AP": "Kurze Reichweite PB",
      "Slugs": "Flintenlaufgeschosse",
      "Double Barrel Slugs": "Doppellauf Flintenlaufgeschosse",
      "Double-Barrel Short Range": "Doppellauf Kurze Reichweite",
      "Double-Barrel Medium Range": "Doppellauf Mittlere Reichweite",
      "Double-Barrel Long Range": "Doppellauf Lange Reichweite",
      "Single Shot": "Einzelschuss",
      "One-handed": "Einhändig",
      "Attached to Rifle": "Am Gewehr befestigt",
      "Fighting": "Kämpfen",
      "Athletics (throwing)": "Athletik (Werfen)",
      "Overcharge": "Überladung",
      "Three-Round Burst": "Dreier-Feuerstoß",
      "A-2 Three-Round Burst": "A-2 Dreier-Feuerstoß",
      "Nonlethal Damage": "Betäubungsschaden",
      "Rollover (Raise Damage)": "Todesrolle (Steigerungsschaden)",
      "Bombard, Precise Location": "Bombardieren, Genaue Position",
      "Bombard, Rough Location": "Bombardieren, Ungefähre Position",
      "Inflict Poison": "Gift injizieren",
      "Resist Poison": "Gift widerstehen",
      "Resist Poison (-4)": "Gift widerstehen (−4)",
      "Wild Attack": "Rücksichtsloser Angriff",
      "Apply Cards": "Aktionskarte anbieten",
      "Attempt to Acquire Skill": "Fertigkeit erwerben",
      "Support (Performance)": "Unterstützung (Darstellung)",
      "Support (Persuasion)": "Unterstützung (Überreden)",
      "Test (Intimidation)": "Herausforderung (Einschüchtern)",
      "Test (Taunt)": "Herausforderung (Provozieren)",
      "Resist Test (Smarts)": "Herausforderung widerstehen (Verstand)",
      "Resist Test (Spirit)": "Herausforderung widerstehen (Willenskraft)",
      "ROF2": "FR 2",
      "ROF3": "FR 3",
      "ROF4": "FR 4",
      "ROF5": "FR 5",
      "ROF6": "FR 6",
      "Double Tap": "Doppelschuss",
      "Double Tap with 3RB": "Doppelschuss mit Dreier-Feuerstoß",
      "Dual-Linked": "Gekoppelte Waffe (2-fach)",
      "Dual-Linked Damage": "Gekoppelte Waffe (2-fach) Schaden",
      "Quad-Linked": "Gekoppelte Waffe (4-fach)",
      "Quad-Linked Damage": "Gekoppelte Waffe (4-fach) Schaden",
      "Shotgun — Bonus": "Schrotflinte — Bonus",
      "Shotgun — Short Range (Base)": "Schrotflinte — Kurze Reichweite (Basis)",
      "Shotgun — Medium Range (Base)": "Schrotflinte — Mittlere Reichweite (Basis)",
      "Shotgun — Long Range (Base)": "Schrotflinte — Lange Reichweite (Basis)",
      "Shotgun — DB Short Range": "Schrotflinte — Doppellauf Kurze Reichweite",
      "Shotgun — DB Medium Range": "Schrotflinte — Doppellauf Mittlere Reichweite",
      "Shotgun — DB Long Range": "Schrotflinte — Doppellauf Lange Reichweite",
      "Shotgun — Slugs (Trait)": "Schrotflinte — Flintenlaufgeschosse (Probe)",
      "Shotgun — Slugs (Damage)": "Schrotflinte — Flintenlaufgeschosse (Schaden)",
      "Shotgun — Double Barrel Slugs (Damage)": "Schrotflinte — Doppellauf Flintenlaufgeschosse (Schaden)",
    };
    const traitMap = {
      "Persuasion": "Überreden",
      "Intimidation": "Einschüchtern",
      "Fighting": "Kämpfen",
      "Athletics": "Athletik",
      "Vigor": "Konstitution",
      "Strength": "Stärke",
      "Shooting": "Schießen",
      "Healing": "Heilen",
      "Notice": "Wahrnehmung",
      "Stealth": "Heimlichkeit",
      "Common Knowledge": "Allgemeinwissen",
      "Academics": "Akademisches Wissen",
      "Battle": "Kriegskunst",
      "Boating": "Seefahrt",
      "Driving": "Fahren",
      "Electronics": "Elektronik",
      "Faith": "Glaube",
      "Focus": "Fokus",
      "Gambling": "Glücksspiel",
      "Hacking": "Hacken",
      "Occult": "Okkultismus",
      "Performance": "Auftreten",
      "Piloting": "Pilot",
      "Psionics": "Psionik",
      "Repair": "Reparieren",
      "Research": "Recherche",
      "Riding": "Reiten",
      "Science": "Wissenschaft",
      "Spellcasting": "Zaubern",
      "Survival": "Überleben",
      "Taunt": "Provozieren",
      "Thievery": "Diebeskunst",
      "Weird Science": "Verrückte Wissenschaft",
      "Agility": "Geschicklichkeit",
      "Smarts": "Verstand",
      "Spirit": "Willenskraft",
    };
    if (!additional || typeof additional !== 'object') return additional;
    const result = JSON.parse(JSON.stringify(additional));
    for (const [key, val] of Object.entries(result)) {
      if (val?.name && nameMap[val.name]) {
        result[key].name = nameMap[val.name];
      }
      if (val?.override && traitMap[val.override]) {
        result[key].override = traitMap[val.override];
      }
    }
    return result;
  },

  "sourceTranslation": (source) => {
    const map = {
      "SWADE Core Rules": "Grundregelwerk",
      "Savage Worlds Adventure Edition": "Grundregelwerk",
      "": ""
    };
    return map[source] ?? source;
  },

  "weaponNotes": (notes) => {
    if (!notes || typeof notes !== 'string') return notes;
    const map = {
      "Two hands": "Zweihändig",
      "Parry +1": "Parade +1",
      "+1 Parry, Reach 1": "Parade +1, Reichweite 1",
      "Parry +1, Reach 1": "Parade +1, Reichweite 1",
      "Parry +1, Reach 1, Two hands": "Parade +1, Reichweite 1, Zweihändig",
      "Parry −1, Two hands": "Parade −1, Zweihändig",
      "Parry –1, two hands": "Parade –1, Zweihändig",
      "Parry -1, Two hands": "Parade −1, Zweihändig",
      "Reach 1": "Reichweite 1",
      "Reach 1, Two hands": "Reichweite 1, Zweihändig",
      "Reach 1, two hands": "Reichweite 1, Zweihändig",
      "Reach 2": "Reichweite 2",
      "Reach 2, Two hands": "Reichweite 2, Zweihändig",
      "Reach 2, two hands": "Reichweite 2, Zweihändig",
      "AP 1": "PB 1",
      "AP 2": "PB 2",
      "Spiked, AP 1": "Mit Schlagdorn, PB 1",
      "Cannot be thrown": "Kann nicht geworfen werden.",
      "Hand-drawn": "Handgespannt",
      "Ignores shield bonus": "Ignoriert Boni durch Schilde",
      "Two hands, +2 damage to break objects": "Zweihändig, +2 Schaden gegen Gegenstände",
      "Critical Failure hits the user": "Kritischer Fehlschlag trifft den Angreifer.",
      "Includes cavalry sabers": "Beinhaltet Reitersäbel",
      "Basic swords and scimitars": "Standardschwerter und Krummschwerter",
      "Often carried by law enforcement": "Oft die Waffe von Gesetzeshütern",
      "A sign of low status or thuggery": "Für arme Schlucker und Kriminelle",
      "Do not count as a weapon for Unarmed Defender": "Zählt nicht als Waffe für die Regel Unbewaffneter Verteidiger.",
      "Black powder weapons are Reload 3.": "Schwarzpulverwaffen haben Nachladen 3.",
      "Black powder weapons are Reload 3. Treat as Shotgun.": "Schwarzpulverwaffen haben Nachladen 3. Regeln wie Schrotflinten.",
      "Reload 4. The tight rifling requires four actions to reload instead of the usual three.": "Nachladen 4. Der gezogene Lauf erfordert vier Aktionen zum Nachladen statt der üblichen drei.",
      "Requires a windlass to load. Reload 2": "Wird mit Kurbel gespannt. Nachladen 2.",
      "Str+d6 and Parry +1 attached to rifle, Reach 1, two hands": "Stä+W6 und Parade +1 wenn an einem Gewehr befestigt, Reichweite 1, Zweihändig",
      "Basic tools in handle add +1 to Survival rolls": "Einfache Werkzeuge im Griff, +1 auf Überlebensproben.",
      "AP 2 when charging, Reach 2, only usable in mounted combat": "PB 2 bei Sturmangriff, Reichweite 2, nur einsetzbar im berittenen Kampf",
      "Reach 1. Parry +1 if used two-handed": "Reichweite 1, Parade +1 bei Verwendung mit zwei Händen.",
      "A shotgun shell on a stick used in melee; must be reloaded with a fresh shell (one action)": "Ein Schrotpatrone an einem Stock, der im Nahkampf verwendet wird; muss mit einer neuen Patrone nachgeladen werden (eine Aktion)",
      "A successful hit means the target is Entangled (see page 98). The net is Hardness 10 and vulnerable only to cutting attacks.": "Bei einem erfolgreichen Treffer ist das Ziel Festgehalten. Das Netz hat Härte 10 und ist nur durch Schnittangriffe zu zerstören.",
      "−2 to be Noticed if hidden": "−2 auf Wahrnehmungsprobe wenn versteckt.",
      "No Recoil, Overcharge, Cauterize": "Kein Rückstoß, Überladen, Kauterisieren",
      "Laser Battery, Pistol": "Laserbatterie, Pistole",
      "Laser Battery, SMG/Rifle": "Laserbatterie, MP/Gewehr",
      "Heavy Weapon": "Schwere Waffe",
      "Heavy Weapon.": "Schwere Waffe",
      "Heavy": "Schwere Waffe",
      "MBT": "MFS",
      "MBT, Heavy Weapon": "MFS, Schwere Waffe",
      "MBT, Heavy Weapon.": "MFS, Schwere Waffe",
      "SBT": "KFS",
      "SBT, Heavy Weapon": "KFS, Schwere Waffe",
      "LBT": "GFS",
      "LBT, Heavy Weapon.": "GFS, Schwere Waffe.",
      "Acts as an Intimidation Test against everyone not in the affected area": "Wird als Einschüchterungstest gegen jedes Ziel außerhalb des Wirkbereichs gehandelt.",
      "Heavy Weapon. A short range, heat-seeking missile fired from an aircraft.": "Schwere Waffe. Eine wärmesuchende Kurzstreckenrakete, die aus einem Flugzeug abgefeuert wird.",
      "Heavy Weapon. A wire-guided missile fired from a portable or vehicle-mounted launcher. Doesn\u2019t require a lock\u2014just a Shooting roll, and can\u2019t be jammed.": "Schwere Waffe. Eine drahtgelenkte Rakete, die aus einem tragbaren oder auf einem Fahrzeug montierten Werfer abgefeuert wird. Erfordert keine Zielerfassung, nur eine Schießenprobe, und kann nicht elektronisch gestört werden.",
      "All types of shot are Heavy Weapons, Reload 8. Two crew members may reload at the same time.": "Alle Arten von Kanonengeschossen sind Schwere Waffen mit Nachladen 8. Zwei Besatzungsmitglieder können gleichzeitig nachladen.",
      "MBT, Heavy Weapon, Reload time is every 5 minutes with a crew of 4.": "MFS, Schwere Waffe, Nachladezeit ist 5 Minuten für eine Mannschaft von 4.",
      "Heavy Weapon. A laser-guided missile fired from a vehicle-mounted launcher.": "Schwere Waffe. Eine lasergelenkte Rakete, die aus einem auf einem Fahrzeug montierten Werfer abgefeuert wird.",
      "Heavy Weapon. A medium range, radar-guided missile fired from an aircraft.": "Schwere Waffe. Eine radargelenkte Mittelstreckenrakete, die aus einem Flugzeug abgefeuert wird.",
      "3× Small Burst Templates": "Drei kleine Flächenschablonen",
      "Scaly hide.": "Schuppenhaut",
      "Small, Medium or Large Blast Template": "Kleine, Mittlere oder Große Flächenschablone",
      "Cone Template": "Kegelschablone",
      "Cone Template, nonlethal damage": "Kegelschablone, Betäubungsschaden",
      "Nonlethal damage": "Betäubungsschaden",
      "Used by trolls.": "",
      "Small Blast Template": "Kleine Flächenschablone",
      "Uses Shooting. Range 1/2/4. Shots 3 before needing to be recharged for at least two hours. Victims must make a Vigor roll at –2 or be Stunned.": "Verwendet Schießen. FRW 1/2/4. 3 Schuss, dann muss die Waffe mindestens zwei Stunden lang aufgeladen werden. Opfer muss eine Konstitutionsprobe mit -2 ablegen, um nicht Betäubt zu werden.",
      "Use Shooting (or Fighting if engaged). No Range Penalty but max range is 2″ (about 10 feet), Shots 5, victim must make Vigor roll at –2 or be Stunned.": "Verwende Schießen (oder Kämpfen im Nahkampf). Kein Entfernungsabzug, doch maximale Reichweite ist 2“ (4 m), 5 Schuss, Opfer muss eine Konstitutionsprobe mit -2 ablegen, um nicht Betäubt zu werden.",
    };
    // Exakter Treffer (notes in map: greift auch bei leerem Zielwert, z.B. "Used by trolls." → "")
    if (notes in map) return map[notes];
    return notes
      .replace(/\bTwo hands\b/gi, "Zweihändig")
      .replace(/\btwo hands\b/g, "Zweihändig")
      .replace(/\bParry\b/g, "Parade")
      .replace(/\bReach\b/g, "Reichweite")
      .replace(/\bHeavy Weapon\b/g, "Schwere Waffe")
      .replace(/\bHeavy\b/g, "Schwere Waffe")
      .replace(/\bSnapfire\b/g, "Schnellschuss-Malus")
      .replace(/\bCauterize\b/g, "Kauterisieren")
      .replace(/\bOvercharge\b/g, "Überladen")
      .replace(/\bNo Recoil\b/g, "Kein Rückstoß")
      .replace(/\bAP\b/g, "PB")
      .replace(/\bMBT\b/g, "MFS")
      .replace(/\bSBT\b/g, "KFS")
      .replace(/\bLBT\b/g, "GFS");
  },

  "weaponAmmo": (ammo) => {
    if (!ammo || typeof ammo !== 'string') return ammo;
    const map = {
      "Arrows/Bolts": "Pfeile/Bolzen",
      "Sling stones": "Schleudersteine",
      "Shot (w/ powder)": "Kugel (mit Schwarzpulver)",
      "Bullets, Medium": "Patronen, Mittel",
      "Bullets, Large": "Patronen, Groß",
      "Bullets, Small": "Patronen, Klein",
      "Shotgun Shells": "Schrotpatronen",
      "Colt 1911 Magazine": "Colt 1911 Magazin",
      "Barrett Magazine": "Barrett Magazin",
      "Desert Eagle Magazine": "Desert Eagle Magazin",
      "Glock (9mm) Magazine": "Glock (9mm) Magazin",
      "H&K MP5 Magazine": "H&K MP5 Magazin",
      "M-16 Magazine": "M-16 Magazin",
      "Ruger Magazine": "Ruger Magazin",
      "Steyr AUG Magazine": "Steyr AUG Magazin",
      "Tommy Gun Magazine": "Tommy Gun Magazin",
      "Uzi Magazine": "Uzi Magazin",
      "AK47 Magazine": "AK47 Magazin",
      "Laser Battery, Pistol": "Laserbatterie, Pistole",
      "Laser Battery, Rifle / SMG": "Laserbatterie, Gewehr / MP",
      "Laser Battery, Gatling": "Laserbatterie, Gatling",
      "Canister Shot (Cannon)": "Kartätsche (Kanone)",
      "Solid Shot (Cannon)": "Rundgeschoss (Kanone)",
      "Shrapnel Shot (Cannon)": "Schrapnell (Kanone)",
    };
    if (map[ammo]) return map[ammo];
    return ammo
      .replace(/\bMagazine\b/g, "Magazin")
      .replace(/\bBullets\b/g, "Patronen")
      .replace(/\bMedium\b/g, "Mittel")
      .replace(/\bLarge\b/g, "Groß")
      .replace(/\bSmall\b/g, "Klein")
      .replace(/\bShotgun Shells\b/g, "Schrotpatronen")
      .replace(/\bArrows\/Bolts\b/g, "Pfeile/Bolzen")
      .replace(/\bLaser Battery\b/g, "Laserbatterie");
  },

  "vehicleSkill": (skill) => {
    if (!skill || typeof skill !== 'string') return skill;
    const map = {
      "Driving": "Fahren",
      "Piloting": "Pilot",
      "Boating": "Seefahrt",
      "Riding": "Reiten",
      "Electronics": "Elektronik",
    };
    return map[skill] ?? skill;
  },

  "vehicleCategory": (cat) => {
    if (!cat || typeof cat !== 'string') return cat;
    const map = {
      "Civilian": "Zivil",
      "Civilian Vehicles": "Zivilfahrzeuge",
      "Futuristic Military Vehicles": "Futuristische Militärfahrzeuge",
      "Modern Military Aircraft": "Moderne Militärflugzeuge",
      "Watercraft": "Wasserfahrzeuge",
      "World War II Military Aircraft": "Militärflugzeuge (2. Weltkrieg)",
      "World War II Military Vehicles": "Militärfahrzeuge (2. Weltkrieg)",
    };
    return map[cat] ?? cat;
  },

  "grantsTranslation": (original, translation) => {
    if (!Array.isArray(original)) return original;
    const nameMap = {
      "Champions": "Auserwählter",
      "Vow - Protect Humanity": "Schwur – Die Menschheit beschützen",
      "Ancestral Enemy (Demons & Devils)": "Volksfeind (Dämonen & Teufel)",
      "Armor +2": "Panzerung +2",
    };
    const grantNameByUuid = {
      "Compendium.swade-core-rules.swade-edges.Item.7d5eiEX0NEiaCuCJ": "Arkaner Hintergrund (Wunder)",
      "Compendium.swade-core-rules.swade-edges.Item.M2diZ7X4997YL2pa": "Aufmerksamkeit",
      "Compendium.swade-core-rules.swade-edges.Item.RxHGrVFtf2LbLr8Y": "Auserwählter",
      "Compendium.swade-core-rules.swade-hindrances.Item.97ulajnqpnVgGb63": "Schwur",
      "Compendium.swade-core-rules.swade-hindrances.Item.9cXIBRS4q3ryJJBJ": "Blutrünstig",
      "Compendium.swade-core-rules.swade-hindrances.Item.IQgZkCUMklDKYV9x": "Außenseiter",
      "Compendium.swade-core-rules.swade-hindrances.Item.S1ZceKjgKXlNGcZY": "Pazifist",
      "Compendium.swade-core-rules.swade-hindrances.Item.SN9wpZHz7aOdKCpB": "Nichtschwimmer",
      "Compendium.swade-core-rules.swade-hindrances.Item.un8FNwybGbMDEaJA": "Zwei linke Hände",
      "Compendium.swade-core-rules.swade-personal-weapons.Item.1TUtzm0rkTg1gyXo": "Klauen",
      "Compendium.swade-core-rules.swade-personal-weapons.Item.NOA98ElhCtJc4XaX": "Biss",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.ADAPTFXsFJvZsIwc": "Anpassungsfähig",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.ADAPTFXsFJvZsIzM": "Erbe",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.AQUAsFXsFJvZsIwc": "Wasserwesen/Amphibisches Wesen",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.ARMOsFXsFJvZsIwc": "Panzerung",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.CONSsFXsFJvZsIwc": "Konstrukt",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.DEPEsFXsFJvZsIwc": "Abhängigkeit",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.FLYDsFXsFJvZsIwc": "Fliegen",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.FRAIsFXsFJvZsIwc": "Zerbrechlich 1",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.LOWLsFXsFJvZsIwc": "Nachtsicht",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.RENMsFXsFJvZsIwc": "Volksfeind",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.RPACsFXsFJvZsIwc": "Verringerte Bewegungsweite",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.SIZEsFXsFJvZsIwc": "Größe -1",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.TOUGhFXsFJvZsIwc": "Robustheit 1",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.WEAKsFXsFJvZsIwc": "Anfälligkeit für Naturgewalten",
      "Compendium.swade-core-rules.swade-racial-abilities.Item.yaAfJYLC2kS2qCAp": "Glück (Halbling)",
      "Compendium.swade-core-rules.swade-skills.Item.5qXzjDHdjaeYnBod": "Glaube"
    };
    const result = JSON.parse(JSON.stringify(original));
    for (const grant of result) {
      if (grant?.mutation && typeof grant.mutation.name === 'string' && nameMap[grant.mutation.name] != null) {
        grant.mutation.name = nameMap[grant.mutation.name];
      }
      const de = (translation && typeof translation === 'object') ? translation[grant?.name] : null;
      if (de == null) continue;
      grant.mutation = grant.mutation || {};
      const ag = grant.mutation.flags?.['swade-core-rules'];
      if (ag && typeof ag === 'object' && 'abilityGrant' in ag) {
        ag.abilityGrant = de;
      } else {
        grant.mutation.system = grant.mutation.system || {};
        grant.mutation.system.description = de;
        if (typeof grant.mutation.name !== 'string' || !grant.mutation.name) {
          const dn = grantNameByUuid[grant?.uuid];
          if (dn) grant.mutation.name = dn;
        }
      }
    }
    return result;
  },

  "choiceSetsTranslation": (original) => {
    if (!Array.isArray(original)) return original;
    const titleMap = {
      "Choose Flight Pace.": "Bewegungsweite (Fliegen) wählen",
      "Aquatic or Semi-Aquatic - Choose one.": "Wähle die Art des Aquarianers:",
      "Pick Toughness Value.": "Robustheit – Wert wählen",
      "Reduced Pace": "Verringerte Bewegungsweite (Boden)",
      "Armor - Choose Amount": "Panzerung - Anzahl wählen",
      "Choose Heritage.": "Erbe wählen",
      "Poor Parry - Choose one.": "Schlechte Parade - Wert wählen",
      "Parry Increase - Choose one.": "Parade erhöhen - Wert wählen",
      "Claws - Choose one.": "Klauen - Wert wählen",
      "Horn Type - Choose one.": "Hörner - Wert wählen",
      "Choose Rank of Edge Taken.": "Rang des Talents wählen",
      "Power Choice.": "Macht wählen",
      "Choose Ancestries' Reach.": "Reichweite der Abstammung wählen",
      "Choose Regeneration Type.": "Regenerationsart wählen",
      "Choose Size.": "Größe wählen",
      "Choose Sleep Reduction Type.": "Art der Schlafreduktion wählen",
      "Poison, Disease, or Both - Choose one.": "Gift, Krankheit oder beides – Wähle eins",
      "Poisonous Touch - Choose one.": "Giftige Berührung - Wähle eins",
      "Hindrance Type - Choose one.": "Handicap-Typ - Wähle eins",
      "Pick a Skill.": "Fertigkeit wählen",
      "Choose a Skill.": "Fertigkeit wählen",
      "Choose Skill to Remove.": "Zu entfernende Fertigkeit wählen",
      "Attribute Increase": "Attributserhöhung",
      "Attribute Penalty": "Attributsabzug",
      "Pick if Skill is Common or Uncommon In Campaign.": "Nützlichkeit der Fertigkeit in dieser Kampagne",
    };
    const choiceMap = {
      "Pace 6": "Bewegungsweite 6",
      "Pace 12": "Bewegungsweite 12",
      "Pace 24 Run 2d6": "Bewegungsweite 24, Sprintwürfel 2W6",
      "Aquatic": "Wasserwesen",
      "Semi-Aquatic": "Amphibisches Wesen",
      "Toughness +1": "Robustheit +1",
      "Toughness +2": "Robustheit +2",
      "Toughness +3": "Robustheit +3",
      "Reduced Pace -1": "Verringerte Bewegungsweite -1",
      "Reduced Pace -2": "Verringerte Bewegungsweite -2",
      "Armor 1": "Panzerung 1 (+2)",
      "Armor 2": "Panzerung 2 (+4)",
      "Armor 3": "Panzerung 3 (+6)",
      "Adaptable": "Anpassungsfähig",
      "Agile": "Geschickt",
      "Poor Parry -1": "Schlechte Parade -1",
      "Poor Parry -2": "Schlechte Parade -2",
      "Poor Parry -3": "Schlechte Parade -3",
      "Parry +1": "Parade +1",
      "Parry +2": "Parade +2",
      "Parry +3": "Parade +3",
      "Claws Str+d4": "Klauen Stärke+W4",
      "Claws Str+d6": "Klauen Stärke+W6",
      "Claws Str+d6 AP 2": "Klauen Stärke+W6 PB 2",
      "Str+d4": "Stärke+W4",
      "Str+d6": "Stärke+W6",
      "Novice": "Anfänger",
      "Seasoned": "Fortgeschritten",
      "Veteran": "Veteran",
      "Heroic": "Heroisch",
      "One Power": "Eine Macht",
      "Two Powers": "Zwei Mächte",
      "Three Powers": "Drei Mächte",
      "Four Powers": "Vier Mächte",
      "Five Powers": "Fünf Mächte",
      "Reach 1": "Reichweite 1",
      "Reach 2": "Reichweite 2",
      "Reach 3": "Reichweite 3",
      "Regeneration (Slow)": "Regeneration (Langsam)",
      "Regeneration (Slow + Injuries)": "Regeneration (Langsam + Verletzungen)",
      "Size 1": "Größe 1",
      "Size 2": "Größe 2",
      "Size 3": "Größe 3",
      "Half Normal Amount": "Halb so viel wie normal",
      "Never Sleeps": "Schläft nie",
      "Poison": "Gift",
      "Disease": "Krankheit",
      "Both": "Beides",
      "Mild": "Leichtes Gift",
      "Knockout": "K.O. - Gift",
      "Lethal": "Tödliches Gift",
      "Paralyzing": "Lähmendes Gift",
      "Minor": "leicht",
      "Major": "schwer",
      "Common Skill": "Wird häufiger verwendet",
      "Uncommon Skill": "Wird seltener verwendet",
      "Agility": "Geschicklichkeit",
      "Smarts": "Verstand",
      "Spirit": "Willenskraft",
      "Strength": "Stärke",
      "Vigor": "Konstitution",
      "Agility Penalty": "Geschicklichkeit",
      "Smarts Penalty": "Verstand",
      "Spirit Penalty": "Willenskraft",
      "Strength Penalty": "Stärke",
      "Vigor Penalty": "Konstitution",
      "Academics": "Geisteswissenschaften",
      "Athletics": "Athletik",
      "Battle": "Kriegskunst",
      "Boating": "Seefahrt",
      "Common Knowledge": "Allgemeinwissen",
      "Driving": "Fahren",
      "Electronics": "Elektronik",
      "Faith": "Glaube",
      "Fighting": "Kämpfen",
      "Focus": "Fokus",
      "Gambling": "Glücksspiel",
      "Hacking": "Hacken",
      "Healing": "Heilen",
      "Intimidation": "Einschüchtern",
      "Language": "Sprache",
      "Notice": "Wahrnehmung",
      "Occult": "Okkultismus",
      "Performance": "Darbietung",
      "Persuasion": "Überreden",
      "Piloting": "Pilot",
      "Psionics": "Psionik",
      "Repair": "Reparieren",
      "Research": "Recherche",
      "Riding": "Reiten",
      "Science": "Naturwissenschaften",
      "Shooting": "Schießen",
      "Spellcasting": "Zaubern",
      "Stealth": "Heimlichkeit",
      "Survival": "Überleben",
      "Taunt": "Provozieren",
      "Thievery": "Diebeskunst",
      "Weird Science": "Verrückte Wissenschaft",
    };
    const effectMap = {
      "Flight Pace 6": "Bewegungsweite (Fliegen) 6",
      "Flight Pace 12": "Bewegungsweite (Fliegen) 12",
      "Flight Pace 24 Run 2d6": "Bewegungsweite (Fliegen) 24, Sprintwürfel 2W6",
      "Ancestry Toughness": "Robustheit (Abstammung)",
      "Reduced Pace": "Verringerte Bewegungsweite",
      "Armor 1 (Ancestry)": "Panzerung 1 (Abstammung)",
      "Armor 2 (Ancestry)": "Panzerung 2 (Abstammung)",
      "Armor 3 (Ancestry)": "Panzerung 3 (Abstammung)",
      "Heritage": "Erbe",
      "Parry Increase (Ancestry)": "Parade (Abstammung)",
      "Poor Parry (Ancestry)": "Schlechte Parade (Abstammung)",
      "Agility Increase (Ancestry)": "Geschicklichkeit erhöht (Abstammung)",
      "Smarts Increase (Ancestry)": "Verstand erhöht (Abstammung)",
      "Spirit Increase (Ancestry)": "Willenskraft erhöht (Abstammung)",
      "Strength Increase (Ancestry)": "Stärke erhöht (Abstammung)",
      "Vigor Increase (Ancestry)": "Konstitution erhöht (Abstammung)",
      "Agility Penalty (Ancestry)": "Geschicklichkeit Abzug (Abstammung)",
      "Smarts Penalty (Ancestry)": "Verstand Abzug (Abstammung)",
      "Spirit Penalty (Ancestry)": "Willenskraft Abzug (Abstammung)",
      "Strength Penalty (Ancestry)": "Stärke Abzug (Abstammung)",
      "Vigor Penalty (Ancestry)": "Konstitution Abzug (Abstammung)",
      "Size 1": "Größe 1",
      "Size 2": "Größe 2",
      "Size 3": "Größe 3",
      "Ancestry Skill d6 (Athletics)": "Abstammungsfertigkeit W6 (Athletik)",
      "Ancestry Skill d6 (Common Knowledge)": "Abstammungsfertigkeit W6 (Allgemeinwissen)",
      "Ancestry Skill d6 (Notice)": "Abstammungsfertigkeit W6 (Wahrnehmung)",
      "Ancestry Skill d6 (Persuasion)": "Abstammungsfertigkeit W6 (Überreden)",
      "Ancestry Skill d6 (Stealth)": "Abstammungsfertigkeit W6 (Heimlichkeit)",
      "Skill Bonus (+1)": "Fertigkeitsbonus (+1)",
      "Skill Bonus (+2)": "Fertigkeitsbonus (+2)",
    };
    const renameMap = {
      "Toughness +1": "Robustheit +1",
      "Toughness +2": "Robustheit +2",
      "Toughness +3": "Robustheit +3",
      "Reduced Pace (-1)": "Verringerte Bewegungsweite (-1)",
      "Reduced Pace (-2)": "Verringerte Bewegungsweite (-2)",
      "Poor Parry (-1)": "Schlechte Parade (-1)",
      "Poor Parry (-2)": "Schlechte Parade (-2)",
      "Poor Parry (-3)": "Schlechte Parade (-3)",
      "Parry (+1)": "Parade (+1)",
      "Parry (+2)": "Parade (+2)",
      "Parry (+3)": "Parade (+3)",
      "Power (One Choice)": "Macht (Eine Wahl)",
      "Power (Two Choices)": "Macht (Zwei Wahlen)",
      "Power (Three Choices)": "Macht (Drei Wahlen)",
      "Power (Four Choices)": "Macht (Vier Wahlen)",
      "Power (Five Choices)": "Macht (Fünf Wahlen)",
      "Reach (1)": "Reichweite (1)",
      "Reach (2)": "Reichweite (2)",
      "Reach (3)": "Reichweite (3)",
      "Regeneration (Slow)": "Regeneration (Langsam)",
      "Regeneration (Slow + Injuries)": "Regeneration (Langsam + Verletzungen)",
      "Size 1": "Größe 1",
      "Size 2": "Größe 2",
      "Size 3": "Größe 3",
      "Immune (Poison)": "Immun (Gift)",
      "Immune (Disease)": "Immun (Krankheit)",
      "Immune (Posion & Disease)": "Immun (Gift & Krankheit)",
      "Poisonous Touch (Mild)": "Giftige Berührung (Leicht)",
      "Poisonous Touch (Knockout)": "Giftige Berührung (K.O.)",
      "Poisonous Touch (Lethal)": "Giftige Berührung (Tödlich)",
      "Poisonous Touch (Paralyzing)": "Giftige Berührung (Lähmend)",
      "Skill Penalty (-1)": "Fertigkeitsabzug (-1)",
      "Skill Penalty (-2)": "Fertigkeitsabzug (-2)",
      "Skill Penalty (-4)": "Fertigkeitsabzug (-4)",
      "Skill Bonus (+1)": "Fertigkeitsbonus (+1)",
      "Skill Bonus (+2)": "Fertigkeitsbonus (+2)",
    };
    const armorDesc = "<p>Die Spezies hat eine dicke Haut oder ist mit festem Material wie Schuppen oder sogar Fels bedeckt. Dies gewährt für jedes Mal, welches du diese Eigenschaft auswählst, +2 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02armor000000000]{Panzerung}.</p>";
    const descMap = {
      "Armor 1 (Ancestry)": armorDesc,
      "Armor 2 (Ancestry)": armorDesc,
      "Armor 3 (Ancestry)": armorDesc,
      "Heritage": "<p>Halbelfen könnten die Anmut ihres elfischen Elternteils oder die Anpassungsfähigkeit ihrer menschlichen Vorfahren erhalten. Ein Halbelf kann entweder mit einem freien Anfänger-@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01edges000000000]{Talent} seiner Wahl oder einem W6 anstelle eines W4 in @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01traits00000000]{Geschicklichkeit} beginnen (was auch sein Maximum für Geschicklichkeit auf W12+1 anhebt).</p>",
    };
    const aquaDrown = "@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04drowning000000]";
    const aquaMove = "@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]";
    const choiceMutationMap = {
      "Aquatic": {
        name: "Wasserwesen",
        description: `<p>Wasserwesen können in sauerstoffhaltigen Flüssigkeiten nicht ${aquaDrown}{ertrinken} und bewegen sich beim Schwimmen mit ihrer vollen ${aquaMove}{Bewegungsweite}.</p>`,
      },
      "Semi-Aquatic": {
        name: "Amphibisches Wesen",
        description: `<p>Ein amphibisches Wesen kann für 15 Minuten den Atem anhalten, ehe es würfeln muss, ob es ${aquaDrown}{ertrinkt}.</p>`,
      },
    };
    const result = JSON.parse(JSON.stringify(original));
    for (const set of result) {
      if (set && typeof set.title === 'string' && titleMap[set.title] != null) {
        set.title = titleMap[set.title];
      }
      for (const choice of (set?.choices || [])) {
        const choiceEn = typeof choice?.name === 'string' ? choice.name : null;
        if (choiceEn && choiceMap[choiceEn] != null) {
          choice.name = choiceMap[choiceEn];
        }
        if (choiceEn && choiceMutationMap[choiceEn] != null) {
          choice.mutation = choice.mutation || {};
          choice.mutation.name = choiceMutationMap[choiceEn].name;
          choice.mutation.system = choice.mutation.system || {};
          choice.mutation.system.description = choiceMutationMap[choiceEn].description;
          choice.addToName = false;
        }
        if (choice?.mutation && typeof choice.mutation.name === 'string' && renameMap[choice.mutation.name] != null) {
          choice.mutation.name = renameMap[choice.mutation.name];
        }
        for (const eff of (choice?.mutation?.effects || [])) {
          const en = typeof eff?.name === 'string' ? eff.name : null;
          if (en && descMap[en] != null) {
            eff.description = descMap[en];
          }
          if (en && effectMap[en] != null) {
            eff.name = effectMap[en];
          }
        }
      }
    }
    return result;
  }
};

// ===== Core-Skills-Kompendium auf Premium-Modul umstellen =====
// Damit neue Charaktere die übersetzten Fertigkeiten aus dem
// swade-core-rules Kompendium erhalten (mit dt. Name + Beschreibung).
Hooks.once('ready', () => {
  if (!argaActive()) return;
  const current = game.settings.get('swade', 'coreSkillsCompendium');
  if (current !== 'swade-core-rules.swade-skills') {
    game.settings.set('swade', 'coreSkillsCompendium', 'swade-core-rules.swade-skills');
  }
});

// ===== Auto-erzeugte Kartenstapel des Systems eindeutschen (DE <-> EN) =====
// Das System "swade" legt beim Welt-Setup zwei Kartenstapel an:
//   - Aktionsdeck  -> Settings-ID swade.actionDeck,            EN-Default "Action Deck"
//   - Ablagestapel -> Settings-ID swade.actionDeckDiscardPile, EN-Name "Action Cards Discard Pile"
// Der Ablagestapel-Name ist im System hart codiert (KEIN i18n); zudem stecken beide
// in keinem Kompendium, daher kann Babele sie nicht uebersetzen. Wir benennen sie
// nach Abschluss des System-Setups (Hook "swadeReady" wird direkt nach setupWorld()
// gefeuert) ueber ihre Settings-IDs direkt in der Welt um.
// Beidseitig: ist die Uebersetzung aktiv (argaActive) -> deutsche Namen, sonst ->
// englische Default-Namen. Der Sprachumschalter laedt die Welt neu, daher feuert
// "swadeReady" erneut und dieser Hook wechselt mit. Sicher: nur der Spielleiter,
// und nur wenn der Stapel exakt den jeweils anderen bekannten Namen traegt -> ein
// bewusst vergebener eigener Name wird nie ueberschrieben.
Hooks.once('swadeReady', async () => {
  if (!game.user?.isGM) return;
  const wantGerman = argaActive();
  const renames = [
    { setting: 'actionDeck',            en: 'Action Deck',               de: 'Aktionskartendeck' },
    { setting: 'actionDeckDiscardPile', en: 'Action Cards Discard Pile', de: 'Aktionskarten-Ablagestapel' },
  ];
  for (const r of renames) {
    try {
      const id = game.settings.get('swade', r.setting);
      const doc = id ? game.cards?.get(id) : null;
      if (!doc) continue;
      if (wantGerman && doc.name === r.en) {
        await doc.update({ name: r.de });
      } else if (!wantGerman && doc.name === r.de) {
        await doc.update({ name: r.en });
      }
    } catch (e) {
      console.error(`${MODULE_ID}: Umbenennen von Kartenstapel "${r.setting}" fehlgeschlagen`, e);
    }
  }
});

// Harte Voraussetzung: Fehlt das (kostenpflichtige) Originalmodul, dauerhaft warnen.
Hooks.once('ready', () => {
  if (argaModuleDisabled()) return;
  if (!coreRulesActive()) {
    ui.notifications?.error('Arga\'s SWADE Translation (German): Das Originalmodul „SWADE Core Rules" ist nicht aktiv – es findet keine Übersetzung statt. Bitte aktiviere das kostenpflichtige Originalmodul.', { permanent: true });
  }
});

Hooks.once('babele.init', (babele) => {
  argaRegisterSettings();
  // Ohne aktives Originalmodul KEINE Übersetzung registrieren (Voraussetzung).
  if (argaModuleDisabled() || !coreRulesActive()) return;
  babele.registerConverters(converters);

  // ActiveEffect.changes: Standard-"structured"-Converter durch einfaches
  // Pfad-Mapping ersetzen. Babele 2.9.1 übersetzt Effects automatisch mit
  // (Default-Item-Mapping → effects); der structured-Converter baut aus dem
  // changes-Array ein nach den change-keys benanntes Objekt. Bei SWADE-Effekten
  // mit präfix-kollidierenden Keys (z.B. "system.pace" UND
  // "system.pace.running.die") scheitert das spätere mergeObject mit
  // "Cannot create property 'running' on number '-1'" → Babele bricht die
  // Übersetzung dieses Dokuments ab (betrifft Handicaps Fettleibig/Alt/Langsam).
  // changes sind reine Mechanik (Keys + Zahlen), enthalten nichts Übersetzbares.
  babele.registerMapping({
    ActiveEffect: {
      changes: 'changes',
    },
  });

  // Eingebettete Waffen in Actor-Packs (Fahrzeuge, Bestiarium):
  // Default-Item-Mapping zeigt description auf "system.description.value",
  // SWADE speichert sie aber als String unter "system.description".
  // "notes" fehlt im Default ganz → hier mit weaponNotes-Converter ergänzt.
  // type-scoped ("Item.weapon"): greift nur bei Waffen, andere Item-Typen
  // bleiben unberührt.
  babele.registerMapping({
    'Item.weapon': {
      description: 'system.description',
      notes: { path: 'system.notes', converter: 'weaponNotes' },
      actions: { path: 'system.actions.additional', converter: 'actionButtons' },
      trait: { path: 'system.actions.trait', converter: 'actionTrait' },
    },
  });

  // Weitere eingebettete Item-Typen in Actor-Packs (Bestiarium): description als
  // String unter system.description (nicht .value). action/edge/power haben
  // zusätzlich Zusatz-Aktionen; armor kann eine Notiz tragen.
  babele.registerMapping({
    'Item.skill':     { description: 'system.description' },
    'Item.ability':   { description: 'system.description' },
    'Item.gear':      { description: 'system.description' },
    'Item.hindrance': { description: 'system.description' },
    'Item.armor': {
      description: 'system.description',
      notes: { path: 'system.notes', converter: 'weaponNotes' },
    },
    'Item.action': {
      description: 'system.description',
      actions: { path: 'system.actions.additional', converter: 'actionButtons' },
    },
    'Item.edge': {
      description: 'system.description',
      actions: { path: 'system.actions.additional', converter: 'actionButtons' },
    },
    'Item.power': {
      description: 'system.description',
      actions: { path: 'system.actions.additional', converter: 'actionButtons' },
    },
  });

  babele.register({
    module: MODULE_ID,
    lang: 'de',
    dir: 'compendiums',
  });
});

// ===== ActiveEffect-Übersetzungen (Babele kann diese nicht nativ übersetzen) =====
// Neue Einträge einfach in der Map ergänzen: "Englischer Name": "Deutscher Name",
const effectTranslations = {
  "Alertness": "Aufmerksamkeit",
  "Ambidextrous": "Beidhändig",
  "Aristocrat": "Aristokrat",
  "Attractive": "Attraktiv",
  "Berserk": "Berserker",
  "Block": "Block",
  "Brave": "Mutig",
  "Brawler": "Raufbold",
  "Brawny": "Kräftig",
  "Bruiser": "Schläger",
  "Champion": "Auserwählter",
  "Combat Reflexes": "Kampfreflexe",
  "Elan": "Elan",
  "Fast Healer": "Schnelle Heilung",
  "Fleet-Footed": "Flink",
  "Free Runner": "Parkour",
  "Great Luck": "Großes Glück",
  "Hard to Kill": "Schwer zu töten",
  "Healer": "Heiler",
  "Holy/Unholy Warrior": "Heiliger/Unheiliger Krieger",
  "Imp Block": "Harter Block",
  "Imp Dodge": "Schnelles Ausweichen",
  "Imp Level Headed": "Sehr kühler Kopf",
  "Imp Nerves of Steel": "Stärkere Schmerzresistenz",
  "Improvisational Fighter": "Improvisationsgabe",
  "Investigator": "Ermittler",
  "Iron Jaw (Soak)": "Eisenkiefer (Schaden wegstecken)",
  "Iron Jaw (Knockout)": "Eisenkiefer (K.O. vermeiden)",
  "Level Headed": "Kühler Kopf",
  "Liquid Courage": "Mut in Flaschen",
  "Luck": "Glück",
  "Martial Artist": "Kampfkünstler",
  "Martial Warrior": "Kampfkunstmeister",
  "Master of Arms": "Meister aller Waffen",
  "Menacing": "Bedrohlich",
  "Mentalist": "Mentalist",
  "Mr. Fix It": "Reparaturgenie",
  "Nerves of Steel": "Schmerzresistenz",
  "Power Surge": "Energieschub",
  "Quick": "Schnell",
  "Rapid Recharge": "Schnelle Machtregeneration",
  "Rock and Roll!": "Volles Rohr!",
  "Soldier": "Soldat",
  "Streetwise": "Gassenwissen",
  "Strong Willed": "Starker Wille",
  "Thief": "Dieb",
  "Tough as Nails": "Zäh wie Leder",
  "Tougher than Nails": "Zäher als Leder",
  "Use Chi": "Chi",
  "Very Attractive": "Sehr attraktiv",
  "Weapon Master": "Waffenmeister",
  "Woodsman": "Naturbursche",
  "Work the Crowd": "Echte Rampensau",
  "Bad Eyes (Minor)": "Schlechte Augen (Leicht)",
  "Bad Eyes (Major)": "Schlechte Augen (Schwer)",
  "Bad Luck": "Pech",
  "Can't Swim": "Nichtschwimmer",
  "Clueless": "Verpeilt",
  "Elderly": "Alt",
  "Hard of Hearing": "Schwerhörig",
  "Hesitant": "Zögerlich",
  "Mean": "Fies",
  "Mild Mannered": "Sanftmütig",
  "Obese": "Fettleibig",
  "Outsider": "Außenseiter",
  "Phobia (Minor)": "Phobie (Leicht)",
  "Phobia (Major)": "Phobie (Schwer)",
  "Slow (Minor)": "Langsam (Leicht)",
  "Slow (Major)": "Langsam (Schwer)",
  "Small": "Klein",
  "Thin Skinned (Minor)": "Dünnhäutig (Leicht)",
  "Thin Skinned (Major)": "Dünnhäutig (Schwer)",
  "Timid": "Feige",
  "Tongue Tied": "Schwerzüngig",
  "Ugly (Minor)": "Hässlich (Leicht)",
  "Ugly (Major)": "Hässlich (Schwer)",
  "Very Young": "Sehr jung",
  "Young": "Jung",
  "Agile": "Geschickt",
  "Faith": "Glaube",
  "Keen Senses": "Scharfe Sinne",
  "Reduced Pace": "Verringerte Bewegungsweite",
  "Spirited": "Beherzt",
  "Tough": "Widerstandsfähig",
  "Vigorous": "Widerstandsfähig",
  "Ancestral Enemy": "Volksfeind",
  "Construct": "Konstrukt",
  "Frail": "Zerbrechlich",
  "Pace (Ancestry)": "Bewegungsweite (Abstammung)",
  "Size -1": "Größe -1",
  "Elemental": "Elementar",
  "Hardy": "Zäh",
  "Resilient": "Widerstandsfähig",
  "Very Resilient": "Sehr Widerstandsfähig",
  "Speed": "Schnell",
  "Swarm": "Schwarm",
  "Undead": "Untot",
  "Spear Parry +1 (if used 2 handed)": "Parade +1 (beidhändig)",
  "Armor (+2)": "Panzerung (+2)",
  "Toughness (+2)": "Robustheit (+2)",
  "Blind (-2)": "Geblendet (−2)",
  "Blind (-4)": "Geblendet (−4)",
  "Numb (1 point)": "Abschwächen (1 Punkt)",
  "Numb (2 points)": "Abschwächen (2 Punkte)",
  "Pace x 2": "Bewegungsweite x2",
  "Bleeding Out": "Verblutend",
  "Rending": "Zerfleischt",
};

// Sortiert nach Länge (längste zuerst), damit z.B.
// "Very Resilient" vor "Resilient" ersetzt wird.
const sortedEffectKeys = Object.keys(effectTranslations)
  .sort((a, b) => b.length - a.length);

function translateEffectNames(htmlEl) {
  if (!htmlEl) return;
  const walker = document.createTreeWalker(htmlEl, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    for (const en of sortedEffectKeys) {
      if (node.textContent.includes(en)) {
        node.textContent = node.textContent.replace(en, effectTranslations[en]);
      }
    }
  }
}

// @UUID-Links in Effekt-Beschreibungen anreichern, sonst stehen sie als Rohtext da.
// (Foundry v13/v14: TextEditor liegt unter foundry.applications.ux; Global ist deprecated.)
function applyEffectDescription(descDiv, descHtml) {
  if (!descDiv || descDiv.dataset.translated) return;
  descDiv.dataset.translated = 'true';
  const TE = foundry?.applications?.ux?.TextEditor?.implementation
          ?? foundry?.applications?.ux?.TextEditor
          ?? globalThis.TextEditor;
  Promise.resolve(TE.enrichHTML(descHtml))
    .then((enriched) => { descDiv.innerHTML = enriched; })
    .catch((err) => {
      console.warn('argas-swade-translation-german: enrichHTML der Effekt-Beschreibung fehlgeschlagen', err);
      descDiv.innerHTML = descHtml;
    });
}

function translateEffectDescriptions(htmlEl) {
  if (!htmlEl) return;
  const detailsList = htmlEl.querySelectorAll?.('details[data-effect-id]') ?? [];
  for (const details of detailsList) {
    const descHtml = findEffectDescription(details);
    if (!descHtml) continue;
    const descDiv = details.querySelector('div.description');
    applyEffectDescription(descDiv, descHtml);
  }
}

for (const hook of ['renderActorSheet', 'renderItemSheet', 'renderChatMessage']) {
  Hooks.on(hook, (app, html) => {
    if (!argaActive()) return;
    if (!sortedEffectKeys.length) return;
    const htmlEl = html instanceof jQuery ? html[0] : html;
    translateEffectNames(htmlEl);
    translateEffectDescriptions(htmlEl);
  });
}

Hooks.on('renderDocumentSheetV2', (app, html) => {
  if (!argaActive()) return;

  const actor = app?.document ?? app?.object;
  if (!actor || actor.type !== 'vehicle') return;

  const root = html instanceof HTMLElement ? html
             : html?.[0] instanceof HTMLElement ? html[0]
             : html?.element instanceof HTMLElement ? html.element
             : null;
  if (!root) return;

  // 1) Manöverfertigkeit: Select-Optionen übersetzen (value bleibt englisch für Foundry)
  const vehicleSkillMap = {
    'Driving':  'Fahren',
    'Boating':  'Seefahrt',
    'Piloting': 'Pilot',
    'Riding':   'Reiten'
  };

  const skillSelect = root.querySelector('select[name="system.driver.skill"]');
  if (skillSelect) {
    for (const option of skillSelect.options) {
      const translated = vehicleSkillMap[option.textContent.trim()];
      if (translated) {
        option.textContent = translated;
      }
    }
  }

  // 2) Label "Fertigkeitsname" → "Alternative Fertigkeit"
  //    (Falsches Label in der SWADE-System de.json für "Alternative Skill")
  const altInput = root.querySelector('input[name="system.driver.skillAlternative"]');
  if (altInput) {
    const label = altInput.closest('.form-group')?.querySelector('label');
    if (label && label.textContent.trim() === 'Fertigkeitsname') {
      label.textContent = 'Alternative Fertigkeit';
    }
  }
});

Hooks.on('renderActiveEffectConfig', (app, html) => {
  if (!argaActive()) return;
  const htmlEl = html instanceof jQuery ? html[0] : html;
  if (!htmlEl) return;

  const nameInput = htmlEl.querySelector('input[name="name"]');
  if (nameInput && effectTranslations[nameInput.value]) {
    nameInput.value = effectTranslations[nameInput.value];
  }

  const effectName = app.document?.name;
  const effectId = app.document?.id;
  const descHtml = resolveEffectDescription(effectId, effectName);
  setTimeout(() => {
    const pm = htmlEl.querySelector('.ProseMirror, .editor-content.ProseMirror, div[contenteditable="true"].ProseMirror');
    if (!pm || pm.dataset.translated) return;
    const source = descHtml ?? pm.innerHTML;
    if (!descHtml && !/@UUID\[|@Compendium\[/.test(source)) return;
    applyEffectDescription(pm, source);
  }, 100);

  translateEffectNames(htmlEl);
});

const effectDescriptionsByID = {
  "7MiYdn0XeVCiUFQu": "<p>Verringert den Abzug des Empfängers durch Wunden und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfung} um eins, bei einer Steigerung um zwei. Ein Entkräfteter (-2) Held mit drei Wunden (-3) verringert beispielsweise seinen Gesamtnachteil von -5 bei einem Erfolg auf -4, bei einer Steigerung auf -3. Dieser Effekt hält eine Stunde lang an. Er entfernt nicht die Wunden oder die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfung}, sondern erlaubt dem Empfänger lediglich, die Abzüge zu ignorieren. Wenn das Ziel durch Wunden oder @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfung} Ausgeschaltet wird, ist es trotzdem wie üblich Ausgeschaltet.</p>",
  "6Ix2kFqUUaf2mMVo": "<p>Verringert den Abzug des Empfängers durch Wunden und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfung} um eins, bei einer Steigerung um zwei. Ein Entkräfteter (-2) Held mit drei Wunden (-3) verringert beispielsweise seinen Gesamtnachteil von -5 bei einem Erfolg auf -4, bei einer Steigerung auf -3. Dieser Effekt hält eine Stunde lang an. Er entfernt nicht die Wunden oder die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfung}, sondern erlaubt dem Empfänger lediglich, die Abzüge zu ignorieren. Wenn das Ziel durch Wunden oder @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfung} Ausgeschaltet wird, ist es trotzdem wie üblich Ausgeschaltet.</p>",
  "GymyTzQpByx2blGD": "<p>Ein Erfolg bedeutet, dass das Opfer –2 auf alle Aktionen erleidet, die Sicht erfordern, oder –4 bei einer Steigerung. Das Opfer versucht, den Effekt am Ende seiner folgenden Züge automatisch (als freie Aktion) mit einer Konstitutionsprobe abzuschütteln. Ein Erfolg hebt 2 Punkte Abzüge auf, eine Steigerung beendet den Effekt sofort.</p>",
  "N3mKRqKW4Nl6VEb2": "<p>Ein Erfolg bedeutet, dass das Opfer –2 auf alle Aktionen erleidet, die Sicht erfordern, oder –4 bei einer Steigerung. Das Opfer versucht, den Effekt am Ende seiner folgenden Züge automatisch (als freie Aktion) mit einer Konstitutionsprobe abzuschütteln. Ein Erfolg hebt 2 Punkte Abzüge auf, eine Steigerung beendet den Effekt sofort.</p>",
  "Cozm4EhOsLHu81hH": "<p>Ein @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03traitrolls0000]{Erfolg} bei Beschleunigen verdoppelt die Entfernung, die sich das Ziel @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{bewegen} kann (Grundbewegungsweite und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Sprinten}). Bei einer @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03traitrolls0000#steigerungen]{Steigerung} ignoriert der Charakter außerdem den Abzug von -2 fürs Sprinten.</p>",
  "GMhfERXYVbrjQhhk": "<div class=\"swade-core\">\n<p>Der Charakter wurde privilegiert geboren oder stieg später im Leben im Stand auf. Er könnte Geld haben oder auch nicht (siehe die Talente @UUID[Compendium.swade-core-rules.swade-edges.Item.vNDguZFqPlgMo5qx]{Reich} und @UUID[Compendium.swade-core-rules.swade-edges.Item.KIXfH0MyiHVIDHrq]{Stinkreich}), aber auf jeden Fall bewegt er sich in der Elite der sozialen Kreise des Settings. Aristokraten addieren +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überreden}, wenn sie @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04networking0000]{Informationsbeschaffung} bei der örtlichen Elite, Industriellen, Adeligen oder anderen Aristokraten betreiben. Sie addieren außerdem +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.su7eyijoB0RFpRB1]{Allgemeinwissen}, wenn es um die Etikette der Oberschicht, Stammbäume und Heraldik oder lokale Gerüchte über andere Vertreter ihres Standes geht.</p>\n</div>",
  "0OuAJRtfLz4tPcml": "<div class=\"swade-core\">\n<p>Es ist kein Geheimnis, dass Leute hilfsbereiter sind, wenn sie ihr Gegenüber körperlich anziehend finden. Dein Charakter addiert +1 auf Würfe mit @UUID[Compendium.swade-core-rules.swade-skills.Item.UVdSzNvdAPmGk0iO]{Darbietung} und @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überreden}, wenn das Ziel ihn generell anziehend findet (in Bezug auf Geschlecht, Spezies und so weiter).</p>\n</div>",
  "ABtO3YvOlRpVCogF": "<div class=\"swade-core\">\n<p>Dem Helden entgeht nicht viel. Er ist sehr aufmerksam und scharfsinnig und addiert +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.Y0545TlaAqRRE2P0]{Wahrnehmungsproben}, wenn er die Welt, die ihn umgibt, hören, sehen oder anderweitig wahrnehmen möchte.</p>\n</div>",
  "UPNflRrXTEIheOjV": "<div class=\"swade-core\">\n<p>Auserwählte sind heilige (oder unheilige) Männer und Frauen, die auserkoren wurden, für eine Gottheit oder Religion zu kämpfen. Die meisten sind fromme Seelen und bereit, ihr Leben für eine größere Sache zu opfern, doch einige wurden vielleicht in die Rolle hineingeboren und folgen ihrem Pfad eher zögerlich.</p> <p>Auserwählte bekämpfen die Kräfte der Dunkelheit (oder des Lichts). Sie addieren +2 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03dealingdamag00]{Schaden}, wenn sie übernatürlich böse (oder gute, wenn sie böse sind) Kreaturen angreifen. Der Bonus gilt auf @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03areaeffectat00]{Flächenschaden}, @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03attacks0000000]{Fernkampfangriffe}, @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor05powers.JournalEntryPage.05powers00000000]{Mächte}, etc.</p> <p>Die SL muss entscheiden, auf welche Feinde dieser Bonus gilt, doch grundsätzlich sind es alle bösen (oder guten!) Kreaturen, die aus Magie entstanden sind oder @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor06bestia.JournalEntryPage.06bestiary000000]{übernatürliche&nbsp;Fähigkeiten} haben.</p>\n</div>",
  "PXxjFEmzs6bD1Chi": "<div class=\"swade-core\">\n<p>Dein Krieger ist mit der linken Hand so geschickt wie mit der rechten. Er ignoriert den Abzug für @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03offhandattac00]{Angriffe mit der falschen Hand}. Wenn beidhändige Charaktere in jeder Hand eine Waffe halten, dürfen sie die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03attacks0000000]{Angriffe}-Boni beider Waffen addieren (wenn beide einen haben).</p>\n</div>",
  "1UkpIwduU7EtkEGz": "<div class=\"swade-core\">\n<p>Berserker werden wild und fast unkontrollierbar, wenn der &bdquo;rote Zorn&ldquo; sie ergreift, doch ihr Zorn macht sie auch zu tödlichen Mordmaschinen! Unmittelbar nachdem er eine Wunde erlitten hat oder @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Angeschlagen} wurde (nur durch körperlichen Schaden), muss dein Held eine Verstandsprobe würfeln, um nicht in den Berserkerrausch zu verfallen. Er kann sich entscheiden die Probe freiwillig nicht zu schaffen, wenn er möchte.</p> <p>Der Berserkerrausch hat folgende Auswirkungen:</p> <ul> <li>WUT: Der Stärkewert des Charakters steigt um einen Würfeltyp und alle Angriffe müssen als @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03wildattack0000]{Rücksichtslose Angriffe} ausgeführt werden. Er kann keine Fertigkeiten verwenden, die einen klaren Verstand oder Konzentration erfordern (Entscheidung der SL). Er könnte beispielsweise durchaus Drohungen brüllen und somit @UUID[Compendium.swade-core-rules.swade-skills.Item.TlMOxNi4U4YOnHId]{Einschüchtern} verwenden.</li> <li>ZORNIG: Adrenalin und Zorn treiben die Muskeln des Berserkers an, wodurch er +2 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Robustheit} erhält. Er ignoriert eine Stufe Wundabzüge (dies ist kumulativ mit anderen Fähigkeiten, die Wundabzüge verringern).</li> <li>UNGEZÜGELTE UNVORSICHTIGKEIT: Immer wenn der Berserker einen Kritischen Fehlschlag bei einer @UUID[Compendium.swade-core-rules.swade-skills.Item.jixNprOk5ao0aDyI]{Kämpfenprobe} erzielt, trifft er ein zufälliges Ziel in @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02reach000000000]{Reichweite} seines Angriffs (nicht das eigentliche Ziel), egal ob Freund oder Feind. Wenn es keine passenden Ziele gibt, geht der Schlag einfach ins Leere, zertrümmert Gegenstände in der Umgebung oder etwas in der Art.</li> </ul> <p><span class=\"fontstyle0\">Nach fünf durchgehenden Runden des Berserkerzorns erleidet der Held eine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfungsstufe}. Nach zehn Runden erleidet er weitere Stufe Erschöpfung, und der Zorn endet. Er kann seinen Zorn auch jederzeit bewusst abbrechen, indem er eine Verstandsprobe mit -2 ablegt (dies ist eine freie Aktion, und macht es möglich, die Erschöpfung zu umgehen, wenn es dem Charakter gelingt, den Zorn zu beenden, ehe sie verursacht wird!). Beginne neu damit, Runden zu zählen, wenn er wieder in Berserkerrausch verfällt, selbst wenn es im selben Kampf ist.</span></p>\n</div>",
  "lQ74CgjO4vUv7TQx": "<div class=\"swade-core\">\n<p>Dein Held hat auf die harte Tour gelernt Nahkampfangriffe abzuwehren. Erhöhe seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Parade} um 1, und der @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03gangingup00000]{Überzahlbonus} wird gegen ihn um 1 verringert.</p>\n</div>",
  "9NydTG76la7m1eTA": "<div class=\"swade-core\">\n<p>Die Kampfkunstausbildung deines Helden geht über die Norm hinaus und fällt in den Bereich des Mystischen. Zu Beginn einer jeden Kampfbegegnung erhält er einen Chi-Punkt, den er ausgeben kann, um eines der folgenden Dinge zu tun:</p> <ul> <li>Er kann einen misslungenen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03attacks0000000]{Angriff} (sogar einen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03traitrolls0000#kritischer-fehlschlag]{Kritischen Fehlschlag}) neu würfeln.</li> <li>Er kann seinen Gegner einen Angriff gegen sich neu würfeln lassen.</li> <li>Er kann +W6 auf den Schaden eines erfolgreichen @UUID[Compendium.swade-core-rules.swade-skills.Item.jixNprOk5ao0aDyI]{Kämpfen}-Angriffs addieren, den er mit seinen Händen, Füßen, Klauen oder anderen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03naturalweapo00]{natürlichen Waffen} ausgeführt hat.</li> </ul> <p>Nicht verbrauchtes Chi geht am Ende der Kampfbegegnung verloren.</p>\n</div>",
  "NSXoFUpev9UOXq5b": "<div class=\"swade-core\">\n<p>Diebe sind spezialisiert auf Täuschung, Verrat und Akrobatik. Sie sind unabdingbar, wenn es gilt Fallen zu entdecken, Wände zu erklimmen und Schlösser zu knacken.</p> <p>Diebe wissen, wie sie Vorsprünge an Wänden und Fenstersimsen verwenden können, um die höchsten Gebäude zu erklimmen und wie Katzen durch Straßen und Gassen zu huschen. Sie addieren +1 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.qc2GOKFIXIJEpTw1]{Athletikproben}, um in urbanen Gebieten zu klettern.</p> <p>Diebe wissen auch, wie man sich in der Dunkelheit zwischen Straßenlaternen bewegt, und addieren +1 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.bFaYnzftXwQ9p4Si]{Heimlichkeitsproben} in urbanen Umgebungen. Außerdem sind diese Schurken, was kaum überrascht, sehr geschickt, wenn es um @UUID[Compendium.swade-core-rules.swade-skills.Item.RiG6qQrQoXtw3tvF]{Diebeskunst} geht, und addieren in allen Umständen +1 auf entsprechende Proben.</p>\n</div>",
  "CJgSKeLop8G2Awfa": "<div class=\"swade-core\">\n<p>Wie Rampensau, doch kann der Held bei bis zu zwei @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03support0000000]{Unterstützen}-Aktionen in einem Zug einen zusätzlichen Charakter unterstützen.</p>\n</div>",
  "3ApraUkQKIqc2F4k": "<div class=\"swade-core\">\n<p>Der Held kann auch extreme Treffer abschütteln. Er addiert +2 auf @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03soakrolls00000]{Schaden wegstecken} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03thedrop0000000]{K.O.-Schläge} Konstitutionsproben, um&nbsp; zu vermeiden.</p>\n</div>",
  "u7paWxVTE24pTFzq": "<div class=\"swade-core\">\n<p>Der Held kann auch extreme Treffer abschütteln. Er addiert +2 auf @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03soakrolls00000]{Schaden wegstecken} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03thedrop0000000]{K.O.-Schläge} Konstitutionsproben, um&nbsp; zu vermeiden.</p>\n</div>",
  "9kFbhzHWhmnywHRy": "<div class=\"swade-core\">\n<p>Elan bedeutet Begeisterung oder Wille. Wer dieses Talent hat, läuft zur Höchstform auf, wenn es hart auf hart kommt. Wenn du einen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03bennies0000000]{Benny} ausgibst, um eine Eigenschaftsprobe zu wiederholen, addiere +2 auf das Gesamtergebnis. Der Bonus gilt nur auf den wiederholten Wurf. Er gilt nicht für @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03dealingdamag00]{Schadenswürfe} (da sie keine Eigenschaftsproben sind), und auch nicht beim @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03soakrolls00000]{Schaden wegstecken}, wenn du nicht <em>noch einen</em> Benny verwendest, um die Konstitutionsprobe zu wiederholen.</p>\n</div>",
  "CGGH14dBuyUTM43K": "<div class=\"swade-core\">\n<p>Der Charakter erhält 10 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor05powers.JournalEntryPage.05arcanebackgr00]{Machtpunkte} zurück, wenn seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03actioncardsi00]{Aktionskarte} ein Joker ist. Dabei kann er sein Maximum nicht übersteigen.</p>\n</div>",
  "Ruqr6NxiggWbdyQq": "<div class=\"swade-core\">\n<p>Ermittler verbringen viel Zeit damit, über alte Legenden zu forschen, sich auf der Straße umzuhören oder teuflische Mysterien zu entschlüsseln. Einige dieser Helden sind tatsächliche Privatermittler, andere sind Magier-Detektive in Fantasywelten oder neugierige Collegeprofessoren, die auf Dinge stoßen, die die Menschheit niemals wissen sollte.</p> <p>Ermittler addieren +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.Y1HxgTeyvoqM3SGZ]{Recherche} und auf @UUID[Compendium.swade-core-rules.swade-skills.Item.Y0545TlaAqRRE2P0]{Wahrnehmung}, sofern sie auf einem Schreibtisch nach bedeutsamen Papieren suchen, einen Stapel Werbepost nach etwas Wichtigem durchwühlen oder versteckte Gegenstände in einem Haufen Schrott oder Schutt entdecken wollen.</p>\n</div>",
  "DiO4M0we7bx3OJs6": "<div class=\"swade-core\">\n<p>Die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Bewegungsweite} des Helden steigt um +2, und sein Sprintwürfel wird um einen Typ verbessert (ein W6 wird beispielsweise ein W8).</p>\n</div>",
  "J587NczYXdA9tt1M": "<div class=\"swade-core\">\n<p>Charaktere, die dieses Talent besitzen, wissen, wie sie den örtlichen Schwarzmarkt finden, gestohlene Güter verhökern, den örtlichen Gesetzeshütern (oder den Verbrechern!) ausweichen können, sich bedeckt halten, wenn es heiß wird, illegale Waffen erwerben, herausfinden, welcher &bdquo;Boss&ldquo; Schläger anheuert oder ähnliche zwielichtige Aktivitäten.</p> <p>Charaktere mit diesem Talent addieren +2 auf Proben mit @UUID[Compendium.swade-core-rules.swade-skills.Item.TlMOxNi4U4YOnHId]{Einschüchtern} oder @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überreden} zur @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04networking0000]{Informationsbeschaffung}, sofern diese zwielichtige oder kriminelle Elemente involvieren. Sie addieren außerdem +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.su7eyijoB0RFpRB1]{Allgemeinwissen}-Proben, die mit zwielichtigen Aktivitäten (wie weiter oben beschrieben) zu tun haben.</p>\n</div>",
  "RHUEBuZR1iLofMhq": "<div class=\"swade-core\">\n<p>Der Abenteurer scheint vom Schicksal, Karma, den Göttern oder an welche äußeren Kräften er auch immer glauben mag (oder welche an ihn glauben), gesegnet.</p> <p>Er zieht einen zusätzlichen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03bennies0000000]{Benny} zu Beginn einer jeden Spielsitzung, so dass ihm wichtige Aufgaben leichter gelingen als den meisten, und er selbst extremste @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04hazards0000000]{Gefahren} überstehen kann.</p>\n</div>",
  "6JymaOUPhhGgoEHK": "<div class=\"swade-core\">\n<p>Der Spieler zieht zwei zusätzliche @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03bennies0000000]{Bennys} statt einem zu Beginn einer jeden Sitzung.</p>\n</div>",
  "dHqIrpXx8rA1HUYG": "<div class=\"swade-core\">\n<p>Der @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Parade}-Bonus des Helden beträgt jetzt +2, und der @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03gangingup00000]{Überzahlbonus} wird um 2 Punkte verringert.</p>\n</div>",
  "hWEu2pgoT4yCDxiO": "<div class=\"swade-core\">\n<p>Gläubige stellen sich im Namen ihrer göttlichen Schutzherren großen Gefahren. Um solche schwierigen Situationen zu überleben gewähren die Mächte des Guten (oder Bösen) Wunder und die Fähigkeit, ihre Gunst in übernatürlichen Schutz zu verwandeln.</p> <p>Der Auserkorene darf für jeden ausgegebenen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor05powers.JournalEntryPage.05arcanebackgr00]{Machtpunkt} +1 auf sein Ergebnis beim Schaden wegestecken addieren, bis zu einem Maximum von +4.</p>\n</div>",
  "tZfeHaS9PxaIn0mX": "<div class=\"swade-core\">\n<p>Helden müssen oft mit Ausrüstungsgegenständen oder sogar Möbeln kämpfen, auch wenn diese nicht für einen Kampf ausgelegt sind. Ein Kämpfer mit diesem Talent hat kein Problem mit @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03improvisedwe00]{improvisierten Waffen}. Er ignoriert den üblichen Abzug von -2, wenn er sie verwendet.</p>\n</div>",
  "0n4zlJ3cSXp8vNj0": "<div class=\"swade-core\">\n<p>Der Kämpfer hat die Grundlagen einer Kampfkunst erlernt. Seine Fäuste und Füße sind Waffen (siehe @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03naturalweapo00]{Natürliche Waffen}) und somit gilt er immer als @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03unarmeddefen00]{bewaffnet}. Er addiert +2 bei @UUID[Compendium.swade-core-rules.swade-skills.Item.jixNprOk5ao0aDyI]{Kämpfen}-Angriffen mit ihnen und verursacht Stärke+W6 Schaden. Wenn er bereits einen Stärke-Schadenswürfel durch die Abstammungseigenart Klauen oder das Talent @UUID[Compendium.swade-core-rules.swade-edges.Item.4lf3EBFmxqPA6HTX]{Raufbold} erhält, erhöhe den Schadenswürfel um einen Würfeltyp. Kampfkünstler addieren keinen Schaden auf andere Natürliche Waffen wie Fänge oder Hörner.</p>\n</div>",
  "8GuAKkQxOUCIgz5k": "<div class=\"swade-core\">\n<p>Der Kämpfer hat die Grundlagen einer Kampfkunst erlernt. Seine Fäuste und Füße sind Waffen (siehe @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03naturalweapo00]{Natürliche Waffen}) und somit gilt er immer als @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03unarmeddefen00]{bewaffnet}. Er addiert +1 bei @UUID[Compendium.swade-core-rules.swade-skills.Item.jixNprOk5ao0aDyI]{Kämpfen}-Angriffen mit ihnen und verursacht Stärke+W4 Schaden. Wenn er bereits einen Stärke-Schadenswürfel durch die Abstammungseigenart @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor06bestia.JournalEntryPage.06specialabili04]{Klauen} oder das Talent @UUID[Compendium.swade-core-rules.swade-edges.Item.4lf3EBFmxqPA6HTX]{Raufbold} erhält, erhöhe den Schadenswürfel um einen Würfeltyp. Kampfkünstler addieren <em>keinen</em> Schaden auf andere Natürliche Waffen wie Fänge oder Hörner.</p>\n</div>",
  "Yo4QABeieRwTm0H7": "<div class=\"swade-core\">\n<p>Dein Krieger erholt sich schnell von Schock und Verletzungen. Er addiert +2 auf Erholungsproben gegen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Angeschlagen} oder @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03stunned0000000]{Betäubt}.</p>\n</div>",
  "elSPHAiFU2C34XoO": "<div class=\"swade-core\">\n<p>Dein Charakter ist sehr groß oder sehr fit. Seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor06bestia.JournalEntryPage.06sizetable00000]{Größe} steigt um +1 (und somit auch seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Robustheit}), und er behandelt seine Stärke als um einen Würfeltyp höher, wenn es um die Ermittlung von @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02gearnotes00000]{Behinderung} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02minimumstren00]{Mindeststärke}, damit Rüstungen, Waffen und Ausrüstungsgegenstände ohne Abzug verwendet werden können, geht.</p> <p>Kräftig kann die Größe eines Charakters nicht über&nbsp;+3 anheben.</p>\n</div>",
  "Autx8trPTM7LfBwU": "<div class=\"swade-core\">\n<p>Charaktere, die ruhig bleiben, wenn alle anderen in @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03coverandobst00]{Deckung} springen, können tödliche Kämpfer sein. Ein Held mit diesem Talent zieht eine zusätzliche @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03actioncardsi00]{Aktionskarten} im Kampf und wählt aus, welche er verwenden möchte.</p>\n</div>",
  "1DeKo4LZY9MWC8qw": "<div class=\"swade-core\">\n<p>Erhöhe die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Parade} des Helden noch einmal um +1, und sein @UUID[Compendium.swade-core-rules.swade-skills.Item.jixNprOk5ao0aDyI]{Kämpfen}-Bonusschadenswürfel ist jetzt ein W10.</p>\n</div>",
  "fOCC3PU2YmRCtLXh": "<div class=\"swade-core\">\n<p>Ständiger Kontakt mit den Gedanken anderer gibt diesen psionischen Agenten einen Vorteil, wenn es darum geht, geistige Angriffe zu führen oder abzuwehren. Mentalisten addieren +2 auf @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03test0000000000]{vergleichende} @UUID[Compendium.swade-core-rules.swade-skills.Item.bkrB9AajSCSA6eIY]{Psionikproben}, egal ob sie ihre Mächte gegen einen Feind verwenden oder sich gegen einen Rivalen schützen.</p>\n</div>",
  "IZ2DQGALF6msWsTr": "<div class=\"swade-core\">\n<p>Dieser gesellige Charakter verarbeitet Alkohol ganz anders als die meisten. In der ersten Runde, nachdem er sich einen hinter die Binde gekippt hat (ungefähr 200 ml starker Schnaps oder etwas Entsprechendes) steigt seine Konstitution um einen Würfeltyp (was auch seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Robustheit} erhöht). Der Trinker kann außerdem eine Stufe Wundabzüge ignorieren (was mit anderen Fähigkeiten, die diesen Effekt haben, kumulativ ist).</p> <p>Verstand, Geschicklichkeit und alle verknüpften Fertigkeiten erleiden aber für die Wirkungsdauer einen Abzug von&nbsp;-1.</p> <p>Der Effekt hält eine Stunde lang an, dann erleidet der Trinker für die nächsten vier Stunden eine Stufe @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03fatigue0000000]{Erschöpfung}.</p>\n</div>",
  "V1WW7gVzZ4ttLOBh": "<div class=\"swade-core\">\n<p>Charaktere mit diesem Talent haben gelernt, ihre Furcht zu meistern, oder sie haben so viele grauenvolle Dinge gesehen, dass sie abgestumpft sind. Diese tapferen Entdecker addieren +2 auf @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04fear0000000000]{Furchtproben} und ziehen 2 von Ergebnissen auf der @UUID[Compendium.swade-core-rules.swade-tables.RollTable.jhkI6HatGAeyflta]{Furchttabelle} ab.</p>\n</div>",
  "0GFf6otn7L5IcEnG": "<div class=\"swade-core\">\n<p>Naturburschen sind Waldläufer, Kundschafter und Jäger, die sich in der Wildnis wohler fühlen als in urbanen Gebieten. Sie sind geschickte Fährtenleser und Kundschafter, und wissen, wie man über Monate in der Wildnis überlebt.</p> <p>Naturburschen addieren +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.zf0tDkEA1afk1rcs]{Überlebensproben} und @UUID[Compendium.swade-core-rules.swade-skills.Item.bFaYnzftXwQ9p4Si]{Heimlichkeitsproben} in der Wildnis (nicht in Städten, Ruinen oder unter der Erde).</p>\n</div>",
  "PXxjFEmzs6bD1Tai": "<div class=\"swade-core\">\n<p>Seine Fäuste schlagen ein wie Hämmer, seine Klauen schneiden wie eine Sense. Sein Körper fühlt sich an, als würde er aus Stein bestehen. Raufbolde erhöhen ihre @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Robustheit} um 1 und verursachen Stärke+W4 Schaden, wenn sie mit ihren Fäusten oder Füßen angreifen (oder @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor06bestia.JournalEntryPage.06specialabili04]{Klauen}, wenn sie welche haben). Wenn sie bereits Schaden durch Klauen verursachen, das Talent @UUID[Compendium.swade-core-rules.swade-edges.Item.YVUeqfQ2v6hwnfrO]{Kampfkünstler} besitzen, etc., erhöhe den Schadenswürfel um einen Schritt.</p> <p>Das Talent Raufbold macht die Fäuste des Charakters nicht zu @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03naturalweapo00]{Natürlichen Waffen}.</p>\n</div>",
  "ABtO3YvOlRpVCogG": "<div class=\"swade-core\">\n<p>Der Mechaniker addiert +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.lTxygYQbGn9OoxFz]{Reparierenproben}. Mit einer Steigerung halbiert er die Zeit, die normalerweise nötig ist, um etwas zu reparieren. Das bedeutet, dass ein Reparaturgenie, wenn bei einer bestimmten Reparatur angegeben ist, dass sie bei einer Steigerung in der Hälfte der Zeit gelingt, sie in einem Viertel der Zeit erledigt ist, wenn er eine Steigerung erzielt.</p>\n</div>",
  "9NtKFiDH3miX0WZw": "<div class=\"swade-core\">\n<p>Der Kämpfer erhöht seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Robustheit} noch einmal um +1, und der Schaden mit seinen Fäusten oder Klauen steigt um einen weiteren Würfeltyp.</p>\n</div>",
  "AJjIBqfSGR2q4zPe": "<div class=\"swade-core\">\n<p>Dein Held hat gelernt, trotz extremer Schmerzen weiterzukämpfen. Er kann 1 Punkt @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wundabzüge} ignorieren.</p>\n</div>",
  "w9LmDZVB1VeibUQX": "<div class=\"swade-core\">\n<p>Schnelle Charaktere haben blitzschnelle Reflexe und die Ruhe weg. Wenn du eine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03actioncardsi00]{Aktionskarte} von 5 oder weniger ausgeteilt bekommst, kannst du sie abwerfen und neu ziehen, bis du eine Karte erhältst, die höher als 5 ist.</p> <p>Charaktere mit @UUID[Compendium.swade-core-rules.swade-edges.Item.zRpf7fTG1tykwKAs]{Kühler Kopf} und Schnell ziehen zuerst ihre zusätzliche Karte und entscheiden dann, welche sie nehmen. Wenn diese Karte eine 5 oder darunter ist, können sie dann das Talent Schnell verwenden, um eine Ersatzkarte zu ziehen, bis sie auf 6 oder höherkommen.</p>\n</div>",
  "jOTKhkcUVQCnkagM": "<div class=\"swade-core\">\n<p>@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor05powers.JournalEntryPage.05arcanebackgr00]{Machtpunkte} frischen sich normalerweise mit einer Geschwindigkeit von 5 Punkten pro Stunde Ruhe wieder auf (siehe @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor05powers.JournalEntryPage.05activation0000]{Aufladen}). Dieses Talent erhöht dies auf 10 Punkte pro Stunde.</p>\n</div>",
  "6NHmKBHPjz7nRVa8": "<div class=\"swade-core\">\n<p>Der Held addiert +2, wenn er @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03areaeffectat00]{Flächeneffekten} ausweichen will. Siehe @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03evasion0000000]{Wegspringen}.</p>\n</div>",
  "TPwbpi6elzEJpXaR": "<div class=\"swade-core\">\n<p>Dieser Abenteurer hat mehr Leben als eine Herde Katzen. Er kann seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wundabzüge} ignorieren, wenn er Konstitutionsproben macht, um nicht zu @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Verbluten}.</p>\n</div>",
  "7e49iewdr0t67N0R": "<div class=\"swade-core\">\n<p>Dein Held ist atemberaubend. Er erhöht den Bonus auf @UUID[Compendium.swade-core-rules.swade-skills.Item.UVdSzNvdAPmGk0iO]{Darbietung} und @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überreden} auf +2.</p>\n</div>",
  "WkCdtT1UZ7kXYIuk": "<div class=\"swade-core\">\n<p>Charaktere, die ruhig bleiben, wenn alle anderen in @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03coverandobst00]{Deckung} springen, können tödliche Kämpfer sein. Ein Held mit diesem Talent zieht zwei zusätzliche @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03actioncardsi00]{Aktionskarten} im Kampf und wählt aus, welche er verwenden möchte.</p>\n</div>",
  "ioAMYg89nbX4dAnv": "<div class=\"swade-core\">\n<p>Professionelle Soldaten sind daran gewöhnt, schwere Lasten zu tragen und raue Bedingungen zu ertragen. Nach einigen Tagen, um sich an ihre Ausrüstung zu gewöhnen (Entscheidung der SL), behandeln sie ihre Stärke als um einen Würfeltyp höher, wenn es um die Berechnung von @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02gearnotes00000]{Belastung} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02minimumstren00]{Mindeststärke} für Rüstung, Waffen und Ausrüstung geht. (Dies ist kumulativ zum Talent @UUID[Compendium.swade-core-rules.swade-edges.Item.wKCK3CuIuwEMzRKz]{Kräftig}).</p> <p>Sie erhalten auch eine freie Wiederholung für Konstitutionsproben, um @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04hazards0000000]{Umweltgefahren }zu überstehen.</p>\n</div>",
  "WYxDKHdh40NGDHFd": "<div class=\"swade-core\">\n<p>Selbstvertrauen ist eine starke Rüstung gegen jene, die diese Person kleinmachen wollen. Sie addiert +2 auf ihr Gesamtergebnis, wenn sie einer @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03test0000000000]{Herausforderung} mit Verstand oder Willenskraft widersteht.</p>\n</div>",
  "PwhgMDi6QZBKrNiC": "<div class=\"swade-core\">\n<p>Dieser Held ignoriert 2 Punkte @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wundabzüge}.</p>\n</div>",
  "lceYdwypZjwSSuOU": "<div class=\"swade-core\">\n<p>Erfahrene Schützen lernen, den @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03recoil00000000]{Rückstoß} einer vollautomatischen Waffe zu kompensieren. Wenn ein Charakter mit diesem Talent sich in seinem Zug nicht bewegt, ignoriert er den Rückstoß-Malus, wenn er mit einer @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02rateoffire0000]{Feuerrate} von 2 oder höher schießt.</p>\n</div>",
  "RUVuIEg91MNMB53C": "<div class=\"swade-core\">\n<p>Der Krieger erhöht seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Parade} um +1, und der Bonusschadenswürfel bei @UUID[Compendium.swade-core-rules.swade-skills.Item.jixNprOk5ao0aDyI]{Kämpfen}-Proben ist ein W8 anstelle eines W6 (siehe @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03dealingdamag00#bonusschaden]{Bonusschaden}). Er muss bewaffnet sein, um diesen Vorteil zu erhalten, doch umfasst dies das Talent @UUID[Compendium.swade-core-rules.swade-edges.Item.YVUeqfQ2v6hwnfrO]{Kampfkünstler}, @UUID[Compendium.swade-core-rules.swade-rules.swadecor06bestia.JournalEntryPage.06specialabili04]{Klauen} oder andere Fähigkeiten, die als Waffen zählen.</p>\n</div>",
  "7HPzoPNm1q5xjqep": "<div class=\"swade-core\">\n<p>Dein Charakter macht weiter, wenn andere fallen. Er kann vier @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wunden} einstecken, ehe er @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00#ausgeschaltet]{Ausgeschaltet} ist (sein maximaler Wundabzug bleibt weiterhin -3).</p>\n</div>",
  "a52TIiBjb8VeKDv5": "<div class=\"swade-core\">\n<p>Dein Charakter macht weiter, wenn andere fallen. Er kann bis zu fünf @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wunden} einstecken, ehe er @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00#ausgeschaltet]{Ausgeschaltet} ist (sein maximaler Wundabzug bleibt weiterhin -3).</p>\n</div>",
  "zTYSjPjn5O1WpFLL": "<div class=\"swade-core\">\n<p>Dein Abenteurer hat schon einige Jahre auf dem Buckel, aber er ist auch noch nicht reif fürs Altersheim. Seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Bewegungsweite} sinkt um 1, und er verringert das Ergebnis seines Sprintwürfels um 1 (Minimum 1). Er erleidet außerdem einen Abzug von -1 auf Proben mit Geschicklichkeit, Konstitution und Stärke, aber nicht bei verknüpften Fertigkeiten. Auf der positiven Seite erhält der Charakter durch die Weisheit des Alters 5 zusätzliche Fertigkeitspunkte, die er für alle Fertigkeiten verwenden kann, die mit Verstand verknüpft sind.</p>\n</div>",
  "n4MZb733hAoLQdWg": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>In einer Gesellschaft, in der bestimmte Arten von Personen vorherrschen, gehört dein Held nicht dazu. Ein amerikanischer Ureinwohner in einer Westernstadt, ein Alien in einem Sci-Fi-Spiel voller menschlicher Marines oder ein Halbork in einer Gruppe von Elfen, Zwergen und Menschen sind mögliche Beispiele. Die Einheimischen werden vermutlich höhere Preise verlangen, Bitten um Hilfe ignorieren und den Charakter als Bürger zweiter Klasse behandeln.</p>\n<p>Außenseiter ziehen 2 von Überredenproben ab, mit denen sie Personen beeinflussen wollen, die nicht zu ihrer Art gehören. Die schwere Version bedeutet zusätzlich, dass der Charakter wenige oder keine Rechte in dem Gebiet hat, in dem die Kampagne stattfindet. Er könnte unter Xenophoben einer anderen Spezies angehören, die Zivilisation könnte Fremden gegenüber grausam und intolerant handeln, oder er ist vielleicht sogar eine künstliche Intelligenz, deren Bewusstsein vom Gesetz nicht anerkannt wird.</p>\n</div>",
  "t6gh72alaLJLQ7a4": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Persönliche Angriffe gehen dem Charakter wirklich unter die Haut. Bei einem leichten Handicap erleidet er einen Abzug von -2, wenn er @UUID[Compendium.swade-core-rules.swade-skills.Item.yFPvkPIm0IR6eqch]{Provozieren}-Angriffen widerstehen will. Bei einem schweren Handicap beträgt der Abzug -4.</p>\n</div>",
  "e3mu9DzoGHM6DOCf": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Persönliche Angriffe gehen dem Charakter wirklich unter die Haut. Bei einem leichten Handicap erleidet er einen Abzug von -2, wenn er @UUID[Compendium.swade-core-rules.swade-skills.Item.yFPvkPIm0IR6eqch]{Provozieren}-Angriffen widerstehen will. Bei einem schweren Handicap beträgt der Abzug -4.</p>\n</div>",
  "onZ4pMyX9AY5lCSK": "<div class=\"swade-core\">\n<p>Nicht jeder hat Eiswasser in den Adern. Dein Held kann kein Blut sehen und hat große Angst davor, verletzt zu werden. Er erleidet einen Abzug von -2 auf @UUID[Compendium.swade-core-rules.swade-tables.RollTable.jhkI6HatGAeyflta]{Furchtproben} und wenn er @UUID[Compendium.swade-core-rules.swade-skills.Item.TlMOxNi4U4YOnHId]{Einschüchtern} widersteht.</p>\n</div>",
  "zpvG6oYNcgpaM4my": "<div class=\"swade-core\">\n<p>Charaktere, die gut mit ihrem Gewicht zurechtkommen, wählen das Talent @UUID[Compendium.swade-core-rules.swade-edges.Item.wKCK3CuIuwEMzRKz]{Kräftig}. Andere sind fettleibig. Ein Charakter kann nicht gleichzeitig Kräftig und Fettleibig sein, und dieses Handicap kann deine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03sizeandscale00]{Größe} nicht über +3 anheben.</p>\n<p>Die Größe (und somit @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Robustheit}) eines fettleibigen Helden steigt um +1. Seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Bewegungsweite} sinkt um 1, und sein Sprintwürfel wird um einen Typ verringert (Minimum W4). Wenn es um getragene Rüstung und Ausrüstung (nicht Waffen) geht, wird seine Stärke als um einen Würfeltyp niedriger behandelt. Er hat auch unter Umständen Schwierigkeiten, Rüstung und Kleidung zu finden, die passt, oder sich an enge Orte zu begeben.</p>\n</div>",
  "0UALfHf6bjfMUezZ": "<div class=\"swade-core\">\n<p>Dieser Griesgram ist übellaunig und streitlustig. Es fällt ihm schwer, etwas Nettes für andere zu tun, er lässt sich für seine Mühen bezahlen, benimmt sich daneben, selbst wenn man ihn belohnt oder ihm einen Gefallen tut. Neben den zu erwartenden rollenspielerischen Problemen ziehen fiese Charaktere 1 von @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überredenproben} ab.</p>\n</div>",
  "6xJV6hjIg6fFuoyS": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Wie man aussieht, so wird man angesehen. Allerdings ist das für diese unglückselige Person nicht von Vorteil. Er erleidet einen Abzug von -1 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überredenproben}, oder -2, wenn er ein schweres Handicap ausgewählt hat.</p>\n</div>",
  "ZF4c6b8VNGtvCtCp": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Der Held ist 12&nbsp;bis 15 Jahre alt (in menschlichen Jahren &ndash; passe dies für andere Völker an). Er hat nur 4&nbsp;Punkte für seine Attribute anstelle der üblichen&nbsp;5, und 10 Fertigkeitspunkte anstelle von 12. Er könnte auch unter rechtlichen Einschränkungen leiden, die vom Setting abhängen (er darf nicht Auto fahren, keine Waffe besitzen oder Ähnliches).</p>\n<p>Andererseits haben junge Leute oft ziemlich viel Glück. Sie erhalten zu Beginn einer jeden Spielsitzung einen zusätzlichen Benny (dies ist kumulativ zu anderen Talenten wie @UUID[Compendium.swade-core-rules.swade-edges.Item.7huwXlataZ2OaQXL]{Glück} oder @UUID[Compendium.swade-core-rules.swade-edges.Item.2mbFmjLj5liENPVl]{Großes Glück}). Die meisten jungen Charaktere sollten auch das Handicap @UUID[Compendium.swade-core-rules.swade-hindrances.Item.1NFYIxXLjVyPUUxJ]{Klein} wählen, doch ist dies nicht verpflichtend.</p>\n<p>Bei einem schweren Handicap ist der Charakter sehr jung (8 bis 11 Jahre alt). Er hat nur 3 Punkte für seine Attribute und 10 für Fertigkeiten, sowie das Handicap Klein. Sehr junge Helden ziehen zu Beginn einer jeden Spielsitzung zwei zusätzliche Bennys.</p>\n</div>",
  "H0BtmXBb2bNNa6Rf": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Der Held ist 12&nbsp;bis 15 Jahre alt (in menschlichen Jahren &ndash; passe dies für andere Völker an). Er hat nur 4&nbsp;Punkte für seine Attribute anstelle der üblichen&nbsp;5, und 10 Fertigkeitspunkte anstelle von 12. Er könnte auch unter rechtlichen Einschränkungen leiden, die vom Setting abhängen (er darf nicht Auto fahren, keine Waffe besitzen oder Ähnliches).</p>\n<p>Andererseits haben junge Leute oft ziemlich viel Glück. Sie erhalten zu Beginn einer jeden Spielsitzung einen zusätzlichen Benny (dies ist kumulativ zu anderen Talenten wie @UUID[Compendium.swade-core-rules.swade-edges.Item.7huwXlataZ2OaQXL]{Glück} oder @UUID[Compendium.swade-core-rules.swade-edges.Item.2mbFmjLj5liENPVl]{Großes Glück}). Die meisten jungen Charaktere sollten auch das Handicap @UUID[Compendium.swade-core-rules.swade-hindrances.Item.1NFYIxXLjVyPUUxJ]{Klein} wählen, doch ist dies nicht verpflichtend.</p>\n<p>Bei einem schweren Handicap ist der Charakter sehr jung (8 bis 11 Jahre alt). Er hat nur 3 Punkte für seine Attribute und 10 für Fertigkeiten, sowie das Handicap Klein. Sehr junge Helden ziehen zu Beginn einer jeden Spielsitzung zwei zusätzliche Bennys.</p>\n</div>",
  "jqsyDcDjcUIunbLP": "<div class=\"swade-core\">\n<p>Dieser Abenteurer ist ziemlich dürr, ziemlich klein oder beides. Seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03sizeandscale00]{Größe} wird um 1 verringert, wodurch auch seine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Robustheit} sinkt. Die Größe kann nicht unter -1 sinken, doch der Abzug auf Robustheit ist kumulativ. Ein kleiner Halbling beispielsweise hat Größe -1, verliert aber einen zusätzlichen Punkt Robustheit.</p>\n</div>",
  "koJmsYJdoxQ0F82G": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Eine Behinderung oder eine alte Verletzung schränken die Bewegungsfähigkeit des Helden ein. Bei einem leichten Handicap sinkt seine Bewegungsweite um 1 und sein Sprintwürfel verringert sich um einen Würfeltyp (wenn er bereits einen W4 hat, verringere ihn auf W4-1). Bei einem schweren Handicap sinkt die Bewegungsweite um 2, der Sprintwürfel verringert sich um einen Würfeltyp und er zieht 2 von Athletikproben und Proben ab, um Athletik zu widerstehen (wie zum Beispiel bei Herausforderungen oder Ringen).</p>\n<p>Langsame Charaktere dürfen nicht gleichzeitig Flink sein.</p>\n<p><strong>Prothesen:</strong> Ein Charakter mit der leichten Version dieses Handicaps könnte eine Prothese haben. Wenn die Prothese verloren geht, erleidet er die Auswirkungen der schweren Version von Langsam.</p>\n<p><strong>Rollstuhl:</strong> Ab dem viktorianischen Zeitalter können langsame Helden ohne Kosten das Spiel mit einem manuellen Rollstuhl beginnen. In der Moderne (1980 und später) kann der Charakter auch einen ultraleichten oder energiebetriebenen Rollstuhl verwenden.</p>\n<ul>\n<li>MANUELL: Die Bewegungsweite ist der halbe Athletikwert (Maximum 3), und du kannst nicht sprinten.</li>\n<li>ULTRALEICHT: Die Bewegungsweite entspricht dem Athletikwürfel, und du kannst mit einem W4 (leicht) oder einem W4-1 (schwer) sprinten.</li>\n<li>ENERGIEBETRIEBEN: Bewegungsweite 6 auf flachem Boden, Bewegungsweite 3 auf unebenem Boden, Sprinten ist nicht möglich. Die meisten energiebetriebenen Rollstühle können ungefähr 15 km weit fahren, ehe sie wieder aufgeladen werden müssen.</li>\n</ul>\n</div>",
  "sx7Da1rKR9pUAfZG": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Eine Behinderung oder eine alte Verletzung schränken die Bewegungsfähigkeit des Helden ein. Bei einem leichten Handicap sinkt seine Bewegungsweite um 1 und sein Sprintwürfel verringert sich um einen Würfeltyp (wenn er bereits einen W4 hat, verringere ihn auf W4-1). Bei einem schweren Handicap sinkt die Bewegungsweite um 2, der Sprintwürfel verringert sich um einen Würfeltyp und er zieht 2 von Athletikproben und Proben ab, um Athletik zu widerstehen (wie zum Beispiel bei Herausforderungen oder Ringen).</p>\n<p>Langsame Charaktere dürfen nicht gleichzeitig Flink sein.</p>\n<p><strong>Prothesen:</strong> Ein Charakter mit der leichten Version dieses Handicaps könnte eine Prothese haben. Wenn die Prothese verloren geht, erleidet er die Auswirkungen der schweren Version von Langsam.</p>\n<p><strong>Rollstuhl:</strong> Ab dem viktorianischen Zeitalter können langsame Helden ohne Kosten das Spiel mit einem manuellen Rollstuhl beginnen. In der Moderne (1980 und später) kann der Charakter auch einen ultraleichten oder energiebetriebenen Rollstuhl verwenden.</p>\n<ul>\n<li>MANUELL: Die Bewegungsweite ist der halbe Athletikwert (Maximum 3), und du kannst nicht sprinten.</li>\n<li>ULTRALEICHT: Die Bewegungsweite entspricht dem Athletikwürfel, und du kannst mit einem W4 (leicht) oder einem W4-1 (schwer) sprinten.</li>\n<li>ENERGIEBETRIEBEN: Bewegungsweite 6 auf flachem Boden, Bewegungsweite 3 auf unebenem Boden, Sprinten ist nicht möglich. Die meisten energiebetriebenen Rollstühle können ungefähr 15 km weit fahren, ehe sie wieder aufgeladen werden müssen.</li>\n</ul>\n</div>",
  "qco7WaIGiyhFSZlM": "<div class=\"swade-core\">\n<p>Dank Schwimmbädern, mühelosen Reisen zu Seen und Stränden oder bewusster Erziehung können die meisten Leute im 21. Jahrhundert schwimmen. Historisch gesehen allerdings konnten Leute, die nicht an einem gemäßigten Gewässer aufgewachsen sind, das nicht.</p>\n<p>Charaktere mit diesem Handicap erleiden einen Abzug von -2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.qc2GOKFIXIJEpTw1]{Athletikproben}, wenn sie schwimmen, und jeder Zoll, den sie sich im Wasser bewegen, kostet sie 3&ldquo; @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Bewegungsweite}. Siehe auch @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04drowning000000]{Ertrinken}.</p>\n</div>",
  "Ty8J9BtdGdP6IOKW": "<div class=\"swade-core\">\n<p>Dein Held hat ein bisschen weniger Glück als die meisten. Er erhält einen Benny weniger pro Spielsitzung als normal. Ein Charakter kann nicht gleichzeitig Pech und @UUID[Compendium.swade-core-rules.swade-edges.Item.7huwXlataZ2OaQXL]{Glück} haben.</p>\n</div>",
  "tuFvcLdagY2QYrDZ": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Phobien sind überwältigende und irrationale Ängste, die den Verstand eines Helden heimsuchen. Wenn er sich in Gegenwart seiner Phobie befindet (Entscheidung der SL, aber normalerweise in Sichtweite) zieht er bei einem leichten Handicap 1 von allen Eigenschaftsproben ab, bei einem schweren Handicap 2.</p>\n<p>Phobien sollten nicht zu offensichtlich sein &ndash; jeder sollte beispielsweise Angst vor Vampiren haben, also ist das keine Phobie, sondern gesunder Menschenverstand. Stattdessen sollte sich eine Phobie auf ein zufälliges Element fokussieren, das sein Verstand mit dem verursachenden Ereignis in Verbindung bringt. Denk daran: Phobien sind irrationale Ängste.</p>\n</div>",
  "UnNtoqgwBNQWSnzM": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Phobien sind überwältigende und irrationale Ängste, die den Verstand eines Helden heimsuchen. Wenn er sich in Gegenwart seiner Phobie befindet (Entscheidung der SL, aber normalerweise in Sichtweite) zieht er bei einem leichten Handicap 1 von allen Eigenschaftsproben ab, bei einem schweren Handicap 2.</p>\n<p>Phobien sollten nicht zu offensichtlich sein &ndash; jeder sollte beispielsweise Angst vor Vampiren haben, also ist das keine Phobie, sondern gesunder Menschenverstand. Stattdessen sollte sich eine Phobie auf ein zufälliges Element fokussieren, das sein Verstand mit dem verursachenden Ereignis in Verbindung bringt. Denk daran: Phobien sind irrationale Ängste.</p>\n</div>",
  "QAwbE4LSBKoZTFjY": "<div class=\"swade-core\">\n<p>Dein Warmduscher ist einfach nicht besonders bedrohlich. Vielleicht ist er ein bisschen speckig um die Körpermitte, hat ein zu nettes Gesicht oder eine sehr sanfte Stimme. Was auch immer das Problem ist, er hat Schwierigkeiten damit, wie ein harter Kerl auszusehen. Er zieht 2 ab, wenn er @UUID[Compendium.swade-core-rules.swade-skills.Item.TlMOxNi4U4YOnHId]{Einschüchtern}-Proben ablegt.</p>\n</div>",
  "i6HdHYHtjqXOGBqZ": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Die Augen deines Helden sind nicht mehr, was sie einmal waren. Er erleidet einen Abzug von -1 auf alle Eigenschaftswürfe, die von Sicht abhängen (wie @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03attacks0000000]{Fernkampfangriffe} und @UUID[Compendium.swade-core-rules.swade-skills.Item.Y0545TlaAqRRE2P0]{Wahrnehmungsproben}), oder -2, wenn du ein schweres Handicap hast.</p>\n<p>In Settings, in denen Brillen verfügbar sind, negieren sie den Abzug, solange du sie trägst. Wenn eine Brille im Kampf verloren geht oder zerbricht (die Wahrscheinlichkeit beträgt 50%, wenn der Charakter eine Wunde einsteckt, stürzt oder ein andere Art von Verletzung erleidet), ist der Charakter bis zum Ende seines nächsten Zugs @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03distractedan00]{Abgelenkt} (und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03distractedan00]{Verwundbar} im Fall eines schweren Handicaps).</p>\n</div>",
  "ag8GEXf4cSMQWElk": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Die Augen deines Helden sind nicht mehr, was sie einmal waren. Er erleidet einen Abzug von -1 auf alle Eigenschaftswürfe, die von Sicht abhängen (wie @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03attacks0000000]{Fernkampfangriffe} und @UUID[Compendium.swade-core-rules.swade-skills.Item.Y0545TlaAqRRE2P0]{Wahrnehmungsproben}), oder -2, wenn du ein schweres Handicap hast.</p>\n<p>In Settings, in denen Brillen verfügbar sind, negieren sie den Abzug, solange du sie trägst. Wenn eine Brille im Kampf verloren geht oder zerbricht (die Wahrscheinlichkeit beträgt 50%, wenn der Charakter eine Wunde einsteckt, stürzt oder ein andere Art von Verletzung erleidet), ist der Charakter bis zum Ende seines nächsten Zugs @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03distractedan00]{Abgelenkt} (und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03distractedan00]{Verwundbar} im Fall eines schweren Handicaps).</p>\n</div>",
  "tL1IWFQH6IklcvnK": "<div class=\"swade-core\">\n<p>(Leicht oder Schwer)</p>\n<p>Charaktere, die ihr Gehör ganz oder zum Teil verloren haben, haben diesen Nachteil. Bei einem leichten Handicap erleidet der Charakter einen Abzug von -4 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.Y0545TlaAqRRE2P0]{Wahrnehmungsproben}, die mit Gehör zu tun haben, zum Beispiel wenn er bei lauten Geräuschen aufwachen soll. Ein schweres Handicap bedeutet, dass der Charakter taub ist. Er kann nicht hören und scheitert automatisch bei allen Wahrnehmungsproben, die auf Gehör basieren.</p>\n<p>Hörgeräte verringern den Abzug um 2, erfordern aber Batterien, und wenn der Charakter eine Wunde einsteckt, stürzt oder eine andere Art Verletzung erleidet, besteht eine Chance von 50%, dass sie herausfallen.</p>\n</div>",
  "6xJV6ijIg6fFuoyS": "<div class=\"swade-core\">\n<p>Dein Held achtet nicht besonders auf die Welt, die ihn umgibt, und findet nicht einmal einen Heuhaufen in einem Häufchen Nadeln.</p>\n<p>Er erleidet -1 auf Proben mit @UUID[Compendium.swade-core-rules.swade-skills.Item.su7eyijoB0RFpRB1]{Allgemeinwissen} und @UUID[Compendium.swade-core-rules.swade-skills.Item.Y0545TlaAqRRE2P0]{Wahrnehmung}.</p>\n</div>",
  "YODh1z4EGLXlywaF": "<div class=\"swade-core\">\n<p>Dein Held zögert in Stresssituationen. Ziehe zwei @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03soakrolls00000]{Aktionskarten} im Kampf und verwende die schlechtere. Wenn du einen Joker ziehst, kannst du ihn normal verwenden und das Handicap für die Runde ignorieren (deshalb ist es auch nur ein leichtes Handicap, weil es tatsächlich die Chancen erhöht, einen Joker zu ziehen!).</p>\n<p>Zögerliche Charaktere können nicht die Talente @UUID[Compendium.swade-core-rules.swade-edges.Item.H1xRqRutivEASOge]{Schnell} oder @UUID[Compendium.swade-core-rules.swade-edges.Item.zRpf7fTG1tykwKAs]{Kühler Kopf} wählen.</p>\n</div>",
  "gymMrzYNFsuZnJIx": "<p>Avionen sind aufmerksamer als die meisten. Sie beginnen mit einem W6 in @UUID[Compendium.swade-core-rules.swade-skills.Item.Y0545TlaAqRRE2P0]{Wahrnehmung} (anstelle eines W4) und können die Fertigkeit auf W12+1 anheben.</p>",
  "JBptc54WI3H4IHCr": "<p>Die Menschen, die diese zerstörte Erde geerbt haben, beginnen das Spiel mit einem W6 in Konstitution anstelle eines W4. Das erhöht ihre maximale Konstitution auf W12+1.</p>",
  "F2QuNNyDj3urPX6W": "<p>Elfen sind anmutig und geschickt. Sie beginnen mit einem W6 in Geschicklichkeit anstatt einem W4. Das erhöht ihre maximale Geschicklichkeit auf W12+1.</p>",
  "PdIwZKW9aqtZ9UbV": "<p>Halblinge sind allgemein sehr optimistische Kreaturen. Sie beginnen mit einem W6 in Willenskraft anstatt einem W4. Das erhöht ihre maximale Willenskraft auf W12+1.</p>",
  "yAvbCcTj29muJN56": "<p>Verringere die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Bewegungsweite} des Charakters um 1 und seinen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Sprintwürfel} um einen Schritt.</p>",
  "r5afuqrfLsC8blhj": "<p>Alle Himmlischen beginnen mit einem W6 in @UUID[Compendium.swade-core-rules.swade-skills.Item.5qXzjDHdjaeYnBod]{Glaube}. Das erhöht ihren maximalen Glauben auf W12+1.</p>",
  "zMGRA3gVb4YI1qD9": "<p>Ihre katzenhafte Anmut verleiht den Rakashanern einen W6 anstelle eines W4 in @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01traits00000000]{Geschicklichkeit}. Das erhöht ihre maximale Geschicklichkeit auf W12+1.</p>",
  "9rgZKfkcra1cRZyo": "<p>Zwerge haben im Vergleich zu den meisten anderen Völkern kurze Beine. Verringere ihre @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Bewegungsweite} um 1 und ihren @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Sprintwürfel} um einen Schritt.</p>",
  "ZkcNk6MSpkDDGpMT": "<p>Zwerge sind kräftig und knallhart. Sie beginnen mit einem W6 in Konstitution anstatt einem W4. Das erhöht ihre maximale Konstitution auf W12+1.</p>",
  "LpBn1TUzHNV3VFRW": "<div class=\"swade-core\">\n<p><span class=\"fontstyle0\">Die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Bewegungsweite} des Charakters steigt um +2, und sein @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Sprintwürfel} wird um einen Würfeltyp verbessert.</span></p>\n<p><strong>Wert:</strong> 2</p>\n<p><strong>Maximum:</strong> 2</p>\n</div>",
  "iTV63p0YQXWZF3rt": "<article class=\"swade-core\">Halblinge bekommen einen zusätzlichen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03bennies0000000]{Benny} pro Spielsitzung.</article>",
  "zQkvgqw1kUtgBIij": "<div class=\"swade-core\">\n<p>Die Wesenheit ist kleiner als der Durchschnitt, was ihre @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03sizeandscale00]{Größe} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000]{Robustheit} um &ndash;1 verringert (siehe die @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor06bestia.JournalEntryPage.06sizetable00000]{Größentabelle}).</p>\n<p><strong>Wert:</strong> -1</p>\n<p><strong>Maximum:</strong> 1</p>\n</div>",
  "fUoz3zZ3fcf4Ozjb": "<div class=\"swade-core\">\n<p>Die Mitglieder dieser Abstammung haben eine Abneigung gegen ein anderes Volk, das in dem Setting recht weit verbreitet ist. Sie erleiden einen Abzug von &ndash;2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überredenproben}, wenn sie mit ihren Rivalen sprechen müssen, und sie werden auch bei kleinen Provokationen schnell feindselig. Dies kann nur einmal pro Abstammung ausgewählt werden.</p>\n<p><strong>Wert:</strong> -1</p>\n<p><strong>Maximum:</strong> Unbegrenzt</p>\n</div>",
  "zk4W4mwYBCR70M1H": "<div class=\"swade-core\">\n<p>Erde, @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04fire0000000000]{Feuer}, Luft und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04drowning000000]{Wasser} stellen die Grundlage der Elementarreiche dar, in denen seltsame, unergründliche Kreaturen leben.</p>\n<p>Elementare haben Körper aus purer Erde, Feuer, Luft oder Wasser, und ignorieren somit zusätzlichen Schaden durch @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03calledshots000]{Angesagte Ziele}, ignorieren 1 Punkt @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wundabzüge}, atmen nicht, essen nicht und sind immun gegen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04poison00000000]{Gifte} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04disease0000000]{Krankheiten}. Sie können nur über Magie oder @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03healing0000000]{Natürliche Heilung} geheilt werden.</p>\n</div>",
  "kLw0l3pGFffK3kGc": "<div class=\"swade-core\">\n<p>Roboter, Golems und andere belebte Objekte werden kollektiv als Konstrukte bezeichnet. Einige sind intelligente Wesen, andere bloße Automaten, die dem Willen ihres Meisters folgen.</p>\n<p>Was auch immer ihre Ursprünge und ihr Material sind, Konstrukte haben mehrere Vorteile gegenüber Kreaturen aus Fleisch und Blut.</p>\n<p>Konstrukte addieren +2, wenn sie Erholungsproben gegen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Angeschlagen} ablegen, ignorieren 1 Punkt @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wundabzüge}, atmen nicht, essen nicht und sind immun gegen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04disease0000000]{Krankheiten} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04poison00000000]{Gifte}, verbluten nicht, und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wunden} werden mit @UUID[Compendium.swade-core-rules.swade-skills.Item.lTxygYQbGn9OoxFz]{Reparieren} anstelle von @UUID[Compendium.swade-core-rules.swade-skills.Item.Syo1BvITMeRV2Aat]{Heilen} entfernt, ohne &bdquo;@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03healing0000000]{Goldene Stunde}&ldquo;.</p>\n</div>",
  "URRGGtopX2gc5a8M": "<article class=\"swade-core\">\n<ul>\n<li><strong>Schnell:</strong> W10 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03movement000000]{Sprintwürfel}.</li>\n</ul>\n</article>",
  "R3mMga1S6dPN1jeF": "<div class=\"swade-core\">\n<ul>\n<li><strong>Schwarm: </strong>+2 auf Erholung von @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Angeschlagen}, @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000#abgeleitete-werte]{Parade} +2. Schwärme bestehen aus vielen kleinen Kreaturen, daher richten Hieb- und Stichwaffen keinen echten Schaden an. @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03areaeffectat00]{Flächeneffektangriffe} funktionieren normal, und ein Charakter kann zutreten, um jede Runde seinen Schaden in @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01traits00000000]{Stärke} zu verursachen. Manche Schwärme (Bienen, Hornissen, Vögel) können durch vollständiges Untertauchen in Wasser abgewehrt werden.</li>\n</ul>\n</article>",
  "rj1JKO8r0JXyd1K6": "<div class=\"swade-core\">\n<p>Zombies, Skelette und ähnliche fleischgewordene Schrecken sind besonders schwer zu zerstören.</p>\n<p>Sie addieren +2 auf @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01characters0000]{Robustheit} und Erholungsproben gegen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Angeschlagen}, ignorieren zusätzlichen Schaden durch @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03calledshots000]{Angesagte Ziele}, ignorieren 1 Punkt @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wundabzüge}, müssen nicht atmen oder essen und sind immun gegen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04poison00000000]{Gifte} und @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor04theadv.JournalEntryPage.04disease0000000]{Krankheit}, @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Verbluten} nicht und können nur mit magischer @UUID[Compendium.swade-core-rules.swade-powers.Item.R7PJ0KAU43GgLQC9]{Heilung} geheilt werden.</p>\n</div>",
  "We48tELFzE9qCZ5E": "<div class=\"swade-core\">\n<p>Elite-@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03wildcardsand00]{Statisten} sind widerstandsfähiger als üblich. Dazu könnten besonders gezüchtete Orks in einem Fantasy-Setting, besonders harte Schläger oder Agenten in der Moderne, oder sogar mutierte Tiere, die im Labor eines verrückten Wissenschaftlers&nbsp;erschaffen wurden, gehören.</p>\n<p>Widerstandsfähige @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03wildcardsand00]{Statisten} können eine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wunde} erleiden, ehe sie @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Ausgeschaltet} sind. @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03wildcardsand00]{Wildcards} können nicht Widerstandfähig oder @UUID[Compendium.swade-core-rules.swade-specialabilities.Item.ckc8WGlXl9uWsyWH]{Sehr Widerstandsfähig} sein. Die Fähigkeiten existieren, um ausgewählte Statisten etwas näher an die Helden und Schurken heranzubringen, die sie anführen.</p>\n</div>",
  "LKZ0RCTOAcBQOFDL": "<div class=\"swade-core\">\n<p>Elite-@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03wildcardsand00]{Statisten} sind widerstandsfähiger als üblich. Dazu könnten besonders gezüchtete Orks in einem Fantasy-Setting, besonders harte Schläger oder Agenten in der Moderne, oder sogar mutierte Tiere, die im Labor eines verrückten Wissenschaftlers&nbsp;erschaffen wurden, gehören.</p>\n<p>Widerstandsfähige @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03wildcardsand00]{Statisten} können eine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wunde} erleiden, ehe sie @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Ausgeschaltet} sind. @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03wildcardsand00]{Wildcards} können nicht Widerstandfähig oder @UUID[Compendium.swade-core-rules.swade-specialabilities.Item.ckc8WGlXl9uWsyWH]{Sehr Widerstandsfähig} sein. Die Fähigkeiten existieren, um ausgewählte Statisten etwas näher an die Helden und Schurken heranzubringen, die sie anführen.</p>\n</div>",
  "A9beVwR3yV8v8o83": "<div class=\"swade-core\">\n<p>Sehr zähe oder entschlossene Kreaturen fallen nicht durch kleinere Verletzungen, egal wie viele sie erleiden. Ein ordentlicher Treffer ist notwendig, um eine dieser hartnäckigen Kreaturen zu Fall zu bringen. Wenn die Bestie @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Angeschlagen} ist, verursacht ein zweites Angeschlagen-Ergebnis keine @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03damageeffect00]{Wunde}.</p>\n</div>",
};

// Fallback per englischem Effekt-Namen (für auf Charakter importierte Effekte mit neuer ID)
const effectDescriptionsByName = {
  "Numb (1 point)": effectDescriptionsByID["7MiYdn0XeVCiUFQu"],
  "Numb (2 points)": effectDescriptionsByID["6Ix2kFqUUaf2mMVo"],
  "Blind (-2)": effectDescriptionsByID["GymyTzQpByx2blGD"],
  "Blind (-4)": effectDescriptionsByID["N3mKRqKW4Nl6VEb2"],
  "Pace x 2": effectDescriptionsByID["Cozm4EhOsLHu81hH"],
  "Agile": effectDescriptionsByID["zMGRA3gVb4YI1qD9"],
  "Alertness": effectDescriptionsByID["ABtO3YvOlRpVCogF"],
  "Ambidextrous": effectDescriptionsByID["PXxjFEmzs6bD1Chi"],
  "Ancestral Enemy": effectDescriptionsByID["fUoz3zZ3fcf4Ozjb"],
  "Aristocrat": effectDescriptionsByID["GMhfERXYVbrjQhhk"],
  "Attractive": effectDescriptionsByID["0OuAJRtfLz4tPcml"],
  "Bad Eyes (Major)": effectDescriptionsByID["ag8GEXf4cSMQWElk"],
  "Bad Eyes (Minor)": effectDescriptionsByID["i6HdHYHtjqXOGBqZ"],
  "Bad Luck": effectDescriptionsByID["Ty8J9BtdGdP6IOKW"],
  "Berserk": effectDescriptionsByID["1UkpIwduU7EtkEGz"],
  "Block": effectDescriptionsByID["lQ74CgjO4vUv7TQx"],
  "Brave": effectDescriptionsByID["V1WW7gVzZ4ttLOBh"],
  "Brawler": effectDescriptionsByID["PXxjFEmzs6bD1Tai"],
  "Brawny": effectDescriptionsByID["elSPHAiFU2C34XoO"],
  "Bruiser": effectDescriptionsByID["9NtKFiDH3miX0WZw"],
  "Can't Swim": effectDescriptionsByID["qco7WaIGiyhFSZlM"],
  "Champion": effectDescriptionsByID["UPNflRrXTEIheOjV"],
  "Clueless": effectDescriptionsByID["6xJV6ijIg6fFuoyS"],
  "Combat Reflexes": effectDescriptionsByID["Yo4QABeieRwTm0H7"],
  "Construct": effectDescriptionsByID["kLw0l3pGFffK3kGc"],
  "Elan": effectDescriptionsByID["9kFbhzHWhmnywHRy"],
  "Elderly": effectDescriptionsByID["zTYSjPjn5O1WpFLL"],
  "Elemental": effectDescriptionsByID["zk4W4mwYBCR70M1H"],
  "Faith": effectDescriptionsByID["r5afuqrfLsC8blhj"],
  "Fleet-Footed": effectDescriptionsByID["DiO4M0we7bx3OJs6"],
  "Great Luck": effectDescriptionsByID["6JymaOUPhhGgoEHK"],
  "Hard of Hearing": effectDescriptionsByID["tL1IWFQH6IklcvnK"],
  "Hard to Kill": effectDescriptionsByID["TPwbpi6elzEJpXaR"],
  "Hardy": effectDescriptionsByID["A9beVwR3yV8v8o83"],
  "Healer": "<div class=\"swade-core\">\n<p>Ein Held mit diesem Talent addiert +2 auf alle @UUID[Compendium.swade-core-rules.swade-skills.Item.Syo1BvITMeRV2Aat]{Heilen}-Proben, egal ob sie @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03healing0000000]{natürlicher} oder magischer Natur sind.</p>\n</div>",
  "Hesitant": effectDescriptionsByID["YODh1z4EGLXlywaF"],
  "Holy/Unholy Warrior": effectDescriptionsByID["hWEu2pgoT4yCDxiO"],
  "Imp Block": effectDescriptionsByID["dHqIrpXx8rA1HUYG"],
  "Imp Dodge": effectDescriptionsByID["6NHmKBHPjz7nRVa8"],
  "Imp Level Headed": effectDescriptionsByID["WkCdtT1UZ7kXYIuk"],
  "Imp Nerves of Steel": effectDescriptionsByID["PwhgMDi6QZBKrNiC"],
  "Improvisational Fighter": effectDescriptionsByID["tZfeHaS9PxaIn0mX"],
  "Investigator": effectDescriptionsByID["Ruqr6NxiggWbdyQq"],
  "Iron Jaw (Knockout)": effectDescriptionsByID["u7paWxVTE24pTFzq"],
  "Iron Jaw (Soak)": effectDescriptionsByID["3ApraUkQKIqc2F4k"],
  "Keen Senses": effectDescriptionsByID["gymMrzYNFsuZnJIx"],
  "Level Headed": effectDescriptionsByID["Autx8trPTM7LfBwU"],
  "Liquid Courage": effectDescriptionsByID["IZ2DQGALF6msWsTr"],
  "Luck": effectDescriptionsByID["RHUEBuZR1iLofMhq"],
  "Martial Artist": effectDescriptionsByID["8GuAKkQxOUCIgz5k"],
  "Martial Warrior": effectDescriptionsByID["0n4zlJ3cSXp8vNj0"],
  "Master of Arms": effectDescriptionsByID["1DeKo4LZY9MWC8qw"],
  "Mean": effectDescriptionsByID["0UALfHf6bjfMUezZ"],
  "Menacing": "<div class=\"swade-core\">\n<p>Es ist nicht immer ein Nachteil, ein ungehobelter Klotz zu sein, wenn man weiß, wie man es einsetzen kann. Bedrohlich erlaubt es einem Charakter, sein übles Aussehen oder seine noch üblere Einstellung auszunutzen. Der Charakter erhält +2 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.TlMOxNi4U4YOnHId]{Einschüchtern}-Proben.</p>\n</div>",
  "Mentalist": effectDescriptionsByID["fOCC3PU2YmRCtLXh"],
  "Mild Mannered": effectDescriptionsByID["QAwbE4LSBKoZTFjY"],
  "Mr. Fix It": effectDescriptionsByID["ABtO3YvOlRpVCogG"],
  "Nerves of Steel": effectDescriptionsByID["AJjIBqfSGR2q4zPe"],
  "Obese": effectDescriptionsByID["zpvG6oYNcgpaM4my"],
  "Outsider": effectDescriptionsByID["n4MZb733hAoLQdWg"],
  "Pace (Ancestry)": effectDescriptionsByID["LpBn1TUzHNV3VFRW"],
  "Phobia (Major)": effectDescriptionsByID["UnNtoqgwBNQWSnzM"],
  "Phobia (Minor)": effectDescriptionsByID["tuFvcLdagY2QYrDZ"],
  "Power Surge": effectDescriptionsByID["CGGH14dBuyUTM43K"],
  "Quick": effectDescriptionsByID["w9LmDZVB1VeibUQX"],
  "Rapid Recharge": effectDescriptionsByID["jOTKhkcUVQCnkagM"],
  "Reduced Pace": effectDescriptionsByID["yAvbCcTj29muJN56"],
  "Resilient": effectDescriptionsByID["We48tELFzE9qCZ5E"],
  "Rock and Roll!": effectDescriptionsByID["lceYdwypZjwSSuOU"],
  "Size -1": effectDescriptionsByID["zQkvgqw1kUtgBIij"],
  "Slow (Major)": effectDescriptionsByID["sx7Da1rKR9pUAfZG"],
  "Slow (Minor)": effectDescriptionsByID["koJmsYJdoxQ0F82G"],
  "Small": effectDescriptionsByID["jqsyDcDjcUIunbLP"],
  "Soldier": effectDescriptionsByID["ioAMYg89nbX4dAnv"],
  "Speed": effectDescriptionsByID["URRGGtopX2gc5a8M"],
  "Spirited": effectDescriptionsByID["PdIwZKW9aqtZ9UbV"],
  "Streetwise": effectDescriptionsByID["J587NczYXdA9tt1M"],
  "Strong Willed": effectDescriptionsByID["WYxDKHdh40NGDHFd"],
  "Swarm": effectDescriptionsByID["R3mMga1S6dPN1jeF"],
  "Thief": effectDescriptionsByID["NSXoFUpev9UOXq5b"],
  "Thin Skinned (Major)": effectDescriptionsByID["e3mu9DzoGHM6DOCf"],
  "Thin Skinned (Minor)": effectDescriptionsByID["t6gh72alaLJLQ7a4"],
  "Timid": effectDescriptionsByID["onZ4pMyX9AY5lCSK"],
  "Tongue Tied": "<div class=\"swade-core\">\n<p>Dein Abenteurer versaut coole Sprüche (oder sie fallen ihm erst nachher ein!), schweift ab, wenn er jemanden von etwas überreden will, und bringt so gut wie alles, was er sagt, falsch rüber.</p>\n<p>Er erleidet einen @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor03rules0.JournalEntryPage.03traitrolls0000]{Abzug} von -1 auf Proben mit @UUID[Compendium.swade-core-rules.swade-skills.Item.UVdSzNvdAPmGk0iO]{Darbietung}, @UUID[Compendium.swade-core-rules.swade-skills.Item.TlMOxNi4U4YOnHId]{Einschüchtern}, @UUID[Compendium.swade-core-rules.swade-skills.Item.yFPvkPIm0IR6eqch]{Provozieren} und @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überreden}, die Sprechen erfordern.</p>\n</div>",
  "Tough": effectDescriptionsByID["ZkcNk6MSpkDDGpMT"],
  "Tough as Nails": effectDescriptionsByID["7HPzoPNm1q5xjqep"],
  "Tougher than Nails": effectDescriptionsByID["a52TIiBjb8VeKDv5"],
  "Ugly (Major)": effectDescriptionsByID["6xJV6hjIg6fFuoyS"],
  "Ugly (Minor)": "<div class=\"swade-core\">\n<p>Wie man aussieht, so wird man angesehen. Allerdings ist das für diese unglückselige Person nicht von Vorteil. Er erleidet einen Abzug von -1 auf @UUID[Compendium.swade-core-rules.swade-skills.Item.k7fIVOghEx6y44xE]{Überredenproben}.</p>\n</div>",
  "Undead": effectDescriptionsByID["rj1JKO8r0JXyd1K6"],
  "Use Chi": effectDescriptionsByID["9NydTG76la7m1eTA"],
  "Very Attractive": effectDescriptionsByID["7e49iewdr0t67N0R"],
  "Very Resilient": effectDescriptionsByID["LKZ0RCTOAcBQOFDL"],
  "Very Young": effectDescriptionsByID["H0BtmXBb2bNNa6Rf"],
  "Vigorous": effectDescriptionsByID["JBptc54WI3H4IHCr"],
  "Weapon Master": effectDescriptionsByID["RUVuIEg91MNMB53C"],
  "Woodsman": effectDescriptionsByID["0GFf6otn7L5IcEnG"],
  "Work the Crowd": effectDescriptionsByID["CJgSKeLop8G2Awfa"],
  "Young": effectDescriptionsByID["ZF4c6b8VNGtvCtCp"],
};

const AMBIGUOUS_EFFECT_IDS = new Set([
  "LpBn1TUzHNV3VFRW",
  "6xJV6ijIg6fFuoyS",
  "hWEu2pgoT4yCDxiO",
  "fOCC3PU2YmRCtLXh",
]);

const ambiguousEffectIdNames = {
  "LpBn1TUzHNV3VFRW": ["Construct", "Frail", "Pace (Ancestry)"],
  "6xJV6ijIg6fFuoyS": ["Clueless", "Tongue Tied", "Ugly (Minor)"],
  "hWEu2pgoT4yCDxiO": ["Healer", "Holy/Unholy Warrior"],
  "fOCC3PU2YmRCtLXh": ["Menacing", "Mentalist"],
};

// Abstammungsgewährte Effekte, die den abstammungsspezifischen Item-Text spiegeln sollen statt des
// generischen Texts (geteilte Handicap-IDs + Panzerung-Abstammung-IDs).
const ANCESTRY_GRANT_EFFECT_IDS = new Set([
  "qco7WaIGiyhFSZlM",
  "fUoz3zZ3fcf4Ozjb",
  "n4MZb733hAoLQdWg",
  "AncestryArmor001",
  "AncestryArmor002",
  "AncestryArmor003",
]);

const reverseEffectTranslations = {};
for (const [en, de] of Object.entries(effectTranslations)) {
  if (!(de in reverseEffectTranslations)) reverseEffectTranslations[de] = en;
}

function resolveEffectDescription(effectId, effectName) {
  if (AMBIGUOUS_EFFECT_IDS.has(effectId)) {
    const enName = reverseEffectTranslations[effectName] ?? effectName;
    return effectDescriptionsByName[enName];
  }
  return effectDescriptionsByID[effectId] ?? effectDescriptionsByName[effectName];
}

function resolveAmbiguousEffectBySummary(effectId, summaryText) {
  const names = ambiguousEffectIdNames[effectId];
  if (!names || !summaryText) return undefined;
  let bestName = null, bestLen = -1;
  for (const enName of names) {
    const deName = effectTranslations[enName] ?? enName;
    for (const needle of [deName, enName]) {
      if (needle && summaryText.includes(needle) && needle.length > bestLen) {
        bestLen = needle.length;
        bestName = enName;
      }
    }
  }
  return bestName ? effectDescriptionsByName[bestName] : undefined;
}

// MutationObserver: übersetzt Effekt-Beschreibungen wenn <details> aufgeklappt wird
function findEffectDescription(details) {
  const effectId = details.getAttribute('data-effect-id');
  const summaryText = details.querySelector('summary')?.textContent?.trim();
  if (AMBIGUOUS_EFFECT_IDS.has(effectId)) {
    return resolveAmbiguousEffectBySummary(effectId, summaryText) ?? null;
  }
  if (effectDescriptionsByID[effectId]) return effectDescriptionsByID[effectId];
  if (summaryText) {
    for (const [enName, descHtml] of Object.entries(effectDescriptionsByName)) {
      if (summaryText.includes(enName) || summaryText.includes(effectTranslations[enName] ?? '')) {
        return descHtml;
      }
    }
  }
  return null;
}

Hooks.once('ready', () => {
  if (!argaActive()) return;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!(node instanceof HTMLElement)) continue;
        const detailsList = node.matches?.('details[data-effect-id]')
          ? [node]
          : Array.from(node.querySelectorAll?.('details[data-effect-id]') ?? []);
        for (const details of detailsList) {
          const descHtml = findEffectDescription(details);
          if (!descHtml) continue;
          const descDiv = details.querySelector('div.description');
          applyEffectDescription(descDiv, descHtml);
        }
        translateEffectNames(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.body.addEventListener('toggle', (e) => {
    const details = e.target;
    if (!details.matches?.('details[data-effect-id]') || !details.open) return;
    const descHtml = findEffectDescription(details);
    if (!descHtml) return;
    const descDiv = details.querySelector('div.description');
    applyEffectDescription(descDiv, descHtml);
  }, true);
});

// Babele kann Enum-Werte wie "hearts" und Chat-Kartennamen nicht übersetzen,
// daher ersetzen wir die Texte direkt im DOM per MutationObserver.

const suitTranslations = {
  "hearts": "Herz",
  "spades": "Pik",
  "clubs": "Kreuz",
  "diamonds": "Karo"
};
const suitValues = new Set(Object.keys(suitTranslations));

const cardNameMap = {};
const suits = { "Hearts": "Herz", "Spades": "Pik", "Clubs": "Kreuz", "Diamonds": "Karo" };
const values = {
  "2": "2", "3": "3", "4": "4", "5": "5", "6": "6", "7": "7",
  "8": "8", "9": "9", "10": "10", "Jack": "Bube", "Queen": "Dame",
  "King": "König", "Ace": "Ass"
};
for (const [enSuit, deSuit] of Object.entries(suits)) {
  for (const [enVal, deVal] of Object.entries(values)) {
    cardNameMap[`${enVal} of ${enSuit}`] = `${deSuit} ${deVal}`;
  }
}
cardNameMap["Black Joker"] = "Schwarzer Joker";
cardNameMap["Red Joker"] = "Roter Joker";

// Sortiert nach Länge (längste zuerst) für sichere Ersetzung
const cardNameKeys = Object.keys(cardNameMap).sort((a, b) => b.length - a.length);

Hooks.once('ready', () => {
  if (!argaActive()) return;

  function translateCards(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      const trimmed = node.textContent.trim();

      if (suitValues.has(trimmed)) {
        node.textContent = node.textContent.replace(trimmed, suitTranslations[trimmed]);
        continue;
      }

      for (const en of cardNameKeys) {
        if (node.textContent.includes(en)) {
          node.textContent = node.textContent.replace(en, cardNameMap[en]);
        }
      }
    }
  }

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === 1) translateCards(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
});

// Das swade-core-rules Modul nutzt kein i18n für Makro-Dialoge.
// Daher übersetzen wir per DOM-Hooks, preCreate-Hooks und MutationObserver.

Hooks.once('ready', () => {
  if (!argaActive()) return;

  const style = document.createElement('style');
  style.textContent = `.dialog-form .form-group > label { white-space: nowrap !important; flex: 0 0 auto !important; }`;
  document.head.appendChild(style);
});

const macroDialogTranslations = new Map([
  ["Heal Wounds",                    "Wunden heilen"],
  ["Number of Wounds to Heal",       "Anzahl der zu heilenden Wunden"],
  ["Put -1 if a Critical Failure increases Wound level by one",
                                     "Gib -1 ein, wenn ein Kritischer Fehlschlag die Wundenstufe um eins erhöht"],
  ["Heal",                           "Heilen"],

  ["Apply Smite",                    "Waffe verbessern"],
  ["Weapon",                         "Waffe"],
  ["Damage Modifier",                "Schadensmodifikator"],
  ["Armor Piercing Modifier",        "Panzerbrechend-Modifikator"],
  ["Heavy Weapon",                   "Schwere Waffe"],
  ["Select the weapon and modifiers for Smite.",
                                     "Waffe und Modifikatoren auswählen."],
  ["Apply Effects",                  "Effekte anwenden"],

  ["Trait",                          "Eigenschaft"],
  ["Raise?",                         "mit Steigerung?"],
  ["Select the trait and choose the modification.",
                                     "Eigenschaft auswählen und Modifikation wählen."],
  ["Boost Trait",                    "Eigenschaft erhöhen"],
  ["Lower Trait",                    "Eigenschaft senken"],
  ["Attributes",                     "Attribute"],
  ["Skills",                         "Fertigkeiten"],
  ["No actor selected!",             "Kein Token ausgewählt!"],

  ["Fear Table Modifier",            "Furcht-Tabelle"],
  ["Fear Penalty",                   "Furchtabzug"],
  ["Input creature Fear Penalty (Positive Number, leave blank for 0)",
                                     "Furchtabzug der Kreatur eingeben (Zahl muss ohne Vorzeichen eingegeben werden; leer lassen für 0)"],
  ["Roll",                           "Würfeln"],
  ["Heart Attack",                   "Herzinfarkt"],
  ["Fear Table not found.",          "Furcht-Tabelle nicht gefunden."],

  ["Jack of All Trades",             "Alleskönner"],
  ["Skill",                          "Fertigkeit"],
  ["Type name of skill you want to learn.",
                                     "Name der Fertigkeit eingeben, die du erlernen möchtest."],
  ["Roll Smarts",                    "auf Verstand würfeln"],
  ["Skill Name",                     "Fertigkeitsname freitextlich"],
  ["Skill name input was invalid or canceled.",
                                     "Kein Fertigkeitsname eingegeben."],
  ["Core Skills Compendium pack not found.",
                                     "Grundfertigkeiten-Kompendium nicht gefunden."],

  ["Manage Status Effects",          "Status-Effekte verwalten"],
  ["Select the status effects you want to manage.",
                                     "Wähle die Status-Effekte aus, die du hinzufügen/entfernen möchtest."],
  ["Status Effects",                 "Status-Effekte"],
  ["Add",                            "Hinzufügen"],
  ["Remove",                         "Entfernen"],
  ["No effects selected for processing.",
                                     "Keine Effekte zur Verarbeitung ausgewählt."],

  ["Actor Item Patcher",             "Akteur-Items aktualisieren"],
  ["Patch Items",                    "Items aktualisieren"],
  ["Folders",                        "Ordner mit Akteuren"],
  ["Actors",                         "Akteure"],
  ["Packs",                          "Kompendien"],
  ["No actors or compendium packs selected. Aborting.",
                                     "Keine Akteure oder Kompendien ausgewählt. Abbruch."],
  ["Finished patching selected actors!",
                                     "Aktualisierung der ausgewählten Akteure abgeschlossen!"],

  ["All",                            "Alle"],
  ["None",                           "Keine"],
  ["Compendium Filters",             "Kompendium-Filter"],
  ["SEARCH",                         "SUCHE"],
  ["Search compendiums by name or module",
                                     "Kompendien nach Name oder Modul durchsuchen"],
  ["MODULES",                        "MODULE"],
  ["All Modules",                    "Alle Module"],

  ["SWADE Template Placement",       "Schablone platzieren"],
  ["Select the template type you want to place.",
                                     "Wähle den Schablonentyp aus, den du platzieren möchtest."],
  ["Template Types",                 "Schablonentypen"],
  // Englische Originale (falls SWADE-System nicht vorübersetzt)
  ['Small Cone (4", 2" wide)',       'Kleine Kegelschablone (4" lang, 2" breit)'],
  ['Cone (9", 3" wide)',             'Kegelschablone (9" lang, 3" breit)'],
  ['Stream (12" long, 1" wide)',     'Strahlschablone (12" lang, 1" breit)'],
  ['Small Blast (1" radius)',        'Kleine Flächenschablone (1" Radius)'],
  ['Medium Blast (2" radius)',       'Mittlere Flächenschablone (2" Radius)'],
  ['Large Blast (3" radius)',        'Große Flächenschablone (3" Radius)'],
  // Halb-übersetzte DOM-Varianten (SWADE-System übersetzt "Small"→"Klein" etc.)
  ['Klein Cone (4", 2" wide)',       'Kleine Kegelschablone (4" lang, 2" breit)'],
  ['Klein Blast (1" radius)',        'Kleine Flächenschablone (1" Radius)'],
  ["No active scene found!",         "Keine aktive Szene gefunden!"],
  ["This macro requires the SWADE system!",
                                     "Dieses Makro erfordert das SWADE-System!"],
  ["Invalid template selection!",    "Ungültige Schablonenauswahl!"],
  ["Template preset not found!",     "Schablonenvorlage nicht gefunden!"],

  ["Apply Poison",                   "Vergiftung anwenden"],
  ["Poison Type",                    "Giftart"],
  ["Choose the type of poison to apply.",
                                     "Art des Gifts auswählen."],
  ["Pick Your Poison",               "Gift auswählen"],
  ["Lethal Poison",                  "Tödliches Gift"],
  ["Mild Poison",                    "Mildes Gift"],
  ["Paralyzing Poison",              "Lähmendes Gift"],
  ["Knockout Poison",                "K.O.-Gift"],
  ["Paralysis Duration (Rounds)",    "Lähmungsdauer (Runden)"],
  ["Optional. Specify a duration for paralysis (rounds). Defaults to 1 if left blank.",
                                     "Optional. Dauer der Lähmung angeben (in Runden). Standard ist 1, wenn leer gelassen."],
  ["Failure",                        "Fehlschlag"],
  ["Critical Failure",               "Kritischer Fehlschlag"],
  ["No valid actor found.",          "Kein gültiger Akteur gefunden."],

  ["Damage Roll",                    "Schadenswurf"],
  ["Roll Formula:",                  "Würfelformel:"],
  ["Flavor Text:",                   "Beschreibungstext:"],
  ["e.g., 3d6 or 3d6x",             "z.B. 3d6 oder 3d6x"],
  ["e.g., Fire, Falling, Breaking Things, etc.",
                                     "z.B. Feuer, Sturz, Zerstörung, etc."],
  ["Roll Damage",                    "Schaden würfeln"],
  ["Please enter a valid damage roll formula.",
                                     "Bitte eine gültige Würfelformel eingeben."],
  ["No flavor specified",            "Kein Beschreibungstext angegeben"],
  ["Failed to execute damage roll. Check your input.",
                                     "Schadenswurf fehlgeschlagen. Eingabe prüfen."],

  ["Warrior's Gift",                 "Kriegersegen"],
  ["Combat Edges",                   "Kampftalente"],
  ["Grant Edges",                    "Talente gewähren"],
  ["No Combat Edges found in available compendiums.",
                                     "Keine Kampftalente in den verfügbaren Kompendien gefunden."],

  ["No tokens selected and no character assigned. Please select a token or assign a character.",
                                     "Kein Token ausgewählt."],

  ["Speak Aloud Message",            "Öffentliche Chat-Nachricht"],
  ["Whisper to all players rather than a select few.",
                                     "An ALLE Spieler flüstern (statt nur an ausgewählte)"],
  ["Players",                        "Spieler"],
  ["Whisper",                        "Flüstern"],

  ["Add Basic Actions to New Characters",
                                     "Standard-Aktionen bei neuen Charakteren hinzufügen"],
  ["Create basic actions such as Jump or Disarm on new characters",
                                     "Neue Charaktere erhalten die Standard-Aktionen wie 'Springen' oder 'Entwaffnen'"],
  ["Enable Chi",                     "Chi aktivieren"],
  ["Adds Chi as an additional stat (enable in Tweaks)",
                                     "Fügt 'Chi' als weiteren Wert hinzu (kann in den Charakter-Optionen aktiviert werden)"],
]);

const patcherTextEN = "Select actors whose items to patch by selecting the actors themselves or the folder that contains them. Then select the compendiums to use for patching their owned items.";
const patcherTextDE = "Wähle Akteure (einzeln oder per Ordner), deren Items auf den neuesten Kompendium-Stand gebracht werden sollen. Dann wähle die Kompendien aus, die zum Aktualisieren verwendet werden sollen.\nNach dem Bestätigen werden anhand der Item-IDs alle Namen, Beschreibungen, Effekte, Aktionen etc. auf Grundlage der ausgewählten Kompendien aktualisiert.";

const dynamicDialogPatterns = [
  { regex: /^Boost\/Lower (.+) Trait$/,
    replace: (m) => `Eigenschaft erhöhen/senken: ${m[1]}` },
  { regex: /^Select the Combat Edges you want to grant with (.+)\.$/,
    replace: (m) => `Wähle die Kampftalente aus, die du mit ${m[1]} gewähren möchtest.` },
];

function translateMacroText(text) {
  if (!text || typeof text !== 'string') return text;
  const trimmed = text.trim();

  if (trimmed === patcherTextEN) return patcherTextDE;

  const exact = macroDialogTranslations.get(trimmed);
  if (exact) return exact;

  for (const pattern of dynamicDialogPatterns) {
    const match = trimmed.match(pattern.regex);
    if (match) return pattern.replace(match);
  }

  return null;
}

function translateMacroDOM(element) {
  if (!element) return;

  const titleEl = element.querySelector?.('.window-title');
  if (titleEl) {
    const translated = translateMacroText(titleEl.textContent);
    if (translated) titleEl.textContent = translated;
  }

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, null);
  let node;
  while ((node = walker.nextNode())) {
    const translated = translateMacroText(node.textContent);
    if (translated) node.textContent = translated;
  }

  for (const el of element.querySelectorAll?.('label, legend, p, .hint') ?? []) {
    for (const child of el.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const translated = translateMacroText(child.textContent);
        if (translated) child.textContent = translated;
      }
    }
  }

  for (const btn of element.querySelectorAll?.('button') ?? []) {
    const label = btn.querySelector('.label') || btn;
    for (const child of label.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const translated = translateMacroText(child.textContent);
        if (translated) child.textContent = translated;
      }
    }
  }

  for (const input of element.querySelectorAll?.('input[placeholder], textarea[placeholder]') ?? []) {
    const translated = translateMacroText(input.placeholder);
    if (translated) input.placeholder = translated;
  }

  for (const opt of element.querySelectorAll?.('optgroup') ?? []) {
    const translated = translateMacroText(opt.label);
    if (translated) opt.label = translated;
  }

  for (const span of element.querySelectorAll?.('.button-label') ?? []) {
    for (const child of span.childNodes) {
      if (child.nodeType === Node.TEXT_NODE) {
        const translated = translateMacroText(child.textContent);
        if (translated) child.textContent = translated;
      }
    }
  }

  for (const opt of element.querySelectorAll?.('select option') ?? []) {
    const translated = translateMacroText(opt.textContent);
    if (translated) opt.textContent = translated;
  }
}

for (const hook of ['renderDialogV2', 'renderDialog']) {
  Hooks.on(hook, (app, html) => {
    if (!argaActive()) return;
    const el = html instanceof HTMLElement ? html : html[0] || html;
    translateMacroDOM(el);
  });
}

const macroNotificationPatterns = [
  { regex: /^(.+) was healed of all wounds\.$/,
    replace: (m) => `${m[1]} wurde vollständig geheilt.` },
  { regex: /^(.+) healed of (\d+) wounds?\.$/,
    replace: (m) => `${m[1]} wurde um ${m[2]} Wunde${m[2] !== "1" ? "n" : ""} geheilt.` },
  { regex: /^(.+) healed of NaN wounds?\.$/,
    replace: (m) => `${m[1]}: Heilung fehlgeschlagen — bitte eine gültige Zahl eingeben.` },
  { regex: /validation errors.*wounds.*must be an integer/,
    replace: () => "Validierungsfehler: Wunden-Wert muss eine ganze Zahl sein." },
  { regex: /^(.+) is not a Character or NPC type\.$/,
    replace: (m) => `${m[1]} ist kein Charakter oder NSC.` },
  { regex: /^(.+) is incapacitated due to exceeding maximum wounds\.$/,
    replace: (m) => `${m[1]} ist 'Ausgeschaltet' (wegen Überschreitung der maximalen Wunden).` },
  { regex: /^Incapacitated effect data could not be found\.$/,
    replace: () => "Effektdaten für 'Ausgeschaltet' konnten nicht gefunden werden." },
  { regex: /^(.+) failed to roll Smarts\.$/,
    replace: (m) => `${m[1]} konnte keinen Verstand-Wurf ablegen.` },
  { regex: /^(Added|Removed) selected effects\.$/,
    replace: (m) => `Ausgewählte Effekte ${m[1] === "Added" ? "hinzugefügt" : "entfernt"}.` },
  { regex: /^(.+) has been granted the (.+) Edges\.$/,
    replace: (m) => `${m[1]} erhält als Talent(e): ${m[2]}.` },
  { regex: /^(.+)'s temporary Edges removed\.$/,
    replace: (m) => `Temporäre Talente von ${m[1]} entfernt.` },
  { regex: /^The selected actor has no weapons\.$/,
    replace: () => "Der ausgewählte Akteur hat keine Waffen." },
  { regex: /^Please select a single token first\.$/,
    replace: () => "Bitte zuerst einen einzelnen Token auswählen." },
  { regex: /^The selected token has no associated actor\.$/,
    replace: () => "Der ausgewählte Token hat keinen zugeordneten Akteur." },
  { regex: /^You may not create documents in the locked compendium "(.+)"\.$/,
    replace: (m) => `Du kannst keine Dokumente im gesperrten Kompendium „${m[1]}" erstellen.` },
  { regex: /^(.+) must be used during combat\.?$/,
    replace: (m) => `${m[1]} kann nur während eines Kampfes verwendet werden.` },
];

function translateMacroNotification(msg) {
  if (!msg || typeof msg !== 'string') return null;
  const trimmed = msg.trim();

  const exact = macroDialogTranslations.get(trimmed);
  if (exact) return exact;

  for (const pattern of macroNotificationPatterns) {
    const match = trimmed.match(pattern.regex);
    if (match) return pattern.replace(match);
  }
  return null;
}

Hooks.once('ready', () => {
  if (!argaActive()) return;

  const origInfo = ui.notifications.info.bind(ui.notifications);
  const origWarn = ui.notifications.warn.bind(ui.notifications);
  const origError = ui.notifications.error.bind(ui.notifications);

  ui.notifications.info = (msg, options) => {
    const translated = translateMacroNotification(msg);
    return origInfo(translated || msg, options);
  };
  ui.notifications.warn = (msg, options) => {
    const translated = translateMacroNotification(msg);
    return origWarn(translated || msg, options);
  };
  ui.notifications.error = (msg, options) => {
    const translated = translateMacroNotification(msg);
    return origError(translated || msg, options);
  };
});

// Babele übersetzt Item-Name/Beschreibung, aber NICHT die ActiveEffects.
// Dieser Hook fängt die Item-Erstellung auf Akteuren ab und übersetzt
// Effekt-Namen + Beschreibungen, damit sie auf Deutsch gespeichert werden.
Hooks.on('preCreateItem', (item, data, options, userId) => {
  if (!argaActive()) return;

  // Nur Items, die auf einen Akteur importiert werden (Drag & Drop / Makro)
  if (!item.parent) return;

  const effects = data.effects;
  if (!effects?.length) return;

  const parentDesc = data.system?.description ?? item.system?.description ?? '';

  let changed = false;
  const updatedEffects = effects.map(e => {
    const eff = foundry.utils.deepClone(e);
    const origName = eff.name;

    if (origName && effectTranslations[origName]) {
      eff.name = effectTranslations[origName];
      changed = true;
    }

    const descHtml = (eff._id && ANCESTRY_GRANT_EFFECT_IDS.has(eff._id) && parentDesc)
                   ? parentDesc
                   : (eff._id && AMBIGUOUS_EFFECT_IDS.has(eff._id))
                   ? (origName ? effectDescriptionsByName[origName] : null)
                   : (eff._id && effectDescriptionsByID[eff._id])
                   ? effectDescriptionsByID[eff._id]
                   : (origName && effectDescriptionsByName[origName])
                   ? effectDescriptionsByName[origName]
                   : null;
    if (descHtml) {
      eff.description = descHtml;
      changed = true;
    }

    return eff;
  });

  if (changed) {
    item.updateSource({ effects: updatedEffects });
  }
});

const _aquaPick = (item) => {
  if (!item?.parent || item.type !== 'ability') return null;
  const cs = item.system?.choiceSets;
  if (!Array.isArray(cs)) return null;
  const set = cs[0];
  if (!set || set.title !== 'Wähle die Art des Aquarianers:') return null;
  if (typeof set.choice !== 'number' || set.choice < 0) return null;
  const chosen = set.choices?.[set.choice];
  const nm = chosen?.mutation?.name;
  const desc = chosen?.mutation?.system?.description;
  if (typeof nm === 'string' && nm && typeof desc === 'string' && desc) return { name: nm, description: desc };
  return null;
};

Hooks.on('preCreateItem', (item) => {
  if (!argaActive()) return;
  const p = _aquaPick(item);
  if (p && (item.name !== p.name || item.system?.description !== p.description)) {
    item.updateSource({ name: p.name, 'system.description': p.description });
  }
});

Hooks.on('updateItem', (item, changes) => {
  if (!argaActive()) return;
  if (!foundry.utils.hasProperty(changes, 'system.choiceSets')) return;
  const p = _aquaPick(item);
  if (p && (item.name !== p.name || item.system?.description !== p.description)) {
    item.update({ name: p.name, 'system.description': p.description });
  }
});

const macroEffectNameMap = new Map([
  ["Smite Modifiers",    "Waffenverbesserung"],
  ["Lethal Poison",      "Tödliches Gift"],
  ["Paralyzing Poison",  "Lähmendes Gift"],
  ["Knockout Poison",    "K.O.-Gift"],
  ["Warrior's Gift",     "Kriegersegen"],
  ["Perished",           "Gestorben"],
  ["Bleeding Out",       "Verblutend"],
  ["Rending",            "Zerfleischt"],
  // Abstammung-choiceSet-Effekte (Fallback, falls der Converter den erzeugten Effekt nicht erreicht)
  ["Armor 1 (Ancestry)", "Panzerung 1 (Abstammung)"],
  ["Armor 2 (Ancestry)", "Panzerung 2 (Abstammung)"],
  ["Armor 3 (Ancestry)", "Panzerung 3 (Abstammung)"],
  ["Ancestry Toughness", "Robustheit (Abstammung)"],
  ["Flight Pace 6",      "Bewegungsweite (Fliegen) 6"],
  ["Flight Pace 12",     "Bewegungsweite (Fliegen) 12"],
  ["Flight Pace 24 Run 2d6", "Bewegungsweite (Fliegen) 24, Sprintwürfel 2W6"],
  ["Heritage",           "Erbe"],
]);

// Schlüssel ist der englische Original-Name (Identifikation vor Umbenennung).
const macroEffectDescriptions = new Map([
  ["Bleeding Out",
    "<p>Der verwundete Charakter liegt im Sterben und muss zu Beginn eines jeden Zugs eine Konstitutionsprobe ablegen. Bei einem Fehlschlag stirbt er. Bei einem Erfolg überlebt er, muss aber im nächsten Zug wieder würfeln (oder jede Minute, wenn er außerhalb des Kampfes ist). Bei einer Steigerung wird er stabilisiert und muss nicht mehr würfeln.</p>"
    + "<p>Andere Charaktere können die Blutung stoppen, indem sie eine <em>Heilenprobe</em> ablegen. Dies ist eine Aktion, und wenn sie erfolgreich ist, ist der Patient stabilisiert.</p>"
    + "<p>Die Macht <em>Heilung</em> kann Wunden ebenfalls stabilisieren, ebenso wie ein „natürlicher\" Heilungswurf von einem Wesen mit <em>Regeneration</em>.</p>"],
  ["Rending",
    "<p>Einige Kreaturen haben besonders brutale Klauen oder Waffen. Opfer, die von einem zerfleischenden Angriff <em>Angeschlagen</em> werden oder eine Wunde erleiden, bluten und müssen zu Beginn ihres nächsten Zuges als freie Aktion eine Konstitutionsprobe ablegen.</p>"
    + "<p>Ein Fehlschlag verursacht eine Wunde, und das Opfer muss im nächsten Zug eine weitere Konstitutionsprobe ablegen. Ein Erfolg bedeutet, dass das Opfer keine Wunde erleidet, aber dennoch im nächsten Zug eine Konstitutionsprobe ablegen muss. Eine Steigerung beendet die Blutung, und keine weiteren Würfe sind wegen dieses Angriffs nötig.</p>"
    + "<p>Eine erfolgreiche Probe mit <em>Heilen</em> oder der Macht <em>Heilung</em> stillt die Blutung ebenfalls.</p>"],
  ["Armor 1 (Ancestry)", "<p>Die Spezies hat eine dicke Haut oder ist mit festem Material wie Schuppen oder sogar Fels bedeckt. Dies gewährt für jedes Mal, welches du diese Eigenschaft auswählst, +2 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02armor000000000]{Panzerung}.</p>"],
  ["Armor 2 (Ancestry)", "<p>Die Spezies hat eine dicke Haut oder ist mit festem Material wie Schuppen oder sogar Fels bedeckt. Dies gewährt für jedes Mal, welches du diese Eigenschaft auswählst, +2 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02armor000000000]{Panzerung}.</p>"],
  ["Armor 3 (Ancestry)", "<p>Die Spezies hat eine dicke Haut oder ist mit festem Material wie Schuppen oder sogar Fels bedeckt. Dies gewährt für jedes Mal, welches du diese Eigenschaft auswählst, +2 @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor02gear00.JournalEntryPage.02armor000000000]{Panzerung}.</p>"],
  ["Heritage", "<p>Halbelfen könnten die Anmut ihres elfischen Elternteils oder die Anpassungsfähigkeit ihrer menschlichen Vorfahren erhalten. Ein Halbelf kann entweder mit einem freien Anfänger-@UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01edges000000000]{Talent} seiner Wahl oder einem W6 anstelle eines W4 in @UUID[Compendium.swade-core-rules.swade-rules.JournalEntry.swadecor01charac.JournalEntryPage.01traits00000000]{Geschicklichkeit} beginnen (was auch sein Maximum für Geschicklichkeit auf W12+1 anhebt).</p>"],
]);

const macroEffectNamePatterns = [
  { regex: /^Boost (.+)$/, replace: (m) => `Eigenschaft erhöhen: ${m[1]}` },
  { regex: /^Lower (.+)$/, replace: (m) => `Eigenschaft senken: ${m[1]}` },
];

// Panzerungs-Effekte (Abstammung): den generischen armorDesc NICHT setzen, wenn der Effekt
// bereits eine Beschreibung trägt (abstammungsspezifischer Text aus preCreateItem).
const ANCESTRY_ARMOR_EFFECT_NAMES = new Set([
  "Armor 1 (Ancestry)",
  "Armor 2 (Ancestry)",
  "Armor 3 (Ancestry)",
]);

Hooks.on('preCreateActiveEffect', (effect) => {
  if (!argaActive()) return;

  const name = effect.name;
  if (!name) return;

  const updates = {};

  const exact = macroEffectNameMap.get(name);
  if (exact) {
    updates.name = exact;
  } else {
    for (const p of macroEffectNamePatterns) {
      const match = name.match(p.regex);
      if (match) {
        updates.name = p.replace(match);
        break;
      }
    }
  }

  const descDE = macroEffectDescriptions.get(name);
  if (descDE && !(ANCESTRY_ARMOR_EFFECT_NAMES.has(name) && effect.description)) {
    updates.description = descDE;
  }

  if (Object.keys(updates).length) {
    effect.updateSource(updates);
  }
});

const macroChatPatterns = [
  { regex: /^(.+) gains temporary proficiency in (.+) \(d(\d+)\)\.$/,
    replace: (m) => `${m[1]} erhält die temporäre Fertigkeit ${m[2]} (W${m[3]}).` },
  { regex: /^(.+) must try again after additional study or effort\.$/,
    replace: (m) => `${m[1]} muss noch etwas üben oder weitere Studien betreiben (und kann es danach erneut versuchen).` },
  { regex: /^(.+) loses their temporary proficiency with (.+)\.$/,
    replace: (m) => `${m[1]} verliert die temporäre Fertigkeit ${m[2]}.` },
  { regex: /^(.+) has been granted the (.+) Edges\.$/,
    replace: (m) => `${m[1]} erhält als Talent(e): ${m[2]}.` },
  { regex: /^(.+)'s temporary Edges removed\.$/,
    replace: (m) => `Temporäre Talente von ${m[1]} entfernt.` },
  { regex: /^(.+) has perished from (.+)$/,
    replace: (m) => `${m[1]} ist an ${m[2]} gestorben` },
  { regex: /^(.+) is Distracted, Stunned, takes (\d+) Wound\(s\), and will perish from the lethal poison in (\d+) rounds\.$/,
    replace: (m) => `${m[1]} ist Abgelenkt, Betäubt, erhält ${m[2]} Wunde(n) und wird in ${m[3]} Runden an dem tödlichen Gift sterben.` },
  { regex: /^(.+) is Distracted and suffers (Fatigue|Exhaustion) from the mild poison\.$/,
    replace: (m) => `${m[1]} ist durch das leichte Gift Abgelenkt und ${m[2] === "Fatigue" ? "Erschöpft" : "Entkräftet"}.` },
  { regex: /^(.+) is Distracted, Stunned, and cannot attempt to recover from being Stunned for (\d+) rounds\.$/,
    replace: (m) => `${m[1]} ist Abgelenkt, Betäubt und kann ${m[2]} Runden lang nicht versuchen, sich vom Zustand der Betäubung zu erholen.` },
  { regex: /^(.+) is Distracted, Stunned, and may attempt to recover from paralysis on their next turn\.$/,
    replace: (m) => `${m[1]} ist Abgelenkt und Betäubt (gelähmt), kann aber in der nächsten Runde versuchen, sich von der Lähmung (dem Zustand der Betäubung) zu erholen.` },
  { regex: /^(.+) is Distracted, Incapacitated, and Unconscious for (\d+) hours\.$/,
    replace: (m) => `${m[1]} ist Abgelenkt, Ausgeschaltet und bewusstlos für ${m[2]} Stunden.` },
];

Hooks.on('preCreateChatMessage', (msg) => {
  if (!argaActive()) return;

  const content = msg.content;
  if (!content || typeof content !== 'string') return;
  const trimmed = content.trim();

  for (const p of macroChatPatterns) {
    const match = trimmed.match(p.regex);
    if (match) {
      msg.updateSource({ content: p.replace(match) });
      return;
    }
  }
});

// --- "Rounds Verbleibend" → "Runden verbleibend" Fix ---
// Das SWADE-System mischt englische und deutsche Begriffe bei der Effektdauer.
Hooks.once('ready', () => {
  if (!argaActive()) return;

  const roundsObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, null);
        let textNode;
        while ((textNode = walker.nextNode())) {
          const text = textNode.textContent;
          if (!text) continue;
          if (/\d+\s+Rounds?\s+(Verbleibend|Remaining)/i.test(text)) {
            textNode.textContent = text
              .replace(/(\d+)\s+Rounds\s+(Verbleibend|Remaining)/gi, '$1 Runden verbleibend')
              .replace(/(\d+)\s+Round\s+(Verbleibend|Remaining)/gi, '$1 Runde verbleibend');
          }
        }
      }
    }
  });
  roundsObserver.observe(document.body, { childList: true, subtree: true });
});

Hooks.once('ready', () => {
  if (!argaActive()) return;

  const expiryLabels = new Map([
    ['', 'Effekt endet nicht'],
    ['turnStart', 'Zugbeginn (nächster Zug)'],
    ['turnStartPrompt', 'Zugbeginn (mit Nachfrage)'],
    ['turnEnd', 'Zugende (nächster Zug)'],
    ['turnEndPrompt', 'Zugende (mit Nachfrage)'],
  ]);

  const localizeExpiry = (root) => {
    const selects = root.matches?.('select[name="duration.expiry"]')
      ? [root]
      : root.querySelectorAll?.('select[name="duration.expiry"]') ?? [];
    for (const sel of selects) {
      for (const opt of sel.options) {
        const de = expiryLabels.get(opt.value);
        if (de && opt.textContent !== de) opt.textContent = de;
      }
      const label = sel.closest('.form-group')?.querySelector('label');
      if (label && label.textContent.trim() === 'Expiration Behavior') {
        label.textContent = 'Effekt-Ende';
      }
    }
  };

  const expiryObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        localizeExpiry(node);
      }
    }
  });
  expiryObserver.observe(document.body, { childList: true, subtree: true });
});

Hooks.once('ready', () => {
  if (!argaActive()) return;

  const attrNames = new Map([
    ['Agility', 'Geschick'],
    ['Smarts', 'Verstand'],
    ['Spirit', 'Willenskraft'],
    ['Strength', 'Stärke'],
    ['Vigor', 'Konstitution'],
  ]);

  const localizeWizard = (win) => {
    const title = win.querySelector('.window-title');
    if (title && title.textContent.trim() === 'A.E.G.I.S.') {
      title.textContent = 'Assistent für aktive Effekte';
    }
    const heading = win.querySelector('.main-grid h2.underline');
    if (heading && /Active\s*Effect\s*Guided/i.test(heading.textContent)) {
      heading.replaceChildren();
      const icon = document.createElement('i');
      icon.className = 'fa-solid fa-shield-quartered';
      heading.append(icon, ' Assistent für aktive Effekte');
    }
    for (const label of win.querySelectorAll('.changes-list .change .label')) {
      const m = label.textContent.match(/^(\S+)(\s[\s\S]*)?$/);
      if (m && attrNames.has(m[1])) {
        label.textContent = attrNames.get(m[1]) + (m[2] ?? '');
      }
    }
  };

  const wizardObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        if (node.matches?.('.active-effect-wizard')) {
          localizeWizard(node);
        } else {
          node.querySelectorAll?.('.active-effect-wizard').forEach(localizeWizard);
          const w = node.closest?.('.active-effect-wizard');
          if (w) localizeWizard(w);
        }
      }
    }
  });
  wizardObserver.observe(document.body, { childList: true, subtree: true });
});

Hooks.once('ready', () => {
  if (!argaActive()) return;

  const localizeCurrency = (root) => {
    if (!root || root.nodeType !== Node.ELEMENT_NODE) return;
    const apply = (el) => {
      if (!el || el.textContent.trim() !== 'Currency') return;
      let replaced = false;
      for (const child of el.childNodes) {
        if (child.nodeType === Node.TEXT_NODE && child.textContent.includes('Currency')) {
          child.textContent = child.textContent.replace('Currency', 'Währung');
          replaced = true;
        }
      }
      if (!replaced) el.textContent = 'Währung';
    };
    const sel = 'label[for$="-currency"], label[for*="currency" i]';
    if (root.matches?.(sel)) apply(root);
    root.querySelectorAll?.(sel).forEach(apply);
    if (root.matches?.('label, span') && root.textContent.trim() === 'Currency') apply(root);
    root.querySelectorAll?.('label, span').forEach((el) => {
      if (el.textContent.trim() === 'Currency') apply(el);
    });
  };

  const toEl = (x) => (x instanceof HTMLElement) ? x : (x && x[0] instanceof HTMLElement ? x[0] : null);

  localizeCurrency(document.body);

  for (const hook of ['renderActorSheet', 'renderApplicationV2']) {
    Hooks.on(hook, (app, html) => {
      const el = toEl(html) || toEl(app?.element);
      if (el) localizeCurrency(el);
    });
  }

  const currencyObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType !== Node.ELEMENT_NODE) continue;
        localizeCurrency(node);
      }
    }
  });
  currencyObserver.observe(document.body, { childList: true, subtree: true });
});

Hooks.on('renderApplicationV2', (app, element) => {
  if (!argaActive()) return;
  const root = (element instanceof HTMLElement) ? element : app?.element;
  if (!(root instanceof HTMLElement) || !root.classList.contains('choice-dialog')) return;
  const title = root.querySelector('.window-title');
  if (title && title.textContent.trim() === 'SWADE ChoiceDialog') {
    title.textContent = 'SWADE Auswahldialog';
  }
});

// RollTable-Titel (<h1> im sheet-header) werden in einer Versalien-Schrift
// ohne ß-Glyph gerendert → ß im ANGEZEIGTEN Titel durch ss ersetzen.
// Anzeige-only: der gespeicherte Tabellenname bleibt unverändert (z. B.
// "Außer Kontrolle"), die Schrift rendert "ss" als Versal-SS.
Hooks.on('renderApplicationV2', (app, element) => {
  if (!argaActive()) return;
  if (((app?.document ?? app?.object)?.documentName) !== 'RollTable') return;
  const root = (element instanceof HTMLElement) ? element : app?.element;
  if (!(root instanceof HTMLElement)) return;
  const h1 = root.querySelector('.sheet-header h1');
  if (!h1) return;
  for (const node of h1.childNodes) {
    if (node.nodeType === 3 && node.nodeValue.includes('\u00df')) {
      node.nodeValue = node.nodeValue.replace(/\u00df/g, 'ss');
    }
  }
});

// =====================================================================
//  SWADE "Inhalt"-Übersicht (CompendiumTOC): Suche auf den ANGEZEIGTEN
//  (deutschen) Text umbiegen.
//  Das systemeigene Such-Widget filtert sonst gegen die englischen
//  Originalnamen → "Regeln" findet nichts, "rules" schon. Foundrys
//  normale Seitenliste ("Seiten suchen") ist davon nicht betroffen.
//  Vorgehen: native Suche auf dem Feld kappen (Klon entfernt direkte
//  Listener, stopPropagation fängt delegierte ab) und durch einen
//  eigenen Filter ersetzen, der die li.page-Einträge nach ihrem
//  sichtbaren a.name-Text (deutsch) ein-/ausblendet.
// =====================================================================

function argaTocNormalize(s) {
  return (s ?? '')
    .toLocaleLowerCase('de')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

Hooks.on('renderCompendiumTOC', (app, html) => {
  if (!argaActive()) return;

  const root = html instanceof HTMLElement ? html
             : html?.[0] instanceof HTMLElement ? html[0]
             : app?.element instanceof HTMLElement ? app.element
             : null;
  if (!root) return;

  // Nur die seitenbasierte Regel-Übersicht (li.page) anfassen. Andere über
  // CompendiumTOC geöffnete Kompendien haben diese Struktur nicht → deren
  // native Suche unberührt lassen (sonst würde sie hier mit gekappt).
  if (!root.querySelector('li.page')) return;

  const input = root.querySelector('input[type="search"][name="search"]');
  if (!input || input.dataset.argaSearch) return;

  const fresh = input.cloneNode(true);
  fresh.dataset.argaSearch = '1';
  fresh.placeholder = 'Suchen';
  input.replaceWith(fresh);

  // Modus-Umschalter (Name/Volltext) ist mit dem Ersatz-Filter wirkungslos
  // → ausblenden, damit er nicht den deutschen Filter überschreibt.
  root.querySelector('.toggle-search-mode')?.style.setProperty('display', 'none');

  const runFilter = () => {
    const q = argaTocNormalize(fresh.value.trim());
    for (const li of root.querySelectorAll('li.page')) {
      const name = li.querySelector('a.name')?.textContent ?? li.textContent;
      const treffer = !q || argaTocNormalize(name).includes(q);
      li.style.display = treffer ? 'flex' : 'none';
    }
  };

  const onInput = (e) => { e.stopPropagation(); runFilter(); };
  fresh.addEventListener('input', onInput);
  for (const ev of ['keydown', 'keyup', 'change', 'search']) {
    fresh.addEventListener(ev, (e) => e.stopPropagation());
  }

  runFilter();
});

// =====================================================================
//  CompendiumTOC-Suche: Variante mit li.toc-entry (Item-/Akteur-Kompendien)
//  ---------------------------------------------------------------------
//  Eigenständiger Block - kann ersatzlos gelöscht werden, falls die Suche
//  irgendwann anderweitig (System/Babele) korrekt auf Deutsch filtert.
//  Schwester des li.page-Blocks oben: SWADE öffnet auch normale Kompendien
//  (Talente, Gegner, ...) als CompendiumTOC, deren native Suche aber gegen
//  die englischen Originalnamen filtert → deutsche Begriffe finden nichts.
//  Gleiches Muster: native Suche kappen (Klon + stopPropagation) und durch
//  einen eigenen Filter auf den sichtbaren a.name-Text (deutsch) ersetzen.
//  argaTocNormalize stammt aus dem li.page-Block weiter oben.
// =====================================================================
Hooks.on('renderCompendiumTOC', (app, html) => {
  if (!argaActive()) return;

  const root = html instanceof HTMLElement ? html
             : html?.[0] instanceof HTMLElement ? html[0]
             : app?.element instanceof HTMLElement ? app.element
             : null;
  if (!root) return;

  // Nur die toc-entry-Variante. Die seitenbasierte Regel-Übersicht (li.page)
  // behandelt der Block oben → hier ausschließen, keine Überschneidung.
  if (root.querySelector('li.page')) return;
  if (!root.querySelector('li.toc-entry')) return;

  const input = root.querySelector('input[type="search"][name="search"]');
  if (!input || input.dataset.argaSearch) return;

  const fresh = input.cloneNode(true);
  fresh.dataset.argaSearch = '1';
  fresh.placeholder = 'Suchen';
  input.replaceWith(fresh);

  root.querySelector('.toggle-search-mode')?.style.setProperty('display', 'none');

  const runFilter = () => {
    const q = argaTocNormalize(fresh.value.trim());
    for (const li of root.querySelectorAll('li.toc-entry')) {
      const name = li.querySelector('a.name')?.textContent ?? li.textContent;
      const treffer = !q || argaTocNormalize(name).includes(q);
      li.style.display = treffer ? 'flex' : 'none';
    }
  };

  const onInput = (e) => { e.stopPropagation(); runFilter(); };
  fresh.addEventListener('input', onInput);
  for (const ev of ['keydown', 'keyup', 'change', 'search']) {
    fresh.addEventListener(ev, (e) => e.stopPropagation());
  }

  runFilter();
});

const ARGA_SCR_BANNER_DIR = 'modules/swade-core-rules/assets/art/banners';
const ARGA_OWN_BANNER_20 = 'modules/argas-swade-translation-german/assets/banners/banner_20.webp';

function argaResortSwadeBanners(root) {
  const rows = root.querySelectorAll('li[data-pack^="swade-core-rules."], li[data-pack="argas-swade-translation-german.makros"]');
  let pos = 0;
  for (const row of rows) {
    const img = row.querySelector('img.compendium-banner');
    if (!img) continue;
    pos += 1;
    if (pos > 20) break;
    const src = pos === 20
      ? ARGA_OWN_BANNER_20
      : `${ARGA_SCR_BANNER_DIR}/banner_${String(pos).padStart(2, '0')}.webp`;
    if (img.getAttribute('src') !== src) {
      img.setAttribute('src', src);
    }
  }
}

function argaSortSwadeDirectory(root) {
  const collator = new Intl.Collator(game.i18n.lang);
  const titleOf = (li) => {
    const el = li.querySelector('.compendium-name, .entry-name, .document-name, h3, h4, a');
    return (el?.textContent ?? '').trim();
  };
  const targets = root.querySelectorAll('li[data-pack^="swade-core-rules."], li[data-pack="argas-swade-translation-german.makros"]');
  if (targets.length < 2) return;
  const byParent = new Map();
  for (const li of targets) {
    const parent = li.parentElement;
    if (!parent) continue;
    if (!byParent.has(parent)) byParent.set(parent, []);
    byParent.get(parent).push(li);
  }
  for (const [parent, items] of byParent) {
    if (items.length < 2) continue;
    if (items.some((li) => !titleOf(li))) continue;
    const sorted = items.slice().sort((a, b) => collator.compare(titleOf(a), titleOf(b)));
    if (items.every((li, i) => li === sorted[i])) continue;
    const anchor = items[0].previousSibling;
    for (const li of items) li.remove();
    const ref = anchor ? anchor.nextSibling : parent.firstChild;
    for (const li of sorted) parent.insertBefore(li, ref);
  }
}

function argaHideMacroPack(root) {
  let hide = argaModuleDisabled();
  if (!hide) {
    try { hide = game.settings.get(MODULE_ID, 'hideMacroPack') === true; } catch (e) {}
  }
  if (!hide) return;
  root.querySelector(`li[data-pack="${MODULE_ID}.makros"]`)?.remove();
}

Hooks.on('renderCompendiumDirectory', (app, html) => {
  const root = html instanceof HTMLElement ? html
             : html?.[0] instanceof HTMLElement ? html[0]
             : app?.element instanceof HTMLElement ? app.element
             : null;
  if (!root) return;
  argaHideMacroPack(root);
  if (argaModuleDisabled()) return;
  argaSortSwadeDirectory(root);
  argaResortSwadeBanners(root);
});

Hooks.once('i18nInit', () => {
  if (!argaActive()) return;
  const value = 'UUID eingeben oder {type} hineinziehen';
  const t = game.i18n.translations;
  foundry.utils.setProperty(t, 'HTMLDocumentTagsElement.PLACEHOLDER', value);
  if (Object.prototype.hasOwnProperty.call(t, 'HTMLDocumentTagsElement.PLACEHOLDER')) {
    t['HTMLDocumentTagsElement.PLACEHOLDER'] = value;
  }
});

const ARGA_WIN_RESTORE_KEY = 'argas-swade-translation-german.windows';

async function argaRestoreWindows(list) {
  for (const entry of list) {
    try {
      let app = null;
      if (entry.uuid) {
        const doc = await fromUuid(entry.uuid);
        // Sicherheitsnetz: einzelne Journal-Seiten NIE öffnen (auch nicht im
        // Bearbeiten-Modus). Genau das hat zuvor die deutsche Übersetzung in das
        // gesperrte Basis-Kompendium zurückgeschrieben. Nur den Journal-Eintrag
        // selbst öffnen wir wieder (er erscheint im Nur-Lesen-Modus der Kompendie).
        if (doc?.documentName === "JournalEntryPage") continue;
        const sheet = doc?.sheet;
        if (!sheet) continue;
        const opts = entry.pageId ? { pageId: entry.pageId } : {};
        if (sheet instanceof foundry.applications.api.ApplicationV2) {
          await sheet.render({ force: true, ...opts });
        } else {
          await sheet.render(true, opts);
        }
        app = sheet;
      } else if (entry.pack) {
        const pack = game.packs.get(entry.pack);
        if (!pack) continue;
        await pack.render(true);
        app = [...foundry.applications.instances.values()].find((a) => a.collection === pack)
           ?? Object.values(ui.windows).find((w) => w.collection === pack)
           ?? null;
        if (!app) continue;
      } else {
        continue;
      }
      if (entry.pos && Object.keys(entry.pos).length) app.setPosition(entry.pos);
      if (entry.min) await app.minimize();
    } catch (e) {}
  }
}

function argaApplySidebar(expanded) {
  if (typeof expanded !== 'boolean') return;
  try {
    const sb = ui.sidebar;
    if (!sb) return;
    const isExpanded = typeof sb.expanded === 'boolean' ? sb.expanded
                     : typeof sb._collapsed === 'boolean' ? !sb._collapsed
                     : null;
    if (isExpanded === expanded) return;
    if (expanded) {
      if (typeof sb.expand === 'function') sb.expand();
      else if (typeof sb.toggleExpanded === 'function') sb.toggleExpanded(true);
    } else {
      if (typeof sb.collapse === 'function') sb.collapse();
      else if (typeof sb.toggleExpanded === 'function') sb.toggleExpanded(false);
    }
  } catch (e) {}
}

function argaApplySidebarTab(tab) {
  if (!tab) return;
  try {
    const sb = ui.sidebar;
    if (!sb) return;
    if (typeof sb.changeTab === 'function') sb.changeTab(tab, 'primary');
    else if (typeof sb.activateTab === 'function') sb.activateTab(tab);
  } catch (e) {}
}

Hooks.once('ready', () => {
  let raw = null;
  try { raw = sessionStorage.getItem(ARGA_WIN_RESTORE_KEY); } catch (e) { return; }
  if (!raw) return;
  try { sessionStorage.removeItem(ARGA_WIN_RESTORE_KEY); } catch (e) {}
  let data = null;
  try { data = JSON.parse(raw); } catch (e) { return; }
  const windows = Array.isArray(data) ? data
                : Array.isArray(data?.windows) ? data.windows : [];
  const sidebarExpanded = Array.isArray(data) ? undefined : data?.sidebarExpanded;
  const sidebarTab = Array.isArray(data) ? undefined : data?.sidebarTab;
  if (!windows.length && typeof sidebarExpanded !== 'boolean' && !sidebarTab) return;
  setTimeout(() => {
    argaApplySidebarTab(sidebarTab);
    argaApplySidebar(sidebarExpanded);
    if (windows.length) argaRestoreWindows(windows);
  }, 500);
});

Hooks.once('init', () => {
  argaRegisterSettings();
});

Hooks.once('ready', async () => {
  if (argaModuleDisabled()) return;
  try {
    if (game.settings.get(MODULE_ID, 'welcomeDismissed')) return;
  } catch (e) {
    return;
  }

  const isGerman = game.settings.get('core', 'language') === 'de';
  const LOGO = `modules/${MODULE_ID}/assets/icons/Savage-Worlds-Fanprodukt-Logo.webp`;
  const RED = '#aa0000';
  const GREEN = '#1f6b35';

  // Drei Status-Checks fuer das Begruessungsfenster.
  const coreActive = game.modules.get('swade-core-rules')?.active === true;
  let isMetric = false;
  try { isMetric = game.settings.get('swade', 'weightUnit') === 'metric'; } catch (e) {}
  const isGM = game.user?.isGM === true;

  // Aufzählung als 3-Spalten-Raster (Bullet | Text | Haken). checkRow liefert die
  // drei Zellen EINER Zeile; das Raster (siehe dynamic) richtet alle Haken in einer
  // Spalte aus, mit festem 1-cm-Abstand hinter dem längsten Text.
  // ✓/✗ als reine Textzeichen (U+2713/U+2717) – sie haben KEINE Emoji-Variante
  // und nehmen daher zuverlässig die per CSS gesetzte Farbe (grün/rot) an.
  const checkRow = (ok, text) =>
    `<span style="padding-right:0.4rem;">•</span>`
    + `<span>${text}</span>`
    + `<span style="color:${ok ? GREEN : RED};font-weight:bold;font-size:1.2em;padding-left:1cm;">${ok ? '✓' : '✗'}</span>`;

  const coreHint = coreActive ? ''
    : `<div style="color:${RED};">Das kostenpflichtige Originalmodul <strong>SWADE Core Rules</strong> ist nicht aktiv.<br>Ohne das Original findet <strong>keine Übersetzung</strong> statt – bitte aktiviere es in der Modulverwaltung (anschließend startet die Welt neu).</div>`;
  const langHint = isGerman ? ''
    : `<div style="color:${RED};">Ohne deutsche Anzeigesprache übersetzt das Modul nicht – bitte umstellen.</div>`;
  const metricHint = (!isMetric && !isGM)
    ? `<div style="color:${RED};">Die Gewichtseinheit kann nur der Spielleiter umstellen.</div>` : '';

  const dynamic = `
      <hr style="width:100%;margin:0;">
      <div style="font-weight:bold;text-align:center;">Prüfung der Voraussetzungen</div>
      <div style="display:grid;grid-template-columns:auto auto auto;align-items:center;row-gap:0.55rem;width:fit-content;align-self:center;">
        ${checkRow(coreActive, 'SWADE Core Rules geladen')}
        ${checkRow(isGerman, 'Anzeigesprache auf „Deutsch“')}
        ${checkRow(isMetric, 'Metrische Gewichtseinheiten (optional)')}
      </div>
      ${coreHint}
      ${langHint}
      ${metricHint}`;

  const content = `
    <div style="display:flex;flex-direction:column;gap:0.7rem;">
      <div style="text-align:center;"><img src="${LOGO}" alt="" style="display:block;max-width:240px;height:auto;margin:0 auto;border:none;"></div>
      <div style="text-align:center;">Danke für das Installieren von</div>
      <div style="text-align:center;font-size:1.3em;font-weight:bold;">Arga's SWADE Translation (German)</div>
      <div>Es handelt sich um ein inoffizielles Fan-Produkt, welches (mit vorliegender Genehmigung) das kostenpflichtige englische Originalmodul</div>
      <div style="text-align:center;font-weight:bold;">Savage Worlds Adventure Edition Core Rules (swade-core-rules)</div>
      <div>mittels des Moduls <strong>Babele</strong> ins Deutsche übersetzt. Die Originaldateien werden dabei nicht verändert.<br>Bitte nimm in den Spieleinstellungen <span style="color:${RED};font-weight:bold;">keine Änderungen</span> bei der Parade-Fertigkeit (Fighting) oder den Fahrzeugfertigkeiten (Boating, Driving, Piloting, Riding) vor. Die Werte werden im Spiel automatisch übersetzt.</div>
      <div style="text-align:center;margin-top:0.4rem;">Viel Spaß – Arga.</div>
      ${dynamic}
      <hr style="width:100%;margin:0;">
      <label style="display:flex;align-items:center;justify-content:center;gap:0.4rem;">
        <input type="checkbox" name="dismiss"> Nicht mehr anzeigen
      </label>
    </div>
  `;

  const buttons = [];
  if (!coreActive) {
    buttons.push({
      action: 'modules',
      label: 'Modulverwaltung öffnen',
      callback: () => {
        try {
          new foundry.applications.sidebar.apps.ModuleManagement().render({ force: true });
        } catch (e) {
          try { game.settings.sheet.render(true); } catch (e2) {}
        }
      },
    });
  }
  if (!isGerman) {
    buttons.push({
      action: 'switch',
      label: 'Anzeigesprache auf Deutsch umstellen',
      callback: async () => {
        try { await game.settings.set('core', 'language', 'de'); } catch (e) {}
        location.reload();
      },
    });
  }
  if (isGM && !isMetric) {
    buttons.push({
      action: 'metric',
      label: 'Auf metrisch (kg) umstellen',
      callback: async () => {
        try {
          await game.settings.set('swade', 'weightUnit', 'metric');
          // Vorhandene Item-Gewichte direkt mit umrechnen (vor dem Neuladen abwarten).
          const wapi = game.modules.get(MODULE_ID)?.api?.weight;
          if (wapi?.convertAllItemWeights) await wapi.convertAllItemWeights(true);
          ui.notifications?.info('Gewichtseinheit auf metrisch (kg) umgestellt.');
        } catch (e) {
          ui.notifications?.warn('Umstellen fehlgeschlagen – das kann nur der Spielleiter.');
        }
        // Neu laden, damit das Begrüßungsfenster für die übrigen Punkte erneut erscheint.
        location.reload();
      },
    });
  }
  buttons.push({
    action: 'close',
    label: 'Schließen',
    default: true,
  });

  const onRenderWelcome = (app) => {
    const ours = app?.element?.classList?.contains('arga-welcome-dialog')
      || app?.options?.window?.title === "Arga's SWADE Translation (German)";
    if (!ours) return;
    Hooks.off('renderDialogV2', onRenderWelcome);
    const el = app.element;
    if (!el) return;
    const dismiss = el.querySelector('input[name="dismiss"]');
    if (dismiss) {
      dismiss.addEventListener('change', () => {
        try { game.settings.set(MODULE_ID, 'welcomeDismissed', dismiss.checked); } catch (e) {}
      });
    }
    requestAnimationFrame(() => {
      try {
        const w = el.offsetWidth || 520;
        const h = el.offsetHeight || 0;
        app.setPosition({
          left: Math.max(0, Math.round((window.innerWidth - w) / 2)),
          top: Math.max(0, Math.round((window.innerHeight - h) / 2) - 80),
        });
      } catch (e) {}
    });
  };
  Hooks.on('renderDialogV2', onRenderWelcome);

  try {
    await foundry.applications.api.DialogV2.wait({
      window: { title: "Arga's SWADE Translation (German)" },
      classes: ['arga-welcome-dialog'],
      position: { width: 520 },
      content,
      buttons,
      rejectClose: false,
    });
  } catch (e) {
    Hooks.off('renderDialogV2', onRenderWelcome);
  }
});

Hooks.once('init', () => {
  const mod = game.modules.get(MODULE_ID);
  if (!mod) return;
  mod.api = Object.assign(mod.api ?? {}, {
    effectTranslations,
    resolveEffectDescriptionFor(effectId, enName, parentDesc) {
      if (effectId && ANCESTRY_GRANT_EFFECT_IDS.has(effectId) && parentDesc) return parentDesc;
      if (effectId && AMBIGUOUS_EFFECT_IDS.has(effectId)) return (enName && effectDescriptionsByName[enName]) || null;
      if (effectId && effectDescriptionsByID[effectId]) return effectDescriptionsByID[effectId];
      if (enName && effectDescriptionsByName[enName]) return effectDescriptionsByName[enName];
      return null;
    },
  });
});
