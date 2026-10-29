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

});
