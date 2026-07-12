// --- Service Worker Registration ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('Service Worker registered successfully with scope:', reg.scope))
      .catch((err) => console.error('Service Worker registration failed:', err));
  });
}

// --- Application Route Guard (handled by auth.js) ---

// --- Application State ---
const AppState = {
  isSimulatedOffline: localStorage.getItem('simulated_offline') === 'true',
  get activeUser() { return window.Auth.getUser()?.email || 'Unknown User'; },
  
  isOnline() {
    if (this.isSimulatedOffline) {
      return false;
    }
    return navigator.onLine;
  }
};

// Expose on window so sync.js can access it across scripts
window.AppState = AppState;

// On sync: only refresh displayed data — never re-initialize forms or re-attach listeners
window.addEventListener('sync_completed_with_data', () => {
  refreshData();
});

// --- Toast Notification Helper ---
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `glass px-6 py-4 rounded-xl shadow-2xl flex items-center justify-between border-l-4 transition-all duration-300 transform translate-y-10 opacity-0 max-w-md w-full mb-3`;
  
  if (type === 'success') {
    toast.classList.add('border-emerald-500', 'text-emerald-400');
    toast.innerHTML = `
      <div class="flex items-center space-x-3">
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span class="text-sm font-medium text-slate-200">${message}</span>
      </div>
    `;
  } else if (type === 'warning') {
    toast.classList.add('border-amber-500', 'text-amber-400');
    toast.innerHTML = `
      <div class="flex items-center space-x-3">
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
        <span class="text-sm font-medium text-slate-200">${message}</span>
      </div>
    `;
  } else {
    toast.classList.add('border-red-500', 'text-red-400');
    toast.innerHTML = `
      <div class="flex items-center space-x-3">
        <svg class="w-6 h-6 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
        <span class="text-sm font-medium text-slate-200">${message}</span>
      </div>
    `;
  }

  container.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'scale-95');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// --- Connection Status Management ---
function updateConnectionUI() {
  const statusBadge = document.getElementById('status-badge');
  const statusIndicatorText = document.getElementById('status-text');
  const queueIndicator = document.getElementById('queue-indicator');
  
  if (!statusBadge) return;

  const online = AppState.isOnline();
  
  statusBadge.className = 'px-3 py-1 text-xs font-semibold rounded-full flex items-center space-x-1 cursor-pointer transition-all duration-300 ';
  
  if (online) {
    const syncStatus = window.SyncEngine ? window.SyncEngine.getSyncStatus() : 'online';
    const isSyncing = syncStatus === 'syncing';
    
    statusBadge.classList.add('badge-online');
    statusBadge.innerHTML = `
      <span class="w-2.5 h-2.5 bg-emerald-500 rounded-full inline-block ${isSyncing ? 'animate-bounce' : 'animate-pulse'} mr-1.5"></span>
      <span>${isSyncing ? 'SYNCING' : 'ONLINE'} ${AppState.isSimulatedOffline ? '(SIM)' : ''}</span>
    `;
    if (statusIndicatorText) statusIndicatorText.textContent = isSyncing ? 'Synchronizing data...' : 'App connected. Syncing enabled.';
  } else {
    statusBadge.classList.add('badge-offline');
    statusBadge.innerHTML = `
      <span class="w-2.5 h-2.5 bg-red-500 rounded-full inline-block mr-1.5"></span>
      <span>OFFLINE ${AppState.isSimulatedOffline ? '(FORCED)' : ''}</span>
    `;
    if (statusIndicatorText) statusIndicatorText.textContent = 'Working offline. Updates will queue.';
  }

  window.StockDB.getSyncQueue().then((queue) => {
    if (queueIndicator) {
      if (queue.length > 0) {
        queueIndicator.className = 'ml-2 px-2 py-0.5 text-2xs font-extrabold bg-amber-500 text-slate-900 rounded-full inline-block animate-bounce';
        queueIndicator.textContent = `${queue.length} PENDING`;
      } else {
        queueIndicator.className = 'hidden';
      }
    }
  });
}

window.addEventListener('online', () => {
  updateConnectionUI();
  if (window.SyncEngine && AppState.isOnline()) {
    window.SyncEngine.fullSync();
  }
});
window.addEventListener('offline', () => {
  updateConnectionUI();
});

function toggleSimulatedConnection() {
  AppState.isSimulatedOffline = !AppState.isSimulatedOffline;
  localStorage.setItem('simulated_offline', AppState.isSimulatedOffline);
  updateConnectionUI();
  showToast(
    AppState.isSimulatedOffline 
      ? 'Forced Offline Mode enabled' 
      : 'Auto network mode restored', 
    AppState.isSimulatedOffline ? 'warning' : 'success'
  );
  
  if (AppState.isOnline() && window.SyncEngine) {
    window.SyncEngine.fullSync();
  }
}

window.toggleSimulatedConnection = toggleSimulatedConnection;

// --- Voucher helpers ---
function peekNextVoucherNumber() {
  const current = parseInt(localStorage.getItem('grv_voucher_counter') || '0', 10);
  return String(current + 1).padStart(4, '0');
}

function commitVoucherNumber(voucherNumber) {
  localStorage.setItem('grv_voucher_counter', String(parseInt(voucherNumber, 10)));
}

function formatVoucherLabel(direction, voucherNumber, txId) {
  if (!voucherNumber) return txId != null ? `#${txId}` : '—';
  const prefix = direction === 'in' ? 'GRV' : 'GIN';
  const devId = window.SyncEngine ? window.SyncEngine.getDeviceId() : 'local';
  return `${prefix}-${devId}-${voucherNumber}`;
}

// --- Background Sync Mechanism ---
let isSyncing = false;
async function triggerBackgroundSync() {
  if (window.SyncEngine) {
    await window.SyncEngine.fullSync();
  }
}

async function rollbackStockSnapshots(stockSnapshots) {
  for (const snap of stockSnapshots) {
    const item = await window.StockDB.getItem(snap.id);
    if (item) {
      item.quantity = snap.previousQuantity;
      item.updatedAt = Date.now();
      await window.StockDB.putItem(item);
    }
  }
}

// --- Save Stock Transaction Action ---
async function saveTransaction(txData) {
  const { 
    items, direction, 
    authorisedBy, receivedBy, deliveredBy, inspectedBy,
    signatureAuthorised, signatureReceived, signatureDelivered, signatureInspected,
    memo, reference, jtOrden
  } = txData;
  
  const isOnline = AppState.isOnline();
  const voucherNumber = peekNextVoucherNumber();
  const stockSnapshots = [];
  
  try {
    for (const cartItem of items) {
      const item = await window.StockDB.getItem(cartItem.id);
      if (!item) {
        throw new Error(`Item SKU ${cartItem.id} not found in inventory.`);
      }
      
      const previousQuantity = item.quantity;
      let newQty = item.quantity;
      if (direction === 'in') {
        newQty += cartItem.quantity;
        // Over-capacity is allowed (user was warned at cart stage); just log it
        if (newQty > item.maxCapacity) {
          console.warn(`Stock In for "${item.name}" exceeds max capacity (${item.maxCapacity}). New qty will be ${newQty}.`);
        }
      } else {
        if (item.quantity < cartItem.quantity) {
          throw new Error(`Insufficient stock for ${item.name}. Only ${item.quantity} available.`);
        }
        newQty -= cartItem.quantity;
      }
      
      item.quantity = newQty;
      item.updatedAt = Date.now();
      await window.StockDB.putItem(item);
      stockSnapshots.push({ id: item.id, previousQuantity });
    }
    
    const transactionRecord = {
      items,
      direction,
      voucherNumber,
      authorisedBy,
      receivedBy,
      deliveredBy,
      inspectedBy: inspectedBy || '',
      signatureAuthorised,
      signatureReceived,
      signatureDelivered,
      signatureInspected: signatureInspected || '',
      memo: memo || '',
      reference: reference || '',
      jtOrden: jtOrden || '',
      personA: deliveredBy,
      personB: authorisedBy,
      signatureA: signatureDelivered,
      signatureB: signatureAuthorised || 'pin_verified',
      pinVerified: true,
      timestamp: Date.now()
    };
    
    try {
      await window.StockDB.addTransaction(transactionRecord);
      commitVoucherNumber(voucherNumber);
    } catch (txErr) {
      await rollbackStockSnapshots(stockSnapshots);
      throw txErr;
    }
    
    if (window.SyncEngine) {
      await window.SyncEngine.queueChange('transactions', 'insert', transactionRecord);
      if (!isOnline) {
        console.log('Saved transaction locally & queued for sync:', transactionRecord);
        showToast('Offline transaction saved locally and queued.', 'warning');
      }
    }
    
    updateConnectionUI();
    return { success: true, voucherNumber };
  } catch (err) {
    if (stockSnapshots.length > 0) {
      await rollbackStockSnapshots(stockSnapshots);
    }
    showToast(err.message, 'error');
    console.error('Transaction failed:', err);
    return { success: false, error: err.message };
  }
}

// --- Active User Display ---
function renderUserSelector() {
  const container = document.getElementById('user-selector-container');
  if (!container) return;

  container.innerHTML = `
    <div class="flex items-center space-x-3 text-xs">
      <div class="flex items-center space-x-1.5 bg-slate-950/45 px-3 py-1.5 rounded-xl border border-white/5">
        <span class="w-1.5 h-1.5 bg-sky-400 rounded-full inline-block animate-pulse"></span>
        <span class="text-slate-400 font-medium">Operator:</span>
        <span class="text-slate-200 font-semibold">ALI</span>
      </div>
      <button onclick="openChangePasswordModal()" class="glass px-3 py-1.5 rounded-xl hover:text-sky-300 hover:border-sky-500/30 transition text-slate-400 font-semibold focus:outline-none flex items-center space-x-1" title="Change Password">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
        </svg>
        <span>Password</span>
      </button>
      <button onclick="signOut()" class="glass px-3 py-1.5 rounded-xl hover:text-red-400 hover:border-red-500/30 transition text-slate-400 font-semibold focus:outline-none flex items-center space-x-1">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path>
        </svg>
        <span>Sign Out</span>
      </button>
    </div>
  `;

  // Inject the change-password modal if it doesn't already exist on this page
  if (!document.getElementById('change-password-modal')) {
    const modalHTML = `
      <div id="change-password-modal" class="fixed inset-0 z-50 hidden items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
        <div class="glass-modal rounded-3xl w-full max-w-sm overflow-hidden border border-white/10 shadow-2xl">
          <div class="px-6 py-4 bg-slate-900/60 border-b border-white/10 flex items-center justify-between">
            <h3 class="font-bold text-slate-100 text-sm flex items-center space-x-2">
              <svg class="w-5 h-5 text-sky-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z"></path>
              </svg>
              <span>Change Password</span>
            </h3>
            <button onclick="closeChangePasswordModal()" class="text-slate-400 hover:text-white transition">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>
          <form id="change-password-form" class="p-6 space-y-4">
            <p class="text-xs text-slate-400">Enter your current password to verify your identity, then set a new password.</p>
            <div>
              <label class="block text-xs font-semibold text-slate-400 mb-1.5">Current Password *</label>
              <input type="password" id="cp-current-password" placeholder="••••" required class="w-full text-center tracking-widest text-lg font-bold px-3 py-3 rounded-xl glass-input focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-400 mb-1.5">New Password *</label>
              <input type="password" id="cp-new-password" placeholder="••••" required class="w-full text-center tracking-widest text-lg font-bold px-3 py-3 rounded-xl glass-input focus:outline-none">
            </div>
            <div>
              <label class="block text-xs font-semibold text-slate-400 mb-1.5">Confirm New Password *</label>
              <input type="password" id="cp-confirm-password" placeholder="••••" required class="w-full text-center tracking-widest text-lg font-bold px-3 py-3 rounded-xl glass-input focus:outline-none">
            </div>
            <button type="submit" id="cp-submit-btn" class="w-full py-3.5 rounded-xl font-bold bg-sky-primary text-white border border-sky-400/20 hover:bg-sky-600 transition shadow-lg shadow-sky-950/45">
              Update Password
            </button>
          </form>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML('beforeend', modalHTML);

    // Attach form handler
    document.getElementById('change-password-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPwd = document.getElementById('cp-current-password').value;
      const newPwd = document.getElementById('cp-new-password').value;
      const confirmPwd = document.getElementById('cp-confirm-password').value;
      const submitBtn = document.getElementById('cp-submit-btn');

      if (newPwd !== confirmPwd) {
        showToast('New passwords do not match.', 'error');
        return;
      }
      if (newPwd.length < 8) {
        showToast('New password must be at least 8 characters.', 'error');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Verifying...';

      try {
        // Re-authenticate with current password to verify identity
        const email = 'operator@jdi.org';
        await window.Auth.signInWithEmail(email, currentPwd, false);

        // Now update to the new password
        submitBtn.textContent = 'Updating...';
        await window.Auth.updatePassword(newPwd);

        showToast('Password updated successfully!', 'success');
        closeChangePasswordModal();
      } catch (err) {
        showToast(err.message || 'Password change failed. Check your current password.', 'error');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Update Password';
      }
    });
  }
}

function openChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) {
    // Clear fields
    document.getElementById('cp-current-password').value = '';
    document.getElementById('cp-new-password').value = '';
    document.getElementById('cp-confirm-password').value = '';
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeChangePasswordModal() {
  const modal = document.getElementById('change-password-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

window.openChangePasswordModal = openChangePasswordModal;
window.closeChangePasswordModal = closeChangePasswordModal;

function signOut() {
  window.Auth.signOutSupabase();
  showToast('Signing out...', 'warning');
  setTimeout(() => {
    window.location.href = 'login.html';
  }, 800);
}
window.signOut = signOut;

// --- Page-Specific Code Router ---
function initActivePage() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';
  
  console.log('Initializing Active Page:', page);
  
  renderUserSelector();
  
  const activeUserDisplay = document.getElementById('active-user-display');
  if (activeUserDisplay) activeUserDisplay.textContent = AppState.activeUser;

  if (page === 'index.html' || page === '') {
    initDashboard();
  } else if (page === 'inventory.html') {
    initInventory();
  } else if (page === 'transaction.html') {
    initTransaction();
  } else if (page === 'history.html') {
    initHistory();
  }
}

// --- Lightweight Data Refresh (called on sync events) ---
// Only re-renders data displays. Does NOT re-attach any event listeners.
function refreshData() {
  const path = window.location.pathname;
  const page = path.split('/').pop() || 'index.html';

  if (page === 'index.html' || page === '') {
    initDashboard();
  } else if (page === 'inventory.html') {
    renderInventoryGrid();   // data-only, no listeners
  } else if (page === 'history.html') {
    renderHistoryTable();    // data-only, no listeners
  }
  // transaction.html intentionally excluded — form listeners must not be re-added
}

// --- Dashboard Initializer ---
async function initDashboard() {
  try {
    const items = await window.StockDB.getAllItems();
    const transactions = await window.StockDB.getAllTransactions();
    
    const totalItems = items.length;
    const lowStockItems = items.filter(item => item.quantity < item.minThreshold);
    const lowStockCount = lowStockItems.length;
    
    const totalItemsEl = document.getElementById('total-items-metric');
    const lowStockEl = document.getElementById('low-stock-metric');
    
    if (totalItemsEl) totalItemsEl.textContent = totalItems;
    if (lowStockEl) {
      lowStockEl.textContent = lowStockCount;
      if (lowStockCount > 0) {
        lowStockEl.parentElement.classList.add('text-amber-500');
      } else {
        lowStockEl.parentElement.classList.remove('text-amber-500');
      }
    }
    
    const alertListEl = document.getElementById('dashboard-alerts-list');
    if (alertListEl) {
      if (lowStockItems.length === 0) {
        alertListEl.innerHTML = `
          <div class="text-center py-6 text-slate-400 text-sm">
            <svg class="w-8 h-8 mx-auto mb-2 text-emerald-500 opacity-60" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            All stock levels healthy.
          </div>
        `;
      } else {
        alertListEl.innerHTML = lowStockItems.map(item => `
          <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/40 border border-amber-500/20 hover:border-amber-500/40 transition">
            <div class="flex flex-col">
              <span class="font-semibold text-sm text-slate-200">${item.name}</span>
              <span class="text-xs text-slate-400">SKU: ${item.id} | ${item.category}</span>
            </div>
            <div class="text-right">
              <span class="badge-low-stock px-2.5 py-0.5 text-xs font-bold rounded-full">${item.quantity} in stock</span>
              <div class="text-2xs text-slate-400 mt-1">Min required: ${item.minThreshold}</div>
            </div>
          </div>
        `).join('');
      }
    }

    const recentActivityEl = document.getElementById('recent-activity-list');
    if (recentActivityEl) {
      const limitTxs = transactions.slice(0, 5);
      if (limitTxs.length === 0) {
        recentActivityEl.innerHTML = `
          <div class="text-center py-6 text-slate-400 text-sm">
            No transactions logged yet.
          </div>
        `;
      } else {
        recentActivityEl.innerHTML = limitTxs.map(tx => {
          const badgeClass = tx.direction === 'in' ? 'badge-in' : 'badge-out';
          const directionText = tx.direction === 'in' ? 'STOCK IN' : 'STOCK OUT';
          const timeString = new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          const userA = tx.authorisedBy || tx.personA || '—';
          const voucherNum = tx.voucherNumber ? formatVoucherLabel(tx.direction, tx.voucherNumber) : '';
          
          let itemName = '';
          let quantityText = '';
          
          if (tx.items && Array.isArray(tx.items)) {
            if (tx.items.length === 1) {
              itemName = tx.items[0].itemName || tx.items[0].name || tx.items[0].id;
              quantityText = `${tx.direction === 'in' ? '+' : '-'}${tx.items[0].quantity}`;
            } else {
              itemName = `${tx.items.length} Items List`;
              const totalQty = tx.items.reduce((sum, item) => sum + item.quantity, 0);
              quantityText = `${tx.direction === 'in' ? '+' : '-'}${totalQty}`;
            }
          } else {
            itemName = tx.itemName;
            quantityText = `${tx.direction === 'in' ? '+' : '-'}${tx.quantity}`;
          }
          
          return `
            <div class="flex items-center justify-between p-3 rounded-lg bg-slate-900/20 border border-white/5 hover:border-white/10 transition cursor-pointer" onclick="window.location.href='history.html'">
              <div class="flex items-center space-x-3">
                <span class="${badgeClass} px-2 py-0.5 text-2xs font-extrabold rounded">${directionText}</span>
                <div class="flex flex-col">
                  <span class="font-semibold text-sm text-slate-200">${itemName}</span>
                  <span class="text-2xs text-slate-400">${voucherNum} · ${userA} at ${timeString}</span>
                </div>
              </div>
              <div class="text-right font-bold text-slate-100 text-sm">
                ${quantityText}
              </div>
            </div>
          `;
        }).join('');
      }
    }
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

// --- Inventory Initializer ---
let currentSearch = '';
let currentCategory = 'All';

async function initInventory() {
  const searchInput = document.getElementById('inventory-search');
  const categoryFilter = document.getElementById('inventory-category-filter');
  
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase();
      renderInventoryGrid();
    });
  }
  
  if (categoryFilter) {
    categoryFilter.addEventListener('change', (e) => {
      currentCategory = e.target.value;
      renderInventoryGrid();
    });
  }

  setupInventoryModals();
  renderInventoryGrid();
}

async function renderInventoryGrid() {
  const tableBody = document.getElementById('inventory-table-body');
  const cardGrid = document.getElementById('inventory-card-grid');
  if (!tableBody && !cardGrid) return;
  
  try {
    const items = await window.StockDB.getAllItems();
    
    const filteredItems = items.filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(currentSearch) || 
                            item.id.toLowerCase().includes(currentSearch) || 
                            item.category.toLowerCase().includes(currentSearch);
      const matchesCategory = currentCategory === 'All' || item.category === currentCategory;
      return matchesSearch && matchesCategory;
    });

    if (filteredItems.length === 0) {
      const emptyState = `
        <tr>
          <td colspan="7" class="text-center py-12 text-slate-400">
            <svg class="w-12 h-12 mx-auto mb-3 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0a2 2 0 01-2 2H6a2 2 0 01-2-2m16 0V9a2 2 0 00-2-2H6a2 2 0 00-2 2v4h16z"></path></svg>
            No hardware items match the search filters.
          </td>
        </tr>
      `;
      if (tableBody) tableBody.innerHTML = emptyState;
      if (cardGrid) cardGrid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-400">No items found.</div>`;
      return;
    }

    let rowsHTML = '';
    let cardsHTML = '';

    filteredItems.forEach(item => {
      let stockBadgeHTML = '';
      if (item.quantity < item.minThreshold) {
        stockBadgeHTML = `<span class="badge-low-stock px-2 py-0.5 text-2xs font-semibold rounded-full">Low Stock</span>`;
      } else if (item.quantity > item.maxCapacity) {
        stockBadgeHTML = `<span class="badge-over-stock px-2 py-0.5 text-2xs font-semibold rounded-full">Over Stock</span>`;
      } else {
        stockBadgeHTML = `<span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 text-2xs font-semibold rounded-full">Healthy</span>`;
      }

      const qtyColorClass = item.quantity < item.minThreshold 
        ? 'text-amber-400 font-bold' 
        : item.quantity > item.maxCapacity 
          ? 'text-red-400 font-bold' 
          : 'text-slate-100 font-medium';

      rowsHTML += `
        <tr class="border-b border-white/5 hover:bg-slate-900/30 transition">
          <td class="px-6 py-4 font-semibold text-sky">${item.id}</td>
          <td class="px-6 py-4 text-slate-100">${item.name}</td>
          <td class="px-6 py-4 text-slate-400 text-sm">${item.category}</td>
          <td class="px-6 py-4 text-sm ${qtyColorClass}">${item.quantity}</td>
          <td class="px-6 py-4 text-sm text-slate-400">${item.minThreshold} / ${item.maxCapacity}</td>
          <td class="px-6 py-4 text-sm">${stockBadgeHTML}</td>
          <td class="px-6 py-4 text-right text-sm font-medium space-x-2">
            <button onclick="openEditModal('${item.id}')" class="text-sky hover:text-sky-300 font-semibold focus:outline-none transition">Edit</button>
            <button onclick="deleteInventoryItem('${item.id}')" class="text-red-400 hover:text-red-300 font-semibold focus:outline-none transition">Delete</button>
          </td>
        </tr>
      `;

      cardsHTML += `
        <div class="glass-card rounded-2xl p-6 flex flex-col justify-between">
          <div>
            <div class="flex justify-between items-start mb-3">
              <span class="text-2xs font-extrabold tracking-widest text-sky uppercase">${item.category}</span>
              ${stockBadgeHTML}
            </div>
            <h3 class="text-lg font-bold text-slate-100 mb-1 leading-snug">${item.name}</h3>
            <p class="text-xs text-slate-400 font-mono mb-4">SKU: ${item.id}</p>
            
            <div class="grid grid-cols-2 gap-4 mb-4 bg-slate-950/30 p-3 rounded-xl border border-white/5">
              <div>
                <span class="text-3xs text-slate-400 block uppercase tracking-wider">Current Stock</span>
                <span class="text-xl font-bold ${qtyColorClass}">${item.quantity}</span>
              </div>
              <div>
                <span class="text-3xs text-slate-400 block uppercase tracking-wider">Limits (Min/Max)</span>
                <span class="text-sm font-semibold text-slate-300">${item.minThreshold} / ${item.maxCapacity}</span>
              </div>
            </div>
          </div>
          
          <div class="flex justify-between items-center mt-2 pt-2 border-t border-white/5">
            <span class="text-3xs text-slate-400">Loc: ${item.location || 'N/A'}</span>
            <div class="space-x-3">
              <button onclick="openEditModal('${item.id}')" class="text-xs text-sky hover:text-sky-300 font-bold focus:outline-none">Edit</button>
              <button onclick="deleteInventoryItem('${item.id}')" class="text-xs text-red-400 hover:text-red-300 font-bold focus:outline-none">Delete</button>
            </div>
          </div>
        </div>
      `;
    });

    if (tableBody) tableBody.innerHTML = rowsHTML;
    if (cardGrid) cardGrid.innerHTML = cardsHTML;
  } catch (err) {
    console.error('Failed to render inventory:', err);
  }
}

function setupInventoryModals() {
  const addModal = document.getElementById('add-item-modal');
  const editModal = document.getElementById('edit-item-modal');
  
  const openAddBtn = document.getElementById('open-add-modal-btn');
  const closeAddBtn = document.getElementById('close-add-modal-btn');
  const closeEditBtn = document.getElementById('close-edit-modal-btn');
  
  const addForm = document.getElementById('add-item-form');
  const editForm = document.getElementById('edit-item-form');

  if (openAddBtn && addModal) {
    openAddBtn.addEventListener('click', () => {
      const randStr = Math.floor(100 + Math.random() * 900);
      const skuInput = document.getElementById('add-sku');
      if (skuInput) skuInput.value = `HW-NEW-${randStr}`;
      addModal.classList.remove('hidden');
      addModal.classList.add('flex');
    });
  }

  if (closeAddBtn && addModal) {
    closeAddBtn.addEventListener('click', () => {
      addModal.classList.add('hidden');
      addModal.classList.remove('flex');
    });
  }

  if (closeEditBtn && editModal) {
    closeEditBtn.addEventListener('click', () => {
      editModal.classList.add('hidden');
      editModal.classList.remove('flex');
    });
  }

  if (addForm) {
    addForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sku = document.getElementById('add-sku').value.trim().toUpperCase();
      const name = document.getElementById('add-name').value.trim();
      const category = document.getElementById('add-category').value;
      const qty = parseInt(document.getElementById('add-qty').value, 10);
      const minVal = parseInt(document.getElementById('add-min').value, 10);
      const maxVal = parseInt(document.getElementById('add-max').value, 10);
      const loc = document.getElementById('add-location').value.trim() || 'Warehouse A';

      if (!sku || !name || isNaN(qty) || isNaN(minVal) || isNaN(maxVal)) {
        showToast('Please fill in all mandatory fields.', 'error');
        return;
      }

      const existing = await window.StockDB.getItem(sku);
      if (existing) {
        showToast('SKU already exists. Please choose a unique SKU.', 'error');
        return;
      }

      const newItem = {
        id: sku,
        name,
        category,
        quantity: qty,
        minThreshold: minVal,
        maxCapacity: maxVal,
        location: loc,
        updatedAt: Date.now()
      };

      try {
        await window.StockDB.putItem(newItem);
        if (window.SyncEngine) {
          window.SyncEngine.queueChange('inventory', 'upsert', newItem);
        }
        showToast('New hardware item added successfully!', 'success');
        addForm.reset();
        addModal.classList.add('hidden');
        addModal.classList.remove('flex');
        renderInventoryGrid();
      } catch (err) {
        showToast('Error saving item: ' + err.message, 'error');
      }
    });
  }

  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sku = document.getElementById('edit-sku').value;
      const name = document.getElementById('edit-name').value.trim();
      const category = document.getElementById('edit-category').value;
      const qty = parseInt(document.getElementById('edit-qty').value, 10);
      const minVal = parseInt(document.getElementById('edit-min').value, 10);
      const maxVal = parseInt(document.getElementById('edit-max').value, 10);
      const loc = document.getElementById('edit-location').value.trim();

      if (!name || isNaN(qty) || isNaN(minVal) || isNaN(maxVal)) {
        showToast('Please fill in all mandatory fields.', 'error');
        return;
      }

      const updatedItem = {
        id: sku,
        name,
        category,
        quantity: qty,
        minThreshold: minVal,
        maxCapacity: maxVal,
        location: loc,
        updatedAt: Date.now()
      };

      try {
        await window.StockDB.putItem(updatedItem);
        if (window.SyncEngine) {
          window.SyncEngine.queueChange('inventory', 'upsert', updatedItem);
        }
        showToast('Item updated successfully!', 'success');
        editModal.classList.add('hidden');
        editModal.classList.remove('flex');
        renderInventoryGrid();
      } catch (err) {
        showToast('Error updating item: ' + err.message, 'error');
      }
    });
  }
}

async function openEditModal(sku) {
  const editModal = document.getElementById('edit-item-modal');
  if (!editModal) return;
  
  try {
    const item = await window.StockDB.getItem(sku);
    if (!item) return;

    document.getElementById('edit-sku').value = item.id;
    document.getElementById('edit-name').value = item.name;
    document.getElementById('edit-category').value = item.category;
    document.getElementById('edit-qty').value = item.quantity;
    document.getElementById('edit-min').value = item.minThreshold;
    document.getElementById('edit-max').value = item.maxCapacity;
    document.getElementById('edit-location').value = item.location || '';

    editModal.classList.remove('hidden');
    editModal.classList.add('flex');
  } catch (err) {
    console.error('Failed to load edit details:', err);
  }
}
window.openEditModal = openEditModal;

async function deleteInventoryItem(sku) {
  if (confirm(`Are you sure you want to delete item SKU: ${sku}?`)) {
    try {
      await window.StockDB.deleteItem(sku);
      const deletedItem = await window.StockDB.getItem(sku);
      if (window.SyncEngine && deletedItem) {
        window.SyncEngine.queueChange('inventory', 'delete', deletedItem);
      }
      showToast('Item removed from inventory.', 'success');
      renderInventoryGrid();
    } catch (err) {
      showToast('Failed to delete item: ' + err.message, 'error');
    }
  }
}
window.deleteInventoryItem = deleteInventoryItem;

// --- Transaction Page State & Signature Handling ---
let transactionCart = [];
// Track all 6 signature slots: GRN (authorised, received, delivered) + GIN (gin-authorised, gin-received, gin-delivered)
let activeSignatureRole = null;
let savedSignatures = {
  'authorised': null,
  'received': null,
  'delivered': null,
  'gin-authorised': null,
  'gin-inspected': null,
  'gin-delivered': null,
  'gin-received': null
};
let signatureCanvas = null;
let signatureCtx = null;
let isDrawingSignature = false;
let lastSigX = 0;
let lastSigY = 0;

let currentTransactionDirection = 'in';

function renderCart() {
  const tableBody = document.getElementById('cart-table-body');
  if (!tableBody) return;
  
  if (transactionCart.length === 0) {
    tableBody.innerHTML = `
      <tr>
        <td colspan="3" class="text-center py-8 text-slate-500 font-medium">Your goods voucher list is empty. Select an item on the left to begin.</td>
      </tr>
    `;
    return;
  }
  
  tableBody.innerHTML = transactionCart.map((item, index) => `
    <tr class="border-b border-white/5 hover:bg-slate-900/30 transition font-medium">
      <td class="px-4 py-3">
        <div class="flex flex-col">
          <span class="text-slate-200 font-semibold">${item.name}</span>
          <span class="text-3xs text-sky font-mono">${item.id}</span>
        </div>
      </td>
      <td class="px-4 py-3 text-center text-slate-100 font-bold">${item.quantity}</td>
      <td class="px-4 py-3 text-right">
        <button type="button" onclick="removeCartItem(${index})" class="text-red-400 hover:text-red-300 font-bold focus:outline-none">Remove</button>
      </td>
    </tr>
  `).join('');
}

async function addItemToCart() {
  const select = document.getElementById('cart-sku-select');
  const qtyInput = document.getElementById('cart-qty-input');
  if (!select || !qtyInput) return;
  
  const sku = select.value;
  const qty = parseInt(qtyInput.value, 10);
  
  if (!sku || isNaN(qty) || qty <= 0) {
    showToast('Please select a valid item and quantity.', 'error');
    return;
  }
  
  try {
    const item = await window.StockDB.getItem(sku);
    if (!item) {
      showToast('Item not found.', 'error');
      return;
    }
    
    const existingIndex = transactionCart.findIndex(i => i.id === sku);

    // --- Stock Out: block if requested qty exceeds available stock ---
    if (currentTransactionDirection === 'out') {
      const alreadyInCart = existingIndex > -1 ? transactionCart[existingIndex].quantity : 0;
      const totalRequestedQty = alreadyInCart + qty;
      if (totalRequestedQty > item.quantity) {
        const remaining = item.quantity - alreadyInCart;
        if (remaining <= 0) {
          showToast(
            `Cannot add to voucher — no remaining stock for "${item.name}". Available: ${item.quantity}, already in list: ${alreadyInCart}.`,
            'error'
          );
        } else {
          showToast(
            `Insufficient stock for "${item.name}". You requested ${qty} but only ${remaining} more unit(s) can be issued (stock: ${item.quantity}, already listed: ${alreadyInCart}).`,
            'error'
          );
        }
        return;
      }
    }

    if (existingIndex > -1) {
      transactionCart[existingIndex].quantity += qty;
    } else {
      transactionCart.push({
        id: item.id,
        name: item.name,
        itemId: item.id,
        itemName: item.name,
        quantity: qty
      });
    }

    // --- Stock In: allow above max capacity but warn the user ---
    if (currentTransactionDirection === 'in') {
      const cartQty = transactionCart.find(i => i.id === sku).quantity;
      const projectedTotal = item.quantity + cartQty;
      if (projectedTotal > item.maxCapacity) {
        showToast(
          `Warning: Receiving ${cartQty} unit(s) of "${item.name}" will exceed the max capacity of ${item.maxCapacity} (projected: ${projectedTotal}). Item added - proceed with caution.`,
          'warning'
        );
        renderCart();
        qtyInput.value = 1;
        select.value = '';
        const warnDisplaySpan = document.getElementById('custom-select-display');
        if (warnDisplaySpan) {
          warnDisplaySpan.textContent = '-- Choose Hardware SKU --';
          warnDisplaySpan.classList.add('text-slate-400');
          warnDisplaySpan.classList.remove('text-slate-100', 'font-semibold');
        }
        document.getElementById('selected-item-details').classList.add('hidden');
        return;
      }
    }
    
    renderCart();
    qtyInput.value = 1;
    select.value = '';
    const okDisplaySpan = document.getElementById('custom-select-display');
    if (okDisplaySpan) {
      okDisplaySpan.textContent = '-- Choose Hardware SKU --';
      okDisplaySpan.classList.add('text-slate-400');
      okDisplaySpan.classList.remove('text-slate-100', 'font-semibold');
    }
    document.getElementById('selected-item-details').classList.add('hidden');
    showToast(`Added ${qty} unit(s) of ${item.name} to the voucher list.`, 'success');
  } catch (err) {
    console.error(err);
  }
}

function removeCartItem(index) {
  transactionCart.splice(index, 1);
  renderCart();
  showToast('Item removed from voucher list.', 'warning');
}

// --- Signature Pad Functions ---
function openSignatureModal(role) {
  activeSignatureRole = role;
  const modal = document.getElementById('signature-modal');
  const title = document.getElementById('signature-modal-title');
  
  const roleLabels = {
    'authorised': 'Draw Authorised By Signature',
    'received': 'Draw Received By Signature',
    'delivered': 'Draw Delivered By Signature',
    'gin-authorised': 'Draw Authorised By Signature (GIN)',
    'gin-inspected': 'Draw Inspected By Signature (GIN)',
    'gin-delivered': 'Draw Delivered By Signature (GIN)',
    'gin-received': 'Draw Received By Signature (GIN)'
  };
  
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
  if (title) {
    title.textContent = roleLabels[role] || 'Draw Signature';
  }
  
  signatureCanvas = document.getElementById('signature-canvas');
  if (signatureCanvas) {
    signatureCtx = signatureCanvas.getContext('2d');
    const rect = signatureCanvas.getBoundingClientRect();
    signatureCanvas.width = rect.width;
    signatureCanvas.height = rect.height;
    
    signatureCtx.strokeStyle = '#38bdf8';
    signatureCtx.lineWidth = 3;
    signatureCtx.lineCap = 'round';
    signatureCtx.lineJoin = 'round';
    
    signatureCtx.fillStyle = '#020617';
    signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  }
}

function closeSignatureModal() {
  const modal = document.getElementById('signature-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function clearSignatureCanvas() {
  if (signatureCanvas && signatureCtx) {
    signatureCtx.fillStyle = '#020617';
    signatureCtx.fillRect(0, 0, signatureCanvas.width, signatureCanvas.height);
  }
}

function saveSignatureCanvas() {
  if (!signatureCanvas) return;
  const dataURL = signatureCanvas.toDataURL();
  
  savedSignatures[activeSignatureRole] = dataURL;
  
  // Map role to container ID
  const containerMap = {
    'authorised': 'authorised-sig-container',
    'received': 'received-sig-container',
    'delivered': 'delivered-sig-container',
    'gin-authorised': 'gin-authorised-sig-container',
    'gin-inspected': 'gin-inspected-sig-container',
    'gin-delivered': 'gin-delivered-sig-container',
    'gin-received': 'gin-received-sig-container'
  };
  
  const containerId = containerMap[activeSignatureRole];
  const container = document.getElementById(containerId);
  if (container) {
    container.innerHTML = `
      <div class="relative w-full h-full flex items-center justify-center">
        <img class="max-h-full max-w-full opacity-90 filter invert" src="${dataURL}" alt="${activeSignatureRole} Signature" />
        <span class="absolute bottom-1 right-1 text-3xs text-emerald-400 font-bold">✓ Signed</span>
      </div>
    `;
    container.classList.remove('cursor-pointer', 'hover:border-sky-500/30');
    container.classList.add('border-emerald-500/30');
  }
  
  closeSignatureModal();
  showToast('Signature captured successfully.', 'success');
}

function initSignatureCanvasEvents() {
  const canvas = document.getElementById('signature-canvas');
  if (!canvas) return;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: clientX - rect.left,
      y: clientY - rect.top
    };
  }

  function startDraw(e) {
    e.preventDefault();
    isDrawingSignature = true;
    const pos = getPos(e);
    lastSigX = pos.x;
    lastSigY = pos.y;
  }

  function draw(e) {
    if (!isDrawingSignature) return;
    e.preventDefault();
    const pos = getPos(e);
    signatureCtx.beginPath();
    signatureCtx.moveTo(lastSigX, lastSigY);
    signatureCtx.lineTo(pos.x, pos.y);
    signatureCtx.stroke();
    lastSigX = pos.x;
    lastSigY = pos.y;
  }

  function stopDraw() {
    isDrawingSignature = false;
  }

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);

  canvas.addEventListener('touchstart', startDraw);
  canvas.addEventListener('touchmove', draw);
  canvas.addEventListener('touchend', stopDraw);
}

// --- Transaction Page Initializer ---
async function initTransaction() {
  const btnIn = document.getElementById('btn-flow-in');
  const btnOut = document.getElementById('btn-flow-out');
  const formIn = document.getElementById('form-stock-in');
  const formOut = document.getElementById('form-stock-out');

  if (btnIn && btnOut && formIn && formOut) {
    btnIn.addEventListener('click', () => {
      currentTransactionDirection = 'in';
      btnIn.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-sky-primary text-white border border-sky-400/20 shadow-lg shadow-sky-900/20 focus:outline-none transition';
      btnOut.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-slate-900/40 text-slate-400 border border-white/5 hover:bg-slate-900/60 focus:outline-none transition';
      formIn.classList.remove('hidden');
      formOut.classList.add('hidden');
      transactionCart = [];
      renderCart();
      resetAllSignatures();
    });

    btnOut.addEventListener('click', () => {
      currentTransactionDirection = 'out';
      btnOut.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-amber-500 text-slate-900 border border-amber-400/20 shadow-lg shadow-amber-900/20 focus:outline-none transition';
      btnIn.className = 'flex-1 py-3 px-4 rounded-xl font-bold bg-slate-900/40 text-slate-400 border border-white/5 hover:bg-slate-900/60 focus:outline-none transition';
      formOut.classList.remove('hidden');
      formIn.classList.add('hidden');
      transactionCart = [];
      renderCart();
      resetAllSignatures();
    });
  }

  populateItemSelects();
  
  const searchInput = document.getElementById('custom-select-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      populateItemSelects(e.target.value);
    });
  }
  
  setupTransactionFormHandlers();
  initSignatureCanvasEvents();
}

function resetAllSignatures() {
  savedSignatures = {
    'authorised': null, 'received': null, 'delivered': null,
    'gin-authorised': null, 'gin-inspected': null, 'gin-delivered': null, 'gin-received': null
  };
  const sigContainerIds = [
    'authorised-sig-container', 'received-sig-container', 'delivered-sig-container',
    'gin-authorised-sig-container', 'gin-inspected-sig-container', 'gin-delivered-sig-container', 'gin-received-sig-container'
  ];
  const sigLabels = [
    'Tap to Draw Authorised By Signature',
    'Tap to Draw Received By Signature',
    'Tap to Draw Delivered By Signature',
    'Tap to Draw Authorised By Signature',
    'Tap to Draw Inspected By Signature',
    'Tap to Draw Delivered By Signature',
    'Tap to Draw Received By Signature'
  ];
  const onclickRoles = ['authorised', 'received', 'delivered', 'gin-authorised', 'gin-inspected', 'gin-delivered', 'gin-received'];
  
  sigContainerIds.forEach((id, i) => {
    const el = document.getElementById(id);
    if (el) {
      el.innerHTML = `<span class="text-3xs text-sky font-bold uppercase tracking-widest animate-pulse">${sigLabels[i]}</span>`;
      el.className = 'h-24 bg-slate-950/45 rounded-xl border border-white/5 flex flex-col items-center justify-center p-3 text-center cursor-pointer hover:border-sky-500/30 transition';
      el.onclick = () => openSignatureModal(onclickRoles[i]);
    }
  });
}

async function populateItemSelects(searchQuery = '') {
  const optionsList = document.getElementById('custom-select-options');
  if (!optionsList) return;

  try {
    const items = await window.StockDB.getAllItems();
    
    const filteredItems = items.filter(item => {
      const q = searchQuery.toLowerCase();
      return item.id.toLowerCase().includes(q) || 
             item.name.toLowerCase().includes(q) || 
             item.category.toLowerCase().includes(q);
    });
    
    if (filteredItems.length === 0) {
      optionsList.innerHTML = '<li class="px-3 py-3 text-sm text-slate-400 text-center">No items found</li>';
    } else {
      optionsList.innerHTML = filteredItems.map(item => `
        <li class="px-3 py-2.5 text-sm hover:bg-sky-500/10 cursor-pointer border-b border-white/5 transition flex justify-between items-center" onclick="selectHardwareItem('${item.id}', '${item.id} - ${item.name.replace(/'/g, "\\'")}')">
          <div class="flex flex-col">
            <span class="font-bold text-slate-200">${item.name}</span>
            <span class="text-3xs text-sky font-mono">${item.id}</span>
          </div>
          <span class="text-xs text-slate-400">${item.quantity} in stock</span>
        </li>
      `).join('');
    }
  } catch (err) {
    console.error('Failed to populate custom select list:', err);
  }
}

function selectHardwareItem(sku, displayText) {
  const hiddenInput = document.getElementById('cart-sku-select');
  const displaySpan = document.getElementById('custom-select-display');
  const dropdown = document.getElementById('custom-select-dropdown');
  
  if (hiddenInput && displaySpan) {
    hiddenInput.value = sku;
    displaySpan.textContent = displayText;
    displaySpan.classList.remove('text-slate-400');
    displaySpan.classList.add('text-slate-100', 'font-semibold');
    
    hiddenInput.dispatchEvent(new Event('change'));
  }
  
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.classList.remove('flex');
  }
}
window.selectHardwareItem = selectHardwareItem;

function toggleCustomSelect() {
  const dropdown = document.getElementById('custom-select-dropdown');
  const searchInput = document.getElementById('custom-select-search');
  
  if (dropdown) {
    if (dropdown.classList.contains('hidden')) {
      dropdown.classList.remove('hidden');
      dropdown.classList.add('flex');
      if (searchInput) searchInput.focus();
    } else {
      dropdown.classList.add('hidden');
      dropdown.classList.remove('flex');
    }
  }
}
window.toggleCustomSelect = toggleCustomSelect;

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
  const container = document.getElementById('custom-select-container');
  const dropdown = document.getElementById('custom-select-dropdown');
  if (container && dropdown && !dropdown.classList.contains('hidden')) {
    if (!container.contains(e.target)) {
      dropdown.classList.add('hidden');
      dropdown.classList.remove('flex');
    }
  }
});

function setupTransactionFormHandlers() {
  const formIn = document.getElementById('form-stock-in');
  const formOut = document.getElementById('form-stock-out');
  const select = document.getElementById('cart-sku-select');

  if (select) {
    select.addEventListener('change', async (e) => {
      const sku = e.target.value;
      if (!sku) {
        document.getElementById('selected-item-details').classList.add('hidden');
        return;
      }
      
      try {
        const item = await window.StockDB.getItem(sku);
        if (item) {
          document.getElementById('selected-sku-display').textContent = item.id;
          document.getElementById('item-detail-name').textContent = item.name;
          document.getElementById('item-detail-category').textContent = item.category;
          document.getElementById('item-detail-qty').textContent = `${item.quantity} currently in stock`;
          document.getElementById('selected-item-details').classList.remove('hidden');
        }
      } catch (err) {
        console.error(err);
      }
    });
  }

  // GRN Form Submit
  if (formIn) {
    formIn.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const authorisedBy = document.getElementById('grn-authorised-by').value.trim();
      const receivedBy = document.getElementById('grn-received-by').value.trim();
      const deliveredBy = document.getElementById('grn-delivered-by').value.trim();
      const pin = document.getElementById('grn-auth-pin').value;
      const memo = document.getElementById('grn-memo').value.trim();
      const reference = document.getElementById('grn-reference').value.trim();
      const jtOrden = document.getElementById('grn-jt-orden').value.trim();
      
      if (transactionCart.length === 0) {
        showToast('Please add at least one item to the voucher list.', 'error');
        return;
      }
      if (!authorisedBy || !receivedBy || !deliveredBy || !pin) {
        showToast('Please fill out all mandatory fields (names and PIN).', 'error');
        return;
      }
      if (pin !== '1234') {
        showToast('Incorrect staff authorization passcode PIN.', 'error');
        return;
      }
      
      const res = await saveTransaction({
        items: [...transactionCart],
        direction: 'in',
        authorisedBy,
        receivedBy,
        deliveredBy,
        signatureAuthorised: savedSignatures['authorised'],
        signatureReceived: savedSignatures['received'],
        signatureDelivered: savedSignatures['delivered'],
        memo,
        reference,
        jtOrden
      });
      
      if (res.success) {
        showToast(`✓ Goods Received Voucher GRV-${res.voucherNumber} submitted successfully!`, 'success');
        formIn.reset();
        transactionCart = [];
        renderCart();
        populateItemSelects();
        resetAllSignatures();
      }
    });
  }

  // GIN Form Submit
  if (formOut) {
    formOut.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const authorisedBy = document.getElementById('gin-authorised-by').value.trim();
      const inspectedBy = document.getElementById('gin-inspected-by').value.trim();
      const deliveredBy = document.getElementById('gin-delivered-by').value.trim();
      const receivedBy = document.getElementById('gin-received-by').value.trim();
      const pin = document.getElementById('gin-auth-pin').value;
      const memo = document.getElementById('gin-memo').value.trim();
      const reference = document.getElementById('gin-reference').value.trim();
      const jtOrden = document.getElementById('gin-jt-orden').value.trim();
      
      if (transactionCart.length === 0) {
        showToast('Please add at least one item to the voucher list.', 'error');
        return;
      }
      if (!authorisedBy || !inspectedBy || !deliveredBy || !receivedBy || !pin) {
        showToast('Please fill out all mandatory fields (names and PIN).', 'error');
        return;
      }
      if (pin !== '1234') {
        showToast('Incorrect staff authorization passcode PIN.', 'error');
        return;
      }
      
      // Pre-flight check quantity
      try {
        for (const cartItem of transactionCart) {
          const item = await window.StockDB.getItem(cartItem.id);
          if (item && item.quantity < cartItem.quantity) {
            showToast(`Out of Stock: ${item.name} only has ${item.quantity} available, but ${cartItem.quantity} requested.`, 'error');
            return;
          }
        }
      } catch (err) {
        console.error(err);
      }
      
      const res = await saveTransaction({
        items: [...transactionCart],
        direction: 'out',
        authorisedBy,
        inspectedBy,
        receivedBy,
        deliveredBy,
        signatureAuthorised: savedSignatures['gin-authorised'],
        signatureInspected: savedSignatures['gin-inspected'],
        signatureReceived: savedSignatures['gin-received'],
        signatureDelivered: savedSignatures['gin-delivered'],
        memo,
        reference,
        jtOrden
      });
      
      if (res.success) {
        showToast(`✓ Goods Issued Note GIN-${res.voucherNumber} submitted successfully!`, 'warning');
        formOut.reset();
        transactionCart = [];
        renderCart();
        populateItemSelects();
        resetAllSignatures();
      }
    });
  }
}

// Global binds for transaction page
window.openSignatureModal = openSignatureModal;
window.closeSignatureModal = closeSignatureModal;
window.clearSignatureCanvas = clearSignatureCanvas;
window.saveSignatureCanvas = saveSignatureCanvas;
window.addItemToCart = addItemToCart;
window.removeCartItem = removeCartItem;

// --- Transaction History Logs Page ---
let filterTxDirection = 'all';
let filterTxSearch = '';
let filterTxStartDate = '';
let filterTxEndDate = '';

async function initHistory() {
  const selectDir = document.getElementById('history-filter-direction');
  const inputSearch = document.getElementById('history-search');
  const inputStartDate = document.getElementById('history-start-date');
  const inputEndDate = document.getElementById('history-end-date');
  const exportBtn = document.getElementById('export-history-btn');

  if (selectDir) {
    selectDir.addEventListener('change', (e) => {
      filterTxDirection = e.target.value;
      renderHistoryTable();
    });
  }

  if (inputSearch) {
    inputSearch.addEventListener('input', (e) => {
      filterTxSearch = e.target.value.toLowerCase();
      renderHistoryTable();
    });
  }

  if (inputStartDate) {
    inputStartDate.addEventListener('change', (e) => {
      filterTxStartDate = e.target.value;
      renderHistoryTable();
    });
  }

  if (inputEndDate) {
    inputEndDate.addEventListener('change', (e) => {
      filterTxEndDate = e.target.value;
      renderHistoryTable();
    });
  }

  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      exportTransactionsJSON();
    });
  }

  window.addEventListener('beforeprint', () => {
    const printMeta = document.getElementById('print-report-meta');
    if (printMeta) {
      const startDesc = filterTxStartDate ? filterTxStartDate : 'Beginning';
      const endDesc = filterTxEndDate ? filterTxEndDate : 'Present';
      printMeta.textContent = `Report: ${startDesc} to ${endDesc} | Operator: ALI | Generated: ${new Date().toLocaleString()}`;
    }
  });

  renderHistoryTable();
}

async function renderHistoryTable() {
  const tableBody = document.getElementById('history-table-body');
  if (!tableBody) return;

  try {
    const transactions = await window.StockDB.getAllTransactions();

    const filtered = transactions.filter(tx => {
      const matchesDir = filterTxDirection === 'all' || tx.direction === filterTxDirection;
      
      let itemSearchMatch = false;
      const searchTerms = filterTxSearch.toLowerCase();
      if (tx.items && Array.isArray(tx.items)) {
        itemSearchMatch = tx.items.some(item => {
          const nm = (item.itemName || item.name || '').toLowerCase();
          const id = (item.itemId || item.id || '').toLowerCase();
          return nm.includes(searchTerms) || id.includes(searchTerms);
        });
      } else if (tx.itemName && tx.itemId) {
        itemSearchMatch = tx.itemName.toLowerCase().includes(searchTerms) ||
                          tx.itemId.toLowerCase().includes(searchTerms);
      }

      const matchesSearch = itemSearchMatch ||
                            (tx.authorisedBy || tx.personA || '').toLowerCase().includes(searchTerms) ||
                            (tx.deliveredBy || tx.personB || '').toLowerCase().includes(searchTerms);
      
      let matchesStartDate = true;
      if (filterTxStartDate) {
        const startMs = new Date(filterTxStartDate + 'T00:00:00').getTime();
        matchesStartDate = tx.timestamp >= startMs;
      }

      let matchesEndDate = true;
      if (filterTxEndDate) {
        const endMs = new Date(filterTxEndDate + 'T23:59:59.999').getTime();
        matchesEndDate = tx.timestamp <= endMs;
      }

      return matchesDir && matchesSearch && matchesStartDate && matchesEndDate;
    });

    if (filtered.length === 0) {
      tableBody.innerHTML = `
        <tr>
          <td colspan="8" class="text-center py-12 text-slate-400">
            No transaction records found matching filters.
          </td>
        </tr>
      `;
      return;
    }

    const allItems = await window.StockDB.getAllItems();
    const itemStockMap = {};
    allItems.forEach(i => itemStockMap[i.id] = i.quantity);

    let rowsHTML = '';
    filtered.forEach(tx => {
      const directionText = tx.direction === 'in' ? 'GRN' : 'GIN';
      const badgeClass = tx.direction === 'in' ? 'badge-in' : 'badge-out';
      const formattedDate = new Date(tx.timestamp).toLocaleString();
      const voucherNum = tx.voucherNumber ? formatVoucherLabel(tx.direction, tx.voucherNumber) : `#${tx.id}`;
      const authorisedBy = tx.authorisedBy || tx.personB || '—';
      const deliveredBy = tx.deliveredBy || tx.personA || '—';

      const itemsToRender = (tx.items && Array.isArray(tx.items) && tx.items.length > 0) ? tx.items : [{
        itemId: tx.itemId,
        itemName: tx.itemName,
        quantity: tx.quantity
      }];

      itemsToRender.forEach(item => {
        const nm = item.itemName || item.name || item.id || '—';
        const id = item.itemId || item.id || '—';
        const qty = item.quantity || 0;
        const currentStock = itemStockMap[id] !== undefined ? itemStockMap[id] : '—';

        const itemsSummary = `
          <div class="flex flex-col">
            <span class="font-semibold text-slate-100">${nm}</span>
            <span class="text-xs text-sky font-mono">${id}</span>
          </div>
        `;

        rowsHTML += `
          <tr class="border-b border-white/5 hover:bg-slate-900/40 transition cursor-pointer" onclick="openReceiptModal(${tx.id})">
            <td class="px-6 py-4 font-mono text-sky-400 text-xs font-bold">${voucherNum}</td>
            <td class="px-6 py-4 text-slate-400 text-sm whitespace-nowrap">${formattedDate}</td>
            <td class="px-6 py-4">${itemsSummary}</td>
            <td class="px-6 py-4 whitespace-nowrap">
              <span class="${badgeClass} px-2.5 py-0.5 text-2xs font-extrabold rounded">${directionText}</span>
            </td>
            <td class="px-6 py-4 text-slate-200 font-bold text-sm text-center">${qty}</td>
            <td class="px-6 py-4 text-slate-300 font-bold text-sm text-center">${currentStock}</td>
            <td class="px-6 py-4 text-xs text-slate-300">${authorisedBy}</td>
            <td class="px-6 py-4 text-xs text-slate-300">${deliveredBy}</td>
          </tr>
        `;
      });
    });
    tableBody.innerHTML = rowsHTML;
  } catch (err) {
    console.error('Failed to load transaction audit trail:', err);
  }
}

async function openReceiptModal(txId) {
  try {
    const transactions = await window.StockDB.getAllTransactions();
    const tx = transactions.find(t => t.id === txId);
    if (!tx) {
      showToast('Transaction not found.', 'error');
      return;
    }
    
    // Determine GRN or GIN
    const isIn = tx.direction === 'in';
    const voucherNum = tx.voucherNumber || String(tx.id).padStart(4, '0');
    const voucherCode = isIn ? `JDI-GRV-${voucherNum}` : `JDI-GIN-${voucherNum}`;
    
    // Set receipt type header
    const receiptTypeEl = document.getElementById('receipt-type');
    const receiptVoucherNumEl = document.getElementById('receipt-voucher-number');
    const receiptIdEl = document.getElementById('receipt-id');
    const receiptFooterCodeEl = document.getElementById('receipt-footer-code');
    
    if (receiptTypeEl) receiptTypeEl.textContent = isIn ? 'GOODS RECEIVED VOUCHER' : 'GOODS ISSUED NOTE';
    if (receiptVoucherNumEl) receiptVoucherNumEl.textContent = voucherNum;
    if (receiptIdEl) receiptIdEl.textContent = voucherCode;
    if (receiptFooterCodeEl) receiptFooterCodeEl.textContent = isIn ? 'JDI-GRV-01 (Rev. 0)' : 'JDI-GIN-01 (Rev. 0)';
    
    // Meta fields
    const receiptDateEl = document.getElementById('receipt-date');
    const receiptMemoEl = document.getElementById('receipt-memo');
    const receiptRefEl = document.getElementById('receipt-reference');
    const receiptJtOrdenEl = document.getElementById('receipt-jt-orden');
    
    if (receiptDateEl) receiptDateEl.textContent = new Date(tx.timestamp).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    if (receiptMemoEl) receiptMemoEl.textContent = tx.memo || '—';
    if (receiptRefEl) receiptRefEl.textContent = tx.reference || '—';
    if (receiptJtOrdenEl) receiptJtOrdenEl.textContent = tx.jtOrden || '—';
    
    // Items table
    const receiptItemsBody = document.getElementById('receipt-items-body');
    if (receiptItemsBody) {
      if (tx.items && Array.isArray(tx.items)) {
        receiptItemsBody.innerHTML = tx.items.map(item => {
          const nm = item.itemName || item.name || '—';
          const id = item.itemId || item.id || '—';
          return `
            <tr style="border-bottom:1px solid #e2e8f0;">
              <td style="padding:6px;border-right:1px solid #e2e8f0;font-size:9px;font-family:monospace;color:#475569;">${id}</td>
              <td style="padding:6px;border-right:1px solid #e2e8f0;font-size:10px;color:#1e293b;">${nm}</td>
              <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-size:10px;color:#475569;">pcs</td>
              <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-size:10px;"></td>
              <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-size:10px;font-weight:700;">${item.quantity}</td>
              <td style="padding:6px;text-align:center;font-size:10px;font-weight:700;color:#0284c7;">${item.quantity}</td>
            </tr>
          `;
        }).join('');
      } else {
        receiptItemsBody.innerHTML = `
          <tr style="border-bottom:1px solid #e2e8f0;">
            <td style="padding:6px;border-right:1px solid #e2e8f0;font-size:9px;font-family:monospace;color:#475569;">${tx.itemId || '—'}</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;font-size:10px;color:#1e293b;">${tx.itemName || '—'}</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-size:10px;color:#475569;">pcs</td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-size:10px;"></td>
            <td style="padding:6px;border-right:1px solid #e2e8f0;text-align:center;font-size:10px;font-weight:700;">${tx.quantity || 0}</td>
            <td style="padding:6px;text-align:center;font-size:10px;font-weight:700;color:#0284c7;">${tx.quantity || 0}</td>
          </tr>
        `;
      }
    }
    
    // Dynamic Signatures Rendering
    const sigContainer = document.getElementById('receipt-signatures-container');
    if (sigContainer) {
      const getSigImgHTML = (sig, roleLabel) => {
        if (window.Auth && window.Auth.isDisplayableSignature(sig)) {
          return `<img style="max-height:34px;max-width:100%;filter:invert(1);" src="${sig}" alt="${roleLabel} Signature" />`;
        }
        return '';
      };

      if (isIn) {
        // GRV (Stock In): 3 Signatures
        // Authorised By: Mr S. I. Johnson, Received By: Ali, Delivered By: tx.deliveredBy
        const authorisedName = tx.authorisedBy || 'Mr S. I. Johnson';
        const receivedName = tx.receivedBy || 'Ali';
        const deliveredName = tx.deliveredBy || tx.personA || '—';
        const sigAuth = tx.signatureAuthorised || tx.signatureB;
        const sigRecv = tx.signatureReceived;
        const sigDelv = tx.signatureDelivered || tx.signatureA;

        sigContainer.innerHTML = `
          <!-- Authorised By -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Authorised By:</span>
              <span style="font-size:10px;font-weight:600;color:#0284c7;border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;padding-bottom:1px;">${authorisedName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Signature:</span>
              <div style="border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;height:36px;display:flex;align-items:center;justify-content:center;">
                ${getSigImgHTML(sigAuth, 'Authorised By')}
              </div>
            </div>
          </div>

          <!-- Received By -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Received By:</span>
              <span style="font-size:10px;font-weight:600;color:#0284c7;border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;padding-bottom:1px;">${receivedName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Signature:</span>
              <div style="border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;height:36px;display:flex;align-items:center;justify-content:center;">
                ${getSigImgHTML(sigRecv, 'Received By')}
              </div>
            </div>
          </div>

          <!-- Delivered By -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Delivered By:</span>
              <span style="font-size:10px;font-weight:600;color:#0284c7;border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;padding-bottom:1px;">${deliveredName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Signature:</span>
              <div style="border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;height:36px;display:flex;align-items:center;justify-content:center;">
                ${getSigImgHTML(sigDelv, 'Delivered By')}
              </div>
            </div>
          </div>
        `;
      } else {
        // GIN (Stock Out): 4 Signatures
        // Authorised By: Mr S. I. Johnson, Inspected By: Ali, Delivered By: variable, Received By: variable
        const authorisedName = tx.authorisedBy || 'Mr S. I. Johnson';
        const inspectedName = tx.inspectedBy || 'Ali';
        const deliveredName = tx.deliveredBy || tx.personA || '—';
        const receivedName = tx.receivedBy || '—';
        const sigAuth = tx.signatureAuthorised || tx.signatureB;
        const sigInspect = tx.signatureInspected;
        const sigDelv = tx.signatureDelivered;
        const sigRecv = tx.signatureReceived || tx.signatureA;

        sigContainer.innerHTML = `
          <!-- Authorised By -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Authorised By:</span>
              <span style="font-size:10px;font-weight:600;color:#0284c7;border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;padding-bottom:1px;">${authorisedName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Signature:</span>
              <div style="border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;height:36px;display:flex;align-items:center;justify-content:center;">
                ${getSigImgHTML(sigAuth, 'Authorised By')}
              </div>
            </div>
          </div>

          <!-- Inspected By -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Inspected By:</span>
              <span style="font-size:10px;font-weight:600;color:#0284c7;border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;padding-bottom:1px;">${inspectedName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Signature:</span>
              <div style="border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;height:36px;display:flex;align-items:center;justify-content:center;">
                ${getSigImgHTML(sigInspect, 'Inspected By')}
              </div>
            </div>
          </div>

          <!-- Delivered By -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Delivered By:</span>
              <span style="font-size:10px;font-weight:600;color:#0284c7;border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;padding-bottom:1px;">${deliveredName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Signature:</span>
              <div style="border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;height:36px;display:flex;align-items:center;justify-content:center;">
                ${getSigImgHTML(sigDelv, 'Delivered By')}
              </div>
            </div>
          </div>

          <!-- Received By -->
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Received By:</span>
              <span style="font-size:10px;font-weight:600;color:#0284c7;border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;padding-bottom:1px;">${receivedName}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="font-size:9px;font-weight:700;color:#1e293b;white-space:nowrap;width:90px;">Signature:</span>
              <div style="border-bottom:1px solid #cbd5e1;flex:1;min-width:100px;height:36px;display:flex;align-items:center;justify-content:center;">
                ${getSigImgHTML(sigRecv, 'Received By')}
              </div>
            </div>
          </div>
        `;
      }
    }
    
    // Update modal title
    const modalTitle = document.getElementById('receipt-modal-title');
    if (modalTitle) modalTitle.textContent = isIn ? `GRV-${voucherNum} — Goods Received Voucher` : `GIN-${voucherNum} — Goods Issued Note`;
    
    const modal = document.getElementById('receipt-modal');
    if (modal) {
      modal.classList.remove('hidden');
      modal.classList.add('flex');
    }
  } catch (err) {
    console.error('Failed to open receipt modal:', err);
  }
}

function closeReceiptModal() {
  const modal = document.getElementById('receipt-modal');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

function printCurrentReceipt() {
  document.body.classList.add('printing-receipt');
  window.print();
  document.body.classList.remove('printing-receipt');
}

function printReport() {
  document.body.classList.add('printing-report');
  window.print();
  document.body.classList.remove('printing-report');
}

window.openReceiptModal = openReceiptModal;
window.closeReceiptModal = closeReceiptModal;
window.printCurrentReceipt = printCurrentReceipt;
window.printReport = printReport;

async function exportTransactionsJSON() {
  try {
    const transactions = await window.StockDB.getAllTransactions();
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(transactions, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `jdi_stock_audit_log_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('Transaction audit log downloaded.', 'success');
  } catch (err) {
    showToast('Failed to export transactions: ' + err.message, 'error');
  }
}

// --- Application Core Bootstrap ---
window.addEventListener('DOMContentLoaded', async () => {
  try {
    await window.StockDB.open();
    await window.DBInit.seedIfEmpty();

    if (window.Auth && window.Auth.initSupabase) {
      await window.Auth.initSupabase();
    }

    const supabaseClient = window.Auth?.getSupabaseClient();
    if (window.SyncEngine && supabaseClient) {
      window.SyncEngine.init(supabaseClient);
    }

    updateConnectionUI();
    initActivePage();
  } catch (err) {
    console.error('Application bootstrap failed:', err);
  }
});

