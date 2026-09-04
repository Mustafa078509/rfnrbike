/* RFN Parts Database Sync
   Loads part price, inventory, catalog section metadata and images from Supabase.
   Existing catalog layout remains intact.
*/
(function () {
  'use strict';
  const API_URL = '/.netlify/functions/store-products?product_type=part';

  const normalizeCode = (value) => String(value || '').trim().replace(/\s+/g, '').replace(/\.0$/, '').toUpperCase();
  const normalizeKey = (value) => String(value || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const normalizeBikeIdentity = (value) => String(value || '')
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/\b(rfn|usa|warrior|ares|parts|catalog|official)\b/g, '')
    .replace(/[^a-z0-9]+/g, '');
  const money = (value) => `$${Number(value || 0).toFixed(2)}`;

  function installCatalogLayout() {
    if (document.getElementById('rfnCatalogLayoutV11')) return;
    const style = document.createElement('style');
    style.id = 'rfnCatalogLayoutV11';
    style.textContent = `
      section.section, .section{
        padding:56px 20px 64px!important;
        border-bottom:1px solid #e4e4e7!important;
      }
      section.section>.container, .section>.container{
        width:100%!important;max-width:1240px!important;margin:0 auto!important;padding:0!important;
      }
      section.section .section-header, .section .section-header{
        display:flex!important;flex-direction:column!important;gap:24px!important;
        align-items:stretch!important;margin-bottom:28px!important;
      }
      section.section .section-title, .section .section-title{
        max-width:none!important;font-size:clamp(36px,5vw,62px)!important;
        line-height:.95!important;letter-spacing:3px!important;text-transform:uppercase!important;
      }
      section.section .section-img, .section .section-img{
        display:block!important;width:100%!important;height:clamp(360px,52vw,650px)!important;
        max-height:650px!important;margin:0!important;padding:18px!important;
        object-fit:contain!important;object-position:center!important;
        background:#f4f4f5!important;border:1px solid #dedee3!important;
        border-radius:18px!important;filter:none!important;cursor:zoom-in!important;
        box-shadow:0 12px 35px rgba(0,0,0,.07)!important;
      }
      section.section .parts-grid, .section .parts-grid{
        display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr))!important;
        gap:10px!important;width:100%!important;
      }
      .rfn-diagram-lightbox{
        position:fixed;inset:0;z-index:100000;display:none;align-items:center;justify-content:center;
        padding:24px;background:rgba(0,0,0,.88);cursor:zoom-out;
      }
      .rfn-diagram-lightbox.is-open{display:flex}
      .rfn-diagram-lightbox img{
        width:min(1500px,96vw);height:92vh;object-fit:contain;background:#fff;border-radius:14px;
      }
      @media(max-width:900px){
        section.section .parts-grid,.section .parts-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
        section.section .section-img,.section .section-img{height:clamp(320px,65vw,500px)!important;padding:10px!important}
      }
      @media(max-width:560px){
        section.section,.section{padding:38px 12px 46px!important}
        section.section .parts-grid,.section .parts-grid{grid-template-columns:1fr!important}
        section.section .section-img,.section .section-img{height:330px!important;padding:6px!important}
      }
    `;
    document.head.appendChild(style);

    const lightbox = document.createElement('div');
    lightbox.className = 'rfn-diagram-lightbox';
    lightbox.setAttribute('role', 'dialog');
    lightbox.setAttribute('aria-label', 'Expanded parts diagram');
    lightbox.innerHTML = '<img alt="Expanded parts diagram">';
    document.body.appendChild(lightbox);
    document.addEventListener('click', event => {
      const diagram = event.target.closest?.('.section-img');
      if (diagram?.src) {
        lightbox.querySelector('img').src = diagram.src;
        lightbox.classList.add('is-open');
      } else if (event.target.closest?.('.rfn-diagram-lightbox')) {
        lightbox.classList.remove('is-open');
      }
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') lightbox.classList.remove('is-open');
    });
  }

  const DIAGRAM_PART_NUMBERS = {
    '301052015001': 1,
    '318001002002': 2,
    '403033002001': 3,
    '308059011001': 4,
    '308002029201': 5,
    '308058011001': 6,
    '318001033001': 7,
    'E15-LINK-01': 1,
    'E15-LINK-02': 2,
    'E15-LINK-03': 3,
    'E15-LINK-04': 4,
    'E15-LINK-05': 5,
    '401010012001': 6,
    '401010011001': 7,
    'E15-LINK-08': 8,
    'E15-LINK-09': 9,
    'E15-LINK-10': 10,
    'E15-LINK-11': 11,
    '404005010001': 12,
  };

  function ensureImageStyles() {
    if (document.getElementById('rfnPartImageStyles')) return;
    const style = document.createElement('style');
    style.id = 'rfnPartImageStyles';
    style.textContent = `
      .rfn-part-preview{
        position:fixed;z-index:99999;width:min(320px,calc(100vw - 28px));
        background:rgba(255,255,255,.98);border:1px solid rgba(0,0,0,.12);
        border-radius:16px;padding:10px;box-shadow:0 20px 55px rgba(0,0,0,.28);
        opacity:0;visibility:hidden;pointer-events:none;
        transform:translateY(12px) scale(.94);
        transition:opacity .18s ease,transform .22s cubic-bezier(.2,.8,.2,1),visibility .18s;
        backdrop-filter:blur(8px)
      }
      .rfn-part-preview.is-visible{opacity:1;visibility:visible;transform:translateY(0) scale(1)}
      .rfn-part-preview img{display:block;width:100%;height:230px;object-fit:contain;background:#fff;border-radius:11px}
      .rfn-part-preview-title{font:700 13px/1.3 system-ui;margin:8px 4px 2px;color:#171717;text-align:center}
      .part-card[data-part-image]{cursor:pointer}
      @media (max-width:700px){
        .rfn-part-preview{width:min(280px,calc(100vw - 20px))}
        .rfn-part-preview img{height:200px}
      }
    `;
    document.head.appendChild(style);
  }

  function getPreview() {
    ensureImageStyles();
    let preview = document.getElementById('rfnPartPreview');
    if (!preview) {
      preview = document.createElement('div');
      preview.id = 'rfnPartPreview';
      preview.className = 'rfn-part-preview';
      preview.innerHTML = '<img alt="Part preview"><div class="rfn-part-preview-title"></div>';
      document.body.appendChild(preview);
    }
    return preview;
  }

  function positionPreview(card, preview) {
    const rect = card.getBoundingClientRect();
    const gap = 12;
    const width = preview.offsetWidth || 320;
    const height = preview.offsetHeight || 280;
    let left = rect.left + (rect.width - width) / 2;
    left = Math.max(10, Math.min(left, window.innerWidth - width - 10));
    let top = rect.top - height - gap;
    if (top < 10) top = rect.bottom + gap;
    if (top + height > window.innerHeight - 10) top = Math.max(10, window.innerHeight - height - 10);
    preview.style.left = `${left}px`;
    preview.style.top = `${top}px`;
  }

  function showPartPreview(card) {
    const url = card?.dataset?.partImage;
    if (!url) return;
    const preview = getPreview();
    const img = preview.querySelector('img');
    const title = preview.querySelector('.rfn-part-preview-title');
    img.src = url;
    img.alt = `${card.querySelector('.part-name')?.textContent || 'Part'} image`;
    title.textContent = card.querySelector('.part-name')?.textContent || 'Part';
    preview.classList.add('is-visible');
    requestAnimationFrame(() => positionPreview(card, preview));
  }

  function hidePartPreview() {
    document.getElementById('rfnPartPreview')?.classList.remove('is-visible');
  }

  function installPreviewEvents() {
    if (document.documentElement.dataset.rfnPreviewEvents === 'true') return;
    document.documentElement.dataset.rfnPreviewEvents = 'true';
    document.addEventListener('mouseover', (event) => {
      const card = event.target.closest?.('.part-card[data-part-image], .part-row[data-part-image]');
      if (card && !card.contains(event.relatedTarget)) showPartPreview(card);
    });
    document.addEventListener('mouseout', (event) => {
      const card = event.target.closest?.('.part-card[data-part-image], .part-row[data-part-image]');
      if (card && !card.contains(event.relatedTarget)) hidePartPreview();
    });
    document.addEventListener('focusin', (event) => {
      const card = event.target.closest?.('.part-card[data-part-image], .part-row[data-part-image]');
      if (card) showPartPreview(card);
    });
    document.addEventListener('focusout', hidePartPreview);
    document.addEventListener('click', (event) => {
      const card = event.target.closest?.('.part-card[data-part-image], .part-row[data-part-image]');
      if (!card || event.target.closest('button,a,input,select,textarea')) return;
      if (window.matchMedia('(hover: none)').matches) {
        const preview = getPreview();
        if (preview.classList.contains('is-visible')) hidePartPreview();
        else showPartPreview(card);
      }
    });
    window.addEventListener('scroll', hidePartPreview, { passive:true });
    window.addEventListener('resize', hidePartPreview);
  }

  function setStatus(card, product) {
    const stock = Math.max(0, Number(product.stock_quantity || 0));
    const threshold = Math.max(0, Number(product.low_stock_threshold || 0));
    let tag = card.querySelector('.stock-tag');
    if (!tag) {
      tag = document.createElement('span');
      tag.className = 'stock-tag';
      card.prepend(tag);
    }
    tag.classList.remove('stock-ok', 'stock-low', 'stock-out');
    if (stock <= 0) {
      tag.textContent = 'Out of Stock';
      tag.classList.add('stock-out');
    } else if (stock <= threshold) {
      tag.textContent = `Low Stock (${stock})`;
      tag.classList.add('stock-low');
    } else {
      tag.textContent = `In Stock (${stock})`;
      tag.classList.add('stock-ok');
    }
    const button = card.querySelector('.add-btn');
    if (button) {
      button.disabled = stock <= 0;
      button.dataset.outOfStock = stock <= 0 ? 'true' : 'false';
      button.textContent = stock <= 0 ? 'Out of Stock' : 'Add to Cart';
      button.setAttribute('aria-disabled', stock <= 0 ? 'true' : 'false');
    }
  }

  function setPartImage(card, url) {
    if (!url) {
      delete card.dataset.partImage;
      return;
    }
    ensureImageStyles();
    installPreviewEvents();
    card.dataset.partImage = url;
    card.setAttribute('aria-label', `${card.querySelector('.part-name')?.textContent || 'Part'} — hover to preview image`);
  }

  function updateSectionFromProduct(card, product) {
    const section = card.closest('section.section, .section');
    if (!section) return;
    if (product.section_key) section.dataset.sectionKey = product.section_key;
    if (product.section_name) section.dataset.sectionName = product.section_name;
  }

  function updateCard(card, product) {
    const dealer = Number(product.dealer_price || 0);
    const retail = Number(product.retail_price || 0);
    card.dataset.productId = product.id || '';
    card.dataset.stockQuantity = String(Math.max(0, Number(product.stock_quantity || 0)));
    card.dataset.dealerPrice = String(dealer);
    card.dataset.retailPrice = String(retail);
    card.dataset.sectionKey = product.section_key || '';

    const name = card.querySelector('.part-name');
    if (name && product.name) name.textContent = product.name;
    const code = card.querySelector('.part-code');
    if (code && product.part_number) code.textContent = product.part_number;
    const dealerNode = card.querySelector('.dealer-price');
    if (dealerNode) dealerNode.textContent = money(dealer);
    const retailNode = card.querySelector('.retail-price');
    if (retailNode) retailNode.textContent = money(retail);

    setPartImage(card, product.image_url || '');
    updateSectionFromProduct(card, product);
    setStatus(card, product);
  }

  function deriveSectionKey(section) {
    if (!section) return '';
    if (section.dataset.sectionKey) return section.dataset.sectionKey;
    const span = section.querySelector('.section-title span')?.textContent || '';
    const number = span.match(/\d+/)?.[0];
    if (number) return number.padStart(2, '0');
    const idNumber = String(section.id || '').match(/(\d+)/)?.[1];
    if (idNumber) return idNumber.padStart(2, '0');
    const raw = section.querySelector('.section-title')?.textContent || '';
    return normalizeKey(raw);
  }

  function deriveSectionName(section) {
    if (!section) return '';
    if (section.dataset.sectionName) return section.dataset.sectionName;
    const title = section.querySelector('.section-title');
    if (!title) return '';
    const clone = title.cloneNode(true);
    clone.querySelector('span')?.remove();
    return clone.textContent.trim();
  }

  // Fix legacy pages whose printed section numbers are duplicated or stale
  // (the E15 page previously had two section 08 headings). Match the section
  // by its database name first, then use the printed key only as a fallback.
  function primeSectionIdentities(settings, bikeId) {
    if (!bikeId) return;
    const bikeSettings = (settings || []).filter(setting => setting.bike_id === bikeId);
    const claimed = new Set();
    const sections = [...document.querySelectorAll('section.section, .section')];

    // First reserve every exact name match. This prevents an earlier legacy
    // section with a duplicated number from stealing a later correct section.
    sections.forEach((section) => {
      const nameKey = normalizeKey(deriveSectionName(section));
      const setting = bikeSettings.find(item =>
        !claimed.has(item) && normalizeKey(item.section_name) === nameKey
      );
      if (!setting) return;
      claimed.add(setting);
      section.dataset.sectionKey = String(setting.section_key || deriveSectionKey(section)).padStart(2, '0');
      section.dataset.sectionName = setting.section_name || deriveSectionName(section);
    });

    sections.forEach((section) => {
      if (section.dataset.sectionName) return;
      const printedKey = String(deriveSectionKey(section) || '').padStart(2, '0');
      const setting = bikeSettings.find(item =>
          !claimed.has(item) && String(item.section_key || '').padStart(2, '0') === printedKey
      );
      if (!setting) return;
      claimed.add(setting);
      section.dataset.sectionKey = String(setting.section_key || printedKey).padStart(2, '0');
      section.dataset.sectionName = setting.section_name || deriveSectionName(section);
    });
  }

  function applySectionSettings(settings, bikeId) {
    if (!bikeId) return;
    const bikeSettings = (settings || []).filter(s => s.bike_id === bikeId);
    const byKey = new Map(bikeSettings.map(s => [String(s.section_key || '').padStart(2, '0'), s]));
    const byName = new Map(bikeSettings.map(s => [normalizeKey(s.section_name), s]));
    document.querySelectorAll('section.section, .section').forEach((section) => {
      const key = deriveSectionKey(section);
      const sectionName = deriveSectionName(section);
      const setting = byName.get(normalizeKey(sectionName)) || (!sectionName ? byKey.get(key) : null);
      if (!setting) return;
      section.dataset.sectionKey = setting.section_key || key;
      section.dataset.sectionName = setting.section_name || '';
      if (setting.section_name) {
        const title = section.querySelector('.section-title');
        const number = title?.querySelector('span');
        if (title) {
          [...title.childNodes].forEach(node => { if (node !== number) node.remove(); });
          title.appendChild(document.createTextNode(setting.section_name));
        }
      }
      if (setting.diagram_image_url) {
        const img = section.querySelector('.section-img');
        if (img) { img.src = setting.diagram_image_url; img.dataset.dbDiagramApplied = 'true'; }
      }
    });
  }

  function ensureDatabaseSections(settings, bikeId, products) {
    const definitions = new Map();
    (settings || []).filter(item => item.bike_id === bikeId).forEach(item => {
      const key = String(item.section_key || '').padStart(2, '0');
      if (key) definitions.set(key, item);
    });
    (products || []).forEach(product => {
      const key = String(product.section_key || '00').padStart(2, '0');
      if (!definitions.has(key)) definitions.set(key, {
        section_key:key,
        section_name:product.section_name || (key === '00' ? 'UNASSIGNED PARTS' : `SECTION ${key}`),
        diagram_image_url:product.diagram_image_url || ''
      });
    });

    const lastSection = [...document.querySelectorAll('section.section, .section')].at(-1);
    definitions.forEach((definition, key) => {
      const exists = [...document.querySelectorAll('section.section, .section')]
        .some(section => String(deriveSectionKey(section)).padStart(2, '0') === key);
      if (exists) return;
      const section = document.createElement('section');
      section.className = 'section';
      section.dataset.sectionKey = key;
      section.dataset.sectionName = definition.section_name || '';
      section.innerHTML = `
        <div class="container">
          <div class="section-header">
            <div><div class="section-title"><span>${key} / Parts</span>${definition.section_name || `SECTION ${key}`}</div></div>
            ${definition.diagram_image_url ? `<img class="section-img" src="${definition.diagram_image_url}" alt="${definition.section_name || key} Diagram" loading="lazy">` : ''}
          </div>
          <div class="parts-grid"></div>
        </div>`;
      if (lastSection?.parentNode) lastSection.parentNode.insertBefore(section, lastSection.nextSibling);
      else (document.querySelector('main') || document.body).appendChild(section);
    });
  }

  function createDatabaseCard(product, fallbackNumber) {
    const card = document.createElement('div');
    card.className = 'part-card';
    card.dataset.dbGenerated = 'true';
    const databaseNumber = Number(product.diagram_number);
    const diagramNumber = (Number.isFinite(databaseNumber) && databaseNumber > 0)
      ? databaseNumber
      : (DIAGRAM_PART_NUMBERS[normalizeCode(product.part_number)] || fallbackNumber);
    card.innerHTML = `
      <span class="stock-tag"></span>
      <div class="part-num">#${diagramNumber}</div>
      <div class="part-name"></div>
      <div class="part-code"></div>
      <div class="part-prices">
        <div class="price-box"><div class="price-label">Retail</div><div class="retail-price"></div></div>
        <div class="price-box"><div class="price-label">Dealer</div><div class="dealer-price"></div></div>
      </div>
      <button type="button" class="add-btn">Add to Cart</button>`;
    updateCard(card, product);
    return card;
  }

  function renderAllDatabaseParts(products) {
    const grids = [...document.querySelectorAll('section.section .parts-grid, .section .parts-grid')];
    grids.forEach(grid => { grid.innerHTML = ''; });
    const counters = new Map();
    let rendered = 0;
    [...products]
      .sort((a, b) => {
        const sectionOrder = String(a.section_key || '00').localeCompare(String(b.section_key || '00'), undefined, { numeric:true });
        if (sectionOrder) return sectionOrder;
        const aNumber = Number(a.diagram_number) > 0 ? Number(a.diagram_number) : Number.MAX_SAFE_INTEGER;
        const bNumber = Number(b.diagram_number) > 0 ? Number(b.diagram_number) : Number.MAX_SAFE_INTEGER;
        return aNumber - bNumber || String(a.name || '').localeCompare(String(b.name || ''));
      })
      .forEach(product => {
        const key = String(product.section_key || '00').padStart(2, '0');
        const allSections = [...document.querySelectorAll('section.section, .section')];
        const wantedName = normalizeKey(product.section_name);
        const section = (wantedName && allSections.find(item => normalizeKey(deriveSectionName(item)) === wantedName))
          || allSections.find(item => String(deriveSectionKey(item)).padStart(2, '0') === key);
        const grid = section?.querySelector('.parts-grid');
        if (!grid) return;
        const number = (counters.get(key) || 0) + 1;
        counters.set(key, number);
        grid.appendChild(createDatabaseCard(product, number));
        rendered += 1;
      });
    return rendered;
  }

  function addDatabaseNotice(message, isError) {
    const target = document.querySelector('.catalog-shell, .parts-grid, main');
    if (!target || document.getElementById('partsDatabaseNotice')) return;
    const notice = document.createElement('div');
    notice.id = 'partsDatabaseNotice';
    notice.textContent = message;
    notice.style.cssText = `margin:12px 0;padding:10px 14px;border-radius:8px;font:600 13px/1.4 system-ui;${isError ? 'background:#fff1f1;color:#9d1717;border:1px solid #efb4b4' : 'background:#eef8f0;color:#17652d;border:1px solid #b9dec2'}`;
    target.prepend(notice);
    if (!isError) setTimeout(() => notice.remove(), 2500);
  }

  async function syncParts() {
    try {
      installCatalogLayout();
      const response = await fetch(API_URL, { method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store' });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
      const products = Array.isArray(payload.products) ? payload.products : [];

      // Select the bike for this page before matching part numbers. The same
      // part number can exist on several bikes, so a global by-code map mixes
      // images, prices and sections between catalogs.
      const pageCards = [...document.querySelectorAll('.part-card, .part-row')];
      const pageCodes = new Set(pageCards.map(card => normalizeCode(card.querySelector('.part-code')?.textContent)).filter(Boolean));
      const pageIdentity = normalizeBikeIdentity(`${document.title} ${document.querySelector('h1')?.textContent || ''}`);
      const bikes = Array.isArray(payload.bikes) ? payload.bikes : [];
      const bikeLabels = new Map(bikes.map(bike => [bike.id, bike.name || bike.bike || bike.slug || '']));
      const bikeScores = new Map();

      products.forEach(product => {
        if (!product.bike_id || !pageCodes.has(normalizeCode(product.part_number))) return;
        bikeScores.set(product.bike_id, (bikeScores.get(product.bike_id) || 0) + 1000);
      });
      bikes.forEach(bike => {
        const identity = normalizeBikeIdentity(bike.name || bike.bike || bike.slug || '');
        if (identity && pageIdentity.includes(identity)) {
          // Prefer the longest bike identity on the page (SX-E500 over SX-E5).
          bikeScores.set(bike.id, (bikeScores.get(bike.id) || 0) + 1000000 + (identity.length * 10000));
        }
      });

      const currentBikeId = [...bikeScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
      const currentBikeLabel = bikeLabels.get(currentBikeId) || '';
      const currentBikeIdentity = normalizeBikeIdentity(currentBikeLabel);
      const currentBikeProducts = currentBikeId
        ? products.filter(product =>
            product.bike_id === currentBikeId ||
            (!product.bike_id && currentBikeIdentity && normalizeBikeIdentity(product.bike) === currentBikeIdentity)
          )
        : products.filter(product => {
            const identity = normalizeBikeIdentity(product.bike);
            return identity && pageIdentity.includes(identity);
          });

      // Never erase the saved catalog when a legacy database row cannot be
      // associated with this bike. Keep the page usable and report the issue.
      if (!currentBikeProducts.length) {
        throw new Error('No inventory rows are linked to this bike. Check bike_id or bike_model.');
      }
      ensureDatabaseSections(payload.sections || [], currentBikeId, currentBikeProducts);
      primeSectionIdentities(payload.sections || [], currentBikeId);
      applySectionSettings(payload.sections || [], currentBikeId);

      // Database-first rendering: every inventory row is shown. There is no
      // dependency on a matching static HTML card, image, price or stock level.
      const databaseRendered = renderAllDatabaseParts(currentBikeProducts);
      if (!databaseRendered) throw new Error('Inventory rows were returned but could not be rendered.');
      document.documentElement.dataset.partsDatabase = 'connected';
      window.dispatchEvent(new CustomEvent('rfn:parts-synced', {
        detail: { matched:databaseRendered, total:currentBikeProducts.length, bikeId:currentBikeId, bikeName:currentBikeLabel }
      }));
      addDatabaseNotice(`Inventory connected — ${databaseRendered} parts loaded from database.`, false);
      return;

      const byCode = new Map();
      currentBikeProducts.forEach((product) => {
        const key = normalizeCode(product.part_number);
        if (key && !byCode.has(key)) byCode.set(key, product);
      });

      let matched = 0;
      const matchedProductIds = new Set();
      const unusedCards = [];
      pageCards.forEach((card) => {
        const code = normalizeCode(card.querySelector('.part-code')?.textContent);
        const product = byCode.get(code);
        if (!product) {
          card.style.display = 'none';
          unusedCards.push(card);
          return;
        }
        const cardSectionKey = deriveSectionKey(card.closest('section.section, .section'));
        const productSectionKey = String(product.section_key || '').padStart(2, '0');
        if ((productSectionKey && cardSectionKey !== productSectionKey) ||
            (product.id && matchedProductIds.has(product.id))) {
          card.style.display = 'none';
          unusedCards.push(card);
          return;
        }
        if (!product.section_key) product.section_key = deriveSectionKey(card.closest('section.section, .section'));
        updateCard(card, product);
        if (product.id) matchedProductIds.add(product.id);
        matched += 1;
      });

      // Replace old placeholder cards (for example code "/") with database
      // products that belong to the section but have no valid static card.
      currentBikeProducts
        .filter(product => !product.id || !matchedProductIds.has(product.id))
        .forEach(product => {
          const sectionKey = String(product.section_key || '').padStart(2, '0');
          const desiredNumber = DIAGRAM_PART_NUMBERS[normalizeCode(product.part_number)];
          let card = unusedCards.find(candidate => {
            const section = candidate.closest('section.section, .section');
            if (deriveSectionKey(section) !== sectionKey) return false;
            if (!desiredNumber) return true;
            const shown = Number(candidate.querySelector('.part-num')?.textContent.match(/\d+/)?.[0] || 0);
            return shown === desiredNumber;
          });
          if (!card) {
            card = unusedCards.find(candidate => deriveSectionKey(candidate.closest('section.section, .section')) === sectionKey);
          }
          if (!card) {
            const section = [...document.querySelectorAll('section.section, .section')]
              .find(candidate => deriveSectionKey(candidate) === sectionKey);
            const grid = section?.querySelector('.parts-grid');
            if (!grid) return;
            card = document.createElement('div');
            card.className = 'part-card';
            card.dataset.dbGenerated = 'true';
            card.innerHTML = `
              <span class="stock-tag"></span>
              <div class="part-num"></div>
              <div class="part-name"></div>
              <div class="part-code"></div>
              <div class="part-prices">
                <div class="price-box"><div class="price-label">Retail</div><div class="retail-price"></div></div>
                <div class="price-box"><div class="price-label">Dealer</div><div class="dealer-price"></div></div>
              </div>
              <button type="button" class="add-btn">Add to Cart</button>`;
            grid.appendChild(card);
          } else {
            unusedCards.splice(unusedCards.indexOf(card), 1);
          }
          if (desiredNumber) {
            const numberNode = card.querySelector('.part-num');
            if (numberNode) numberNode.textContent = `#${desiredNumber}`;
          }
          updateCard(card, product);
          if (product.id) matchedProductIds.add(product.id);
          matched += 1;
        });

      if (matched === 0) {
        pageCards.forEach(card => { card.style.display = ''; });
        throw new Error('Inventory returned rows, but none matched this page part numbers or sections.');
      }

      applySectionSettings(payload.sections || [], currentBikeId);

      document.documentElement.dataset.partsDatabase = 'connected';
      window.dispatchEvent(new CustomEvent('rfn:parts-synced', { detail: { matched, total: currentBikeProducts.length, bikeId: currentBikeId, bikeName: bikeLabels.get(currentBikeId) || '' } }));
      addDatabaseNotice(`Inventory connected — ${matched} parts updated from database.`, false);
    } catch (error) {
      console.error('RFN parts database sync failed:', error);
      document.documentElement.dataset.partsDatabase = 'offline';
      addDatabaseNotice('Database connection failed. Catalog is showing saved page data.', true);
    }
  }

  document.addEventListener('click', (event) => {
    const generatedButton = event.target.closest('.part-card[data-db-generated="true"] .add-btn');
    if (generatedButton) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (generatedButton.disabled) return;
      const card = generatedButton.closest('.part-card');
      const name = card.querySelector('.part-name')?.textContent.trim() || 'RFN Part';
      const code = card.querySelector('.part-code')?.textContent.trim() || '';
      const dealerPrice = Number(card.dataset.dealerPrice || 0);
      const retailPrice = Number(card.dataset.retailPrice || 0);
      let cart = [];
      try { cart = JSON.parse(localStorage.getItem('rfnCart') || '[]'); } catch (_) {}
      if (!Array.isArray(cart)) cart = [];
      const id = `${card.dataset.productId || code || name}`;
      const existing = cart.find(item => String(item.productId || item.id) === id);
      if (existing) existing.qty = Number(existing.qty || 1) + 1;
      else cart.push({ id, productId:card.dataset.productId || '', name, code, price:dealerPrice, dealerPrice, retailPrice, qty:1 });
      localStorage.setItem('rfnCart', JSON.stringify(cart));
      document.querySelectorAll('.cart-count').forEach(el => el.textContent = cart.reduce((sum,item)=>sum+Number(item.qty||1),0));
      const old = generatedButton.textContent;
      generatedButton.textContent = 'Added ✓';
      setTimeout(() => { generatedButton.textContent = old || 'Add to Cart'; }, 900);
      return;
    }
    const button = event.target.closest('.add-btn');
    if (!button || button.dataset.outOfStock !== 'true') return;
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.add-btn');
    if (!button || button.disabled) return;
    const card = button.closest('.part-card, .part-row');
    if (!card?.dataset.productId) return;
    setTimeout(() => {
      try {
        const cart = JSON.parse(localStorage.getItem('rfnCart') || '[]');
        if (!Array.isArray(cart)) return;
        const code = card.querySelector('.part-code')?.textContent.trim() || '';
        const item = [...cart].reverse().find((row) => String(row.code || '').trim() === code);
        if (item) {
          item.productId = card.dataset.productId;
          item.stockQuantity = Number(card.dataset.stockQuantity || 0);
          localStorage.setItem('rfnCart', JSON.stringify(cart));
        }
      } catch (error) {
        console.warn('Could not attach database product ID to cart item.', error);
      }
    }, 0);
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncParts, { once: true });
  else syncParts();
})();
