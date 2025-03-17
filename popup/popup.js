document.addEventListener("DOMContentLoaded", function () {
  // Initialize UI
  loadGroups();
  initDragAndDrop();

  // Set up event listeners
  document.getElementById("save-group").addEventListener("click", saveGroup);
  document.getElementById("add-tab").addEventListener("click", addTabToGroup);
  document
    .getElementById("auto-group")
    .addEventListener("click", autoGroupTabs);
  document
    .getElementById("export-groups")
    .addEventListener("click", exportGroups);
  document
    .getElementById("import-groups")
    .addEventListener("click", importGroups);
  document
    .getElementById("search-groups")
    .addEventListener("input", filterGroups);

  // Update groups list every time popup is opened
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "groupsUpdated") {
      loadGroups();
    }
  });
});

// Load and display tab groups
function loadGroups() {
  browser.runtime.sendMessage({ action: "getGroups" }).then((response) => {
    // Fix: Check if response exists before processing it
    if (!response) {
      console.error("Failed to get groups: Response is undefined");
      return;
    }

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
      // If there's a lastAccessed timestamp, use that for sorting instead
      const aTime = groups[a].lastAccessed || groups[a].created;
      const bTime = groups[b].lastAccessed || groups[b].created;
      return bTime - aTime;
    });

    // Populate groups list
    for (const groupId of sortedGroupIds) {
      const group = groups[groupId];
      createGroupElement(groupId, group, groupsList);

      // Add to dropdown
      const option = document.createElement("option");
      option.value = groupId;
      option.textContent = `${group.name} (${group.tabs.length} tabs)`;
      addToGroupSelect.appendChild(option);
    }
  });
}

// Create a group element
function createGroupElement(groupId, group, container) {
  // Create group element
  const groupElement = document.createElement("div");
  groupElement.className = "group-item";
  groupElement.dataset.groupId = groupId;
  groupElement.dataset.groupName = group.name.toLowerCase();

  // Auto-grouped indicator
  if (group.auto) {
    groupElement.classList.add("auto-group");
  }

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
  openButton.innerHTML = '<i class="fas fa-play"></i>';
  openButton.title = "Open group";
  openButton.dataset.groupId = groupId;
  openButton.addEventListener("click", () => openGroup(groupId));

  const deleteButton = document.createElement("button");
  deleteButton.className = "delete-group-btn";
  deleteButton.innerHTML = '<i class="fas fa-trash"></i>';
  deleteButton.title = "Delete group";
  deleteButton.dataset.groupId = groupId;
  deleteButton.addEventListener("click", () => deleteGroup(groupId));

  // Optional: Add edit name button
  const editButton = document.createElement("button");
  editButton.className = "edit-group-btn";
  editButton.innerHTML = '<i class="fas fa-edit"></i>';
  editButton.title = "Rename group";
  editButton.dataset.groupId = groupId;
  editButton.addEventListener("click", () => renameGroup(groupId, group.name));

  // Assemble header
  header.appendChild(name);
  header.appendChild(tabCount);
  actions.appendChild(openButton);
  actions.appendChild(editButton);
  actions.appendChild(deleteButton);
  header.appendChild(actions);

  // Create tab list
  const tabList = document.createElement("div");
  tabList.className = "tab-list";
  tabList.dataset.groupId = groupId;

  for (let i = 0; i < group.tabs.length; i++) {
    const tab = group.tabs[i];
    const tabElement = createTabElement(tab, groupId, i);
    tabList.appendChild(tabElement);
  }

  // Assemble group element
  groupElement.appendChild(header);
  groupElement.appendChild(tabList);
  container.appendChild(groupElement);
}

// Create a tab element
function createTabElement(tab, groupId, tabIndex) {
  const tabElement = document.createElement("div");
  tabElement.className = "tab-item";
  tabElement.dataset.tabIndex = tabIndex;
  tabElement.dataset.groupId = groupId;
  tabElement.dataset.url = tab.url;
  tabElement.draggable = true;

  // Tab favicon
  const favicon = document.createElement("img");
  favicon.className = "tab-favicon";
  favicon.src =
    tab.favIconUrl ||
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"><path d="M0 0h24v24H0z" fill="none"/><path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z"/></svg>';
  favicon.alt = "";

  // Tab domain badge (new)
  const domainBadge = document.createElement("span");
  domainBadge.className = "domain-badge";
  if (tab.domain) {
    domainBadge.textContent = tab.domain.replace(/^www\./, "");
    domainBadge.title = tab.domain;
  }

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
  removeBtn.dataset.tabIndex = tabIndex;
  removeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    removeTabFromGroup(groupId, tabIndex);
  });

  // Preview button
  const previewBtn = document.createElement("button");
  previewBtn.className = "preview-tab-btn";
  previewBtn.innerHTML = '<i class="fas fa-eye"></i>';
  previewBtn.title = "Preview tab";
  previewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    showTabPreview(tab);
  });

  tabElement.appendChild(favicon);
  if (tab.domain) {
    tabElement.appendChild(domainBadge);
  }
  tabElement.appendChild(title);
  tabElement.appendChild(previewBtn);
  tabElement.appendChild(removeBtn);

  // Set up drag events
  tabElement.addEventListener("dragstart", handleDragStart);
  tabElement.addEventListener("dragover", handleDragOver);
  tabElement.addEventListener("drop", handleDrop);
  tabElement.addEventListener("dragend", handleDragEnd);

  return tabElement;
}

// Initialize drag and drop functionality
function initDragAndDrop() {
  // Set up drag events for group-list container (for dropping into empty groups)
  const groupsList = document.getElementById("groups-list");
  groupsList.addEventListener("dragover", handleGroupListDragOver);
  groupsList.addEventListener("drop", handleGroupListDrop);
}

// Handle the start of dragging a tab
function handleDragStart(e) {
  e.dataTransfer.setData(
    "text/plain",
    JSON.stringify({
      groupId: this.dataset.groupId,
      tabIndex: this.dataset.tabIndex,
    }),
  );
  this.classList.add("dragging");
}

// Handle dragging over a potential drop target
function handleDragOver(e) {
  e.preventDefault();
  this.classList.add("drag-over");
}

// Handle dropping a tab onto another tab
function handleDrop(e) {
  e.preventDefault();
  this.classList.remove("drag-over");

  const data = JSON.parse(e.dataTransfer.getData("text/plain"));
  const sourceGroupId = data.groupId;
  const sourceTabIndex = parseInt(data.tabIndex);

  const targetGroupId = this.dataset.groupId;
  const targetTabIndex = parseInt(this.dataset.tabIndex);

  // If dropping in the same group, reorder
  if (sourceGroupId === targetGroupId) {
    browser.runtime.sendMessage({
      action: "reorderTabInGroup",
      groupId: sourceGroupId,
      oldIndex: sourceTabIndex,
      newIndex: targetTabIndex,
    });
  } else {
    // Move tab between groups
    browser.runtime.sendMessage({
      action: "moveTabBetweenGroups",
      sourceGroupId: sourceGroupId,
      tabIndex: sourceTabIndex,
      targetGroupId: targetGroupId,
    });
  }
}

// Handle dragging over the groups list (for empty groups)
function handleGroupListDragOver(e) {
  // Only allow dropping if we're over a group element
  const groupElement = e.target.closest(".group-item");
  if (groupElement) {
    e.preventDefault();
  }
}

// Handle dropping onto the groups list
function handleGroupListDrop(e) {
  const groupElement = e.target.closest(".group-item");
  if (!groupElement) return;

  e.preventDefault();

  const data = JSON.parse(e.dataTransfer.getData("text/plain"));
  const sourceGroupId = data.groupId;
  const sourceTabIndex = parseInt(data.tabIndex);

  const targetGroupId = groupElement.dataset.groupId;

  // Don't do anything if it's the same group
  if (sourceGroupId === targetGroupId) return;

  // Move tab to the end of the target group
  browser.runtime.sendMessage({
    action: "moveTabBetweenGroups",
    sourceGroupId: sourceGroupId,
    tabIndex: sourceTabIndex,
    targetGroupId: targetGroupId,
  });
}

// Handle end of drag operation
function handleDragEnd(e) {
  // Remove drag styling from all elements
  document.querySelectorAll(".dragging").forEach((el) => {
    el.classList.remove("dragging");
  });

  document.querySelectorAll(".drag-over").forEach((el) => {
    el.classList.remove("drag-over");
  });
}

// Show tab preview
function showTabPreview(tab) {
  // Create overlay
  const overlay = document.createElement("div");
  overlay.className = "preview-overlay";

  // Create preview container
  const previewContainer = document.createElement("div");
  previewContainer.className = "preview-container";

  // Header with favicon and title
  const previewHeader = document.createElement("div");
  previewHeader.className = "preview-header";

  const favicon = document.createElement("img");
  favicon.src =
    tab.favIconUrl ||
    'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24"></svg>';
  favicon.className = "preview-favicon";

  const title = document.createElement("div");
  title.className = "preview-title";
  title.textContent = tab.title;

  const closeBtn = document.createElement("button");
  closeBtn.className = "preview-close-btn";
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

  previewHeader.appendChild(favicon);
  previewHeader.appendChild(title);
  previewHeader.appendChild(closeBtn);

  // URL display
  const urlDisplay = document.createElement("div");
  urlDisplay.className = "preview-url";
  urlDisplay.textContent = tab.url;

  // Preview iframe or image (simplified - in a real extension this would be more complex)
  const previewContent = document.createElement("div");
  previewContent.className = "preview-content";
  previewContent.innerHTML = `
    <div class="preview-placeholder">
      <i class="fas fa-globe fa-3x"></i>
      <p>${tab.domain || "Website"}</p>
    </div>
  `;

  // Action buttons
  const previewActions = document.createElement("div");
  previewActions.className = "preview-actions";

  const openBtn = document.createElement("button");
  openBtn.className = "preview-open-btn";
  openBtn.innerHTML = '<i class="fas fa-external-link-alt"></i> Open Tab';
  openBtn.addEventListener("click", () => {
    browser.tabs.create({ url: tab.url });
    document.body.removeChild(overlay);
  });

  previewActions.appendChild(openBtn);

  // Assemble preview
  previewContainer.appendChild(previewHeader);
  previewContainer.appendChild(urlDisplay);
  previewContainer.appendChild(previewContent);
  previewContainer.appendChild(previewActions);

  overlay.appendChild(previewContainer);
  document.body.appendChild(overlay);

  // Close when clicking outside
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      document.body.removeChild(overlay);
    }
  });
}

// Filter groups based on search input
function filterGroups() {
  const searchTerm = document
    .getElementById("search-groups")
    .value.toLowerCase();
  const groups = document.querySelectorAll(".group-item");

  groups.forEach((group) => {
    const groupName = group.dataset.groupName;
    const tabs = Array.from(group.querySelectorAll(".tab-item"));

    let groupVisible = groupName.includes(searchTerm);

    // If group name doesn't match, check if any tabs match
    if (!groupVisible) {
      const hasMatchingTab = tabs.some((tab) => {
        const tabTitle = tab
          .querySelector(".tab-title")
          .textContent.toLowerCase();
        const tabUrl = tab.dataset.url.toLowerCase();
        return tabTitle.includes(searchTerm) || tabUrl.includes(searchTerm);
      });

      groupVisible = hasMatchingTab;
    }

    // Show/hide group based on search
    group.style.display = groupVisible ? "" : "none";
  });
}

// Save current tabs as a new group
function saveGroup() {
  const groupNameInput = document.getElementById("new-group-name");
  const groupName = groupNameInput.value.trim();

  if (!groupName) {
    showNotification("Please enter a group name", "error");
    return;
  }

  browser.runtime.sendMessage(
    { action: "saveGroup", groupName },
    (response) => {
      if (response.success) {
        groupNameInput.value = "";
        loadGroups();
        showNotification("Group saved successfully", "success");
      }
    },
  );
}

// Auto-group tabs by domain
function autoGroupTabs() {
  browser.runtime.sendMessage({ action: "autoGroupTabs" }, (response) => {
    if (response.success) {
      showNotification("Tabs auto-grouped by domain", "success");
      loadGroups();
    }
  });
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
          showNotification("Group deleted", "success");
        }
      },
    );
  });
}

// Rename a group
function renameGroup(groupId, currentName) {
  const newName = prompt("Enter new group name:", currentName);

  if (newName && newName.trim() !== "" && newName !== currentName) {
    browser.storage.sync.get("groups", (data) => {
      if (data.groups && data.groups[groupId]) {
        const groups = data.groups;
        groups[groupId].name = newName.trim();
        browser.storage.sync.set({ groups }, () => {
          loadGroups();
          showNotification("Group renamed", "success");
        });
      }
    });
  }
}

// Add current tab to an existing group
function addTabToGroup() {
  const select = document.getElementById("add-to-group");
  const groupId = select.value;

  if (!groupId) {
    showNotification("Please select a group", "error");
    return;
  }

  browser.runtime.sendMessage(
    { action: "addTabToGroup", groupId },
    (response) => {
      if (response.success) {
        loadGroups();
        showNotification("Tab added to group", "success");
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
        showNotification("Tab removed from group", "success");
      }
    },
  );
}

// Export groups to a JSON file
function exportGroups() {
  browser.runtime.sendMessage({ action: "exportGroups" }, (response) => {
    if (response.success) {
      const blob = new Blob([response.data], { type: "application/json" });
      const url = URL.createObjectURL(blob);

      const downloadLink = document.createElement("a");
      downloadLink.href = url;
      downloadLink.download =
        "tab-groups-backup-" + new Date().toISOString().split("T")[0] + ".json";

      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      showNotification("Groups exported successfully", "success");
    }
  });
}

// Import groups from a JSON file
function importGroups() {
  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = ".json";

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const jsonData = event.target.result;

      browser.runtime.sendMessage(
        { action: "importGroups", data: jsonData },
        (response) => {
          if (response.success) {
            loadGroups();
            showNotification("Groups imported successfully", "success");
          } else {
            showNotification("Failed to import groups", "error");
          }
        },
      );
    };

    reader.readAsText(file);
  });

  fileInput.click();
}

// Show notification
function showNotification(message, type) {
  // Remove existing notifications
  const existingNotifications = document.querySelectorAll(".notification");
  existingNotifications.forEach((notification) => {
    notification.classList.add("hide");
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 300);
  });

  // Create notification
  const notification = document.createElement("div");
  notification.className = `notification ${type}`;
  const icon = type === "success" ? "check-circle" : "exclamation-circle";
  notification.innerHTML = `<i class="fas fa-${icon}"></i> ${message}`;
  document.body.appendChild(notification);

  // Remove notification after 2 seconds
  setTimeout(() => {
    notification.classList.add("hide");
    setTimeout(() => {
      if (notification.parentNode) {
        document.body.removeChild(notification);
      }
    }, 300);
  }, 2000);
}
