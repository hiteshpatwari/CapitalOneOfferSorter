(() => {
  const STORAGE_KEYS = {
    defaultSort: "defaultSort",
    autoSort: "autoSort"
  };

  const SORTS = {
    original: "Original order",
    highest: "Highest miles first",
    lowest: "Lowest miles first",
    highestX: "Highest X multiples first"
  };

  const state = {
    currentSort: "highest",
    defaultSort: "highest",
    autoSort: true,
    toolbar: null,
    grid: null,
    syncTimer: null
  };

  const TILE_SELECTOR = '[data-testid^="feed-tile-"]';

  function loadPreferences() {
    return new Promise((resolve) => {
      chrome.storage.sync.get(
        {
          [STORAGE_KEYS.defaultSort]: "highest",
          [STORAGE_KEYS.autoSort]: true
        },
        (items) => {
          resolve({
            defaultSort: normalizeSort(items[STORAGE_KEYS.defaultSort]),
            autoSort: Boolean(items[STORAGE_KEYS.autoSort])
          });
        }
      );
    });
  }

  function normalizeSort(value) {
    return Object.prototype.hasOwnProperty.call(SORTS, value) ? value : "highest";
  }

  function scheduleSync() {
    window.clearTimeout(state.syncTimer);
    state.syncTimer = window.setTimeout(syncPage, 120);
  }

  function syncPage() {
    const grid = findPrimaryGrid();
    if (!grid) {
      return;
    }

    state.grid = grid;
    captureOriginalLayout(grid);
    ensureToolbar(grid);
    applySort(state.currentSort);
  }

  function findPrimaryGrid() {
    const counts = new Map();

    for (const tile of document.querySelectorAll(TILE_SELECTOR)) {
      const grid = tile.parentElement;
      if (!grid || tile.parentElement !== grid) {
        continue;
      }

      const inlineStyle = tile.getAttribute("style") || "";
      if (!/grid-area:/i.test(inlineStyle)) {
        continue;
      }

      counts.set(grid, (counts.get(grid) || 0) + 1);
    }

    let bestGrid = null;
    let bestCount = 0;

    for (const [grid, count] of counts.entries()) {
      if (count > bestCount && count >= 20) {
        bestGrid = grid;
        bestCount = count;
      }
    }

    return bestGrid;
  }

  function listGridTiles(grid) {
    return Array.from(grid.children).filter((node) => {
      if (!(node instanceof HTMLElement)) {
        return false;
      }

      return node.matches(TILE_SELECTOR) && Boolean(readGridArea(node));
    });
  }

  function captureOriginalLayout(grid) {
    for (const [index, tile] of listGridTiles(grid).entries()) {
      if (!tile.dataset.c1omsOriginalGridArea) {
        tile.dataset.c1omsOriginalGridArea = readGridArea(tile);
      }

      if (!tile.dataset.c1omsOriginalIndex) {
        tile.dataset.c1omsOriginalIndex = String(index);
      }
    }
  }

  function readGridArea(tile) {
    const styleArea = normalizeGridArea(tile.style.gridArea);
    if (styleArea) {
      return styleArea;
    }

    const inlineStyle = tile.getAttribute("style") || "";
    const match = inlineStyle.match(/grid-area:\s*([^;"]+)/i);
    return match ? normalizeGridArea(match[1]) : "";
  }

  function normalizeGridArea(value) {
    if (!value) {
      return "";
    }

    return value.replace(/\s+/g, " ").replace(/\s*\/\s*/g, " / ").trim();
  }

  function parseArea(areaText) {
    const match = areaText.match(
      /(\d+)\s*\/\s*(\d+)\s*\/\s*span\s*(\d+)\s*\/\s*span\s*(\d+)/i
    );

    if (!match) {
      return null;
    }

    return {
      row: Number(match[1]),
      col: Number(match[2]),
      rowSpan: Number(match[3]),
      colSpan: Number(match[4])
    };
  }

  function areaToString(area) {
    return `${area.row} / ${area.col} / span ${area.rowSpan} / span ${area.colSpan}`;
  }

  function getTileText(tile) {
    return tile.innerText.replace(/\s+/g, " ").trim();
  }

  function getMilesValue(tile) {
    const text = getTileText(tile);
    const matches = Array.from(
      text.matchAll(/(?:up to\s*)?(\d[\d,]*)(?:\s*x)?\s*miles\b/gi)
    );

    if (!matches.length) {
      return null;
    }

    return Math.max(
      ...matches.map((match) => Number(match[1].replaceAll(",", ""))).filter(Number.isFinite)
    );
  }

  function getXMultipleValue(tile) {
    const text = getTileText(tile);
    const matches = Array.from(
      text.matchAll(/(?:up to\s*)?(\d[\d,]*(?:\.\d+)?)\s*x\s*miles\b/gi)
    );

    if (!matches.length) {
      return null;
    }

    return Math.max(
      ...matches.map((match) => Number(match[1].replaceAll(",", ""))).filter(Number.isFinite)
    );
  }

  function compareByMiles(aMiles, bMiles, direction) {
    if (aMiles == null && bMiles == null) {
      return 0;
    }

    if (aMiles == null) {
      return 1;
    }

    if (bMiles == null) {
      return -1;
    }

    return direction === "desc" ? bMiles - aMiles : aMiles - bMiles;
  }

  function compareTiles(a, b, sort) {
    if (sort === "highestX") {
      const aX = a.xMultiple;
      const bX = b.xMultiple;

      if (aX != null || bX != null) {
        if (aX == null) {
          return 1;
        }

        if (bX == null) {
          return -1;
        }

        const xDelta = bX - aX;
        if (xDelta) {
          return xDelta;
        }

        const milesTieBreak = compareByMiles(a.miles, b.miles, "desc");
        return milesTieBreak || a.originalIndex - b.originalIndex;
      }

      return a.originalIndex - b.originalIndex;
    }

    const aMiles = a.miles;
    const bMiles = b.miles;
    const delta = compareByMiles(aMiles, bMiles, sort === "highest" ? "desc" : "asc");
    return delta || a.originalIndex - b.originalIndex;
  }

  function buildTileMeta(grid) {
    return listGridTiles(grid)
      .map((tile, index) => {
        const originalAreaText = tile.dataset.c1omsOriginalGridArea || readGridArea(tile);
        const originalArea = parseArea(originalAreaText);

        if (!originalArea) {
          return null;
        }

        return {
          tile,
          originalAreaText,
          originalArea,
          originalIndex: Number(tile.dataset.c1omsOriginalIndex || index),
          miles: getMilesValue(tile),
          xMultiple: getXMultipleValue(tile),
          sortable:
            originalArea.rowSpan === 1 &&
            originalArea.colSpan === 1 &&
            tile.querySelector(".standard-tile") !== null
        };
      })
      .filter(Boolean);
  }

  function restoreOriginalOrder(meta) {
    for (const item of meta) {
      item.tile.style.gridArea = item.originalAreaText;
    }
  }

  function applySort(sort) {
    if (!state.grid || !document.contains(state.grid)) {
      return;
    }

    const normalizedSort = normalizeSort(sort);
    const meta = buildTileMeta(state.grid);

    if (!meta.length) {
      return;
    }

    if (normalizedSort === "original") {
      restoreOriginalOrder(meta);
      updateToolbarState(meta);
      return;
    }

    const fixedTiles = meta.filter((item) => !item.sortable);
    const sortableTiles = meta.filter((item) => item.sortable);
    const slots = sortableTiles
      .map((item) => item.originalArea)
      .sort((a, b) => a.row - b.row || a.col - b.col);
    const sortedTiles = [...sortableTiles].sort((a, b) => compareTiles(a, b, normalizedSort));

    for (const item of fixedTiles) {
      item.tile.style.gridArea = item.originalAreaText;
    }

    sortedTiles.forEach((item, index) => {
      const slot = slots[index];
      if (slot) {
        item.tile.style.gridArea = areaToString(slot);
      }
    });

    updateToolbarState(meta);
  }

  function ensureToolbar(grid) {
    if (
      state.toolbar &&
      document.contains(state.toolbar) &&
      state.toolbar.dataset.gridBound === "1" &&
      state.toolbar.parentElement === grid.parentElement &&
      state.toolbar.nextElementSibling === grid
    ) {
      return;
    }

    state.toolbar?.remove();

    const toolbar = document.createElement("section");
    toolbar.dataset.c1omsToolbar = "1";
    toolbar.dataset.gridBound = "1";
    toolbar.style.cssText = [
      "display:flex",
      "flex-wrap:wrap",
      "align-items:center",
      "justify-content:space-between",
      "gap:12px",
      "margin:0 0 16px 0",
      "padding:14px 16px",
      "border:1px solid #d4d4d4",
      "border-radius:12px",
      "background:#f8fafc",
      "font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif",
      "color:#0f172a",
      "box-shadow:0 4px 12px rgba(15,23,42,0.06)"
    ].join(";");

    const left = document.createElement("div");
    left.style.cssText = "display:flex;flex-direction:column;gap:4px;min-width:220px;";

    const title = document.createElement("strong");
    title.textContent = "Miles sorter";
    title.style.cssText = "font-size:14px;line-height:1.2;";

    const subtitle = document.createElement("div");
    subtitle.textContent = "Sort the offer grid by the miles shown on each tile.";
    subtitle.style.cssText = "font-size:12px;color:#475569;line-height:1.4;";

    left.append(title, subtitle);

    const right = document.createElement("div");
    right.style.cssText = "display:flex;flex-wrap:wrap;align-items:center;gap:10px;";

    const label = document.createElement("label");
    label.style.cssText = "display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;";
    label.textContent = "Order";

    const select = document.createElement("select");
    select.setAttribute("aria-label", "Sort offer tiles by miles");
    select.style.cssText = [
      "padding:8px 10px",
      "border:1px solid #94a3b8",
      "border-radius:10px",
      "background:#ffffff",
      "color:#0f172a",
      "font-size:13px",
      "cursor:pointer"
    ].join(";");

    for (const [value, text] of Object.entries(SORTS)) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = text;
      select.append(option);
    }

    select.value = state.currentSort;
    select.addEventListener("change", () => {
      state.currentSort = normalizeSort(select.value);
      applySort(state.currentSort);
    });

    label.appendChild(select);

    const status = document.createElement("div");
    status.dataset.c1omsStatus = "1";
    status.style.cssText = "font-size:12px;color:#475569;";

    right.append(label, status);
    toolbar.append(left, right);

    if (document.getElementById("c1oSorterOverlay")) {
      const warning = document.createElement("div");
      warning.textContent =
        "Another sorter overlay is present on this page. Disable that extension or userscript if it covers the feed.";
      warning.style.cssText =
        "width:100%;font-size:12px;color:#991b1b;background:#fef2f2;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;";
      toolbar.appendChild(warning);
    }

    grid.parentElement?.insertBefore(toolbar, grid);
    state.toolbar = toolbar;
  }

  function updateToolbarState(meta) {
    if (!state.toolbar) {
      return;
    }

    const select = state.toolbar.querySelector("select");
    if (select instanceof HTMLSelectElement) {
      select.value = state.currentSort;
    }

    const status = state.toolbar.querySelector("[data-c1oms-status='1']");
    if (!(status instanceof HTMLElement)) {
      return;
    }

    const sortableCount = meta.filter((item) => item.sortable).length;
    const xMultipleCount = meta.filter((item) => item.sortable && item.xMultiple != null).length;
    const fixedCount = meta.length - sortableCount;

    if (state.currentSort === "original") {
      status.textContent = `Showing original layout. ${sortableCount} sortable tiles, ${fixedCount} fixed tiles.`;
      return;
    }

    if (state.currentSort === "highestX") {
      status.textContent = `Sorted ${sortableCount} tiles by X multiple. ${xMultipleCount} tiles have explicit X offers.`;
      return;
    }

    status.textContent = `Sorted ${sortableCount} tiles by miles. ${fixedCount} larger tiles remain fixed.`;
  }

  async function initialize() {
    const preferences = await loadPreferences();
    state.defaultSort = preferences.defaultSort;
    state.autoSort = preferences.autoSort;
    state.currentSort = state.autoSort ? state.defaultSort : "original";

    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "sync") {
        return;
      }

      if (changes[STORAGE_KEYS.defaultSort]) {
        state.defaultSort = normalizeSort(changes[STORAGE_KEYS.defaultSort].newValue);
      }

      if (changes[STORAGE_KEYS.autoSort]) {
        state.autoSort = Boolean(changes[STORAGE_KEYS.autoSort].newValue);
      }

      state.currentSort = state.autoSort ? state.defaultSort : "original";
      scheduleSync();
    });

    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    window.addEventListener("load", scheduleSync, { once: true });
    scheduleSync();
  }

  initialize();
})();
