(function (window, document) {
  'use strict';

  var DataApi = window.FlowThreeData;
  if (!DataApi) {
    console.error('FlowThreeData is not available.');
    return;
  }

  var STORAGE_KEY = DataApi.STORAGE_KEY;
  var FLOW_TWO_STORAGE_KEY = 'flowTwo.scannedItems.v1';

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-page');

    if (page === 'flow-three') {
      initFlowThreePage();
      return;
    }

    if (page === 'flow-two') {
      initFlowTwoPage();
      return;
    }

    if (page === 'flow-three-scanner') {
      initFlowThreeScannerPage();
      return;
    }

    if (page === 'summary') {
      initSummaryPage();
    }
  });

  function safeParseJSON(text) {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  }

  function toSafeInt(value, fallbackValue) {
    var parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed)) {
      return fallbackValue;
    }

    return parsed;
  }

  function toSafeNumber(value, fallbackValue) {
    var parsed = Number(value);
    if (!Number.isFinite(parsed)) {
      return fallbackValue;
    }

    return parsed;
  }

  function escapeHTML(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function isTicketCounted(ticket) {
    return ticket.quantity !== null && ticket.quantity !== undefined;
  }

  function normalizeTicket(ticket, index) {
    var gameIdDigits = DataApi.digitsOnly(ticket.gameId);
    var gameId = gameIdDigits ? String(parseInt(gameIdDigits, 10)).padStart(3, '0') : '000';

    var bundleDigits = DataApi.digitsOnly(ticket.bundleId);
    var bundleId = bundleDigits ? String(parseInt(bundleDigits, 10)) : '0';

    var unitPrice = toSafeNumber(ticket.unitPrice, 0);
    if (unitPrice < 0) {
      unitPrice = 0;
    }

    var unitsPerBundle = toSafeInt(ticket.unitsPerBundle, 0);
    if (unitsPerBundle < 0) {
      unitsPerBundle = 0;
    }

    var quantity = ticket.quantity;
    if (quantity === '' || quantity === undefined) {
      quantity = null;
    }

    if (quantity !== null) {
      quantity = toSafeInt(quantity, 0);
      if (quantity < 0) {
        quantity = 0;
      }
      if (unitsPerBundle > 0 && quantity > unitsPerBundle) {
        quantity = unitsPerBundle;
      }
    }

    return {
      id: ticket.id || gameId + '-' + bundleId + '-' + String(index + 1),
      gameId: gameId,
      bundleId: bundleId,
      gameTitle: String(ticket.gameTitle || 'Game Title'),
      unitPrice: unitPrice,
      unitsPerBundle: unitsPerBundle,
      bundlePrice: toSafeNumber(ticket.bundlePrice, 0),
      quantity: quantity,
      totalPrice: quantity === null ? 0 : quantity * unitPrice,
      updatedBy: ticket.updatedBy || null,
      lastScannedCode: ticket.lastScannedCode || '',
      lastUpdatedAt: ticket.lastUpdatedAt || ''
    };
  }

  function normalizeState(rawState) {
    if (!rawState) {
      return null;
    }

    var source = rawState;
    if (Array.isArray(source)) {
      source = { tickets: source };
    }

    if (!source || !Array.isArray(source.tickets) || !source.tickets.length) {
      return null;
    }

    return {
      version: toSafeInt(source.version, 1),
      updatedAt: source.updatedAt || '',
      tickets: source.tickets.map(function (ticket, index) {
        return normalizeTicket(ticket, index);
      })
    };
  }

  function readStateFromStorage() {
    var raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeState(safeParseJSON(raw));
  }

  function writeStateToStorage(state) {
    var nextState = {
      version: state.version || 1,
      tickets: state.tickets,
      updatedAt: new Date().toISOString()
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
    return nextState;
  }

  async function getOrCreateState() {
    var state = readStateFromStorage();
    if (state) {
      return state;
    }

    var seedTickets = await DataApi.loadSeedTickets();
    var initialState = {
      version: 1,
      tickets: seedTickets.map(function (ticket, index) {
        return normalizeTicket(ticket, index);
      }),
      updatedAt: new Date().toISOString()
    };

    return writeStateToStorage(initialState);
  }

  function findTicketById(tickets, ticketId) {
    for (var i = 0; i < tickets.length; i += 1) {
      if (tickets[i].id === ticketId) {
        return tickets[i];
      }
    }
    return null;
  }

  function countTickets(tickets) {
    var counted = 0;
    var uncounted = 0;

    tickets.forEach(function (ticket) {
      if (isTicketCounted(ticket)) {
        counted += 1;
      } else {
        uncounted += 1;
      }
    });

    return {
      counted: counted,
      uncounted: uncounted,
      total: tickets.length
    };
  }

  function formatQuantity(quantity) {
    if (quantity === null || quantity === undefined) {
      return '000';
    }

    return DataApi.pad(quantity, 3);
  }

  function formatPrice(price) {
    return DataApi.pad(price, 2);
  }

  function formatTotal(totalValue, isUncounted) {
    if (isUncounted) {
      return '0000';
    }

    return DataApi.pad(totalValue, 4);
  }

  function formatSummaryAmount(value) {
    var safeValue = toSafeNumber(value, 0);
    if (safeValue < 0) {
      safeValue = 0;
    }

    return String(Math.round(safeValue).toLocaleString('en-US'));
  }

  function bindPseudoButton(element, onActivate) {
    if (!element) {
      return;
    }

    element.addEventListener('click', onActivate);
    element.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onActivate();
      }
    });
  }

  function normalizeFlowTwoItem(item, index) {
    var gameIdDigits = DataApi.digitsOnly(item.gameId);
    var gameId = gameIdDigits ? String(parseInt(gameIdDigits, 10)).padStart(3, '0') : '000';

    var bundleDigits = DataApi.digitsOnly(item.bundleId);
    var bundleId = bundleDigits ? String(parseInt(bundleDigits, 10)) : '0';

    var unitPrice = toSafeNumber(item.unitPrice, 0);
    if (unitPrice < 0) {
      unitPrice = 0;
    }

    var quantity = toSafeInt(item.quantity, 0);
    if (quantity < 0) {
      quantity = 0;
    }

    var totalPrice = toSafeNumber(item.totalPrice, quantity * unitPrice);
    if (totalPrice < 0) {
      totalPrice = 0;
    }

    return {
      id: item.id || gameId + '-' + bundleId + '-' + String(index + 1),
      gameId: gameId,
      bundleId: bundleId,
      gameTitle: String(item.gameTitle || 'Game Title'),
      unitPrice: unitPrice,
      quantity: quantity,
      totalPrice: totalPrice,
      lastScannedCode: String(item.lastScannedCode || ''),
      lastUpdatedAt: String(item.lastUpdatedAt || '')
    };
  }

  function normalizeFlowTwoState(rawState) {
    if (!rawState || !Array.isArray(rawState.items)) {
      return null;
    }

    return {
      version: toSafeInt(rawState.version, 1),
      updatedAt: rawState.updatedAt || '',
      items: rawState.items.map(function (item, index) {
        return normalizeFlowTwoItem(item, index);
      })
    };
  }

  function readFlowTwoStateFromStorage() {
    var raw = window.localStorage.getItem(FLOW_TWO_STORAGE_KEY);
    if (!raw) {
      return null;
    }

    return normalizeFlowTwoState(safeParseJSON(raw));
  }

  function writeFlowTwoStateToStorage(state) {
    var nextState = {
      version: state.version || 1,
      items: state.items,
      updatedAt: new Date().toISOString()
    };

    window.localStorage.setItem(FLOW_TWO_STORAGE_KEY, JSON.stringify(nextState));
    return nextState;
  }

  function getOrCreateFlowTwoState() {
    var state = readFlowTwoStateFromStorage();
    if (state) {
      return state;
    }

    return writeFlowTwoStateToStorage({
      version: 1,
      items: [],
      updatedAt: new Date().toISOString()
    });
  }

  async function initFlowTwoPage() {
    var backButton = document.getElementById('backButton');
    var scanIdButton = document.getElementById('scanIdButton');
    var doneButton = document.getElementById('doneButton');
    var scannedCount = document.getElementById('scannedCount');
    var cardList = document.getElementById('cardList');

    var scanModal = document.getElementById('flowTwoScanModal');
    var scanBackdrop = document.getElementById('flowTwoScanBackdrop');
    var scanCloseButton = document.getElementById('flowTwoScanCloseButton');
    var scanTorchButton = document.getElementById('flowTwoTorchButton');
    var scanTorchIcon = document.getElementById('flowTwoTorchIcon');
    var scanCameraFeed = document.getElementById('flowTwoCameraFeed');
    var scanStatusMessage = document.getElementById('flowTwoScanStatus');

    if (!backButton || !scanIdButton || !doneButton || !scannedCount || !cardList || !scanModal || !scanCloseButton || !scanTorchButton || !scanTorchIcon || !scanCameraFeed || !scanStatusMessage) {
      return;
    }

    var flashOffIcon = 'assets/flash_off.svg';
    var flashOnIcon = 'assets/flash_on.svg';

    var seedTickets = await DataApi.loadSeedTickets();
    var currentState = getOrCreateFlowTwoState();

    var scanReader = null;
    var scanControls = null;
    var stream = null;
    var videoTrack = null;
    var torchEnabled = false;
    var torchSupported = false;
    var scanLock = false;
    var lastScanText = '';
    var lastScanAt = 0;
    var statusTimer = null;

    function renderFlowTwoCards() {
      scannedCount.textContent = DataApi.pad(currentState.items.length, 2);

      if (!currentState.items.length) {
        cardList.innerHTML = '';
        return;
      }

      cardList.innerHTML = currentState.items.map(function (item) {
        return [
          '<article class="recon-card" data-item-id="' + escapeHTML(item.id) + '">',
          '  <div class="recon-card__top">',
          '    <h2 class="recon-card__title">' + escapeHTML(item.gameTitle) + '</h2>',
          '    <div class="recon-row">',
          '      <div class="recon-group">',
          '        <span class="recon-label">Game ID</span>',
          '        <span class="recon-value">' + escapeHTML(item.gameId) + '</span>',
          '      </div>',
          '      <div class="recon-group">',
          '        <span class="recon-label">Bundle ID</span>',
          '        <span class="recon-value">' + escapeHTML(item.bundleId) + '</span>',
          '      </div>',
          '    </div>',
          '  </div>',
          '  <div class="recon-card__bottom">',
          '    <div class="recon-row">',
          '      <div class="recon-group">',
          '        <span class="recon-label">Quantity</span>',
          '        <span class="recon-value">' + DataApi.pad(item.quantity, 3) + '</span>',
          '      </div>',
          '      <div class="recon-group">',
          '        <span class="recon-label">Unity Price</span>',
          '        <span class="recon-value">' + DataApi.pad(item.unitPrice, 2) + '</span>',
          '      </div>',
          '      <div class="recon-group">',
          '        <span class="recon-label">Total</span>',
          '        <span class="recon-value">' + DataApi.pad(item.totalPrice, 4) + '</span>',
          '      </div>',
          '    </div>',
          '  </div>',
          '</article>'
        ].join('');
      }).join('');
    }

    function showScanStatus(message, persistent) {
      scanStatusMessage.textContent = message || '';
      scanStatusMessage.dataset.visible = message ? 'true' : 'false';

      if (statusTimer) {
        window.clearTimeout(statusTimer);
        statusTimer = null;
      }

      if (message && !persistent) {
        statusTimer = window.setTimeout(function () {
          scanStatusMessage.dataset.visible = 'false';
        }, 2200);
      }
    }

    function setFlowTwoTorchIcon(isOn) {
      scanTorchIcon.src = isOn ? flashOnIcon : flashOffIcon;
      scanTorchButton.setAttribute('aria-pressed', String(isOn));
    }

    function updateFlowTwoTorchAvailability() {
      scanTorchButton.disabled = !torchSupported;
      if (!torchSupported) {
        torchEnabled = false;
        setFlowTwoTorchIcon(false);
      }
    }

    function findMatchingSeedTicket(parsedPayload) {
      var parsedGameId = DataApi.normalizeId(parsedPayload.gameId);
      var parsedBundleId = DataApi.normalizeId(parsedPayload.bundleId);
      var parsedBundleDigits = DataApi.digitsOnly(parsedPayload.bundleId);

      var directMatch = seedTickets.find(function (ticket) {
        return DataApi.normalizeId(ticket.gameId) === parsedGameId
          && DataApi.normalizeId(ticket.bundleId) === parsedBundleId;
      });

      if (directMatch) {
        return directMatch;
      }

      return seedTickets.find(function (ticket) {
        if (DataApi.normalizeId(ticket.gameId) !== parsedGameId) {
          return false;
        }

        var ticketBundleDigits = DataApi.digitsOnly(ticket.bundleId);
        if (!ticketBundleDigits || !parsedBundleDigits) {
          return false;
        }

        return parsedBundleDigits.endsWith(ticketBundleDigits)
          || ticketBundleDigits.endsWith(parsedBundleDigits);
      }) || null;
    }

    function stopFlowTwoScanner() {
      if (scanControls && typeof scanControls.stop === 'function') {
        try {
          scanControls.stop();
        } catch (error) {
          console.error('Flow 02 scanner controls stop failed:', error);
        }
      }

      if (scanReader && typeof scanReader.reset === 'function') {
        try {
          scanReader.reset();
        } catch (error) {
          console.error('Flow 02 scanner reset failed:', error);
        }
      }

      if (stream) {
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
      }

      scanControls = null;
      scanReader = null;
      stream = null;
      videoTrack = null;
      torchEnabled = false;
      torchSupported = false;
      setFlowTwoTorchIcon(false);
      updateFlowTwoTorchAvailability();
      scanCameraFeed.srcObject = null;
    }

    async function setFlowTwoTorchState(nextState) {
      if (!videoTrack || !torchSupported) {
        return;
      }

      try {
        await videoTrack.applyConstraints({
          advanced: [{ torch: nextState }]
        });
        torchEnabled = nextState;
        setFlowTwoTorchIcon(torchEnabled);
        showScanStatus('');
      } catch (error) {
        torchEnabled = false;
        setFlowTwoTorchIcon(false);
        showScanStatus('Torch is not available on this device.', true);
        console.error('Flow 02 torch toggle failed:', error);
      }
    }

    async function applyFlowTwoScannedValue(decodedText) {
      if (scanLock) {
        return;
      }

      var now = Date.now();
      if (decodedText === lastScanText && now - lastScanAt < 1500) {
        return;
      }

      lastScanText = decodedText;
      lastScanAt = now;
      scanLock = true;

      try {
        var parsedPayload = DataApi.parseDataMatrixPayload(decodedText);
        if (!parsedPayload) {
          showScanStatus('Scanned code format is invalid.', true);
          return;
        }

        var matchedSeedTicket = findMatchingSeedTicket(parsedPayload);
        if (!matchedSeedTicket) {
          showScanStatus('No matching game/bundle found.', true);
          return;
        }

        var quantity = parsedPayload.quantityLeft;
        if (quantity < 0) {
          quantity = 0;
        }
        if (matchedSeedTicket.unitsPerBundle > 0 && quantity > matchedSeedTicket.unitsPerBundle) {
          quantity = matchedSeedTicket.unitsPerBundle;
        }

        var itemId = matchedSeedTicket.gameId + '-' + matchedSeedTicket.bundleId;
        var existingItem = currentState.items.find(function (item) {
          return item.id === itemId;
        });

        if (existingItem) {
          existingItem.quantity = quantity;
          existingItem.unitPrice = matchedSeedTicket.unitPrice;
          existingItem.totalPrice = quantity * matchedSeedTicket.unitPrice;
          existingItem.lastScannedCode = parsedPayload.raw;
          existingItem.lastUpdatedAt = new Date().toISOString();
        } else {
          currentState.items.push({
            id: itemId,
            gameId: matchedSeedTicket.gameId,
            bundleId: matchedSeedTicket.bundleId,
            gameTitle: matchedSeedTicket.gameTitle,
            unitPrice: matchedSeedTicket.unitPrice,
            quantity: quantity,
            totalPrice: quantity * matchedSeedTicket.unitPrice,
            lastScannedCode: parsedPayload.raw,
            lastUpdatedAt: new Date().toISOString()
          });
        }

        currentState = writeFlowTwoStateToStorage(currentState);
        renderFlowTwoCards();

        showScanStatus('Scanned Game ' + matchedSeedTicket.gameId + ' / Bundle ' + matchedSeedTicket.bundleId + '.', false);

        if (window.navigator && typeof window.navigator.vibrate === 'function') {
          window.navigator.vibrate(70);
        }
      } finally {
        window.setTimeout(function () {
          scanLock = false;
        }, 250);
      }
    }

    async function startFlowTwoScanner() {
      if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) {
        showScanStatus('Scanner library failed to load.', true);
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showScanStatus('Camera access is not supported in this browser.', true);
        updateFlowTwoTorchAvailability();
        return;
      }

      stopFlowTwoScanner();

      try {
        var hints = new Map();
        hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [window.ZXing.BarcodeFormat.DATA_MATRIX]);

        scanReader = new window.ZXing.BrowserMultiFormatReader(hints, 300);
        scanControls = await scanReader.decodeFromVideoDevice(
          null,
          scanCameraFeed,
          function (result, error) {
            if (result) {
              applyFlowTwoScannedValue(result.getText());
              return;
            }

            if (!error) {
              return;
            }

            var errorName = error.name || '';
            var expectedError = errorName === 'NotFoundException'
              || errorName === 'ChecksumException'
              || errorName === 'FormatException';

            if (!expectedError) {
              console.error('Flow 02 scanner decode error:', error);
            }
          }
        );

        stream = scanCameraFeed.srcObject;
        videoTrack = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;

        var capabilities = typeof videoTrack?.getCapabilities === 'function'
          ? videoTrack.getCapabilities()
          : {};

        torchSupported = Boolean(capabilities && capabilities.torch);
        updateFlowTwoTorchAvailability();
        showScanStatus('Align the data matrix inside the scan window.', false);
      } catch (error) {
        updateFlowTwoTorchAvailability();
        showScanStatus('Unable to access the camera.', true);
        console.error('Flow 02 camera startup failed:', error);
      }
    }

    function openFlowTwoScanModal() {
      scanModal.hidden = false;
      startFlowTwoScanner();
    }

    function closeFlowTwoScanModal() {
      stopFlowTwoScanner();
      showScanStatus('', true);
      scanModal.hidden = true;
    }

    bindPseudoButton(backButton, function () {
      window.location.href = 'dashboard.html';
    });

    scanIdButton.addEventListener('click', openFlowTwoScanModal);
    scanCloseButton.addEventListener('click', closeFlowTwoScanModal);

    if (scanBackdrop) {
      scanBackdrop.addEventListener('click', closeFlowTwoScanModal);
    }

    scanTorchButton.addEventListener('click', async function () {
      if (!torchSupported) {
        showScanStatus('Torch is not available on this device.', true);
        return;
      }

      await setFlowTwoTorchState(!torchEnabled);
    });

    doneButton.addEventListener('click', function () {
      window.location.href = 'dashboard.html';
    });

    window.addEventListener('storage', function (event) {
      if (event.key !== FLOW_TWO_STORAGE_KEY) {
        return;
      }

      var latest = readFlowTwoStateFromStorage();
      if (latest) {
        currentState = latest;
        renderFlowTwoCards();
      }
    });

    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') {
        stopFlowTwoScanner();
        return;
      }

      if (!scanModal.hidden) {
        startFlowTwoScanner();
      }
    });

    window.addEventListener('beforeunload', stopFlowTwoScanner);
    window.addEventListener('pagehide', stopFlowTwoScanner);

    setFlowTwoTorchIcon(false);
    updateFlowTwoTorchAvailability();
    renderFlowTwoCards();
  }

  async function initFlowThreePage() {
    var ticketList = document.getElementById('ticketList');
    if (!ticketList) {
      return;
    }

    var tabUncounted = document.getElementById('tabUncounted');
    var tabCounted = document.getElementById('tabCounted');
    var badgeUncounted = document.getElementById('uncountedBadge');
    var badgeCounted = document.getElementById('countedBadge');
    var scanEntryButton = document.getElementById('scanEntryButton');
    var backButton = document.getElementById('backButton');
    var doneButton = document.getElementById('doneButton');

    var quantityModal = document.getElementById('quantityModal');
    var quantityModalMeta = document.getElementById('quantityModalMeta');
    var quantityInput = document.getElementById('quantityInput');
    var quantityError = document.getElementById('quantityError');
    var quantityCancelButton = document.getElementById('quantityCancelButton');
    var quantityConfirmButton = document.getElementById('quantityConfirmButton');

    var currentState = await getOrCreateState();
    var activeTab = 'uncounted';
    var activeTicketId = '';

    function setActiveTab(tabName) {
      activeTab = tabName;
      renderCards();
    }

    function renderCards() {
      var counts = countTickets(currentState.tickets);
      badgeUncounted.textContent = DataApi.pad(counts.uncounted, 2);
      badgeCounted.textContent = DataApi.pad(counts.counted, 2);

      tabUncounted.classList.toggle('active', activeTab === 'uncounted');
      tabCounted.classList.toggle('active', activeTab === 'counted');

      var filteredTickets = currentState.tickets.filter(function (ticket) {
        return activeTab === 'counted' ? isTicketCounted(ticket) : !isTicketCounted(ticket);
      });

      if (!filteredTickets.length) {
        ticketList.innerHTML = [
          '<article class="ticket-card empty-card">',
          '  <div class="card-top"><span class="empty-text">No tickets in this tab.</span></div>',
          '  <div class="card-bottom"><span class="empty-text">Scan or enter quantity to continue.</span></div>',
          '</article>'
        ].join('');
        return;
      }

      ticketList.innerHTML = filteredTickets.map(function (ticket) {
        var isUncounted = !isTicketCounted(ticket);
        return [
          '<article class="ticket-card" data-ticket-id="' + escapeHTML(ticket.id) + '">',
          '  <div class="card-top">',
          '    <h2 class="game-title">' + escapeHTML(ticket.gameTitle) + '</h2>',
          '    <div class="row">',
          '      <div class="group">',
          '        <span class="label">Game ID</span>',
          '        <span class="value">' + escapeHTML(ticket.gameId) + '</span>',
          '      </div>',
          '      <div class="group">',
          '        <span class="label">Bundle ID</span>',
          '        <span class="value">' + escapeHTML(ticket.bundleId) + '</span>',
          '      </div>',
          '    </div>',
          '  </div>',
          '  <div class="card-bottom">',
          '    <div class="row">',
          '      <div class="group">',
          '        <span class="label">Quantity</span>',
          '        <span class="value quantity-value" role="button" tabindex="0" data-ticket-id="' + escapeHTML(ticket.id) + '">' + formatQuantity(ticket.quantity) + '</span>',
          '      </div>',
          '      <div class="group">',
          '        <span class="label">Unity Price</span>',
          '        <span class="value">' + formatPrice(ticket.unitPrice) + '</span>',
          '      </div>',
          '      <div class="group">',
          '        <span class="label">Total</span>',
          '        <span class="value">' + formatTotal(ticket.totalPrice, isUncounted) + '</span>',
          '      </div>',
          '    </div>',
          '  </div>',
          '</article>'
        ].join('');
      }).join('');
    }

    function closeQuantityModal() {
      activeTicketId = '';
      quantityError.textContent = '';
      quantityInput.value = '';
      quantityModal.hidden = true;
    }

    function openQuantityModal(ticketId) {
      var ticket = findTicketById(currentState.tickets, ticketId);
      if (!ticket) {
        return;
      }

      activeTicketId = ticketId;
      quantityError.textContent = '';
      quantityInput.value = ticket.quantity === null ? '' : String(ticket.quantity);
      quantityModalMeta.textContent = ticket.gameId + ' | Bundle ' + ticket.bundleId + ' | Max ' + DataApi.pad(ticket.unitsPerBundle, 3);
      quantityModal.hidden = false;
      quantityInput.focus();
      quantityInput.select();
    }

    function updateTicketQuantity(ticket, quantity, source) {
      ticket.quantity = quantity;
      ticket.totalPrice = quantity === null ? 0 : quantity * ticket.unitPrice;
      ticket.updatedBy = source;
      ticket.lastUpdatedAt = new Date().toISOString();
      currentState = writeStateToStorage(currentState);
      renderCards();
    }

    function confirmQuantity() {
      var ticket = findTicketById(currentState.tickets, activeTicketId);
      if (!ticket) {
        closeQuantityModal();
        return;
      }

      var rawQuantity = quantityInput.value.trim();

      if (rawQuantity === '') {
        updateTicketQuantity(ticket, null, 'manual');
        closeQuantityModal();
        return;
      }

      if (!/^\d+$/.test(rawQuantity)) {
        quantityError.textContent = 'Enter a whole number only.';
        return;
      }

      var quantity = parseInt(rawQuantity, 10);
      if (ticket.unitsPerBundle > 0 && quantity > ticket.unitsPerBundle) {
        quantityError.textContent = 'Quantity cannot exceed ' + String(ticket.unitsPerBundle) + '.';
        return;
      }

      updateTicketQuantity(ticket, quantity, 'manual');
      closeQuantityModal();
    }

    tabUncounted.addEventListener('click', function () {
      setActiveTab('uncounted');
    });

    tabCounted.addEventListener('click', function () {
      setActiveTab('counted');
    });

    tabUncounted.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActiveTab('uncounted');
      }
    });

    tabCounted.addEventListener('keydown', function (event) {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        setActiveTab('counted');
      }
    });

    ticketList.addEventListener('click', function (event) {
      var target = event.target.closest('.quantity-value');
      if (!target) {
        return;
      }

      openQuantityModal(target.getAttribute('data-ticket-id'));
    });

    ticketList.addEventListener('keydown', function (event) {
      var target = event.target.closest('.quantity-value');
      if (!target) {
        return;
      }

      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        openQuantityModal(target.getAttribute('data-ticket-id'));
      }
    });

    quantityConfirmButton.addEventListener('click', confirmQuantity);
    quantityCancelButton.addEventListener('click', closeQuantityModal);

    quantityInput.addEventListener('keydown', function (event) {
      if (event.key === 'Enter') {
        event.preventDefault();
        confirmQuantity();
      }

      if (event.key === 'Escape') {
        event.preventDefault();
        closeQuantityModal();
      }
    });

    quantityModal.addEventListener('click', function (event) {
      if (event.target && event.target.hasAttribute('data-close-modal')) {
        closeQuantityModal();
      }
    });

    bindPseudoButton(scanEntryButton, function () {
      window.location.href = 'flowThreeScanner.html';
    });

    bindPseudoButton(backButton, function () {
      window.location.href = 'dashboard.html';
    });

    if (doneButton) {
      doneButton.addEventListener('click', function () {
        var counts = countTickets(currentState.tickets);
        if (counts.uncounted > 0) {
          window.alert('Please enter quantities for all tickets before opening the summary.');
          return;
        }

        window.location.href = 'summary.html';
      });
    }

    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      var latest = readStateFromStorage();
      if (latest) {
        currentState = latest;
        renderCards();
      }
    });

    renderCards();
  }

  async function initFlowThreeScannerPage() {
    var closeScannerButton = document.getElementById('closeScannerButton');
    var torchButton = document.getElementById('torchButton');
    var torchIcon = document.getElementById('torchIcon');
    var cameraFeed = document.getElementById('cameraFeed');
    var cameraMessage = document.getElementById('cameraMessage');
    var scannerStatusValue = document.getElementById('scannerStatusValue');

    if (!cameraFeed || !torchButton || !torchIcon || !cameraMessage || !scannerStatusValue) {
      return;
    }

    var flashOffIcon = 'assets/flash_off.svg';
    var flashOnIcon = 'assets/flash_on.svg';

    var scanReader = null;
    var scanControls = null;
    var stream = null;
    var videoTrack = null;
    var torchEnabled = false;
    var torchSupported = false;
    var lastScanText = '';
    var lastScanAt = 0;
    var scanLock = false;

    var currentState = await getOrCreateState();
    updateScannerStatus(currentState.tickets);

    function showMessage(message) {
      cameraMessage.textContent = message;
      cameraMessage.hidden = !message;
    }

    function setTorchIcon(isOn) {
      torchIcon.src = isOn ? flashOnIcon : flashOffIcon;
      torchButton.setAttribute('aria-pressed', String(isOn));
    }

    function updateTorchAvailability() {
      torchButton.disabled = !torchSupported;
      if (!torchSupported) {
        torchEnabled = false;
        setTorchIcon(false);
      }
    }

    function updateScannerStatus(tickets) {
      var counts = countTickets(tickets);
      scannerStatusValue.textContent = DataApi.pad(counts.counted, 2) + '/' + DataApi.pad(counts.total, 2);
    }

    function findMatchingTicket(tickets, parsedPayload) {
      var parsedGameId = DataApi.normalizeId(parsedPayload.gameId);
      var parsedBundleId = DataApi.normalizeId(parsedPayload.bundleId);
      var parsedBundleDigits = DataApi.digitsOnly(parsedPayload.bundleId);

      var directMatch = tickets.find(function (ticket) {
        return DataApi.normalizeId(ticket.gameId) === parsedGameId
          && DataApi.normalizeId(ticket.bundleId) === parsedBundleId;
      });

      if (directMatch) {
        return directMatch;
      }

      return tickets.find(function (ticket) {
        if (DataApi.normalizeId(ticket.gameId) !== parsedGameId) {
          return false;
        }

        var ticketBundleDigits = DataApi.digitsOnly(ticket.bundleId);
        if (!ticketBundleDigits || !parsedBundleDigits) {
          return false;
        }

        return parsedBundleDigits.endsWith(ticketBundleDigits)
          || ticketBundleDigits.endsWith(parsedBundleDigits);
      }) || null;
    }

    async function setTorchState(nextState) {
      if (!videoTrack || !torchSupported) {
        return;
      }

      try {
        await videoTrack.applyConstraints({
          advanced: [{ torch: nextState }]
        });
        torchEnabled = nextState;
        setTorchIcon(torchEnabled);
        showMessage('');
      } catch (error) {
        torchEnabled = false;
        setTorchIcon(false);
        showMessage('Torch is not available on this device.');
        console.error('Torch toggle failed:', error);
      }
    }

    function stopScanner() {
      if (scanControls && typeof scanControls.stop === 'function') {
        try {
          scanControls.stop();
        } catch (error) {
          console.error('Scanner controls stop failed:', error);
        }
      }

      if (scanReader && typeof scanReader.reset === 'function') {
        try {
          scanReader.reset();
        } catch (error) {
          console.error('Scanner reset failed:', error);
        }
      }

      if (stream) {
        stream.getTracks().forEach(function (track) {
          track.stop();
        });
      }

      scanControls = null;
      scanReader = null;
      stream = null;
      videoTrack = null;
    }

    async function applyScannedValue(decodedText) {
      if (scanLock) {
        return;
      }

      var now = Date.now();
      if (decodedText === lastScanText && now - lastScanAt < 1500) {
        return;
      }

      lastScanText = decodedText;
      lastScanAt = now;
      scanLock = true;

      try {
        var parsedPayload = DataApi.parseDataMatrixPayload(decodedText);
        if (!parsedPayload) {
          showMessage('Scanned code format is invalid for this flow.');
          return;
        }

        currentState = readStateFromStorage() || currentState;
        var ticket = findMatchingTicket(currentState.tickets, parsedPayload);

        if (!ticket) {
          showMessage('No matching ticket card found for the scanned code.');
          return;
        }

        var quantity = parsedPayload.quantityLeft;
        if (quantity < 0) {
          quantity = 0;
        }
        if (ticket.unitsPerBundle > 0 && quantity > ticket.unitsPerBundle) {
          quantity = ticket.unitsPerBundle;
        }

        ticket.quantity = quantity;
        ticket.totalPrice = quantity * ticket.unitPrice;
        ticket.updatedBy = 'scanner';
        ticket.lastScannedCode = parsedPayload.raw;
        ticket.lastUpdatedAt = new Date().toISOString();

        currentState = writeStateToStorage(currentState);
        updateScannerStatus(currentState.tickets);

        showMessage('Updated Game ' + ticket.gameId + ' / Bundle ' + ticket.bundleId + ' to quantity ' + DataApi.pad(quantity, 3) + '.');

        if (window.navigator && typeof window.navigator.vibrate === 'function') {
          window.navigator.vibrate(70);
        }
      } finally {
        window.setTimeout(function () {
          scanLock = false;
        }, 250);
      }
    }

    async function startScanner() {
      if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) {
        showMessage('Scanner library failed to load. Please refresh this page.');
        return;
      }

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showMessage('Camera access is not supported in this browser.');
        updateTorchAvailability();
        return;
      }

      try {
        var hints = new Map();
        hints.set(window.ZXing.DecodeHintType.POSSIBLE_FORMATS, [window.ZXing.BarcodeFormat.DATA_MATRIX]);

        scanReader = new window.ZXing.BrowserMultiFormatReader(hints, 300);
        scanControls = await scanReader.decodeFromVideoDevice(
          null,
          cameraFeed,
          function (result, error) {
            if (result) {
              applyScannedValue(result.getText());
              return;
            }

            if (!error) {
              return;
            }

            var errorName = error.name || '';
            var expectedError = errorName === 'NotFoundException'
              || errorName === 'ChecksumException'
              || errorName === 'FormatException';

            if (!expectedError) {
              console.error('Scanner decode error:', error);
            }
          }
        );

        stream = cameraFeed.srcObject;
        videoTrack = stream && stream.getVideoTracks ? stream.getVideoTracks()[0] : null;

        var capabilities = typeof videoTrack?.getCapabilities === 'function'
          ? videoTrack.getCapabilities()
          : {};

        torchSupported = Boolean(capabilities && capabilities.torch);
        updateTorchAvailability();
        showMessage('Align the data matrix inside the guide frame.');
      } catch (error) {
        updateTorchAvailability();
        showMessage('Unable to access the camera. Please allow permission and reload.');
        console.error('Camera startup failed:', error);
      }
    }

    closeScannerButton.addEventListener('click', function () {
      stopScanner();
      window.location.href = 'flowThree.html';
    });

    torchButton.addEventListener('click', async function () {
      if (!torchSupported) {
        showMessage('Torch is not available on this device.');
        return;
      }

      await setTorchState(!torchEnabled);
    });

    document.addEventListener('visibilitychange', async function () {
      if (!videoTrack || document.visibilityState !== 'hidden' || !torchEnabled) {
        return;
      }

      await setTorchState(false);
    });

    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      var latest = readStateFromStorage();
      if (latest) {
        currentState = latest;
        updateScannerStatus(currentState.tickets);
      }
    });

    window.addEventListener('beforeunload', stopScanner);
    window.addEventListener('pagehide', stopScanner);

    setTorchIcon(false);
    updateTorchAvailability();
    startScanner();
  }

  async function initSummaryPage() {
    var summaryTotalValue = document.getElementById('summaryTotalValue');
    var summaryList = document.getElementById('summaryList');
    var summaryDoneButton = document.getElementById('summaryDoneButton');

    if (!summaryTotalValue || !summaryList) {
      return;
    }

    var currentState = await getOrCreateState();

    function renderSummary() {
      var countedTickets = currentState.tickets
        .filter(isTicketCounted)
        .slice()
        .sort(function (ticketA, ticketB) {
          var gameDiff = toSafeInt(ticketA.gameId, 0) - toSafeInt(ticketB.gameId, 0);
          if (gameDiff !== 0) {
            return gameDiff;
          }

          return toSafeInt(ticketA.bundleId, 0) - toSafeInt(ticketB.bundleId, 0);
        });

      var totalAmount = countedTickets.reduce(function (total, ticket) {
        var quantity = ticket.quantity === null ? 0 : ticket.quantity;
        return total + (quantity * ticket.unitPrice);
      }, 0);

      summaryTotalValue.textContent = '$ ' + formatSummaryAmount(totalAmount);

      if (!countedTickets.length) {
        summaryList.innerHTML = [
          '<div class="summary-row">',
          '  <div class="game-info">',
          '    <p class="game-title">No counted tickets</p>',
          '    <p class="bundle-id">Go back and count bundles first.</p>',
          '  </div>',
          '  <div class="metrics">',
          '    <div class="metric">',
          '      <p class="metric-label">Unit</p>',
          '      <p class="metric-value">000</p>',
          '    </div>',
          '    <div class="metric">',
          '      <p class="metric-label">Qty</p>',
          '      <p class="metric-value">000</p>',
          '    </div>',
          '    <div class="metric">',
          '      <p class="metric-label">Total</p>',
          '      <p class="metric-value">0000</p>',
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');
        return;
      }

      summaryList.innerHTML = countedTickets.map(function (ticket) {
        var quantity = ticket.quantity === null ? 0 : ticket.quantity;
        var lineTotal = quantity * ticket.unitPrice;

        return [
          '<div class="summary-row">',
          '  <div class="game-info">',
          '    <p class="game-title">' + escapeHTML(ticket.gameTitle) + '</p>',
          '    <p class="bundle-id">Bundle ' + escapeHTML(ticket.bundleId) + '</p>',
          '  </div>',
          '  <div class="metrics">',
          '    <div class="metric">',
          '      <p class="metric-label">Unit</p>',
          '      <p class="metric-value">' + DataApi.pad(ticket.unitPrice, 3) + '</p>',
          '    </div>',
          '    <div class="metric">',
          '      <p class="metric-label">Qty</p>',
          '      <p class="metric-value">' + DataApi.pad(quantity, 3) + '</p>',
          '    </div>',
          '    <div class="metric">',
          '      <p class="metric-label">Total</p>',
          '      <p class="metric-value">' + formatSummaryAmount(lineTotal) + '</p>',
          '    </div>',
          '  </div>',
          '</div>'
        ].join('');
      }).join('');
    }

    if (summaryDoneButton) {
      bindPseudoButton(summaryDoneButton, function () {
        window.location.href = 'dashboard.html';
      });
    }

    window.addEventListener('storage', function (event) {
      if (event.key !== STORAGE_KEY) {
        return;
      }

      var latest = readStateFromStorage();
      if (latest) {
        currentState = latest;
        renderSummary();
      }
    });

    renderSummary();
  }
})(window, document);
