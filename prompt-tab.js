document.addEventListener("DOMContentLoaded", () => {
  // Load the pending tabs and default name
  browser.storage.local.get("pendingSave").then((data) => {
    if (data.pendingSave) {
      document.getElementById("groupName").value = data.pendingSave.defaultName;
    }
  });

  // Handle save button
  document.getElementById("saveBtn").addEventListener("click", () => {
    const groupName = document.getElementById("groupName").value.trim();
    if (groupName) {
      // Get the stored tabs and save them
      browser.storage.local.get("pendingSave").then((data) => {
        if (data.pendingSave && data.pendingSave.tabs) {
          // Call your save function
          browser.runtime
            .sendMessage({
              action: "saveTabsWithName",
              tabs: data.pendingSave.tabs,
              name: groupName,
            })
            .then(() => {
              // Clean up and close
              browser.storage.local.remove("pendingSave");
              window.close();
            });
        }
      });
    }
  });

  // Handle cancel
  document.getElementById("cancelBtn").addEventListener("click", () => {
    browser.storage.local.remove("pendingSave");
    window.close();
  });
});
