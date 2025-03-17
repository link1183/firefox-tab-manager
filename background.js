// Tab group data structure will be stored in browser.storage.sync for cross-device functionality
// Format: { groups: { groupId: { name: string, tabs: [tabInfo], created: timestamp } } }

// Initialize storage with empty groups if not exists
browser.runtime.onInstalled.addListener(() => {
  browser.storage.sync.get("groups").then((data) => {
    if (!data.groups) {
      browser.storage.sync.set({ groups: {} });
    }
  });
});

// Save current tabs as a group
function saveTabGroup(groupName) {
  browser.tabs.query({ currentWindow: true }, (tabs) => {
    // Filter out pinned tabs
    const nonPinnedTabs = tabs.filter((tab) => !tab.pinned);

    const tabInfoList = nonPinnedTabs.map((tab) => ({
      url: tab.url,
      title: tab.title,
      domain: extractDomain(tab.url),
    }));

    browser.storage.sync.get("groups").then((data) => {
      const groups = data.groups || {};
      const groupId = Date.now().toString();

      groups[groupId] = {
        name: groupName,
        tabs: tabInfoList,
        created: Date.now(),
      };

      browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
      });
    });
  });
}

// Extract domain from URL
function extractDomain(url) {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch (e) {
    return "";
  }
}

// Open a tab group
function openTabGroup(groupId, openInNewWindow = false) {
  browser.storage.sync.get("groups").then((data) => {
    if (!data.groups || !data.groups[groupId]) {
      return;
    }

    const group = data.groups[groupId];

    if (openInNewWindow) {
      // Open in a new window
      browser.windows.create({ url: group.tabs[0].url }).then((newWindow) => {
        // Open the rest of the tabs in the new window
        for (let i = 1; i < group.tabs.length; i++) {
          browser.tabs.create({
            url: group.tabs[i].url,
            windowId: newWindow.id,
          });
        }
      });
    } else {
      // Open in current window and replace non-pinned tabs
      browser.tabs.query({ currentWindow: true }).then((currentTabs) => {
        // Get non-pinned tabs to close later
        const nonPinnedTabs = currentTabs.filter((tab) => !tab.pinned);

        // Open the first tab of the group and get its window ID
        browser.tabs.create({ url: group.tabs[0].url }).then((firstTab) => {
          const windowId = firstTab.windowId;

          // Open the rest of the tabs in the same window
          for (let i = 1; i < group.tabs.length; i++) {
            browser.tabs.create({
              url: group.tabs[i].url,
              windowId: windowId,
            });
          }

          // Close all the original non-pinned tabs
          const tabIdsToClose = nonPinnedTabs.map((tab) => tab.id);
          browser.tabs.remove(tabIdsToClose);
        });
      });
    }

    // Update last accessed timestamp
    updateGroupAccessTime(groupId);
  });
}

// Update the last accessed timestamp for a group
function updateGroupAccessTime(groupId) {
  return browser.storage.sync.get("groups").then((data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      groups[groupId].lastAccessed = Date.now();
      return browser.storage.sync.set({ groups });
    }
  });
}

// Delete a tab group
function deleteTabGroup(groupId) {
  return browser.storage.sync.get("groups").then((data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      delete groups[groupId];
      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    }
    return false;
  });
}

// Add current tab to an existing group
function addTabToGroup(groupId) {
  return browser.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => {
      if (tabs.length === 0) return false;

      const tab = tabs[0];
      const tabInfo = {
        url: tab.url,
        title: tab.title,
        domain: extractDomain(tab.url),
      };

      return browser.storage.sync.get("groups").then((data) => {
        if (data.groups && data.groups[groupId]) {
          const groups = data.groups;
          groups[groupId].tabs.push(tabInfo);
          return browser.storage.sync.set({ groups }).then(() => {
            notifyGroupsUpdated();
            return true;
          });
        }
        return false;
      });
    });
}

// Remove a tab from a group
function removeTabFromGroup(groupId, tabIndex) {
  return browser.storage.sync.get("groups").then((data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      groups[groupId].tabs.splice(tabIndex, 1);
      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    }
    return false;
  });
}

// Reorder tabs within a group
function reorderTabInGroup(groupId, oldIndex, newIndex) {
  browser.storage.sync.get("groups", (data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      const tab = groups[groupId].tabs[oldIndex];

      // Remove from old position
      groups[groupId].tabs.splice(oldIndex, 1);

      // Insert at new position
      groups[groupId].tabs.splice(newIndex, 0, tab);

      browser.storage.sync.set({ groups }, () => {
        notifyGroupsUpdated();
      });
    }
  });
}

// Move a tab from one group to another
function moveTabBetweenGroups(sourceGroupId, tabIndex, targetGroupId) {
  browser.storage.sync.get("groups", (data) => {
    if (
      data.groups &&
      data.groups[sourceGroupId] &&
      data.groups[targetGroupId]
    ) {
      const groups = data.groups;
      const tab = groups[sourceGroupId].tabs[tabIndex];

      // Remove from source group
      groups[sourceGroupId].tabs.splice(tabIndex, 1);

      // Add to target group
      groups[targetGroupId].tabs.push(tab);

      browser.storage.sync.set({ groups }, () => {
        notifyGroupsUpdated();
      });
    }
  });
}

// Auto-group tabs by domain
function autoGroupTabs() {
  return browser.tabs.query({ currentWindow: true }).then((tabs) => {
    // Filter out pinned tabs
    const nonPinnedTabs = tabs.filter((tab) => !tab.pinned);

    // Group tabs by domain
    const domainGroups = {};

    nonPinnedTabs.forEach((tab) => {
      const domain = extractDomain(tab.url);
      if (!domain) return;

      if (!domainGroups[domain]) {
        domainGroups[domain] = [];
      }

      domainGroups[domain].push({
        url: tab.url,
        title: tab.title,
        domain: domain,
      });
    });

    // Create a new group for each domain with more than one tab
    return browser.storage.sync.get("groups").then((data) => {
      const groups = data.groups || {};

      Object.keys(domainGroups).forEach((domain) => {
        if (domainGroups[domain].length > 1) {
          const groupId = `auto_${domain}_${Date.now()}`;
          groups[groupId] = {
            name: `${domain.replace("www.", "")}`,
            tabs: domainGroups[domain],
            created: Date.now(),
            auto: true,
          };
        }
      });

      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    });
  });
}

// Export tab groups to JSON
function exportGroups() {
  return new Promise((resolve) => {
    browser.storage.sync.get("groups", (data) => {
      const groups = data.groups || {};
      const exportData = JSON.stringify(groups, null, 2);
      resolve(exportData);
    });
  });
}

// Import tab groups from JSON
function importGroups(jsonData) {
  try {
    const importedGroups = JSON.parse(jsonData);

    browser.storage.sync.get("groups", (data) => {
      const currentGroups = data.groups || {};

      // Merge imported groups with current groups
      const mergedGroups = { ...currentGroups, ...importedGroups };

      browser.storage.sync.set({ groups: mergedGroups }, () => {
        notifyGroupsUpdated();
        return true;
      });
    });

    return true;
  } catch (e) {
    console.error("Import failed:", e);
    return false;
  }
}

// Notify that groups have been updated
function notifyGroupsUpdated() {
  browser.runtime.sendMessage({ action: "groupsUpdated" });
}

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  let responsePromise;

  switch (message.action) {
    case "saveGroup":
      saveTabGroup(message.groupName);
      return Promise.resolve({ success: true });

    case "openGroup":
      responsePromise = Promise.resolve(
        openTabGroup(message.groupId, message.openInNewWindow),
      ).then(() => ({ success: true }));
      break;

    case "deleteGroup":
      responsePromise = deleteTabGroup(message.groupId).then(() => ({
        success: true,
      }));
      break;

    case "addTabToGroup":
      responsePromise = addTabToGroup(message.groupId).then(() => ({
        success: true,
      }));
      break;

    case "removeTabFromGroup":
      responsePromise = removeTabFromGroup(
        message.groupId,
        message.tabIndex,
      ).then(() => ({ success: true }));
      break;

    case "reorderTabInGroup":
      responsePromise = reorderTabInGroup(
        message.groupId,
        message.oldIndex,
        message.newIndex,
      ).then(() => ({ success: true }));
      break;

    case "moveTabBetweenGroups":
      responsePromise = moveTabBetweenGroups(
        message.sourceGroupId,
        message.tabIndex,
        message.targetGroupId,
      ).then(() => ({ success: true }));
      break;

    case "autoGroupTabs":
      responsePromise = autoGroupTabs().then(() => ({ success: true }));
      break;

    case "exportGroups":
      responsePromise = exportGroups().then((data) => ({
        success: true,
        data,
      }));
      break;

    case "importGroups":
      responsePromise = Promise.resolve(importGroups(message.data)).then(
        (result) => ({ success: result }),
      );
      break;

    case "getGroups":
      return browser.storage.sync.get("groups").then((data) => {
        return { groups: data.groups || {} };
      });

    default:
      return false; // Not handled
  }

  // Return true and send response when ready
  responsePromise.then(sendResponse);
  return true; // Keep the message channel open for the async response
});
