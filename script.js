/**
 * MEMÒRIA VISUAL DE VILA-REAL
 * Lògica interactiva: Mapa Leaflet + Clusters, Galeria dinàmica,
 * filtres reactius i panell catalogràfic enriqu богоtic.
 */

document.addEventListener('DOMContentLoaded', () => {

  // ==========================================================================
  // 1. CONFIGURACIÓ I CAPES DEL MAPA (LEAFLET)
  // ==========================================================================
  const vilaRealCoords = [39.9372, -0.1009];
  const mapBounds = [
    [39.885, -0.175], // Sud-Oest (El Termet, Riu Millars)
    [39.980, -0.035]  // Nord-Est (Horta i terme municipal)
  ];

  const map = L.map('map', {
    center: vilaRealCoords,
    zoom: 15,
    minZoom: 13,
    maxZoom: 19,
    maxBounds: mapBounds,
    maxBoundsViscosity: 0.9,
    zoomControl: false // El col·loquem a sota o adaptat
  });

  // Afegir control de zoom a la cantonada inferior dreta per no interferir amb el header
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Definició de capes base (sense necessitat de clau d'API)
  const tileLayers = {
    osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      attribution: 'Tiles &copy; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN',
      maxZoom: 18
    })
  };

  // Capa per defecte: Color (OpenStreetMap)
  let currentTileLayer = tileLayers.osm;
  currentTileLayer.addTo(map);

  // Gestió del canvi de capes base
  const layerButtons = document.querySelectorAll('.layer-pill');
  layerButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      layerButtons.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const layerKey = btn.dataset.layer;
      if (tileLayers[layerKey] && tileLayers[layerKey] !== currentTileLayer) {
        map.removeLayer(currentTileLayer);
        currentTileLayer = tileLayers[layerKey];
        currentTileLayer.addTo(map);
      }
    });
  });

  // Grup de Clusters de Leaflet amb disseny personalitzat
  const markerClusterGroup = L.markerClusterGroup({
    showCoverageOnHover: false,
    maxClusterRadius: 40,
    iconCreateFunction: function(cluster) {
      const count = cluster.getChildCount();
      return L.divIcon({
        html: `<div class="marker-cluster-custom"><div class="cluster-inner">${count}</div></div>`,
        className: 'custom-cluster-wrapper',
        iconSize: L.point(48, 48)
      });
    }
  });
  map.addLayer(markerClusterGroup);

  // ==========================================================================
  // 2. ESTAT GLOBAL DE L'APLICACIÓ
  // ==========================================================================
  let allPhotos = [];
  let currentFilteredPhotos = [];
  let photoMarkersMap = new Map(); // id -> L.marker

  let filterCategory = 'totes';
  let filterText = '';
  let minYearSelected = 1850;
  let maxYearSelected = 2000;
  let currentActivePhoto = null;

  // ==========================================================================
  // 3. ELEMENTS DEL DOM
  // ==========================================================================
  // Capçalera i Vistes
  const btnViewMap = document.getElementById('btn-view-map');
  const btnViewGallery = document.getElementById('btn-view-gallery');
  const mapView = document.getElementById('map-view');
  const galleryView = document.getElementById('gallery-view');
  const galleryGrid = document.getElementById('gallery-grid');
  const galleryEmpty = document.getElementById('gallery-empty');
  const visibleCountEl = document.getElementById('visible-count');
  const totalCountEl = document.getElementById('total-count');

  // Filtres
  const searchInput = document.getElementById('search-input');
  const clearSearchBtn = document.getElementById('clear-search-btn');
  const categoriaSelect = document.getElementById('categoriaSelect');
  const sliderRangeEl = document.getElementById('slider-range');
  const minYearDisplay = document.getElementById('min-year-display');
  const maxYearDisplay = document.getElementById('max-year-display');
  const btnResetFilters = document.getElementById('btn-reset-filters');

  // Panell Lateral (Ficha)
  const sidepanel = document.getElementById('sidepanel');
  const panelOverlay = document.getElementById('panel-overlay');
  const closePanelBtn = document.getElementById('close-panel');
  const sidepanelImg = document.getElementById('sidepanel-img');
  const sidepanelTitle = document.getElementById('sidepanel-title');
  const sidepanelDesc = document.getElementById('sidepanel-desc');
  const sidepanelYearBadge = document.getElementById('sidepanel-year-badge');
  const sidepanelCatBadge = document.getElementById('sidepanel-cat-badge');
  const sidepanelPlace = document.getElementById('sidepanel-place');
  const sidepanelStreet = document.getElementById('sidepanel-street');
  const streetviewBtn = document.getElementById('streetview-btn');
  const sidepanelPeopleSection = document.getElementById('sidepanel-people-section');
  const sidepanelPeopleTags = document.getElementById('sidepanel-people-tags');
  const sidepanelTags = document.getElementById('sidepanel-tags');
  const sidepanelStudent = document.getElementById('sidepanel-student');
  const sidepanelCourse = document.getElementById('sidepanel-course');
  const sidepanelDonor = document.getElementById('sidepanel-donor');

  // Modal d'imatge ampliada
  const modal = document.getElementById('myModal');
  const modalImage = document.getElementById('modal-image');
  const modalCaptionTitle = document.getElementById('modal-caption-title');
  const modalCaptionYear = document.getElementById('modal-caption-year');
  const zoomImageBtn = document.getElementById('zoom-image-btn');

  // ==========================================================================
  // 4. CREACIÓ DEL MARCADOR PERSONALITZAT
  // ==========================================================================
  function createCustomPhotoIcon(photo) {
    const imgSrc = 'img/' + photo.img;
    const yearText = photo.year || '';
    
    const html = `
      <div class="pin-bubble" title="${escapeHtml(photo.titulo)} (${yearText})">
        <img src="${imgSrc}" alt="${escapeHtml(photo.titulo)}" onerror="this.src='img/fallback.jpg'" />
        <span class="pin-year-tag">${yearText}</span>
      </div>
    `;

    return L.divIcon({
      className: 'custom-photo-pin',
      html: html,
      iconSize: [48, 54],
      iconAnchor: [24, 48],
      popupAnchor: [0, -48]
    });
  }

  // ==========================================================================
  // 5. CARGA DE DADES I INICIALITZACIÓ DINÀMICA DEL SLIDER (1850 - 2000)
  // ==========================================================================
  fetch('data.json')
    .then(res => {
      if (!res.ok) throw new Error('No s\'ha pogut carregar data.json');
      return res.json();
    })
    .then(data => {
      allPhotos = data;
      totalCountEl.textContent = allPhotos.length;

      // Ràng fix sol·licitat de 1850 a 2000
      minYearSelected = 1850;
      maxYearSelected = 2000;

      initSlider(1850, 2000);
      createMapMarkers();
      aplicarFiltros();
    })
    .catch(err => {
      console.error('Error inicialitzant dades:', err);
    });

  // Inicialitzar noUiSlider
  function initSlider(minVal, maxVal) {
    if (sliderRangeEl.noUiSlider) {
      sliderRangeEl.noUiSlider.destroy();
    }

    noUiSlider.create(sliderRangeEl, {
      start: [minVal, maxVal],
      connect: true,
      step: 1,
      range: {
        'min': minVal,
        'max': maxVal
      },
      format: {
        to: val => Math.round(val),
        from: val => Number(val)
      }
    });

    minYearDisplay.textContent = minVal;
    maxYearDisplay.textContent = maxVal;

    sliderRangeEl.noUiSlider.on('update', (values) => {
      minYearSelected = parseInt(values[0], 10);
      maxYearSelected = parseInt(values[1], 10);
      minYearDisplay.textContent = minYearSelected;
      maxYearDisplay.textContent = maxYearSelected;
      aplicarFiltros();
    });
  }

  // ==========================================================================
  // 6. GENERACIÓ DELS MARCADORS DEL MAPA
  // ==========================================================================
  function createMapMarkers() {
    markerClusterGroup.clearLayers();
    photoMarkersMap.clear();

    allPhotos.forEach(photo => {
      if (typeof photo.lat === 'number' && typeof photo.lon === 'number') {
        const marker = L.marker([photo.lat, photo.lon], {
          icon: createCustomPhotoIcon(photo),
          riseOnHover: true
        });

        marker.on('click', () => {
          openPhotoDetails(photo);
        });

        photoMarkersMap.set(photo.id, marker);
      }
    });
  }

  // ==========================================================================
  // 7. MOTOR DE FILTRAT I ACTUALITZACIÓ DE VISTES
  // ==========================================================================
  function aplicarFiltros() {
    const q = filterText.trim().toLowerCase();

    currentFilteredPhotos = allPhotos.filter(photo => {
      // 1. Filtre d'anys
      const photoYear = photo.year;
      const passYear = (typeof photoYear === 'number')
        ? (photoYear >= minYearSelected && photoYear <= maxYearSelected)
        : true;

      // 2. Filtre de categoria
      const passCat = (filterCategory === 'totes' || !filterCategory || photo.categoria === filterCategory);

      // 3. Filtre de text lliure (cerca en títol, lloc, personatges, tags, descripció, etc.)
      let passQuery = true;
      if (q) {
        const titleMatch = (photo.titulo || '').toLowerCase().includes(q);
        const descMatch = (photo.desc || '').toLowerCase().includes(q);
        const placeMatch = (photo.lloc || '').toLowerCase().includes(q);
        const streetMatch = (photo.carrer_actual || '').toLowerCase().includes(q);
        const yearMatch = (photo.year ? String(photo.year) : '').includes(q);
        const peopleMatch = Array.isArray(photo.personatges) && photo.personatges.some(p => p.toLowerCase().includes(q));
        const tagsMatch = Array.isArray(photo.tags) && photo.tags.some(t => t.toLowerCase().includes(q));
        const studentMatch = (photo.alumne && photo.alumne.nom) ? photo.alumne.nom.toLowerCase().includes(q) : false;

        passQuery = titleMatch || descMatch || placeMatch || streetMatch || yearMatch || peopleMatch || tagsMatch || studentMatch;
      }

      return passYear && passCat && passQuery;
    });

    // Actualitzar comptador
    visibleCountEl.textContent = currentFilteredPhotos.length;

    // Actualitzar marcadors en el mapa
    markerClusterGroup.clearLayers();
    currentFilteredPhotos.forEach(photo => {
      const marker = photoMarkersMap.get(photo.id);
      if (marker) {
        markerClusterGroup.addLayer(marker);
      }
    });

    // Actualitzar galeria
    renderGallery(currentFilteredPhotos);
  }

  // ==========================================================================
  // 8. RENDERITZAT DE LA VISTA GALERIA
  // ==========================================================================
  function renderGallery(photos) {
    galleryGrid.innerHTML = '';

    if (photos.length === 0) {
      galleryEmpty.style.display = 'block';
      return;
    }
    galleryEmpty.style.display = 'none';

    photos.forEach(photo => {
      const card = document.createElement('article');
      card.className = 'gallery-card';
      card.setAttribute('tabindex', '0');

      const studentName = (photo.alumne && photo.alumne.nom) ? photo.alumne.nom : 'Arxiu Històric';

      card.innerHTML = `
        <div class="card-img-wrapper">
          <img src="img/${photo.img}" alt="${escapeHtml(photo.titulo)}" loading="lazy" onerror="this.src='img/fallback.jpg'" />
          <span class="card-year-badge">${photo.year || 'S/A'}</span>
          <span class="card-cat-badge">${photo.categoria || 'Història'}</span>
        </div>
        <div class="card-content">
          <h3 class="card-title">${escapeHtml(photo.titulo)}</h3>
          <div class="card-location">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2" fill="none"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path><circle cx="12" cy="10" r="3"></circle></svg>
            <span>${escapeHtml(photo.lloc || 'Vila-real')}</span>
          </div>
          <p class="card-desc">${escapeHtml(photo.desc || '')}</p>
          <div class="card-footer">
            <span class="card-student">Per: ${escapeHtml(studentName)}</span>
            <button class="btn-card-view" data-id="${photo.id}">
              <span>Veure fitxa</span> &rarr;
            </button>
          </div>
        </div>
      `;

      // Clic a tota la targeta per obrir detalls
      card.addEventListener('click', () => {
        openPhotoDetails(photo);
      });

      // Teclat (Enter)
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          openPhotoDetails(photo);
        }
      });

      galleryGrid.appendChild(card);
    });
  }

  // ==========================================================================
  // 9. PANELL LATERAL (FITXA ENRIQUIDA DE LA FOTOGRAFIA)
  // ==========================================================================
  function openPhotoDetails(photo) {
    currentActivePhoto = photo;

    // Emplenar dades
    sidepanelTitle.textContent = photo.titulo;
    sidepanelImg.src = 'img/' + photo.img;
    sidepanelImg.alt = photo.titulo;
    sidepanelImg.onerror = () => { sidepanelImg.src = 'img/fallback.jpg'; };

    sidepanelDesc.textContent = photo.desc || 'Sense descripció documentada.';
    sidepanelYearBadge.textContent = photo.year ? `${photo.year} ${photo.year_exacto === false ? '(aprox.)' : ''}` : 'Sense any';
    sidepanelCatBadge.textContent = photo.categoria || 'General';

    sidepanelPlace.textContent = photo.lloc || 'Vila-real';
    sidepanelStreet.textContent = photo.carrer_actual || 'Terme municipal de Vila-real';

    // Enllaç a Street View / Google Maps
    if (photo.lat && photo.lon) {
      streetviewBtn.href = `https://www.google.com/maps/search/?api=1&query=${photo.lat},${photo.lon}`;
      streetviewBtn.style.display = 'inline-flex';
    } else {
      streetviewBtn.style.display = 'none';
    }

    // Personatges documentats
    sidepanelPeopleTags.innerHTML = '';
    if (Array.isArray(photo.personatges) && photo.personatges.length > 0) {
      sidepanelPeopleSection.style.display = 'block';
      photo.personatges.forEach(person => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill people-pill';
        pill.textContent = person;
        pill.title = `Filtrar per: ${person}`;
        pill.addEventListener('click', () => {
          setSearchQuery(person);
        });
        sidepanelPeopleTags.appendChild(pill);
      });
    } else {
      sidepanelPeopleSection.style.display = 'none';
    }

    // Temes / Etiquetes
    sidepanelTags.innerHTML = '';
    if (Array.isArray(photo.tags) && photo.tags.length > 0) {
      photo.tags.forEach(tag => {
        const pill = document.createElement('span');
        pill.className = 'tag-pill';
        pill.textContent = '#' + tag;
        pill.title = `Filtrar per: #${tag}`;
        pill.addEventListener('click', () => {
          setSearchQuery(tag);
        });
        sidepanelTags.appendChild(pill);
      });
    }

    // Secció educativa i d'autoria
    sidepanelStudent.textContent = (photo.alumne && photo.alumne.nom) ? photo.alumne.nom : 'Equip del projecte';
    sidepanelCourse.textContent = (photo.alumne && photo.alumne.curs) ? photo.alumne.curs : 'IES Vila-real';
    sidepanelDonor.textContent = photo.donant || 'Fons ciutadà';

    // Obrir panell
    sidepanel.classList.add('open');
    panelOverlay.classList.add('active');

    // Centrar lleugerament el mapa si estem en vista mapa
    if (mapView.classList.contains('active') && photo.lat && photo.lon) {
      map.flyTo([photo.lat, photo.lon], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.8
      });
    }
  }

  function closePhotoDetails() {
    sidepanel.classList.remove('open');
    panelOverlay.classList.remove('active');
    currentActivePhoto = null;
  }

  closePanelBtn.addEventListener('click', closePhotoDetails);
  panelOverlay.addEventListener('click', closePhotoDetails);

  // ==========================================================================
  // 10. MODAL D'AMPLIACIÓ DE FOTOGRAFIA
  // ==========================================================================
  zoomImageBtn.addEventListener('click', () => {
    if (currentActivePhoto) {
      modalImage.src = 'img/' + currentActivePhoto.img;
      modalCaptionTitle.textContent = currentActivePhoto.titulo;
      modalCaptionYear.textContent = currentActivePhoto.year ? `Any ${currentActivePhoto.year}` : '';
      modal.classList.add('active');
      modal.setAttribute('aria-hidden', 'false');
    }
  });

  window.cerrarModalImagen = function() {
    modal.classList.remove('active');
    modal.setAttribute('aria-hidden', 'true');
  };

  // Tancar amb tecla Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (modal.classList.contains('active')) {
        window.cerrarModalImagen();
      } else if (sidepanel.classList.contains('open')) {
        closePhotoDetails();
      }
    }
  });

  // ==========================================================================
  // 11. COMMUTADOR DE VISTES (MAPA <-> GALERIA)
  // ==========================================================================
  btnViewMap.addEventListener('click', () => {
    btnViewMap.classList.add('active');
    btnViewGallery.classList.remove('active');

    mapView.classList.add('active');
    galleryView.classList.remove('active');

    // Forçar Leaflet a recalcular mides per evitar talls de pantalla
    setTimeout(() => {
      map.invalidateSize();
    }, 200);
  });

  btnViewGallery.addEventListener('click', () => {
    btnViewGallery.classList.add('active');
    btnViewMap.classList.remove('active');

    galleryView.classList.add('active');
    mapView.classList.remove('active');
  });

  // ==========================================================================
  // 12. GESTIÓ D'EVENTS DELS FILTRES
  // ==========================================================================
  // Cerca per text
  searchInput.addEventListener('input', (e) => {
    filterText = e.target.value;
    clearSearchBtn.style.display = filterText ? 'block' : 'none';
    aplicarFiltros();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    filterText = '';
    clearSearchBtn.style.display = 'none';
    aplicarFiltros();
    searchInput.focus();
  });

  function setSearchQuery(term) {
    searchInput.value = term;
    filterText = term;
    clearSearchBtn.style.display = 'block';
    aplicarFiltros();
  }

  // Categoria
  categoriaSelect.addEventListener('change', (e) => {
    filterCategory = e.target.value;
    aplicarFiltros();
  });

  // Botó de restablir tots els filtres
  btnResetFilters.addEventListener('click', () => {
    searchInput.value = '';
    filterText = '';
    clearSearchBtn.style.display = 'none';

    categoriaSelect.value = 'totes';
    filterCategory = 'totes';

    if (sliderRangeEl.noUiSlider) {
      sliderRangeEl.noUiSlider.set([1850, 2000]);
    }

    aplicarFiltros();
  });

  // Utilitat per escapar caràcters HTML
  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // Utilitat per escapar caràcters XML
  function escapeXml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  // ==========================================================================
  // 13. ESPAI DE CREACIÓ XML PER A L'ALUMNAT
  // ==========================================================================
  const btnOpenCreator = document.getElementById('btn-open-creator');
  const btnCloseCreator = document.getElementById('btn-close-creator');
  const xmlCreatorSpace = document.getElementById('xml-creator-space');

  // Elements de la burbuja d'instruccions
  const creatorBubble = document.getElementById('creator-instructions-bubble');
  const bubbleStepBadge = document.getElementById('bubble-step-badge');
  const bubbleTitle = document.getElementById('bubble-title');
  const bubbleDesc = document.getElementById('bubble-desc');
  const bstep1 = document.getElementById('bstep-1');
  const bstep2 = document.getElementById('bstep-2');
  const bstep3 = document.getElementById('bstep-3');

  // Elements d'estat de coordenades
  const coordsStatusBox = document.getElementById('coords-status-box');
  const coordsDot = document.getElementById('coords-dot');
  const coordsStateText = document.getElementById('coords-state-text');
  const coordsTipText = document.getElementById('coords-tip-text');
  const coordsChipsRow = document.getElementById('coords-chips-row');
  const displayLat = document.getElementById('display-lat');
  const displayLon = document.getElementById('display-lon');
  const btnRecenterCreatorMap = document.getElementById('btn-recenter-creator-map');

  // Elements del formulari del creador
  const xmlCreatorForm = document.getElementById('xml-creator-form');
  const formTitol = document.getElementById('form-titol');
  const formImageFile = document.getElementById('form-image-file');
  const formFilename = document.getElementById('form-filename');
  const filePreviewCard = document.getElementById('file-preview-card');
  const imagePreviewThumb = document.getElementById('image-preview-thumb');
  const previewFilename = document.getElementById('preview-filename');
  const previewFilesize = document.getElementById('preview-filesize');
  const btnRemoveSelectedFile = document.getElementById('btn-remove-selected-file');
  const formAny = document.getElementById('form-any');
  const formExactYear = document.getElementById('form-exact-year');
  const formCategoria = document.getElementById('form-categoria');
  const formToponim = document.getElementById('form-toponim');
  const formCarrer = document.getElementById('form-carrer');
  const formDescripcio = document.getElementById('form-descripcio');
  const formTemes = document.getElementById('form-temes');
  const formPersonatges = document.getElementById('form-personatges');
  const formAlumneNom = document.getElementById('form-alumne-nom');
  const formAlumneCurs = document.getElementById('form-alumne-curs');
  const formDonant = document.getElementById('form-donant');
  const btnPreviewXmlAction = document.getElementById('btn-preview-xml-action');

  // Elements del modal de previsualització / descàrrega
  const xmlModal = document.getElementById('xml-modal');
  const xmlModalBackdrop = document.getElementById('xml-modal-backdrop');
  const btnCloseXmlModal = document.getElementById('btn-close-xml-modal');
  const btnModalCloseAction = document.getElementById('btn-modal-close-action');
  const btnCopyXmlText = document.getElementById('btn-copy-xml-text');
  const copyBtnText = document.getElementById('copy-btn-text');
  const xmlCodeDisplay = document.getElementById('xml-code-display');
  const xmlModalFilename = document.getElementById('xml-modal-filename');
  const xmlSuccessNotice = document.getElementById('xml-success-notice');
  const xmlNoticeImgName = document.getElementById('xml-notice-img-name');
  const btnModalDirectDownload = document.getElementById('btn-modal-direct-download');

  // Estat del Creador XML
  let creatorMap = null;
  let creatorMarker = null;
  let creatorSelectedCoords = null; // { lat, lng }
  let currentGeneratedXml = '';
  let currentGeneratedFilename = 'vr_fotografia.xml';

  // 13.1. Inicialització del mapa del Creador XML
  function initCreatorMap() {
    if (creatorMap) return;

    creatorMap = L.map('creator-map', {
      center: vilaRealCoords,
      zoom: 15,
      minZoom: 13,
      maxZoom: 19,
      maxBounds: mapBounds,
      maxBoundsViscosity: 0.9,
      zoomControl: false
    });

    L.control.zoom({ position: 'bottomright' }).addTo(creatorMap);

    const creatorTileLayers = {
      osm: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
      }),
      satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{x}/{y}', {
        attribution: 'Tiles &copy; Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN',
        maxZoom: 18
      })
    };

    let creatorCurrentLayer = creatorTileLayers.osm;
    creatorCurrentLayer.addTo(creatorMap);

    // Gestió del canvi de capes al mapa creador
    const creatorOsmBtn = document.getElementById('creator-layer-osm');
    const creatorSatBtn = document.getElementById('creator-layer-satellite');

    if (creatorOsmBtn && creatorSatBtn) {
      creatorOsmBtn.addEventListener('click', () => {
        creatorOsmBtn.classList.add('active');
        creatorSatBtn.classList.remove('active');
        creatorMap.removeLayer(creatorCurrentLayer);
        creatorCurrentLayer = creatorTileLayers.osm;
        creatorCurrentLayer.addTo(creatorMap);
      });

      creatorSatBtn.addEventListener('click', () => {
        creatorSatBtn.classList.add('active');
        creatorOsmBtn.classList.remove('active');
        creatorMap.removeLayer(creatorCurrentLayer);
        creatorCurrentLayer = creatorTileLayers.satellite;
        creatorCurrentLayer.addTo(creatorMap);
      });
    }

    // Event de clic sobre el mapa per establir la ubicació
    creatorMap.on('click', (e) => {
      setCreatorLocation(e.latlng.lat, e.latlng.lng);
    });
  }

  // 13.2. Establir i actualitzar la posició del punt al mapa
  function setCreatorLocation(lat, lng) {
    creatorSelectedCoords = {
      lat: Number(parseFloat(lat).toFixed(5)),
      lng: Number(parseFloat(lng).toFixed(5))
    };

    // Crear o moure el marcador
    if (!creatorMarker) {
      const pinIcon = L.divIcon({
        className: 'custom-creator-pin-wrap',
        html: `
          <div class="creator-pin-marker">
            <div class="pin-camera-bubble">
              <span>📷</span>
            </div>
            <div class="pin-pulse-wave"></div>
          </div>
        `,
        iconSize: [44, 48],
        iconAnchor: [22, 46]
      });

      creatorMarker = L.marker([lat, lng], {
        icon: pinIcon,
        draggable: true,
        title: 'Arrossega per ajustar la posició'
      }).addTo(creatorMap);

      creatorMarker.on('dragend', (e) => {
        const p = e.target.getLatLng();
        setCreatorLocation(p.lat, p.lng);
      });
    } else {
      creatorMarker.setLatLng([lat, lng]);
    }

    // Actualitzar caixa d'estat de coordenades
    displayLat.textContent = creatorSelectedCoords.lat.toFixed(5);
    displayLon.textContent = creatorSelectedCoords.lng.toFixed(5);
    coordsChipsRow.style.display = 'flex';
    coordsStatusBox.classList.add('has-coords');
    coordsDot.classList.add('active');
    coordsStateText.textContent = 'Ubicació fixada al mapa';
    coordsTipText.textContent = 'Arrossega el marcador per afinar la posició';

    // Actualitzar la burbuja d'instruccions interactiva (Pas 2)
    bubbleStepBadge.textContent = 'Pas 2 de 3';
    bubbleTitle.textContent = 'Ubicació seleccionada!';
    bubbleDesc.innerHTML = `Has marcat el punt en <strong>${creatorSelectedCoords.lat.toFixed(5)}, ${creatorSelectedCoords.lng.toFixed(5)}</strong>. Pots moure el marcador blau si vols ajustar-lo. Ara completa la informació de la teua fotografia al formulari de la dreta.`;

    bstep1.classList.add('done');
    bstep1.classList.remove('active');
    bstep2.classList.add('active');
  }

  // Botó de recentrar el mapa en la posició seleccionada
  if (btnRecenterCreatorMap) {
    btnRecenterCreatorMap.addEventListener('click', () => {
      if (creatorSelectedCoords && creatorMap) {
        creatorMap.flyTo([creatorSelectedCoords.lat, creatorSelectedCoords.lng], Math.max(creatorMap.getZoom(), 17), {
          duration: 0.6
        });
      }
    });
  }

  // 13.3. Obrir i Tancar l'Espai Creador XML
  function openXmlCreator() {
    xmlCreatorSpace.style.display = 'flex';
    xmlCreatorSpace.setAttribute('aria-hidden', 'false');

    initCreatorMap();

    // Forçar recalcul de mides per a Leaflet
    setTimeout(() => {
      if (creatorMap) {
        creatorMap.invalidateSize();
        if (creatorSelectedCoords) {
          creatorMap.setView([creatorSelectedCoords.lat, creatorSelectedCoords.lng], creatorMap.getZoom());
        }
      }
    }, 150);
  }

  function closeXmlCreator() {
    xmlCreatorSpace.style.display = 'none';
    xmlCreatorSpace.setAttribute('aria-hidden', 'true');

    // Forçar el mapa principal a recalcular mides
    setTimeout(() => {
      map.invalidateSize();
    }, 150);
  }

  if (btnOpenCreator) {
    btnOpenCreator.addEventListener('click', openXmlCreator);
  }

  if (btnCloseCreator) {
    btnCloseCreator.addEventListener('click', closeXmlCreator);
  }

  // 13.4. Gestió del fitxer d'imatge i vista prèvia
  if (formImageFile) {
    formImageFile.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      // Autocompletar nom de l'arxiu d'imatge
      formFilename.value = file.name;

      // Mostrar targeta de vista prèvia
      const reader = new FileReader();
      reader.onload = (event) => {
        imagePreviewThumb.src = event.target.result;
        previewFilename.textContent = file.name;
        previewFilesize.textContent = (file.size / 1024).toFixed(1) + ' KB';
        filePreviewCard.style.display = 'flex';
      };
      reader.readAsDataURL(file);

      // Si el títol està buit, suggerir un títol bonic basat en el nom
      if (!formTitol.value.trim()) {
        const cleanName = file.name
          .replace(/\.[^/.]+$/, '')
          .replace(/^vr_\d{4}_/, '')
          .replace(/[_-]+/g, ' ')
          .trim();
        if (cleanName) {
          formTitol.value = cleanName.charAt(0).toUpperCase() + cleanName.slice(1);
        }
      }
    });
  }

  if (btnRemoveSelectedFile) {
    btnRemoveSelectedFile.addEventListener('click', () => {
      formImageFile.value = '';
      filePreviewCard.style.display = 'none';
      imagePreviewThumb.src = '';
    });
  }

  // Suggeriment automàtic de nom de fitxer en escriure any i títol
  function updateSuggestedFilename() {
    if (formFilename.dataset.manualEdit === 'true') return;
    const year = formAny.value.trim();
    const titol = formTitol.value.trim();
    if (year && titol && !formImageFile.files[0]) {
      const slug = slugify(titol);
      formFilename.value = `vr_${year}_${slug}.jpg`;
    }
  }

  formTitol.addEventListener('input', updateSuggestedFilename);
  formAny.addEventListener('input', updateSuggestedFilename);
  formFilename.addEventListener('input', () => {
    formFilename.dataset.manualEdit = 'true';
  });

  // Funció auxiliar per crear un slug net
  function slugify(text) {
    return text
      .toString()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Elimina accents
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 30);
  }

  // 13.5. Construcció del contingut XML segons esquema.xsd
  function generateXmlData() {
    const titol = formTitol.value.trim();
    let filename = formFilename.value.trim();
    const anyVal = parseInt(formAny.value.trim(), 10);
    const isExact = formExactYear.checked;
    const categoria = formCategoria.value;
    const toponim = formToponim.value.trim();
    const carrer = formCarrer.value.trim();
    const descripcio = formDescripcio.value.trim();
    const temesRaw = formTemes.value.trim();
    const personatgesRaw = formPersonatges.value.trim();
    const alumneNom = formAlumneNom.value.trim();
    const alumneCurs = formAlumneCurs.value.trim();
    const donant = formDonant.value.trim();

    // Validacions bàsiques
    if (!creatorSelectedCoords) {
      alert('⚠️ Si us plau, fes clic primer sobre el mapa de Vila-real per seleccionar la ubicació on es va prendre la fotografia.');
      coordsStatusBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return null;
    }

    if (!titol) {
      alert('⚠️ Cal introduir el títol de la fotografia.');
      formTitol.focus();
      return null;
    }

    if (!filename) {
      alert("⚠️ Cal indicar el nom de l'arxiu d'imatge (per exemple: foto.jpg).");
      formFilename.focus();
      return null;
    }

    // Comprovar extensió d'imatge (.jpg, .jpeg, .png)
    if (!filename.match(/\.(jpg|jpeg|png)$/i)) {
      alert("⚠️ L'arxiu d'imatge ha de tenir una extensió vàlida: .jpg, .jpeg o .png");
      formFilename.focus();
      return null;
    }

    if (isNaN(anyVal) || anyVal < 1840 || anyVal > 2025) {
      alert("⚠️ L'any de la fotografia ha d'estar comprès entre 1840 i 2025.");
      formAny.focus();
      return null;
    }

    if (!categoria) {
      alert('⚠️ Selecciona una categoria per a la fotografia.');
      formCategoria.focus();
      return null;
    }

    if (!descripcio) {
      alert('⚠️ Cal introduir una descripció o context històric de la imatge.');
      formDescripcio.focus();
      return null;
    }

    if (!alumneNom) {
      alert("⚠️ Introdueix el teu nom i cognoms com a autor/a de l'entrega.");
      formAlumneNom.focus();
      return null;
    }

    if (!alumneCurs) {
      alert('⚠️ Introdueix el teu curs o grup (ex: 4t ESO B).');
      formAlumneCurs.focus();
      return null;
    }

    // Generació d'ID únic recomanat (ex: vr_1925_placa_major_01)
    const slugName = slugify(toponim || titol || 'foto');
    const photoId = `vr_${anyVal}_${slugName}_01`;
    currentGeneratedFilename = `vr_${anyVal}_${slugName}.xml`;

    // Processar etiquetes de temes
    let temesBlock = '';
    if (temesRaw) {
      const temesList = temesRaw.split(',').map(t => t.trim()).filter(Boolean);
      if (temesList.length > 0) {
        temesBlock = '  <temes>\n' +
          temesList.map(t => `    <tema>${escapeXml(t)}</tema>`).join('\n') +
          '\n  </temes>\n';
      }
    }

    // Processar etiquetes de personatges
    let personatgesBlock = '';
    if (personatgesRaw) {
      const persList = personatgesRaw.split(',').map(p => p.trim()).filter(Boolean);
      if (persList.length > 0) {
        personatgesBlock = '  <personatges>\n' +
          persList.map(p => `    <personatge>${escapeXml(p)}</personatge>`).join('\n') +
          '\n  </personatges>\n';
      }
    }

    // Processar camps opcionals
    const toponimXml = toponim ? `    <toponim_historic>${escapeXml(toponim)}</toponim_historic>\n` : '';
    const carrerXml = carrer ? `    <carrer_actual>${escapeXml(carrer)}</carrer_actual>\n` : '';
    const donantXml = donant ? `  <donant>${escapeXml(donant)}</donant>\n` : '';

    // Generació XML complet i indentat segons esquema.xsd
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!--
  MEMÒRIA VISUAL DE VILA-REAL
  Fitxer de dades catalogràfiques generat per a l'entrega de l'alumnat
-->
<fotografia>

  <!-- Identificador únic de la fotografia -->
  <id>${escapeXml(photoId)}</id>

  <!-- Títol descriptiu -->
  <titol>${escapeXml(titol)}</titol>

  <!-- Nom de l'arxiu d'imatge -->
  <arxiu_imatge>${escapeXml(filename)}</arxiu_imatge>

  <!-- Any i certesa -->
  <any exacte="${isExact}">${anyVal}</any>

  <!-- Categoria temàtica oficial -->
  <categoria>${escapeXml(categoria)}</categoria>

  <!-- Coordenades geogràfiques i toponímia -->
  <geolocalitzacio>
    <latitud>${creatorSelectedCoords.lat.toFixed(5)}</latitud>
    <longitud>${creatorSelectedCoords.lng.toFixed(5)}</longitud>
${toponimXml}${carrerXml}  </geolocalitzacio>

  <!-- Context històric -->
  <descripcio>${escapeXml(descripcio)}</descripcio>

${temesBlock}${personatgesBlock}  <!-- Dades de l'alumne/a -->
  <alumne>
    <nom>${escapeXml(alumneNom)}</nom>
    <curs>${escapeXml(alumneCurs)}</curs>
  </alumne>

${donantXml}</fotografia>
`;

    currentGeneratedXml = xml;
    return {
      xml: xml,
      filename: currentGeneratedFilename,
      imgName: filename
    };
  }

  // 13.6. Descàrrega directa de fitxer
  function downloadXmlFile(filename, content) {
    const blob = new Blob([content], { type: 'application/xml;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // 13.7. Enviament del formulari -> Descarregar XML
  xmlCreatorForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const data = generateXmlData();
    if (!data) return;

    // Descarregar fitxer al navegador de l'alumne
    downloadXmlFile(data.filename, data.xml);

    // Actualitzar la burbuja d'instruccions interactiva (Pas 3 - Èxit)
    bubbleStepBadge.textContent = 'Pas 3 de 3';
    bubbleTitle.textContent = 'Fitxer XML descarregat!';
    bubbleDesc.innerHTML = `S'ha descarregat <strong>${data.filename}</strong> al teu ordinador. Recorda guardar també la teua imatge (<strong>${escapeHtml(data.imgName)}</strong>) a la mateixa carpeta per a l'entrega escolar!`;

    bstep2.classList.add('done');
    bstep2.classList.remove('active');
    bstep3.classList.add('active', 'done');

    // Obrir modal amb missatge d'èxit i previsualització del codi
    openXmlModal(data.xml, data.filename, data.imgName, true);
  });

  // 13.8. Previsualització XML
  btnPreviewXmlAction.addEventListener('click', () => {
    const data = generateXmlData();
    if (!data) return;
    openXmlModal(data.xml, data.filename, data.imgName, false);
  });

  function openXmlModal(xmlContent, filename, imgName, isDownloaded) {
    xmlCodeDisplay.textContent = xmlContent;
    xmlModalFilename.textContent = filename;

    if (isDownloaded) {
      xmlSuccessNotice.style.display = 'flex';
      xmlNoticeImgName.textContent = imgName;
    } else {
      xmlSuccessNotice.style.display = 'none';
    }

    xmlModal.classList.add('active');
    xmlModal.setAttribute('aria-hidden', 'false');
  }

  function closeXmlModal() {
    xmlModal.classList.remove('active');
    xmlModal.setAttribute('aria-hidden', 'true');
  }

  btnCloseXmlModal.addEventListener('click', closeXmlModal);
  btnModalCloseAction.addEventListener('click', closeXmlModal);
  xmlModalBackdrop.addEventListener('click', closeXmlModal);

  // Botó de descàrrega directa des de dins del modal
  btnModalDirectDownload.addEventListener('click', () => {
    if (currentGeneratedXml) {
      downloadXmlFile(currentGeneratedFilename, currentGeneratedXml);
      xmlSuccessNotice.style.display = 'flex';
    }
  });

  // Copiar codi XML al portapapers
  btnCopyXmlText.addEventListener('click', () => {
    if (!currentGeneratedXml) return;
    navigator.clipboard.writeText(currentGeneratedXml).then(() => {
      copyBtnText.textContent = '✓ Copiat!';
      setTimeout(() => {
        copyBtnText.textContent = 'Copiar XML';
      }, 2000);
    }).catch(() => {
      copyBtnText.textContent = 'Error en copiar';
    });
  });

  // Tancar espai creador o modal amb ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (xmlModal.classList.contains('active')) {
        closeXmlModal();
      } else if (xmlCreatorSpace.style.display === 'flex') {
        closeXmlCreator();
      }
    }
  });

});

