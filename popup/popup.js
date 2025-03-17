document.addEventListener("DOMContentLoaded", function () {
  // Initialize UI
  loadGroups();

  // Set up event listeners
  document.getElementById("save-group").addEventListener("click", saveGroup);
  document.getElementById("add-tab").addEventListener("click", addTabToGroup);

  // Update groups list every time popup is opened
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "groupsUpdated") {
      loadGroups();
    }
  });
});

// Load and display tab groups
function loadGroups() {
  browser.runtime.sendMessage({ action: "getGroups" }, (response) => {
    const groups = response.groups || {};
    const groupsList = document.getElementById("groups-list");
    const addToGroupSelect = document.getElementById("add-to-group");

    // Clear previous lists
    groupsList.innerHTML = "";
    addToGroupSelect.innerHTML = '<option value="">Select a group...</option>';

    if (Object.keys(groups).length === 0) {
      groupsList.innerHTML =
        '<div class="empty-message">No groups saved yet</div>';
      return;
    }

    // Sort groups by creation date (newest first)
    const sortedGroupIds = Object.keys(groups).sort((a, b) => {
      return groups[b].created - groups[a].created;
    });

    // Populate groups list
    for (const groupId of sortedGroupIds) {
      const group = groups[groupId];

      // Create group element
      const groupElement = document.createElement("div");
      groupElement.className = "group-item";

      // Create header with name and actions
      const header = document.createElement("div");
      header.className = "group-header";

      const name = document.createElement("h3");
      name.innerHTML = `<i class="fas fa-folder"></i> ${group.name}`;

      const tabCount = document.createElement("span");
      tabCount.className = "tab-count";
      tabCount.innerHTML = `<i class="fas fa-table-columns"></i> ${group.tabs.length}`;

      const actions = document.createElement("div");
      actions.className = "group-actions";

      const openButton = document.createElement("button");
      openButton.className = "open-group-btn";
      openButton.innerHTML = '<i class="fas fa-play"></i> Open';
      openButton.dataset.groupId = groupId;
      openButton.addEventListener("click", () => openGroup(groupId));

      const deleteButton = document.createElement("button");
      deleteButton.className = "delete-group-btn";
      deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
      deleteButton.dataset.groupId = groupId;
      deleteButton.addEventListener("click", () => deleteGroup(groupId));

      // Assemble header
      header.appendChild(name);
      header.appendChild(tabCount);
      actions.appendChild(openButton);
      actions.appendChild(deleteButton);
      header.appendChild(actions);

      // Create tab list
      const tabList = document.createElement("div");
      tabList.className = "tab-list";

      for (let i = 0; i < group.tabs.length; i++) {
        const tab = group.tabs[i];
        const tabElement = document.createElement("div");
        tabElement.className = "tab-item";

        // Tab favicon
        const favicon = document.createElement("img");
        favicon.className = "tab-favicon";
        favicon.src =
          tab.favIconUrl ||
          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>';
        favicon.alt = "";

        // Tab title
        const title = document.createElement("span");
        title.className = "tab-title";
        title.textContent = tab.title || tab.url;
        title.title = tab.url;

        // Remove tab button
        const removeBtn = document.createElement("button");
        removeBtn.className = "remove-tab-btn";
        removeBtn.innerHTML = '<i class="fas fa-times"></i>';
        removeBtn.title = "Remove tab from group";
        removeBtn.dataset.groupId = groupId;
        removeBtn.dataset.tabIndex = i;
        removeBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          removeTabFromGroup(groupId, i);
        });

        tabElement.appendChild(favicon);
        tabElement.appendChild(title);
        tabElement.appendChild(removeBtn);
        tabList.appendChild(tabElement);
      }

      // Assemble group element
      groupElement.appendChild(header);
      groupElement.appendChild(tabList);
      groupsList.appendChild(groupElement);

      // Add to dropdown
      const option = document.createElement("option");
      option.value = groupId;
      option.textContent = `${group.name} (${group.tabs.length} tabs)`;
      addToGroupSelect.appendChild(option);
    }
  });
}

// Save current tabs as a new group
function saveGroup() {
  const groupNameInput = document.getElementById("new-group-name");
  const groupName = groupNameInput.value.trim();

  if (!groupName) {
    alert("Please enter a group name");
    return;
  }

  browser.runtime.sendMessage(
    { action: "saveGroup", groupName },
    (response) => {
      if (response.success) {
        groupNameInput.value = "";
        loadGroups();
      }
    },
  );
}

// Open a tab group
function openGroup(groupId) {
  const openInNewWindow =
    document.querySelector('input[name="window-option"]:checked').value ===
    "new";

  const message = openInNewWindow
    ? "This will open the group in a new window. Continue?"
    : "This will replace your current non-pinned tabs. Continue?";

  showConfirm(message, () => {
    browser.runtime.sendMessage(
      {
        action: "openGroup",
        groupId,
        openInNewWindow,
      },
      (response) => {
        if (response.success) {
          window.close(); // Close the popup
        }
      },
    );
  });
}

// Delete a tab group
function deleteGroup(groupId) {
  showConfirm("Are you sure you want to delete this group?", () => {
    browser.runtime.sendMessage(
      { action: "deleteGroup", groupId },
      (response) => {
        if (response.success) {
          loadGroups();

          // Show notification
          const notification = document.createElement("div");
          notification.className = "notification success";
          notification.innerHTML =
            '<i class="fas fa-check-circle"></i> Group deleted';
          document.body.appendChild(notification);

          // Remove notification after 2 seconds
          setTimeout(() => {
            notification.classList.add("hide");
            setTimeout(() => {
              document.body.removeChild(notification);
            }, 300);
          }, 2000);
        }
      },
    );
  });
}

// Add current tab to an existing group
function addTabToGroup() {
  const select = document.getElementById("add-to-group");
  const groupId = select.value;

  if (!groupId) {
    alert("Please select a group");
    return;
  }

  browser.runtime.sendMessage(
    { action: "addTabToGroup", groupId },
    (response) => {
      if (response.success) {
        loadGroups();

        // Show notification
        const notification = document.createElement("div");
        notification.className = "notification success";
        notification.innerHTML =
          '<i class="fas fa-check-circle"></i> Tab added to group';
        document.body.appendChild(notification);

        // Remove notification after 2 seconds
        setTimeout(() => {
          notification.classList.add("hide");
          setTimeout(() => {
            document.body.removeChild(notification);
          }, 300);
        }, 2000);
      }
    },
  );
}

// Remove a tab from a group
function removeTabFromGroup(groupId, tabIndex) {
  browser.runtime.sendMessage(
    { action: "removeTabFromGroup", groupId, tabIndex },
    (response) => {
      if (response.success) {
        loadGroups();
      }
    },
  );
}

// Custom confirm dialog
function showConfirm(message, onConfirm) {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "overlay";

  // Create confirm dialog
  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog";

  const dialogContent = document.createElement("div");
  dialogContent.className = "confirm-content";
  dialogContent.innerHTML = `<p>${message}</p>`;

  const buttonGroup = document.createElement("div");
  buttonGroup.className = "confirm-buttons";

  const cancelButton = document.createElement("button");
  cancelButton.className = "cancel-btn";
  cancelButton.textContent = "Cancel";
  cancelButton.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  const confirmButton = document.createElement("button");
  confirmButton.className = "confirm-btn";
  confirmButton.textContent = "Confirm";
  confirmButton.addEventListener("click", () => {
    document.body.removeChild(overlay);
    onConfirm();
  });

  buttonGroup.appendChild(cancelButton);
  buttonGroup.appendChild(confirmButton);
  dialogContent.appendChild(buttonGroup);
  dialog.appendChild(dialogContent);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}
