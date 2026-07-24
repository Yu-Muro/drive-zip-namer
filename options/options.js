const DEFAULT_SETTINGS = {
  saveFolder: "",
  conflictAction: "uniquify",
  autoClearAfterUse: true,
  allowMultiple: true
};

const saveFolderInput = document.getElementById("save-folder");
const allowMultipleInput = document.getElementById("allow-multiple");
const autoClearInput = document.getElementById("auto-clear");
const saveButton = document.getElementById("save");
const savedNote = document.getElementById("saved-note");

init();

async function init() {
  const { userSettings } = await chrome.storage.local.get("userSettings");
  const settings = { ...DEFAULT_SETTINGS, ...userSettings };

  saveFolderInput.value = settings.saveFolder;
  allowMultipleInput.checked = settings.allowMultiple;
  autoClearInput.checked = settings.autoClearAfterUse;
  const conflictRadio = document.querySelector(
    `input[name="conflict"][value="${settings.conflictAction}"]`
  );
  if (conflictRadio) conflictRadio.checked = true;

  saveButton.addEventListener("click", save);
}

async function save() {
  const conflictAction =
    document.querySelector('input[name="conflict"]:checked')?.value ??
    "uniquify";

  await chrome.storage.local.set({
    userSettings: {
      saveFolder: saveFolderInput.value.trim(),
      conflictAction,
      allowMultiple: allowMultipleInput.checked,
      autoClearAfterUse: autoClearInput.checked
    }
  });

  savedNote.hidden = false;
  setTimeout(() => {
    savedNote.hidden = true;
  }, 2000);
}
