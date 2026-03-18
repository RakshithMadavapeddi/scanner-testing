(function (window) {
  'use strict';

  var STORAGE_KEY = 'flowThree.ticketState.v1';
  var CSV_PATH = 'assets/InstantScratchTickets_Data - Sheet1.csv';

  var EMBEDDED_CSV = [
    'Game ID,Game Title,Unit Price,Units Per Bundle,Bundle Price,Bundle ID',
    '490,"$25,000,000 MEGA MONEY",$50,50,"$2,500",65558',
    '387,BILLION DOLLAR EXTRAVAGANZA,$50,50,"$2,500",43214',
    '404,300X,$30,50,"$1,500",787865',
    '373,MILLIONS,$30,50,"$1,500",236583',
    '489,200X,$20,100,"$2,000",415893',
    '536,"$2,000,000 STACKED",$20,100,"$2,000",389321',
    '523,"$5,000,000 100X CASHWORD",$20,100,"$2,000",454545',
    '409,"$10,000,000 CASH BLAST",$20,100,"$2,000",874561',
    '445,BONUS 100X,$10,100,"$1,000",980032',
    '488,100X,$10,100,"$1,000",329777',
    '432,JAWS,$10,100,"$1,000",994931',
    '419,777,$10,100,"$1,000",310294',
    '408,INSTANT $500s,$10,100,"$1,000",984905',
    '403,100X CASH,$10,100,"$1,000",558229',
    '444,BONUS 50X,$5,100,$500,771998',
    '487,50X,$5,100,$500,182965',
    '472,BIG BLUE BONUS CASHWORD,$5,100,$500,171998',
    '510,GHOSTBUSTERS,$5,100,$500,440448',
    '455,LUCKY 13,$5,100,$500,767809',
    '450,GAME OF THRONES,$5,100,$500,857693',
    '467,EMERALD MINE 50X,$5,100,$500,225253',
    '474,TRIPLE 777,$5,100,$500,225355',
    '342,MONEY MONEY MONEY,$5,100,$500,425678',
    '366,ELECTRIC 7s,$5,100,$500,98745',
    '443,BONUS 20X,$2,200,$400,875439',
    '486,20X,$2,200,$400,890031',
    '449,THE INSTANT GAME,$2,200,$400,141231',
    '415,BINGO,$2,200,$400,898923'
  ].join('\n');

  function trim(value) {
    return String(value == null ? '' : value).trim();
  }

  function digitsOnly(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function normalizeId(value) {
    var digits = digitsOnly(value);
    if (!digits) {
      return '';
    }

    return String(parseInt(digits, 10));
  }

  function toNumber(value) {
    var cleaned = trim(value).replace(/[^\d.-]/g, '');
    if (!cleaned) {
      return 0;
    }

    var parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function toInt(value) {
    var cleaned = trim(value).replace(/[^\d-]/g, '');
    if (!cleaned) {
      return 0;
    }

    var parsed = parseInt(cleaned, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function parseCsvRows(csvText) {
    var rows = [];
    var currentRow = [];
    var currentCell = '';
    var inQuotes = false;

    for (var i = 0; i < csvText.length; i += 1) {
      var char = csvText[i];

      if (inQuotes) {
        if (char === '"') {
          if (csvText[i + 1] === '"') {
            currentCell += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          currentCell += char;
        }
        continue;
      }

      if (char === '"') {
        inQuotes = true;
        continue;
      }

      if (char === ',') {
        currentRow.push(currentCell);
        currentCell = '';
        continue;
      }

      if (char === '\n') {
        currentRow.push(currentCell);
        rows.push(currentRow);
        currentRow = [];
        currentCell = '';
        continue;
      }

      if (char === '\r') {
        continue;
      }

      currentCell += char;
    }

    if (currentCell.length > 0 || currentRow.length > 0) {
      currentRow.push(currentCell);
      rows.push(currentRow);
    }

    return rows;
  }

  function csvToTickets(csvText) {
    var rows = parseCsvRows(csvText);
    if (rows.length < 2) {
      return [];
    }

    var headers = rows[0].map(trim);
    var tickets = [];

    for (var rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
      var row = rows[rowIndex];
      if (!row || !row.length) {
        continue;
      }

      var source = {};
      for (var headerIndex = 0; headerIndex < headers.length; headerIndex += 1) {
        source[headers[headerIndex]] = trim(row[headerIndex]);
      }

      var gameIdNumber = toInt(source['Game ID']);
      var bundleDigits = digitsOnly(source['Bundle ID']);

      if (!gameIdNumber || !bundleDigits) {
        continue;
      }

      var gameId = String(gameIdNumber).padStart(3, '0');
      var bundleId = String(parseInt(bundleDigits, 10));
      var unitPrice = toNumber(source['Unit Price']);
      var unitsPerBundle = toInt(source['Units Per Bundle']);
      var bundlePrice = toNumber(source['Bundle Price']);

      tickets.push({
        id: gameId + '-' + bundleId + '-' + String(rowIndex),
        gameId: gameId,
        bundleId: bundleId,
        gameTitle: source['Game Title'] || 'Game Title',
        unitPrice: unitPrice,
        unitsPerBundle: unitsPerBundle,
        bundlePrice: bundlePrice,
        quantity: null,
        totalPrice: 0,
        updatedBy: null,
        lastScannedCode: '',
        lastUpdatedAt: ''
      });
    }

    return tickets;
  }

  async function loadSeedTickets() {
    var csvText = '';

    try {
      var response = await fetch(encodeURI(CSV_PATH), { cache: 'no-store' });
      if (!response.ok) {
        throw new Error('Failed to load CSV. Status: ' + String(response.status));
      }
      csvText = await response.text();
    } catch (error) {
      console.warn('Falling back to embedded ticket data.', error);
      csvText = EMBEDDED_CSV;
    }

    var tickets = csvToTickets(csvText);
    if (!tickets.length) {
      tickets = csvToTickets(EMBEDDED_CSV);
    }

    return tickets;
  }

  function parseDataMatrixPayload(rawValue) {
    var digits = digitsOnly(rawValue);
    var match = /^(\d{3})0(\d{6})0(\d{3})0(\d{3})$/.exec(digits);

    if (!match) {
      return null;
    }

    var ticketNumber = parseInt(match[3], 10);

    return {
      raw: digits,
      gameId: match[1],
      bundleId: match[2],
      ticketNumber: ticketNumber,
      quantityLeft: ticketNumber + 1,
      scannedUnitPrice: parseInt(match[4], 10)
    };
  }

  function pad(value, size) {
    var parsed = parseInt(value, 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      parsed = 0;
    }

    return String(parsed).padStart(size, '0');
  }

  window.FlowThreeData = {
    STORAGE_KEY: STORAGE_KEY,
    CSV_PATH: CSV_PATH,
    csvToTickets: csvToTickets,
    loadSeedTickets: loadSeedTickets,
    parseDataMatrixPayload: parseDataMatrixPayload,
    normalizeId: normalizeId,
    digitsOnly: digitsOnly,
    pad: pad
  };
})(window);
