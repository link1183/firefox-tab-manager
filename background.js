// Tab group data structure stored in browser.storage.sync
// Format: { groups: { groupId: { name: string, tabs: [tabInfo], created: timestamp } } }

// Storage constants and limits
const STORAGE_CLEANUP_INTERVAL = 30 * 24 * 60 * 60 * 1000; // 30 days
const MAX_INACTIVE_GROUP_AGE = 90 * 24 * 60 * 60 * 1000; // 90 days
const MAX_GROUPS = 50; // Maximum number of groups to store

// Initialize storage
browser.runtime.onInstalled.addListener(() => {
  browser.storage.sync.get("groups").then((data) => {
    if (!data.groups) {
      browser.storage.sync.set({ groups: {} });
    }
  });

  // Set up command listeners
  setupCommandListeners();

  // Start cleanup timer
  scheduleStorageCleanup();
});

function saveTabGroupFromTabs(tabs, groupName) {
  // Get include pinned tabs setting
  return browser.storage.sync.get("includePinnedTabs").then((settings) => {
    const includePinned = settings.includePinnedTabs || false;

    // Filter tabs based on setting
    const filteredTabs = includePinned
      ? tabs
      : tabs.filter((tab) => !tab.pinned);

    // Compress tab data to save space
    const tabInfoList = filteredTabs.map((tab) => ({
      url: tab.url,
      title: tab.title,
      domain: extractDomain(tab.url),
    }));

    return browser.storage.sync.get("groups").then((data) => {
      const groups = data.groups || {};
      const groupId = Date.now().toString();

      groups[groupId] = {
        name: groupName,
        tabs: tabInfoList,
        created: Date.now(),
        lastAccessed: Date.now(),
      };

      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    });
  });
}

// Set up command listeners for keyboard shortcuts
function setupCommandListeners() {
  console.log("Setting up command listeners");

  browser.commands.onCommand.addListener((command) => {
    console.log("Command received:", command);

    switch (command) {
      case "save-current-tabs":
        browser.tabs.query({ currentWindow: true }).then((originalTabs) => {
          browser.tabs
            .query({ currentWindow: true, active: true })
            .then((activeTabs) => {
              if (activeTabs.length > 0) {
                const defaultName =
                  getDomainFromUrl(activeTabs[0].url) || "New Group";

                // Save the tabs temporarily
                browser.storage.local
                  .set({
                    pendingSave: {
                      tabs: originalTabs,
                      defaultName: defaultName,
                    },
                  })
                  .then(() => {
                    // Open a small popup tab for input
                    browser.tabs.create({
                      url: "/prompt-tab.html",
                      active: true,
                    });
                  });
              }
            });
        });
        break;

      case "quick-switch":
        // Open quick switch panel
        browser.storage.sync.get("groups").then((data) => {
          const groups = data.groups || {};
          if (Object.keys(groups).length === 0) {
            alert("No tab groups saved yet");
            return;
          }

          // Create quick switch UI
          showQuickSwitchPanel(groups);
        });
        break;
    }
  });
}

// Create a custom prompt popup
function createPromptPopup(message, defaultValue) {
  console.log("Creating prompt popup with message:", message);

  // First get the current window ID to remember it
  browser.windows.getCurrent().then((currentWindow) => {
    // Store the current window ID to use it later
    const sourceWindowId = currentWindow.id;

    let createData = {
      type: "popup",
      url: browser.runtime.getURL("prompt/prompt.html"),
      width: 400,
      height: 200,
    };

    browser.windows
      .create(createData)
      .then(() => {
        // Store both the prompt data and source window ID
        browser.storage.local.set({
          promptData: {
            message: message,
            defaultValue: defaultValue,
            sourceWindowId: sourceWindowId, // Save original window ID
          },
        });

        // Listen for response from the popup
        function promptListener(message) {
          if (message.action === "promptResponse") {
            browser.runtime.onMessage.removeListener(promptListener);
            if (message.value) {
              // Use the saved window ID when saving tabs
              saveTabGroupFromWindow(sourceWindowId, message.value);
            }
          }
        }

        browser.runtime.onMessage.addListener(promptListener);
      })
      .catch((error) => {
        console.error("Error creating prompt popup:", error);
      });
  });
}

// Show quick switch panel
function showQuickSwitchPanel() {
  browser.tabs.create({
    url: browser.runtime.getURL("quick-switch/quick-switch.html"),
  });
}

// Save current tabs as a group
function saveTabGroupFromWindow(windowId, groupName) {
  return browser.tabs.query({ windowId: windowId }).then((tabs) => {
    // Get include pinned tabs setting
    return browser.storage.sync.get("includePinnedTabs").then((settings) => {
      const includePinned = settings.includePinnedTabs || false;

      // Filter tabs based on setting
      const filteredTabs = includePinned
        ? tabs
        : tabs.filter((tab) => !tab.pinned);

      // Compress tab data to save space
      const tabInfoList = filteredTabs.map((tab) => ({
        url: tab.url,
        title: tab.title,
        domain: extractDomain(tab.url),
      }));

      return browser.storage.sync.get("groups").then((data) => {
        const groups = data.groups || {};
        const groupId = Date.now().toString();

        groups[groupId] = {
          name: groupName,
          tabs: tabInfoList,
          created: Date.now(),
          lastAccessed: Date.now(),
        };

        return browser.storage.sync.set({ groups }).then(() => {
          notifyGroupsUpdated();
          return true;
        });
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

// Get simplified domain
function getDomainFromUrl(url) {
  const domain = extractDomain(url);
  return domain.replace(/^www\./, "");
}

// Match URL against pattern
function matchUrlPattern(url, pattern) {
  try {
    return new RegExp(pattern, "i").test(url);
  } catch (e) {
    return false;
  }
}

// Open a tab group
function openTabGroup(groupId, openInNewWindow = false) {
  return browser.storage.sync
    .get("groups")
    .then((data) => {
      if (!data.groups || !data.groups[groupId]) {
        return false;
      }

      const group = data.groups[groupId];

      if (openInNewWindow) {
        // Open in a new window
        return browser.windows
          .create({ url: group.tabs[0].url })
          .then((newWindow) => {
            // Open the rest of the tabs in the new window
            const tabPromises = [];
            for (let i = 1; i < group.tabs.length; i++) {
              tabPromises.push(
                browser.tabs.create({
                  url: group.tabs[i].url,
                  windowId: newWindow.id,
                }),
              );
            }
            return Promise.all(tabPromises);
          });
      } else {
        // Open in current window and replace non-pinned tabs
        return browser.tabs
          .query({ currentWindow: true })
          .then((currentTabs) => {
            // Get non-pinned tabs to close later
            const nonPinnedTabs = currentTabs.filter((tab) => !tab.pinned);

            // Open the first tab of the group
            return browser.tabs
              .create({ url: group.tabs[0].url })
              .then((firstTab) => {
                const windowId = firstTab.windowId;

                // Create tab opening promises
                const tabPromises = [];
                for (let i = 1; i < group.tabs.length; i++) {
                  tabPromises.push(
                    browser.tabs.create({
                      url: group.tabs[i].url,
                      windowId: windowId,
                    }),
                  );
                }

                // Wait for all tabs to open then close old tabs
                return Promise.all(tabPromises).then(() => {
                  // Close all the original non-pinned tabs
                  const tabIdsToClose = nonPinnedTabs.map((tab) => tab.id);
                  return browser.tabs.remove(tabIdsToClose);
                });
              });
          });
      }
    })
    .then(() => {
      // Update last accessed timestamp
      return updateGroupAccessTime(groupId);
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

      // Add to recently deleted groups for potential recovery
      const deletedGroup = groups[groupId];
      return saveDeletedGroup(deletedGroup).then(() => {
        delete groups[groupId];
        return browser.storage.sync.set({ groups }).then(() => {
          notifyGroupsUpdated();
          return true;
        });
      });
    }
    return false;
  });
}

// Save deleted group for recovery
function saveDeletedGroup(groupData) {
  return browser.storage.local.get("recentlyDeleted").then((data) => {
    let recentlyDeleted = data.recentlyDeleted || [];

    // Add new deleted group with timestamp
    recentlyDeleted.push({
      group: groupData,
      deletedAt: Date.now(),
    });

    // Keep only last 10 deleted groups
    if (recentlyDeleted.length > 10) {
      recentlyDeleted = recentlyDeleted.slice(-10);
    }

    return browser.storage.local.set({ recentlyDeleted });
  });
}

// Restore recently deleted group
function restoreRecentlyDeleted(index) {
  return browser.storage.local.get("recentlyDeleted").then((data) => {
    const recentlyDeleted = data.recentlyDeleted || [];

    if (index >= 0 && index < recentlyDeleted.length) {
      const toRestore = recentlyDeleted[index].group;

      // Add back to groups
      return browser.storage.sync.get("groups").then((groupData) => {
        const groups = groupData.groups || {};
        const groupId = `restored_${Date.now()}`;

        groups[groupId] = toRestore;
        // Update timestamp
        groups[groupId].restored = Date.now();

        // Remove from recently deleted
        recentlyDeleted.splice(index, 1);

        // Save both changes
        return Promise.all([
          browser.storage.sync.set({ groups }),
          browser.storage.local.set({ recentlyDeleted }),
        ]).then(() => {
          notifyGroupsUpdated();
          return groupId;
        });
      });
    }

    return null;
  });
}

// Get recently deleted groups
function getRecentlyDeletedGroups() {
  return browser.storage.local.get("recentlyDeleted").then((data) => {
    return data.recentlyDeleted || [];
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
  return browser.storage.sync.get("groups").then((data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      const tab = groups[groupId].tabs[oldIndex];

      // Remove from old position
      groups[groupId].tabs.splice(oldIndex, 1);

      // Insert at new position
      groups[groupId].tabs.splice(newIndex, 0, tab);

      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    }
    return false;
  });
}

// Move a tab from one group to another
function moveTabBetweenGroups(sourceGroupId, tabIndex, targetGroupId) {
  return browser.storage.sync.get("groups").then((data) => {
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

      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    }
    return false;
  });
}

// Merge two groups
function mergeGroups(sourceGroupId, targetGroupId) {
  return browser.storage.sync.get("groups").then((data) => {
    if (
      data.groups &&
      data.groups[sourceGroupId] &&
      data.groups[targetGroupId]
    ) {
      const groups = data.groups;

      // Add all tabs from source to target
      const sourceTabs = groups[sourceGroupId].tabs;
      groups[targetGroupId].tabs =
        groups[targetGroupId].tabs.concat(sourceTabs);

      // Remove source group
      delete groups[sourceGroupId];

      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    }
    return false;
  });
}

// Auto-group tabs by domain
function autoGroupTabs() {
  return browser.tabs.query({ currentWindow: true }).then((tabs) => {
    // Get include pinned tabs setting
    return browser.storage.sync.get("includePinnedTabs").then((settings) => {
      const includePinned = settings.includePinnedTabs || false;

      // Filter tabs based on setting
      const filteredTabs = includePinned
        ? tabs
        : tabs.filter((tab) => !tab.pinned);

      // Group tabs by domain
      const domainGroups = {};

      filteredTabs.forEach((tab) => {
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

        // Get auto-grouping threshold
        return browser.storage.sync
          .get("minTabsForSuggestion")
          .then((settings) => {
            const minTabs = settings.minTabsForSuggestion || 2;

            Object.keys(domainGroups).forEach((domain) => {
              if (domainGroups[domain].length >= minTabs) {
                const groupId = `auto_${domain}_${Date.now()}`;
                groups[groupId] = {
                  name: `${domain.replace("www.", "")}`,
                  tabs: domainGroups[domain],
                  created: Date.now(),
                  lastAccessed: Date.now(),
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
    });
  });
}

// Group tabs by URL pattern
function groupTabsByPattern(pattern, groupName) {
  return browser.tabs.query({ currentWindow: true }).then((tabs) => {
    // Get include pinned tabs setting
    return browser.storage.sync.get("includePinnedTabs").then((settings) => {
      const includePinned = settings.includePinnedTabs || false;

      // Filter tabs based on setting
      const filteredTabs = includePinned
        ? tabs
        : tabs.filter((tab) => !tab.pinned);

      // Find tabs matching pattern
      const matchingTabs = filteredTabs.filter((tab) => {
        return matchUrlPattern(tab.url, pattern);
      });

      if (matchingTabs.length === 0) {
        return false;
      }

      // Create compressed tab info
      const tabInfoList = matchingTabs.map((tab) => ({
        url: tab.url,
        title: tab.title,
        domain: extractDomain(tab.url),
      }));

      // Create new group
      return browser.storage.sync.get("groups").then((data) => {
        const groups = data.groups || {};
        const groupId = `pattern_${Date.now()}`;

        groups[groupId] = {
          name: groupName || `Pattern: ${pattern.slice(0, 20)}`,
          tabs: tabInfoList,
          created: Date.now(),
          lastAccessed: Date.now(),
          pattern: pattern,
        };

        return browser.storage.sync.set({ groups }).then(() => {
          notifyGroupsUpdated();
          return true;
        });
      });
    });
  });
}

// Schedule storage cleanup
function scheduleStorageCleanup() {
  // Clean up on install
  cleanUpStorage();

  // Set up interval for cleanup
  setInterval(cleanUpStorage, STORAGE_CLEANUP_INTERVAL);
}

// Clean up storage by removing old groups
function cleanUpStorage() {
  return browser.storage.sync.get("groups").then((data) => {
    if (!data.groups) return;

    const groups = data.groups;
    const now = Date.now();
    let changed = false;

    // Clean up old groups by last accessed time
    Object.keys(groups).forEach((groupId) => {
      const group = groups[groupId];
      const lastAccessed = group.lastAccessed || group.created;

      if (now - lastAccessed > MAX_INACTIVE_GROUP_AGE) {
        delete groups[groupId];
        changed = true;
      }
    });

    // If too many groups, delete oldest ones (by last accessed)
    const groupIds = Object.keys(groups);
    if (groupIds.length > MAX_GROUPS) {
      // Sort by last accessed
      groupIds.sort((a, b) => {
        const aTime = groups[a].lastAccessed || groups[a].created;
        const bTime = groups[b].lastAccessed || groups[b].created;
        return aTime - bTime; // Ascending order, oldest first
      });

      // Delete oldest groups
      const toDelete = groupIds.slice(0, groupIds.length - MAX_GROUPS);
      toDelete.forEach((groupId) => {
        delete groups[groupId];
        changed = true;
      });
    }

    // Save if changed
    if (changed) {
      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    }

    return false;
  });
}

// Rename a group
function renameGroup(groupId, newName) {
  return browser.storage.sync.get("groups").then((data) => {
    if (data.groups && data.groups[groupId]) {
      const groups = data.groups;
      groups[groupId].name = newName.trim();
      return browser.storage.sync.set({ groups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    }
    return false;
  });
}

// Export tab groups to JSON
function exportGroups() {
  return browser.storage.sync.get("groups").then((data) => {
    const groups = data.groups || {};
    const exportData = JSON.stringify(groups, null, 2);
    return exportData;
  });
}

// Import tab groups from JSON
function importGroups(jsonData) {
  try {
    const importedGroups = JSON.parse(jsonData);

    return browser.storage.sync.get("groups").then((data) => {
      const currentGroups = data.groups || {};

      // Merge imported groups with current groups
      const mergedGroups = { ...currentGroups, ...importedGroups };

      return browser.storage.sync.set({ groups: mergedGroups }).then(() => {
        notifyGroupsUpdated();
        return true;
      });
    });
  } catch (e) {
    console.error("Import failed:", e);
    return Promise.resolve(false);
  }
}

// Notify that groups have been updated
function notifyGroupsUpdated() {
  browser.storage.local
    .set({ groupsUpdatedTimestamp: Date.now() })
    .catch((error) => console.log("Storage update error:", error));
}

// Listen for messages from the popup
browser.runtime.onMessage.addListener((message) => {
  let responsePromise;

  switch (message.action) {
    case "saveGroup":
      responsePromise = saveTabGroup(message.groupName).then(() => ({
        success: true,
      }));
      break;

    case "openGroup":
      responsePromise = openTabGroup(
        message.groupId,
        message.openInNewWindow,
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

    case "mergeGroups":
      responsePromise = mergeGroups(
        message.sourceGroupId,
        message.targetGroupId,
      ).then(() => ({ success: true }));
      break;

    case "autoGroupTabs":
      responsePromise = autoGroupTabs().then(() => ({ success: true }));
      break;

    case "groupTabsByPattern":
      responsePromise = groupTabsByPattern(
        message.pattern,
        message.groupName,
      ).then((success) => ({ success }));
      break;

    case "renameGroup":
      responsePromise = renameGroup(message.groupId, message.newName).then(
        () => ({ success: true }),
      );
      break;

    case "getRecentlyDeletedGroups":
      responsePromise = getRecentlyDeletedGroups().then((recentlyDeleted) => ({
        success: true,
        recentlyDeleted,
      }));
      break;

    case "restoreRecentlyDeleted":
      responsePromise = restoreRecentlyDeleted(message.index).then(
        (groupId) => ({ success: true, groupId }),
      );
      break;

    case "exportGroups":
      responsePromise = exportGroups().then((data) => ({
        success: true,
        data,
      }));
      break;

    case "saveTabsWithName":
      responsePromise = saveTabGroupFromTabs(message.tabs, message.name).then(
        () => ({
          success: true,
        }),
      );
      break;

    case "importGroups":
      responsePromise = importGroups(message.data).then((result) => ({
        success: result,
      }));
      break;

    case "getGroups":
      responsePromise = browser.storage.sync
        .get("groups")
        .then((data) => ({ groups: data.groups || {} }));
      break;

    default:
      return false; // Not handled
  }

  // Return the promise to keep message channel open
  return responsePromise;
});
