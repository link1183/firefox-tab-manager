document.addEventListener("DOMContentLoaded", function () {
  // Load saved options
  loadOptions();

  // Set up event listeners for all inputs
  setupEventListeners();
});

// Load saved options from storage
function loadOptions() {
  browser.storage.sync.get(
    {
      // Default values
      defaultOpeningMethod: "current",
      includePinnedTabs: false,
      rememberLastGroup: true,
      enableKeyboardShortcuts: true,
      themeOption: "light",
      showDomainBadges: true,
      maxTabsDisplayed: 15,
      syncAcrossDevices: true,
      autoBackup: false,
      autoBackupFrequency: "weekly",
      suggestAutoGrouping: false,
      minTabsForSuggestion: 3,
      tabSwitchingMethod: "close",
    },
    function (items) {
      // Handle potential undefined items
      if (!items) {
        console.error("Failed to load options: items is undefined");
        return;
      }

      // Set form values based on stored settings
      document.getElementById("defaultOpeningMethod").value =
        items.defaultOpeningMethod;
      document.getElementById("includePinnedTabs").checked =
        items.includePinnedTabs;
      document.getElementById("rememberLastGroup").checked =
        items.rememberLastGroup;
      document.getElementById("enableKeyboardShortcuts").checked =
        items.enableKeyboardShortcuts;
      document.getElementById("themeOption").value = items.themeOption;
      document.getElementById("showDomainBadges").checked =
        items.showDomainBadges;
      document.getElementById("maxTabsDisplayed").value =
        items.maxTabsDisplayed;
      document.getElementById("syncAcrossDevices").checked =
        items.syncAcrossDevices;
      document.getElementById("autoBackup").checked = items.autoBackup;
      document.getElementById("autoBackupFrequency").value =
        items.autoBackupFrequency;
      document.getElementById("autoBackupFrequency").disabled =
        !items.autoBackup;
      document.getElementById("suggestAutoGrouping").checked =
        items.suggestAutoGrouping;
      document.getElementById("minTabsForSuggestion").value =
        items.minTabsForSuggestion;
      document.getElementById("tabSwitchingMethod").value =
        items.tabSwitchingMethod;

      // Apply initial theme if needed
      applyTheme(items.themeOption);
    },
  );
}

// Set up event listeners for all input changes
function setupEventListeners() {
  // Listen for changes on all form elements
  const inputs = document.querySelectorAll("input, select");
  inputs.forEach((input) => {
    input.addEventListener("change", saveOption);
  });

  // Special case for auto backup frequency
  document.getElementById("autoBackup").addEventListener("change", function () {
    document.getElementById("autoBackupFrequency").disabled = !this.checked;
    saveOption.call(this);
  });

  // Export button
  document
    .getElementById("exportAllData")
    .addEventListener("click", exportAllData);

  // Import button
  document.getElementById("importData").addEventListener("click", importData);

  // Advanced domain settings button
  document
    .getElementById("manageAutoGroups")
    .addEventListener("click", openAdvancedDomainSettings);
}

// Save a single option when it changes
function saveOption() {
  const id = this.id;
  const value = this.type === "checkbox" ? this.checked : this.value;

  // Create an object with the option to save
  const option = {};
  option[id] = value;

  // Save to storage
  browser.storage.sync.set(option, function () {
    showSavedIndicator();

    // Special handling for certain options
    if (id === "themeOption") {
      applyTheme(value);
    }

    if (id === "syncAcrossDevices" && !value) {
      // Warning about disabling sync
      if (
        confirm(
          "Disabling sync will keep your groups only on this device. Continue?",
        )
      ) {
        // Copy data from sync to sync if user confirms
        browser.storage.sync.get(null, function (items) {
          browser.storage.sync.set(items);
        });
      } else {
        // User cancelled, revert the change
        document.getElementById("syncAcrossDevices").checked = true;
        browser.storage.sync.set({ syncAcrossDevices: true });
      }
    }
  });
}

// Apply the selected theme
function applyTheme(theme) {
  if (theme === "system") {
    // Check system preference
    if (
      window.matchMedia &&
      window.matchMedia("(prefers-color-scheme: dark)").matches
    ) {
      document.body.classList.add("dark-theme");
    } else {
      document.body.classList.remove("dark-theme");
    }

    // Listen for changes in system theme
    window
      .matchMedia("(prefers-color-scheme: dark)")
      .addEventListener("change", (e) => {
        if (e.matches) {
          document.body.classList.add("dark-theme");
        } else {
          document.body.classList.remove("dark-theme");
        }
      });
  } else if (theme === "dark") {
    document.body.classList.add("dark-theme");
  } else {
    document.body.classList.remove("dark-theme");
  }
}

// Export all data
function exportAllData() {
  const storageArea = document.getElementById("syncAcrossDevices").checked
    ? browser.storage.sync
    : browser.storage.sync;

  storageArea.get(null, function (data) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);

    const downloadLink = document.createElement("a");
    downloadLink.href = url;
    downloadLink.download = `tab-group-manager-backup-${new Date().toISOString().split("T")[0]}.json`;

    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    showNotification("All data exported successfully!");
  });
}

// Import data
function importData() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";

  fileInput.addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (event) {
      try {
        const data = JSON.parse(event.target.result);

        // Confirm before overwriting existing data
        if (
          confirm(
            "This will overwrite your current settings and groups. Continue?",
          )
        ) {
          const storageArea = document.getElementById("syncAcrossDevices")
            .checked
            ? browser.storage.sync
            : browser.storage.sync;

          storageArea.clear().then(() => {
            storageArea.set(data).then(() => {
              showNotification("Data imported successfully! Reloading...");
              setTimeout(() => {
                window.location.reload();
              }, 1500);
            });
          });
        }
      } catch (error) {
        showNotification("Error importing data: Invalid JSON format", true);
        console.error("Import error:", error);
      }
    };

    reader.readAsText(file);
  });

  fileInput.click();
}

// Open advanced domain settings
function openAdvancedDomainSettings() {
  alert(
    "Advanced domain settings would be shown here. This feature is under development.",
  );
}

// Show the saved indicator briefly
function showSavedIndicator() {
  const savedIndicator = document.querySelector(".saved-indicator");
  savedIndicator.textContent = "Changes saved!";

  // Reset after a delay
  setTimeout(() => {
    savedIndicator.textContent = "All changes saved automatically";
  }, 2000);
}

// Show a notification
function showNotification(message, isError = false) {
  // Create notification element if it doesn't exist
  let notification = document.querySelector(".notification");
  if (!notification) {
    notification = document.createElement("div");
    notification.className = "notification";
    document.body.appendChild(notification);
  }

  // Set notification style based on type
  notification.className = `notification ${isError ? "error" : "success"}`;
  notification.textContent = message;

  // Show notification
  notification.classList.add("show");

  // Hide after delay
  setTimeout(() => {
    notification.classList.remove("show");
  }, 3000);
}
