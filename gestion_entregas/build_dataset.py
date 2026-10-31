#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
============================================================================
MEMÒRIA VISUAL DE VILA-REAL
Script de processament i validació d'entregas del alumnat
============================================================================

Ús:
    python build_dataset.py

Funció:
    1. Escaneja la carpeta 'entregas/' on cada subcarpeta conté un XML + imatge.
    2. Valida cada XML contra l'esquema XSD (estructura, coordenades, categories...).
    3. Aplica validacions addicionals (existència de la imatge, coordenades dins
       del terme municipal de Vila-real, camps buits, format de coordenades...).
    4. Genera un informe de validació en HTML (informe_entregas.html).
    5. Exporta les entregas vàlides al fitxer data.json final i copia les imatges
       optimitzades a la carpeta img/ del projecte web.

============================================================================
"""

import json
import os
import sys
import shutil
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

# ============================================================================
# CONFIGURACIÓ
# ============================================================================

# Ruta base del projecte (directori pare de gestion_entregas/)
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
ENTREGAS_DIR = SCRIPT_DIR / "entregas"
ESQUEMA_PATH = SCRIPT_DIR / "esquema.xsd"

# Directoris de sortida del projecte web
IMG_DIR = PROJECT_ROOT / "img"
DATA_JSON_PATH = PROJECT_ROOT / "data.json"

# Informe de sortida
INFORME_PATH = SCRIPT_DIR / "informe_entregas.html"

# Límits geogràfics del terme municipal de Vila-real (amplis per cobrir el terme)
VILAREAL_BOUNDS = {
    "lat_min": 39.88,
    "lat_max": 39.98,
    "lon_min": -0.18,
    "lon_max": -0.04
}

# Categories admeses (han de coincidir amb les del web i l'XSD)
CATEGORIES_ADMESES = [
    "arquitectura",
    "infraestructura",
    "vida quotidiana",
    "esdeveniments",
    "personatges"
]

# ============================================================================
# CLASSES DE RESULTAT
# ============================================================================

class ResultatValidacio:
    """Encapsula el resultat de validar una entrega."""
    def __init__(self, carpeta_name, xml_path):
        self.carpeta = carpeta_name
        self.xml_path = xml_path
        self.errors = []       # Errors crítics (no es pot importar)
        self.avisos = []       # Avisos menors (es pot importar però hi ha detalls)
        self.dades = None      # Diccionari amb les dades parseades si és vàlid
        self.alumne_nom = ""
        self.alumne_curs = ""
        self.alumne_centre = ""
        self.id_foto = ""

    @property
    def es_valid(self):
        return len(self.errors) == 0

    def afegir_error(self, missatge):
        self.errors.append(missatge)

    def afegir_avis(self, missatge):
        self.avisos.append(missatge)


# ============================================================================
# FUNCIONS DE VALIDACIÓ
# ============================================================================

def validar_entrega(carpeta_path):
    """
    Valida una subcarpeta d'entrega (conté un XML i una imatge).
    Retorna un objecte ResultatValidacio.
    """
    carpeta_name = carpeta_path.name
    
    # 1. Trobar l'arxiu XML dins la carpeta
    xmls = list(carpeta_path.glob("*.xml"))
    if len(xmls) == 0:
        result = ResultatValidacio(carpeta_name, None)
        result.afegir_error("No s'ha trobat cap arxiu XML dins la carpeta.")
        return result
    if len(xmls) > 1:
        result = ResultatValidacio(carpeta_name, xmls[0])
        result.afegir_error(f"S'han trobat {len(xmls)} arxius XML. Només n'ha de contindre un.")
        return result

    xml_path = xmls[0]
    result = ResultatValidacio(carpeta_name, xml_path)

    # 2. Parsejar l'XML
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
    except ET.ParseError as e:
        result.afegir_error(f"Error de sintaxi XML: {e}")
        return result

    if root.tag != "fotografia":
        result.afegir_error(f"L'element arrel ha de ser <fotografia>, però s'ha trobat <{root.tag}>.")
        return result

    # 3. Validar camps obligatoris
    camps_obligatoris = {
        "id": "Identificador únic (id)",
        "titol": "Títol de la fotografia (titol)",
        "arxiu_imatge": "Arxiu d'imatge (arxiu_imatge)",
        "any": "Any de la fotografia (any)",
        "categoria": "Categoria (categoria)",
        "geolocalitzacio": "Geolocalització (geolocalitzacio)",
        "descripcio": "Descripció (descripcio)",
        "alumne": "Dades de l'alumne/a (alumne)"
    }

    for tag, nom_camp in camps_obligatoris.items():
        elem = root.find(tag)
        if elem is None:
            result.afegir_error(f"Falta el camp obligatori: {nom_camp}.")

    # Si falten camps obligatoris bàsics, no podem continuar
    if not result.es_valid:
        return result

    # 4. Extreure i validar cada camp
    foto_id = _text(root, "id")
    titol = _text(root, "titol")
    arxiu_imatge = _text(root, "arxiu_imatge")
    any_elem = root.find("any")
    any_text = any_elem.text.strip() if any_elem is not None and any_elem.text else ""
    any_exacte = any_elem.get("exacte", "true") if any_elem is not None else "true"
    categoria = _text(root, "categoria")
    descripcio = _text(root, "descripcio")

    result.id_foto = foto_id

    # --- ID ---
    if not foto_id:
        result.afegir_error("El camp <id> està buit.")

    # --- TÍTOL ---
    if not titol:
        result.afegir_error("El camp <titol> està buit.")

    # --- ARXIU IMATGE ---
    if not arxiu_imatge:
        result.afegir_error("El camp <arxiu_imatge> està buit.")
    else:
        extensions_valides = (".jpg", ".jpeg", ".png")
        if not arxiu_imatge.lower().endswith(extensions_valides):
            result.afegir_error(f"L'arxiu d'imatge '{arxiu_imatge}' no té una extensió vàlida ({', '.join(extensions_valides)}).")
        
        # Comprovar que el fitxer existeix a la carpeta d'entrega
        imatge_path = carpeta_path / arxiu_imatge
        if not imatge_path.exists():
            result.afegir_error(f"L'arxiu d'imatge '{arxiu_imatge}' no existeix dins la carpeta '{carpeta_name}/'.")

    # --- ANY ---
    any_valor = None
    if not any_text:
        result.afegir_error("El camp <any> està buit.")
    else:
        # Detectar coma en comptes de punt o text no numèric
        if "," in any_text:
            result.afegir_error(f"El camp <any> conté una coma: '{any_text}'. Ha de ser un any numèric (ex: 1925).")
        else:
            try:
                any_valor = int(any_text)
                if any_valor < 1840 or any_valor > 2025:
                    result.afegir_error(f"L'any {any_valor} està fora del rang permès (1840 - 2025).")
            except ValueError:
                result.afegir_error(f"El camp <any> no conté un número vàlid: '{any_text}'.")

    # --- CATEGORIA ---
    if categoria not in CATEGORIES_ADMESES:
        result.afegir_error(
            f"La categoria '{categoria}' no és vàlida. "
            f"Categories admeses: {', '.join(CATEGORIES_ADMESES)}."
        )

    # --- GEOLOCALITZACIÓ ---
    geo_elem = root.find("geolocalitzacio")
    latitud = None
    longitud = None
    toponim_historic = ""
    carrer_actual = ""

    if geo_elem is not None:
        lat_text = _text(geo_elem, "latitud")
        lon_text = _text(geo_elem, "longitud")
        toponim_historic = _text(geo_elem, "toponim_historic")
        carrer_actual = _text(geo_elem, "carrer_actual")

        if not lat_text:
            result.afegir_error("El camp <latitud> dins <geolocalitzacio> està buit.")
        elif "," in lat_text:
            result.afegir_error(f"La latitud '{lat_text}' utilitza coma en comptes de punt decimal.")
        else:
            try:
                latitud = float(lat_text)
            except ValueError:
                result.afegir_error(f"La latitud '{lat_text}' no és un número decimal vàlid.")

        if not lon_text:
            result.afegir_error("El camp <longitud> dins <geolocalitzacio> està buit.")
        elif "," in lon_text:
            result.afegir_error(f"La longitud '{lon_text}' utilitza coma en comptes de punt decimal.")
        else:
            try:
                longitud = float(lon_text)
            except ValueError:
                result.afegir_error(f"La longitud '{lon_text}' no és un número decimal vàlid.")

        # Comprovar que les coordenades cauen dins del terme de Vila-real
        if latitud is not None and longitud is not None:
            if not (VILAREAL_BOUNDS["lat_min"] <= latitud <= VILAREAL_BOUNDS["lat_max"]):
                result.afegir_error(
                    f"La latitud {latitud} està fora dels límits del terme de Vila-real "
                    f"({VILAREAL_BOUNDS['lat_min']} - {VILAREAL_BOUNDS['lat_max']}). "
                    f"Revisa les coordenades."
                )
            if not (VILAREAL_BOUNDS["lon_min"] <= longitud <= VILAREAL_BOUNDS["lon_max"]):
                result.afegir_error(
                    f"La longitud {longitud} està fora dels límits del terme de Vila-real "
                    f"({VILAREAL_BOUNDS['lon_min']} - {VILAREAL_BOUNDS['lon_max']}). "
                    f"Revisa les coordenades."
                )

    # --- DESCRIPCIÓ ---
    if not descripcio:
        result.afegir_avis("El camp <descripcio> està buit. Seria recomanable afegir context històric.")

    # --- TEMES ---
    temes = []
    temes_elem = root.find("temes")
    if temes_elem is not None:
        for tema_elem in temes_elem.findall("tema"):
            t = tema_elem.text.strip() if tema_elem.text else ""
            if t:
                temes.append(t)
    if not temes:
        result.afegir_avis("No s'han especificat temes/etiquetes. Seria recomanable incloure'n.")

    # --- PERSONATGES ---
    personatges = []
    pers_elem = root.find("personatges")
    if pers_elem is not None:
        for p_elem in pers_elem.findall("personatge"):
            p = p_elem.text.strip() if p_elem.text else ""
            if p:
                personatges.append(p)

    # --- ALUMNE ---
    alumne_elem = root.find("alumne")
    alumne_nom = ""
    alumne_curs = ""
    alumne_centre = ""
    if alumne_elem is not None:
        alumne_nom = _text(alumne_elem, "nom")
        alumne_curs = _text(alumne_elem, "curs")
        alumne_centre = _text(alumne_elem, "centre")
        if not alumne_nom:
            result.afegir_error("El camp <nom> dins <alumne> està buit.")
        if not alumne_curs:
            result.afegir_avis("El camp <curs> dins <alumne> està buit.")
        if not alumne_centre:
            result.afegir_avis("Falta el camp <centre> dins <alumne> (nom de l'institut).")

    result.alumne_nom = alumne_nom
    result.alumne_curs = alumne_curs
    result.alumne_centre = alumne_centre

    # --- DONANT ---
    donant = _text(root, "donant")

    # --- ELEMENTS IMATGE (REGIONS ANOTADES) ---
    elements_llista = []
    elem_root = root.find("elements_imatge")
    tipus_admesos = {"persona", "edifici", "vehicle", "objecte", "altre"}
    if elem_root is not None:
        for idx, el in enumerate(elem_root.findall("element"), start=1):
            el_id = el.get("id", f"elem-{idx}").strip()
            tipus = el.get("tipus", "altre").strip().lower()
            nom = _text(el, "nom")
            desc = _text(el, "descripcio")

            if not nom:
                result.afegir_error(f"L'element anotat #{idx} no té el camp <nom> obligatori.")
            if tipus not in tipus_admesos:
                result.afegir_avis(f"L'element anotat '{nom or idx}' té el tipus '{tipus}', que no és estàndard.")

            regio = el.find("regio")
            if regio is None:
                result.afegir_error(f"L'element anotat '{nom or idx}' no té l'element <regio> amb coordenades.")
            else:
                try:
                    rx = float(regio.get("x", "-1").replace(",", "."))
                    ry = float(regio.get("y", "-1").replace(",", "."))
                    rw = float(regio.get("ample", "-1").replace(",", "."))
                    rh = float(regio.get("alt", "-1").replace(",", "."))

                    if not (0 <= rx <= 100 and 0 <= ry <= 100):
                        result.afegir_error(f"L'element '{nom}' té coordenades d'origen (x={rx}, y={ry}) fora del rang permès (0-100%).")
                    if rw <= 0 or rh <= 0 or (rx + rw > 105) or (ry + rh > 105):
                        result.afegir_error(f"L'element '{nom}' té dimensions (ample={rw}, alt={rh}) invàlides.")

                    elements_llista.append({
                        "id": el_id,
                        "tipus": tipus,
                        "nom": nom,
                        "descripcio": desc,
                        "regio": {
                            "x": round(rx, 2),
                            "y": round(ry, 2),
                            "ample": round(rw, 2),
                            "alt": round(rh, 2)
                        }
                    })
                except (ValueError, TypeError):
                    result.afegir_error(f"L'element '{nom}' té coordenades de <regio> no numèriques.")

    # 5. Si no hi ha errors, construir el diccionari de dades
    if result.es_valid:
        result.dades = {
            "id": foto_id,
            "lat": latitud,
            "lon": longitud,
            "titulo": titol,
            "img": arxiu_imatge,
            "desc": descripcio,
            "year": any_valor,
            "year_exacto": any_exacte.lower() == "true",
            "categoria": categoria,
            "tags": temes,
            "personatges": personatges,
            "elements": elements_llista,
            "lloc": toponim_historic,
            "carrer_actual": carrer_actual,
            "donant": donant,
            "alumne": {
                "nom": alumne_nom,
                "curs": alumne_curs,
                "centre": alumne_centre
            }
        }

    return result


def _text(parent, tag):
    """Extreu el text d'un element fill o retorna cadena buida."""
    elem = parent.find(tag)
    if elem is not None and elem.text:
        return elem.text.strip()
    return ""


# ============================================================================
# CÒPIA D'IMATGES
# ============================================================================

def copiar_imatge(carpeta_path, nom_imatge, dest_dir):
    """Copia la imatge de l'entrega a la carpeta img/ del projecte."""
    origen = carpeta_path / nom_imatge
    desti = dest_dir / nom_imatge

    if origen.exists():
        shutil.copy2(origen, desti)
        return True
    return False


# ============================================================================
# GENERACIÓ DE L'INFORME HTML
# ============================================================================

def generar_informe_html(resultats, data_json_path, informe_path):
    """Genera un informe visual en HTML amb els resultats de validació."""
    
    total = len(resultats)
    valides = sum(1 for r in resultats if r.es_valid)
    amb_errors = total - valides
    amb_avisos = sum(1 for r in resultats if r.avisos)

    ara = datetime.now().strftime("%d/%m/%Y a les %H:%M")

    html = f"""<!DOCTYPE html>
<html lang="ca">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Informe de Validació d'Entregas | Memòria Visual de Vila-real</title>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    body {{
      font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
      background: #f4f3ee;
      color: #1f2522;
      padding: 30px;
      line-height: 1.6;
    }}
    h1 {{
      font-size: 1.6rem;
      margin-bottom: 6px;
      color: #873217;
    }}
    .subtitle {{
      font-size: 0.9rem;
      color: #5e6863;
      margin-bottom: 24px;
    }}
    .stats {{
      display: flex;
      gap: 14px;
      margin-bottom: 28px;
      flex-wrap: wrap;
    }}
    .stat-card {{
      background: #fff;
      border-radius: 10px;
      padding: 16px 22px;
      border: 1px solid rgba(0,0,0,0.08);
      min-width: 140px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    }}
    .stat-card .number {{
      font-size: 2rem;
      font-weight: 800;
    }}
    .stat-card .label {{
      font-size: 0.8rem;
      color: #5e6863;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }}
    .n-total {{ color: #1f2522; }}
    .n-ok {{ color: #267843; }}
    .n-err {{ color: #c92a2a; }}
    .n-warn {{ color: #b88628; }}

    .entry {{
      background: #fff;
      border-radius: 10px;
      border: 1px solid rgba(0,0,0,0.08);
      padding: 18px 22px;
      margin-bottom: 14px;
      box-shadow: 0 2px 6px rgba(0,0,0,0.04);
    }}
    .entry-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }}
    .entry-title {{
      font-weight: 700;
      font-size: 1rem;
    }}
    .badge {{
      font-size: 0.75rem;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 6px;
    }}
    .badge-ok {{
      background: #e6f7ed;
      color: #267843;
    }}
    .badge-err {{
      background: #fce4e4;
      color: #c92a2a;
    }}
    .badge-warn {{
      background: #fef7e9;
      color: #b88628;
    }}
    .entry-meta {{
      font-size: 0.82rem;
      color: #5e6863;
      margin-bottom: 8px;
    }}
    ul {{
      list-style: none;
      padding: 0;
    }}
    ul li {{
      padding: 4px 0 4px 22px;
      position: relative;
      font-size: 0.88rem;
    }}
    ul li::before {{
      position: absolute;
      left: 0;
      top: 5px;
    }}
    li.err::before {{ content: "❌"; }}
    li.warn::before {{ content: "⚠️"; }}
    li.ok-item::before {{ content: "✅"; }}
  </style>
</head>
<body>
  <h1>📋 Informe de Validació d'Entregas</h1>
  <p class="subtitle">Memòria Visual de Vila-real — Generat el {ara}</p>

  <div class="stats">
    <div class="stat-card">
      <div class="number n-total">{total}</div>
      <div class="label">Entregas Totals</div>
    </div>
    <div class="stat-card">
      <div class="number n-ok">{valides}</div>
      <div class="label">Vàlides ✅</div>
    </div>
    <div class="stat-card">
      <div class="number n-err">{amb_errors}</div>
      <div class="label">Amb Errors ❌</div>
    </div>
    <div class="stat-card">
      <div class="number n-warn">{amb_avisos}</div>
      <div class="label">Amb Avisos ⚠️</div>
    </div>
  </div>
"""

    # Primer mostrar les que tenen errors, després les vàlides
    resultats_ordenats = sorted(resultats, key=lambda r: (r.es_valid, r.carpeta))

    for r in resultats_ordenats:
        if r.es_valid:
            badge = '<span class="badge badge-ok">VÀLID</span>'
            if r.avisos:
                badge = '<span class="badge badge-warn">VÀLID AMB AVISOS</span>'
        else:
            badge = '<span class="badge badge-err">ERRORS</span>'

        xml_name = r.xml_path.name if r.xml_path else "(sense XML)"
        meta_parts = []
        if r.alumne_nom:
            meta_parts.append(f"Alumne/a: <strong>{r.alumne_nom}</strong>")
        if r.alumne_curs:
            meta_parts.append(f"Curs: {r.alumne_curs}")
        if r.alumne_centre:
            meta_parts.append(f"Centre: {r.alumne_centre}")
        if r.id_foto:
            meta_parts.append(f"ID: <code>{r.id_foto}</code>")
        meta_str = " · ".join(meta_parts) if meta_parts else "Sense informació de l'alumne/a"

        html += f"""
  <div class="entry">
    <div class="entry-header">
      <span class="entry-title">📁 {r.carpeta} / {xml_name}</span>
      {badge}
    </div>
    <div class="entry-meta">{meta_str}</div>
    <ul>
"""
        if r.errors:
            for err in r.errors:
                html += f'      <li class="err">{err}</li>\n'
        if r.avisos:
            for avis in r.avisos:
                html += f'      <li class="warn">{avis}</li>\n'
        if r.es_valid and not r.avisos:
            html += '      <li class="ok-item">Tots els camps correctes. Llest per importar.</li>\n'

        html += """    </ul>
  </div>
"""

    html += f"""
  <hr style="margin: 28px 0; border: none; border-top: 1px solid #ddd;">
  <p style="font-size: 0.82rem; color: #888;">
    Data exportada a: <code>{data_json_path}</code><br>
    Només les entregas vàlides s'han incorporat al dataset.
  </p>
</body>
</html>
"""

    with open(informe_path, "w", encoding="utf-8") as f:
        f.write(html)


# ============================================================================
# FUNCIÓ PRINCIPAL
# ============================================================================

def main():
    print("=" * 66)
    print("  MEMORIA VISUAL DE VILA-REAL -- Processament d'Entregas")
    print("=" * 66)
    print()

    # Comprovar que la carpeta d'entregas existeix
    if not ENTREGAS_DIR.exists():
        print(f"[ERROR] No s'ha trobat la carpeta d'entregas: {ENTREGAS_DIR}")
        print(f"   Crea-la i col-loca-hi les subcarpetes de cada alumne/a.")
        sys.exit(1)

    # Escanejar subcarpetes
    subcarpetes = sorted([
        d for d in ENTREGAS_DIR.iterdir() if d.is_dir()
    ])

    if not subcarpetes:
        print(f"[AVIS] La carpeta d'entregas '{ENTREGAS_DIR}' esta buida.")
        print(f"   Col-loca cada entrega dins una subcarpeta (ex: entregas/marc_perez/).")
        sys.exit(0)

    print(f"[INFO] S'han trobat {len(subcarpetes)} subcarpetes d'entregas.")
    print()

    # Processar cada entrega
    resultats = []
    for carpeta in subcarpetes:
        print(f"  [>] Processant: {carpeta.name} ...", end=" ")
        resultat = validar_entrega(carpeta)
        resultats.append(resultat)

        if resultat.es_valid:
            print("[OK] Valid", end="")
            if resultat.avisos:
                print(f" (amb {len(resultat.avisos)} avis/os)", end="")
            print()
        else:
            print(f"[ERROR] {len(resultat.errors)} error/s trobat/s")

    print()

    # Comprovar identificadors repetits (la web els usa com a clau única)
    ids_vistos = {}
    for r in resultats:
        if r.es_valid and r.id_foto:
            if r.id_foto in ids_vistos:
                r.afegir_error(
                    f"L'identificador '{r.id_foto}' ja l'utilitza l'entrega '{ids_vistos[r.id_foto]}'. "
                    f"Cada fotografia ha de tenir un <id> únic."
                )
                r.dades = None
                print(f"  [ERROR] {r.carpeta}: id repetit '{r.id_foto}'")
            else:
                ids_vistos[r.id_foto] = r.carpeta

    # Exportar entregas valides a data.json
    dades_valides = []
    imatges_copiades = 0

    for r in resultats:
        if r.es_valid and r.dades:
            dades_valides.append(r.dades)

            # Copiar la imatge a img/
            nom_img = r.dades["img"]
            if copiar_imatge(r.xml_path.parent, nom_img, IMG_DIR):
                imatges_copiades += 1

    # Escriure data.json
    with open(DATA_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(dades_valides, f, ensure_ascii=False, indent=2)

    print(f"[EXPORT] Exportat: {DATA_JSON_PATH}")
    print(f"   -> {len(dades_valides)} fotografies valides incorporades al dataset.")
    print(f"   -> {imatges_copiades} imatges copiades a {IMG_DIR}/")
    print()

    # Generar informe HTML
    generar_informe_html(resultats, DATA_JSON_PATH, INFORME_PATH)
    print(f"[INFORME] Informe generat: {INFORME_PATH}")
    print()

    # Resum final
    total = len(resultats)
    valides = len(dades_valides)
    amb_errors = total - valides

    if amb_errors == 0:
        print(f"[OK] Totes les {total} entregas son valides! El dataset esta actualitzat.")
    else:
        print(f"[AVIS] {amb_errors} de {total} entregas tenen errors i NO s'han importat.")
        print(f"   Revisa l'informe per a mes detalls.")


if __name__ == "__main__":
    main()
