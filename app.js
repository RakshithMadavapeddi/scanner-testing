(function (window, document) {
  'use strict';

  var DataApi = window.FlowThreeData;
  if (!DataApi) {
    console.error('FlowThreeData is not available.');
    return;
  }

  var STORAGE_KEY = DataApi.STORAGE_KEY;

  document.addEventListener('DOMContentLoaded', function () {
    var page = document.body.getAttribute('data-page');

    if (page === 'flow-three') {
      initFlowThreePage();
      return;
    }

    if (page === 'flow-three-scanner') {
      initFlowThreeScannerPage();
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
      if (window.history.length > 1) {
        window.history.back();
        return;
      }

      window.location.href = 'dashboard.html';
    });

    if (doneButton) {
      doneButton.addEventListener('click', function () {
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
})(window, document);
