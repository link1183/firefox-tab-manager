document.addEventListener("DOMContentLoaded", function () {
  // Load groups
  loadGroups();

  // Set up keyboard event listeners
  setupKeyboardShortcuts();

  // Set up search functionality
  document
    .getElementById("search-input")
    .addEventListener("input", filterGroups);

  // Close panel when pressing Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      window.close();
    }
  });
});

// Load groups from storage
function loadGroups() {
  browser.runtime
    .sendMessage({ action: "getGroups" })
    .then((response) => {
      if (!response || !response.groups) {
        showEmptyState();
        return;
      }

      const groups = response.groups;

      if (Object.keys(groups).length === 0) {
        showEmptyState();
        return;
      }

      displayGroups(groups);
    })
    .catch((error) => {
      console.error("Error loading groups:", error);
      showError("Could not load tab groups. Please try again.");
    });
}

// Show empty state message
function showEmptyState() {
  const groupsList = document.getElementById("groups-list");
  groupsList.innerHTML =
    '<div class="empty-state">No tab groups found. Create one first.</div>';
}

// Show error message
function showError(message) {
  const groupsList = document.getElementById("groups-list");
  groupsList.innerHTML = `<div class="error-state">${message}</div>`;
}

// Display groups in the list
function displayGroups(groups) {
  const groupsList = document.getElementById("groups-list");
  groupsList.innerHTML = "";

  // Sort groups by last accessed time (most recent first)
  const sortedGroupIds = Object.keys(groups).sort((a, b) => {
    const aTime = groups[a].lastAccessed || groups[a].created;
    const bTime = groups[b].lastAccessed || groups[b].created;
    return bTime - aTime;
  });

  // Display top 9 groups (for numeric shortcuts)
  const maxGroups = Math.min(sortedGroupIds.length, 9);

  for (let i = 0; i < maxGroups; i++) {
    const groupId = sortedGroupIds[i];
    const group = groups[groupId];

    const groupElement = document.createElement("div");
    groupElement.className = "group-item";
    groupElement.dataset.groupId = groupId;
    groupElement.dataset.name = group.name.toLowerCase();

    // Number for keyboard shortcut
    const groupNumber = document.createElement("div");
    groupNumber.className = "group-number";
    groupNumber.textContent = i + 1;

    // Group info
    const groupInfo = document.createElement("div");
    groupInfo.className = "group-info";

    const groupName = document.createElement("div");
    groupName.className = "group-name";
    groupName.textContent = group.name;

    const groupMeta = document.createElement("div");
    groupMeta.className = "group-meta";

    const tabCount = document.createElement("div");
    tabCount.className = "tab-count";
    tabCount.innerHTML = `<i class="fas fa-table-columns"></i> ${group.tabs.length} tabs`;

    const lastUsed = document.createElement("div");
    lastUsed.className = "last-used";
    lastUsed.innerHTML = `<i class="fas fa-clock"></i> ${formatLastAccessed(group.lastAccessed || group.created)}`;

    // Assemble group element
    groupMeta.appendChild(tabCount);
    groupMeta.appendChild(lastUsed);

    groupInfo.appendChild(groupName);
    groupInfo.appendChild(groupMeta);

    groupElement.appendChild(groupNumber);
    groupElement.appendChild(groupInfo);

    // Add click event to open group
    groupElement.addEventListener("click", () => openGroup(groupId));

    groupsList.appendChild(groupElement);
  }
}

// Format last accessed time relative to now
function formatLastAccessed(timestamp) {
  const now = Date.now();
  const diffMs = now - timestamp;

  // Convert to appropriate time unit
  const seconds = Math.floor(diffMs / 1000);

  if (seconds < 60) {
    return `${seconds} sec${seconds !== 1 ? "s" : ""} ago`;
  }

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min${minutes !== 1 ? "s" : ""} ago`;
  }

  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} hr${hours !== 1 ? "s" : ""} ago`;
  }

  const days = Math.floor(hours / 24);
  if (days < 30) {
    return `${days} day${days !== 1 ? "s" : ""} ago`;
  }

  const months = Math.floor(days / 30);
  return `${months} month${months !== 1 ? "s" : ""} ago`;
}

// Filter groups based on search input
function filterGroups() {
  const searchTerm = document
    .getElementById("search-input")
    .value.toLowerCase();
  const groupItems = document.querySelectorAll(".group-item");

  groupItems.forEach((item) => {
    const name = item.dataset.name;
    const isVisible = name.includes(searchTerm);
    item.style.display = isVisible ? "" : "none";
  });

  updateKeyboardShortcuts();
}

// Set up keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener("keydown", function (e) {
    // Number keys 1-9 open the corresponding group
    if (e.key >= "1" && e.key <= "9") {
      e.preventDefault();

      const index = parseInt(e.key) - 1;
      const visibleGroups = getVisibleGroups();

      if (index < visibleGroups.length) {
        const groupId = visibleGroups[index].dataset.groupId;
        openGroup(groupId);
      }
    }

    // Arrow keys for navigation
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();

      const visibleGroups = getVisibleGroups();
      if (visibleGroups.length === 0) return;

      // Find currently focused group
      let focusedIndex = -1;
      visibleGroups.forEach((group, i) => {
        if (group.classList.contains("focused")) {
          focusedIndex = i;
        }
      });

      // Calculate new focus index
      let newIndex;
      if (e.key === "ArrowDown") {
        newIndex =
          focusedIndex === -1 ? 0 : (focusedIndex + 1) % visibleGroups.length;
      } else {
        newIndex =
          focusedIndex === -1
            ? visibleGroups.length - 1
            : (focusedIndex - 1 + visibleGroups.length) % visibleGroups.length;
      }

      // Update focus
      visibleGroups.forEach((group) => group.classList.remove("focused"));
      visibleGroups[newIndex].classList.add("focused");
      visibleGroups[newIndex].scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
    }

    // Enter to open the focused group
    if (e.key === "Enter") {
      e.preventDefault();

      const focusedGroup = document.querySelector(".group-item.focused");
      if (focusedGroup) {
        openGroup(focusedGroup.dataset.groupId);
      }
    }
  });
}

// Update keyboard shortcuts based on visible groups
function updateKeyboardShortcuts() {
  const visibleGroups = getVisibleGroups();

  // Remove all group numbers
  document.querySelectorAll(".group-number").forEach((num) => {
    num.textContent = "";
  });

  // Add numbers to visible groups
  for (let i = 0; i < Math.min(visibleGroups.length, 9); i++) {
    const groupNumber = visibleGroups[i].querySelector(".group-number");
    groupNumber.textContent = i + 1;
  }
}

// Get all visible groups
function getVisibleGroups() {
  return Array.from(document.querySelectorAll(".group-item")).filter(
    (group) => {
      return group.style.display !== "none";
    },
  );
}

// Open a group
function openGroup(groupId) {
  const openInNewWindow = document.getElementById("open-new-window").checked;

  browser.runtime
    .sendMessage({
      action: "openGroup",
      groupId,
      openInNewWindow,
    })
    .then((response) => {
      if (response && response.success) {
        window.close();
      }
    })
    .catch((error) => {
      console.error("Error opening group:", error);
    });
}
