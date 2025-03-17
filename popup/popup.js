document.addEventListener("DOMContentLoaded", function () {
  // Initialize UI
  loadGroups();
  initDragAndDrop();
  setupKeyboardNavigation();

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.groupsUpdatedTimestamp) {
      loadGroups();
    }
  });

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

  // Debounced search input
  const searchInput = document.getElementById("search-groups");
  searchInput.addEventListener("input", debounce(filterGroups, 300));

  // Add pattern grouping button event
  document
    .getElementById("pattern-group")
    .addEventListener("click", groupByPattern);

  // Add merge groups button event
  document
    .getElementById("merge-groups")
    .addEventListener("click", mergeGroupsDialog);

  // Add restore deleted button event
  document
    .getElementById("restore-deleted")
    .addEventListener("click", showRecentlyDeleted);

  // Toggle keyboard shortcuts panel
  document
    .getElementById("toggle-shortcuts")
    .addEventListener("click", toggleShortcutsPanel);

  // Update groups list every time popup is opened
  browser.runtime.onMessage.addListener((message) => {
    if (message.action === "groupsUpdated") {
      loadGroups();
    }
  });

  // Open options page
  document.getElementById("open-options").addEventListener("click", (e) => {
    e.preventDefault();
    browser.runtime.openOptionsPage();
  });
});

// Save current tabs as a new group
function saveGroup() {
  const groupNameInput = document.getElementById("new-group-name");
  const groupName = groupNameInput.value.trim();

  if (!groupName) {
    showNotification("Please enter a group name", "error");
    groupNameInput.focus();
    return;
  }

  // Show loading state
  const saveButton = document.getElementById("save-group");
  const originalText = saveButton.innerHTML;
  saveButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  saveButton.disabled = true;

  browser.runtime
    .sendMessage({ action: "saveGroup", groupName })
    .then((response) => {
      if (response && response.success) {
        groupNameInput.value = "";
        loadGroups();
        showNotification("Group saved successfully", "success");
      } else {
        showNotification("Failed to save group", "error");
      }
    })
    .catch((error) => {
      console.error("Error saving group:", error);
      showNotification("Error saving group", "error");
    })
    .finally(() => {
      // Restore button state
      saveButton.innerHTML = originalText;
      saveButton.disabled = false;
      groupNameInput.focus();
    });
}

// Toggle keyboard shortcuts panel
function toggleShortcutsPanel() {
  const panel = document.getElementById("shortcuts-panel");
  panel.style.display = panel.style.display === "none" ? "block" : "none";
}

// Debounce function to limit frequent calls
function debounce(func, wait) {
  let timeout;
  return function () {
    const context = this;
    const args = arguments;
    clearTimeout(timeout);
    timeout = setTimeout(() => {
      func.apply(context, args);
    }, wait);
  };
}

// Setup keyboard navigation
function setupKeyboardNavigation() {
  document.addEventListener("keydown", (event) => {
    // Focus search when pressing '/'
    if (
      event.key === "/" &&
      document.activeElement !== document.getElementById("search-groups")
    ) {
      event.preventDefault();
      document.getElementById("search-groups").focus();
    }

    // ESC key closes any active dialogs
    if (event.key === "Escape") {
      const overlays = document.querySelectorAll(".overlay, .preview-overlay");
      if (overlays.length > 0) {
        overlays.forEach((overlay) => {
          document.body.removeChild(overlay);
        });
      }
    }

    // Enable arrow key navigation for groups
    if (["ArrowUp", "ArrowDown", "Enter"].includes(event.key)) {
      const groups = document.querySelectorAll(
        '.group-item:not([style*="display: none"])',
      );
      if (groups.length === 0) return;

      // Find currently focused group
      const focusedGroup = document.querySelector(".group-item.focused");
      let newFocusIndex = 0;

      if (focusedGroup) {
        const currentIndex = Array.from(groups).indexOf(focusedGroup);

        if (event.key === "ArrowUp") {
          newFocusIndex = (currentIndex - 1 + groups.length) % groups.length;
        } else if (event.key === "ArrowDown") {
          newFocusIndex = (currentIndex + 1) % groups.length;
        } else if (event.key === "Enter") {
          // Open the focused group
          const groupId = focusedGroup.dataset.groupId;
          openGroup(groupId);
          return;
        }
      }

      // Set focus on the new group
      groups.forEach((g) => g.classList.remove("focused"));
      groups[newFocusIndex].classList.add("focused");
      groups[newFocusIndex].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }
  });
}

// Load and display tab groups
function loadGroups() {
  browser.runtime
    .sendMessage({ action: "getGroups" })
    .then((response) => {
      if (!response) {
        console.error("Failed to get groups: Response is undefined");
        return;
      }

      const groups = response.groups || {};
      const groupsList = document.getElementById("groups-list");
      const addToGroupSelect = document.getElementById("add-to-group");
      const mergeGroupsSelect = document.getElementById("merge-source-group");
      const mergeTargetSelect = document.getElementById("merge-target-group");

      // Clear previous lists
      groupsList.innerHTML = "";
      addToGroupSelect.innerHTML =
        '<option value="">Select a group...</option>';

      // Reset merge selects if they exist
      if (mergeGroupsSelect) {
        mergeGroupsSelect.innerHTML =
          '<option value="">Select source group...</option>';
      }

      if (mergeTargetSelect) {
        mergeTargetSelect.innerHTML =
          '<option value="">Select target group...</option>';
      }

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

        // Add to merge dropdowns if they exist
        if (mergeGroupsSelect) {
          const sourceOption = option.cloneNode(true);
          mergeGroupsSelect.appendChild(sourceOption);
        }

        if (mergeTargetSelect) {
          const targetOption = option.cloneNode(true);
          mergeTargetSelect.appendChild(targetOption);
        }
      }
    })
    .catch((error) => {
      console.error("Error loading groups:", error);
      showNotification("Error loading groups", "error");
    });
}

// Create a group element
function createGroupElement(groupId, group, container) {
  // Create group element
  const groupElement = document.createElement("div");
  groupElement.className = "group-item";
  groupElement.dataset.groupId = groupId;
  groupElement.dataset.groupName = group.name.toLowerCase();
  groupElement.tabIndex = 0; // Make focusable for keyboard navigation

  // Auto-grouped indicator
  if (group.auto) {
    groupElement.classList.add("auto-group");
  }

  // Pattern grouped indicator
  if (group.pattern) {
    groupElement.classList.add("pattern-group");
  }

  // Restored group indicator
  if (group.restored) {
    groupElement.classList.add("restored-group");
  }

  // Create header with name and actions
  const header = document.createElement("div");
  header.className = "group-header";

  const name = document.createElement("h3");
  let iconClass = "fa-folder";
  if (group.auto) iconClass = "fa-layer-group";
  if (group.pattern) iconClass = "fa-filter";
  if (group.restored) iconClass = "fa-trash-restore";

  name.innerHTML = `<i class="fas ${iconClass}"></i> ${group.name}`;

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

  // Edit name button
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

  // Get max tabs display setting
  browser.storage.sync.get("maxTabsDisplayed").then((settings) => {
    const maxTabs = settings.maxTabsDisplayed || 15;
    const displayTabs = group.tabs.slice(0, maxTabs);

    for (let i = 0; i < displayTabs.length; i++) {
      const tab = displayTabs[i];
      const tabElement = createTabElement(tab, groupId, i);
      tabList.appendChild(tabElement);
    }

    // Show indicator if there are more tabs
    if (group.tabs.length > maxTabs) {
      const moreTabsElement = document.createElement("div");
      moreTabsElement.className = "more-tabs-indicator";
      moreTabsElement.textContent = `+${group.tabs.length - maxTabs} more tabs`;
      tabList.appendChild(moreTabsElement);
    }
  });

  // Assemble group element
  groupElement.appendChild(header);
  groupElement.appendChild(tabList);
  container.appendChild(groupElement);

  // Add event listener for keyboard activation
  groupElement.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      openGroup(groupId);
    }
  });
}

function showAllHiddenTabs(windowId) {
  browser.runtime
    .sendMessage({
      action: "showHiddenTabs",
      windowId: windowId,
    })
    .then((response) => {
      if (response && response.success) {
        loadGroups(); // Refresh the view
        showNotification("Restored all tabs", "success");
      }
    })
    .catch((error) => {
      console.error("Error showing hidden tabs:", error);
      showNotification("Error showing hidden tabs", "error");
    });
}

function checkForActiveGroup() {
  browser.tabs
    .query({ currentWindow: true, hidden: false })
    .then((visibleTabs) => {
      browser.tabs
        .query({ currentWindow: true, hidden: true })
        .then((hiddenTabs) => {
          // If we have hidden tabs, this might be a hidden group situation
          if (hiddenTabs.length > 0) {
            const currentWindowId =
              visibleTabs.length > 0 ? visibleTabs[0].windowId : null;

            // Check if this set of visible tabs matches any group
            browser.runtime
              .sendMessage({ action: "getGroups" })
              .then((response) => {
                if (!response || !response.groups) return;

                const groups = response.groups;
                const visibleUrls = new Set(visibleTabs.map((tab) => tab.url));

                for (const groupId in groups) {
                  const group = groups[groupId];
                  const groupUrls = new Set(group.tabs.map((tab) => tab.url));

                  // Check if the visible tabs match this group's tabs
                  let matches = 0;
                  let totalTabs = group.tabs.length;

                  group.tabs.forEach((groupTab) => {
                    if (visibleUrls.has(groupTab.url)) {
                      matches++;
                    }
                  });

                  // If we have at least 80% match, consider this the active group
                  if (matches > 0 && matches / totalTabs >= 0.8) {
                    // Mark this group as active
                    const groupElement = document.querySelector(
                      `.group-item[data-group-id="${groupId}"]`,
                    );
                    if (groupElement) {
                      groupElement.classList.add("active-group");

                      // Add a "Show All Tabs" button
                      const actionsElement =
                        groupElement.querySelector(".group-actions");
                      if (actionsElement) {
                        const showAllTabsButton =
                          document.createElement("button");
                        showAllTabsButton.className = "show-all-tabs-btn";
                        showAllTabsButton.innerHTML =
                          '<i class="fas fa-eye"></i>';
                        showAllTabsButton.title = "Show all hidden tabs";
                        showAllTabsButton.dataset.windowId = currentWindowId;
                        showAllTabsButton.addEventListener("click", (e) => {
                          e.stopPropagation();
                          showAllHiddenTabs(currentWindowId);
                        });
                        actionsElement.prepend(showAllTabsButton);
                      }
                    }

                    break;
                  }
                }
              });
          }
        });
    });
}

// Create a tab element
function createTabElement(tab, groupId, tabIndex) {
  const tabElement = document.createElement("div");
  tabElement.className = "tab-item";
  tabElement.dataset.tabIndex = tabIndex;
  tabElement.dataset.groupId = groupId;
  tabElement.dataset.url = tab.url;
  tabElement.draggable = true;

  // Tab domain badge
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
function handleDragEnd(_) {
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

  // Header with title
  const previewHeader = document.createElement("div");
  previewHeader.className = "preview-header";

  const title = document.createElement("div");
  title.className = "preview-title";
  title.textContent = tab.title;

  const closeBtn = document.createElement("button");
  closeBtn.className = "preview-close-btn";
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.addEventListener("click", () => {
    document.body.removeChild(overlay);
  });

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

// Group tabs by pattern
function groupByPattern() {
  const pattern = prompt("Enter a URL pattern (regex):", "");
  if (!pattern) return;

  const groupName = prompt("Enter a name for this group:", "");

  browser.runtime
    .sendMessage({
      action: "groupTabsByPattern",
      pattern: pattern,
      groupName: groupName,
    })
    .then((response) => {
      if (response && response.success) {
        loadGroups();
        showNotification("Pattern group created successfully", "success");
      } else {
        showNotification("No tabs matched the pattern", "error");
      }
    })
    .catch((error) => {
      console.error("Error creating pattern group:", error);
      showNotification("Error creating pattern group", "error");
    });
}

// Show merge groups dialog
function mergeGroupsDialog() {
  browser.runtime.sendMessage({ action: "getGroups" }).then((response) => {
    if (
      !response ||
      !response.groups ||
      Object.keys(response.groups).length < 2
    ) {
      showNotification("Need at least 2 groups to merge", "error");
      return;
    }

    // Create dialog
    const overlay = document.createElement("div");
    overlay.className = "overlay";

    const dialog = document.createElement("div");
    dialog.className = "dialog merge-dialog";

    const header = document.createElement("h3");
    header.textContent = "Merge Groups";

    const form = document.createElement("div");
    form.className = "merge-form";

    // Source group select
    const sourceLabel = document.createElement("label");
    sourceLabel.textContent = "Source Group (will be removed):";
    sourceLabel.htmlFor = "merge-source-group";

    const sourceSelect = document.createElement("select");
    sourceSelect.id = "merge-source-group";

    // Target group select
    const targetLabel = document.createElement("label");
    targetLabel.textContent = "Target Group (will receive tabs):";
    targetLabel.htmlFor = "merge-target-group";

    const targetSelect = document.createElement("select");
    targetSelect.id = "merge-target-group";

    // Populate select options
    const groups = response.groups;
    Object.keys(groups).forEach((groupId) => {
      const group = groups[groupId];

      const sourceOption = document.createElement("option");
      sourceOption.value = groupId;
      sourceOption.textContent = `${group.name} (${group.tabs.length} tabs)`;
      sourceSelect.appendChild(sourceOption);

      const targetOption = document.createElement("option");
      targetOption.value = groupId;
      targetOption.textContent = `${group.name} (${group.tabs.length} tabs)`;
      targetSelect.appendChild(targetOption);
    });

    // Buttons
    const buttons = document.createElement("div");
    buttons.className = "dialog-buttons";

    const cancelButton = document.createElement("button");
    cancelButton.className = "secondary-btn";
    cancelButton.textContent = "Cancel";
    cancelButton.addEventListener("click", () => {
      document.body.removeChild(overlay);
    });

    const mergeButton = document.createElement("button");
    mergeButton.className = "primary-btn";
    mergeButton.textContent = "Merge";
    mergeButton.addEventListener("click", () => {
      const sourceGroupId = sourceSelect.value;
      const targetGroupId = targetSelect.value;

      if (sourceGroupId === targetGroupId) {
        showNotification("Source and target groups must be different", "error");
        return;
      }

      // Send merge request
      browser.runtime
        .sendMessage({
          action: "mergeGroups",
          sourceGroupId,
          targetGroupId,
        })
        .then((response) => {
          if (response && response.success) {
            document.body.removeChild(overlay);
            loadGroups();
            showNotification("Groups merged successfully", "success");
          }
        })
        .catch((error) => {
          console.error("Error merging groups:", error);
          showNotification("Error merging groups", "error");
        });
    });

    buttons.appendChild(cancelButton);
    buttons.appendChild(mergeButton);

    // Assemble form
    form.appendChild(sourceLabel);
    form.appendChild(sourceSelect);
    form.appendChild(targetLabel);
    form.appendChild(targetSelect);

    // Assemble dialog
    dialog.appendChild(header);
    dialog.appendChild(form);
    dialog.appendChild(buttons);

    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
  });
}

// Show recently deleted groups
function showRecentlyDeleted() {
  browser.runtime
    .sendMessage({ action: "getRecentlyDeletedGroups" })
    .then((response) => {
      if (
        !response ||
        !response.recentlyDeleted ||
        response.recentlyDeleted.length === 0
      ) {
        showNotification("No recently deleted groups", "info");
        return;
      }

      // Create dialog
      const overlay = document.createElement("div");
      overlay.className = "overlay";

      const dialog = document.createElement("div");
      dialog.className = "dialog restore-dialog";

      const header = document.createElement("h3");
      header.textContent = "Recently Deleted Groups";

      const list = document.createElement("div");
      list.className = "deleted-groups-list";

      // Add each deleted group
      response.recentlyDeleted.forEach((item, index) => {
        const group = item.group;
        const deleteTime = new Date(item.deletedAt).toLocaleString();

        const groupItem = document.createElement("div");
        groupItem.className = "deleted-group-item";

        const groupInfo = document.createElement("div");
        groupInfo.className = "deleted-group-info";
        groupInfo.innerHTML = `
         <strong>${group.name}</strong> (${group.tabs.length} tabs)<br>
         <span class="delete-time">Deleted: ${deleteTime}</span>
       `;

        const restoreButton = document.createElement("button");
        restoreButton.className = "restore-btn";
        restoreButton.innerHTML =
          '<i class="fas fa-trash-restore"></i> Restore';
        restoreButton.addEventListener("click", () => {
          browser.runtime
            .sendMessage({
              action: "restoreRecentlyDeleted",
              index: index,
            })
            .then((response) => {
              if (response && response.success) {
                document.body.removeChild(overlay);
                loadGroups();
                showNotification("Group restored successfully", "success");
              }
            })
            .catch((error) => {
              console.error("Error restoring group:", error);
              showNotification("Error restoring group", "error");
            });
        });

        groupItem.appendChild(groupInfo);
        groupItem.appendChild(restoreButton);
        list.appendChild(groupItem);
      });

      // Close button
      const closeButton = document.createElement("button");
      closeButton.className = "primary-btn";
      closeButton.textContent = "Close";
      closeButton.addEventListener("click", () => {
        document.body.removeChild(overlay);
      });

      // Assemble dialog
      dialog.appendChild(header);
      dialog.appendChild(list);
      dialog.appendChild(closeButton);

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
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

  browser.runtime
    .sendMessage({ action: "saveGroup", groupName })
    .then((response) => {
      if (response && response.success) {
        groupNameInput.value = "";
        loadGroups();
        showNotification("Group saved successfully", "success");
      }
    })
    .catch((error) => {
      console.error("Error saving group:", error);
      showNotification("Error saving group", "error");
    });
}

// Auto-group tabs by domain
function autoGroupTabs() {
  browser.runtime
    .sendMessage({ action: "autoGroupTabs" })
    .then((response) => {
      if (response && response.success) {
        showNotification("Tabs auto-grouped by domain", "success");
        loadGroups();
      }
    })
    .catch((error) => {
      console.error("Error auto-grouping tabs:", error);
      showNotification("Error auto-grouping tabs", "error");
    });
}

// Open a tab group
function openGroup(groupId) {
  const openInNewWindow =
    document.querySelector('input[name="window-option"]:checked').value ===
    "new";

  browser.storage.sync.get("tabSwitchingMethod").then((settings) => {
    const tabSwitchingMethod = settings.tabSwitchingMethod || "close";

    let message = openInNewWindow
      ? "This will open the group in a new window. Continue?"
      : tabSwitchingMethod === "hide"
        ? "This will hide your current non-pinned tabs and show the group tabs. Continue?"
        : "This will replace your current non-pinned tabs. Continue?";

    showConfirm(message, () => {
      const action =
        tabSwitchingMethod === "hide" ? "openGroupWithHiding" : "openGroup";

      browser.runtime
        .sendMessage({
          action: action,
          groupId,
          openInNewWindow,
        })
        .then((response) => {
          if (response && response.success) {
            window.close(); // Close the popup
          }
        })
        .catch((error) => {
          console.error(
            `Error opening group with ${tabSwitchingMethod} method:`,
            error,
          );
          showNotification(`Error opening group`, "error");
        });
    });
  });
}

// Delete a tab group
function deleteGroup(groupId) {
  showConfirm("Are you sure you want to delete this group?", () => {
    browser.runtime
      .sendMessage({ action: "deleteGroup", groupId })
      .then((response) => {
        if (response && response.success) {
          loadGroups();
          showNotification("Group deleted", "success");
        }
      })
      .catch((error) => {
        console.error("Error deleting group:", error);
        showNotification("Error deleting group", "error");
      });
  });
}

// Rename a group
function renameGroup(groupId, currentName) {
  const newName = prompt("Enter new group name:", currentName);

  if (newName && newName.trim() !== "" && newName !== currentName) {
    browser.runtime
      .sendMessage({
        action: "renameGroup",
        groupId: groupId,
        newName: newName.trim(),
      })
      .then((response) => {
        if (response && response.success) {
          loadGroups();
          showNotification("Group renamed", "success");
        }
      })
      .catch((error) => {
        console.error("Error renaming group:", error);
        showNotification("Error renaming group", "error");
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

  browser.runtime
    .sendMessage({ action: "addTabToGroup", groupId })
    .then((response) => {
      if (response && response.success) {
        loadGroups();
        showNotification("Tab added to group", "success");
      }
    })
    .catch((error) => {
      console.error("Error adding tab to group:", error);
      showNotification("Error adding tab to group", "error");
    });
}

// Remove a tab from a group
function removeTabFromGroup(groupId, tabIndex) {
  browser.runtime
    .sendMessage({ action: "removeTabFromGroup", groupId, tabIndex })
    .then((response) => {
      if (response && response.success) {
        loadGroups();
        showNotification("Tab removed from group", "success");
      }
    })
    .catch((error) => {
      console.error("Error removing tab from group:", error);
      showNotification("Error removing tab from group", "error");
    });
}
// Export groups to a JSON file
function exportGroups() {
  browser.runtime
    .sendMessage({ action: "exportGroups" })
    .then((response) => {
      if (response && response.success) {
        const blob = new Blob([response.data], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const downloadLink = document.createElement("a");
        downloadLink.href = url;
        downloadLink.download =
          "tab-groups-backup-" +
          new Date().toISOString().split("T")[0] +
          ".json";

        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);

        showNotification("Groups exported successfully", "success");
      }
    })
    .catch((error) => {
      console.error("Error exporting groups:", error);
      showNotification("Error exporting groups", "error");
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

      browser.runtime
        .sendMessage({ action: "importGroups", data: jsonData })
        .then((response) => {
          if (response && response.success) {
            loadGroups();
            showNotification("Groups imported successfully", "success");
          } else {
            showNotification("Failed to import groups", "error");
          }
        })
        .catch((error) => {
          console.error("Error importing groups:", error);
          showNotification("Error importing groups", "error");
        });
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

// Show confirmation dialog
function showConfirm(message, onConfirm) {
  const overlay = document.createElement("div");
  overlay.className = "overlay";
  const dialog = document.createElement("div");
  dialog.className = "confirm-dialog";
  const content = document.createElement("div");
  content.className = "confirm-content";
  content.innerHTML = `<p>${message}</p>`;
  const buttons = document.createElement("div");
  buttons.className = "confirm-buttons";
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
  buttons.appendChild(cancelButton);
  buttons.appendChild(confirmButton);
  content.appendChild(buttons);
  dialog.appendChild(content);
  overlay.appendChild(dialog);
  document.body.appendChild(overlay);
}
