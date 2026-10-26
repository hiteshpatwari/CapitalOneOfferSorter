const STORAGE_KEYS = {
  defaultSort: "defaultSort",
  autoSort: "autoSort"
};

const defaultSortInput = document.getElementById("defaultSort");
const autoSortInput = document.getElementById("autoSort");
const saveButton = document.getElementById("saveButton");
const status = document.getElementById("status");

function setStatus(message) {
  status.textContent = message;
  window.setTimeout(() => {
    if (status.textContent === message) {
      status.textContent = "";
    }
  }, 2200);
}

chrome.storage.sync.get(
  {
    [STORAGE_KEYS.defaultSort]: "highest",
    [STORAGE_KEYS.autoSort]: true
  },
  (items) => {
    defaultSortInput.value = items[STORAGE_KEYS.defaultSort];
    autoSortInput.checked = Boolean(items[STORAGE_KEYS.autoSort]);
  }
);

saveButton.addEventListener("click", () => {
  chrome.storage.sync.set(
    {
      [STORAGE_KEYS.defaultSort]: defaultSortInput.value,
      [STORAGE_KEYS.autoSort]: autoSortInput.checked
    },
    () => setStatus("Settings saved.")
  );
});
