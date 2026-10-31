# Memòria Visual de Vila-real

Arxiu fotogràfic geolocalitzat de Vila-real (Castelló) i projecte educatiu.
L'alumnat investiga fotografies històriques de la ciutat, les documenta en
un fitxer XML i les situa sobre un mapa interactiu on qualsevol persona les
pot consultar.

## Què es pot fer

**A la web pública**

- **Vista mapa**: cada fotografia apareix com un marcador amb miniatura i any,
  agrupats en clústers quan n'hi ha molts. Capes de mapa en color i satèl·lit.
- **Vista galeria**: les mateixes fotos en format targeta.
- **Filtres**: cerca per text (títol, lloc, carrer, personatges, temes,
  alumne/a o elements identificats), per categoria i per període (1850–2000).
- **Fitxa de la fotografia**: context històric, ubicació i carrer actual
  (amb enllaç a Google Maps), personatges, temes, autoria i procedència.
- **Fotografia ampliada amb elements identificats**: el botó
  *👁️ Mostrar elements identificats* dibuixa sobre la foto les persones,
  edificis, vehicles o objectes que l'alumnat hi ha marcat. En passar el
  ratolí (o tocar en el mòbil) apareix una targeta amb el nom i la descripció.
  Des de la fitxa lateral es pot fer clic en un element per veure'l ressaltat.

**Al Creador XML (botó *+ Crear XML*)**

Un espai guiat perquè l'alumnat prepare l'entrega sense escriure XML a mà:

1. Fa clic al mapa en el punt on es va fer la fotografia.
2. Omple la fitxa: títol, imatge, any, categoria, ubicació, descripció,
   temes, personatges i dades d'autoria.
3. Opcionalment, **marca elements sobre la imatge**: fa clic i arrossega per
   dibuixar un requadre, li posa nom, tipus (persona, edifici, vehicle,
   objecte o altre) i una descripció. Els requadres es poden moure,
   redimensionar, editar i eliminar.
4. Descarrega el fitxer XML (o el previsualitza i el copia).

## Flux de treball a l'aula

```
Alumnat                      Professorat                        Web
───────                      ───────────                        ───
Creador XML  ──►  carpeta amb XML + imatge  ──►  build_dataset.py  ──►  data.json + img/
```

1. Cada alumne/a genera el seu XML amb el Creador (o a partir de
   [`gestion_entregas/plantilla.xml`](gestion_entregas/plantilla.xml)) i
   l'entrega en una carpeta junt amb la imatge.
2. El professorat copia cada carpeta dins de `gestion_entregas/entregas/`:

   ```
   gestion_entregas/entregas/
   ├── marc_perez/
   │   ├── vr_1924_placa_vila.xml
   │   └── plaza_mayor.jpg
   └── aitana_bellmunt/
       ├── vr_1938_panderola.xml
       └── panderola.jpg
   ```

3. Executa el script de validació (cal Python 3, sense dependències externes):

   ```
   cd gestion_entregas
   python build_dataset.py
   ```

   El script comprova cada entrega (camps obligatoris, categoria, any,
   coordenades dins del terme de Vila-real, existència de la imatge, regions
   dels elements entre 0 i 100 %…), i després:
   - escriu les entregues vàlides a `data.json`,
   - copia les imatges a `img/`,
   - genera `gestion_entregas/informe_entregas.html` amb els errors i avisos
     de cada entrega, per poder-los retornar a l'alumnat.

## Format del XML

L'estructura oficial està definida a
[`gestion_entregas/esquema.xsd`](gestion_entregas/esquema.xsd). Resum:

| Element | Obligatori | Contingut |
|---|---|---|
| `id` | Sí | Identificador únic, p. ex. `vr_1925_placa_major_01` |
| `titol` | Sí | Títol descriptiu |
| `arxiu_imatge` | Sí | Nom del fitxer `.jpg`, `.jpeg` o `.png` |
| `any` | Sí | Any; atribut `exacte="true\|false"` |
| `categoria` | Sí | `arquitectura`, `infraestructura`, `vida quotidiana`, `esdeveniments` o `personatges` |
| `geolocalitzacio` | Sí | `latitud`, `longitud` (amb punt decimal), i opcionalment `toponim_historic` i `carrer_actual` |
| `descripcio` | Sí | Context històric |
| `alumne` | Sí | `nom`, `curs` i `centre` (institut; si falta, el validador avisa) |
| `temes` | No | Llista de `tema` |
| `personatges` | No | Llista de `personatge` |
| `donant` | No | Procedència de la fotografia |
| `elements_imatge` | No | Regions marcades sobre la foto (vegeu baix) |

### Elements identificats a la imatge

Les regions es guarden en **percentatge** respecte a l'ample i l'alt de la
imatge (de 0 a 100), de manera que es veuen igual a qualsevol mida de
pantalla:

```xml
<elements_imatge>
  <element id="elem-1" tipus="edifici">
    <nom>Porxis de la Plaça de la Vila</nom>
    <descripcio>Galeria porticada on se celebrava el mercat setmanal.</descripcio>
    <regio x="8.5" y="32.0" ample="38.0" alt="46.0" />
  </element>
</elements_imatge>
```

- `x`, `y`: cantonada superior esquerra del requadre.
- `ample`, `alt`: mida del requadre.
- `tipus`: `persona`, `edifici`, `vehicle`, `objecte` o `altre`.

## Executar la web en local

La web és HTML, CSS i JavaScript sense compilació, però carrega `data.json`
amb `fetch`, així que cal obrir-la des d'un servidor local (no amb doble clic
sobre `index.html`):

```
python -m http.server
```

i obrir <http://localhost:8000> al navegador.

## Estructura del projecte

```
├── index.html               Web pública i Creador XML
├── script.js                Mapa, galeria, filtres, fitxa, visor i creador
├── style.css                Estils
├── data.json                Dataset generat per build_dataset.py
├── img/                     Imatges publicades
└── gestion_entregas/
    ├── build_dataset.py     Validació d'entregues i generació del dataset
    ├── esquema.xsd          Esquema oficial del XML
    ├── plantilla.xml        Plantilla comentada per a l'alumnat
    ├── informe_entregas.html  Últim informe de validació
    └── entregas/            Carpetes d'entrega (una per alumne/a)
```

## Tecnologies

- [Leaflet](https://leafletjs.com/) i
  [Leaflet.markercluster](https://github.com/Leaflet/Leaflet.markercluster)
  per al mapa.
- [noUiSlider](https://refreshless.com/nouislider/) per a la línia temporal.
- Mapes d'[OpenStreetMap](https://www.openstreetmap.org/) i imatges de satèl·lit d'Esri.
- Python 3 (només biblioteca estàndard) per al processament d'entregues.
