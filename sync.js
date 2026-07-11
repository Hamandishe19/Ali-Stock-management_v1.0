/**
 * sync.js
 * Supabase synchronization engine for Ironclad Stock Management
 */

window.SyncEngine = (function() {
  let supabase = null;
  let isSyncing = false;
  let deviceId = null;

  function generateDeviceId() {
    return Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 6);
  }

  function getDeviceId() {
    if (!deviceId) {
      deviceId = localStorage.getItem('device_id');
      if (!deviceId) {
        deviceId = generateDeviceId();
        localStorage.setItem('device_id', deviceId);
      }
    }
    return deviceId;
  }

  function getLastSyncTime() {
    return parseInt(localStorage.getItem('last_sync_timestamp') || '0', 10);
  }

  function setLastSyncTime(timestamp) {
    localStorage.setItem('last_sync_timestamp', timestamp.toString());
  }

  function getSyncStatus() {
    if (isSyncing) return 'syncing';
    return window.AppState && window.AppState.isOnline() ? 'online' : 'offline';
  }

  async function init(supabaseClient) {
    supabase = supabaseClient;
    getDeviceId(); // Initialize device ID

    // Setup online/offline listeners
    window.addEventListener('online', () => {
      if (window.AppState && !window.AppState.isSimulatedOffline) {
        fullSync();
      }
    });

    // Start realtime if online
    if (window.AppState && window.AppState.isOnline()) {
      setupRealtimeSubscriptions();
      // Initial sync on load
      setTimeout(fullSync, 1000);
    }
  }

  async function pushChanges() {
    if (!supabase) return;
    
    try {
      const queue = await window.StockDB.getSyncQueue();
      if (!queue || queue.length === 0) return;

      console.log(`[SyncEngine] Pushing ${queue.length} items to Supabase...`);

      for (const entry of queue) {
        const { id, payload, timestamp } = entry;
        const { storeName, operation, record } = payload;

        try {
          if (storeName === 'inventory') {
            if (operation === 'upsert' || operation === 'delete') {
              // Both upsert and delete (soft-delete) are mapped to Postgres UPSERT
              const { error } = await supabase
                .from('inventory')
                .upsert({
                  id: record.id,
                  name: record.name,
                  category: record.category,
                  quantity: record.quantity,
                  min_threshold: record.minThreshold,
                  max_capacity: record.maxCapacity,
                  location: record.location || null,
                  updated_at: record.updatedAt,
                  is_deleted: record.is_deleted || false
                }, { onConflict: 'id' });
              
              if (error) throw error;
            }
          } else if (storeName === 'transactions') {
            if (operation === 'insert') {
              // Format for Supabase
              const dbRecord = {
                local_id: record.id, // Original IDB ID
                device_id: getDeviceId(),
                items: record.items,
                direction: record.direction,
                voucher_number: record.voucherNumber,
                authorised_by: record.authorisedBy,
                received_by: record.receivedBy,
                delivered_by: record.deliveredBy,
                inspected_by: record.inspectedBy,
                signature_authorised: record.signatureAuthorised,
                signature_received: record.signatureReceived,
                signature_delivered: record.signatureDelivered,
                signature_inspected: record.signatureInspected,
                person_a: record.personA,
                person_b: record.personB,
                signature_a: record.signatureA,
                signature_b: record.signatureB,
                memo: record.memo,
                reference: record.reference,
                jt_orden: record.jtOrden,
                pin_verified: record.pinVerified,
                timestamp: record.timestamp
              };

              const { error } = await supabase
                .from('transactions')
                .insert(dbRecord);
              
              // If error is unique constraint violation (already pushed), we can ignore and delete from queue
              if (error && error.code !== '23505') {
                throw error;
              }
            }
          }

          // Successfully pushed, remove from local queue
          await window.StockDB.deleteFromSyncQueue(id);
        } catch (itemError) {
          console.error(`[SyncEngine] Failed to push queue item ${id}:`, itemError);
          // Stop processing queue on first error to maintain order
          break;
        }
      }
    } catch (err) {
      console.error('[SyncEngine] pushChanges error:', err);
    }
  }

  async function pullChanges() {
    if (!supabase) return;

    try {
      const lastSync = getLastSyncTime();
      const currentSyncTime = Date.now();
      
      console.log(`[SyncEngine] Pulling changes since ${new Date(lastSync).toISOString()}...`);

      // 1. Pull Inventory
      const { data: remoteInventory, error: invError } = await supabase
        .from('inventory')
        .select('*')
        .gt('updated_at', lastSync); // Pull anything updated since last sync

      if (invError) throw invError;

      if (remoteInventory && remoteInventory.length > 0) {
        for (const remoteItem of remoteInventory) {
          const localItem = await window.StockDB.getItem(remoteItem.id);
          
          // Conflict resolution: Last write wins (updated_at)
          if (!localItem || remoteItem.updated_at > localItem.updatedAt) {
            const mappedItem = {
              id: remoteItem.id,
              name: remoteItem.name,
              category: remoteItem.category,
              quantity: remoteItem.quantity,
              minThreshold: remoteItem.min_threshold,
              maxCapacity: remoteItem.max_capacity,
              location: remoteItem.location,
              updatedAt: parseInt(remoteItem.updated_at, 10),
              is_deleted: remoteItem.is_deleted
            };
            await window.StockDB.putItemFromRemote(mappedItem);
          }
        }
      }

      // 2. Pull Transactions
      const { data: remoteTransactions, error: txError } = await supabase
        .from('transactions')
        .select('*')
        .gt('timestamp', lastSync)
        .neq('device_id', getDeviceId()); // Don't pull our own transactions (already local)

      if (txError) throw txError;

      if (remoteTransactions && remoteTransactions.length > 0) {
        for (const remoteTx of remoteTransactions) {
          // Check if we already have it (dedup)
          const existing = await window.StockDB.getTransactionByLocalId(remoteTx.local_id, remoteTx.device_id);
          if (!existing) {
            const mappedTx = {
              id: `remote_${remoteTx.id}`, // Temporary local ID
              local_id: remoteTx.local_id,
              device_id: remoteTx.device_id,
              items: remoteTx.items,
              direction: remoteTx.direction,
              voucherNumber: remoteTx.voucher_number,
              authorisedBy: remoteTx.authorised_by,
              receivedBy: remoteTx.received_by,
              deliveredBy: remoteTx.delivered_by,
              inspectedBy: remoteTx.inspected_by,
              signatureAuthorised: remoteTx.signature_authorised,
              signatureReceived: remoteTx.signature_received,
              signatureDelivered: remoteTx.signature_delivered,
              signatureInspected: remoteTx.signature_inspected,
              personA: remoteTx.person_a,
              personB: remoteTx.person_b,
              signatureA: remoteTx.signature_a,
              signatureB: remoteTx.signature_b,
              memo: remoteTx.memo,
              reference: remoteTx.reference,
              jtOrden: remoteTx.jt_orden,
              pinVerified: remoteTx.pin_verified,
              timestamp: parseInt(remoteTx.timestamp, 10)
            };
            await window.StockDB.addTransactionFromRemote(mappedTx);
          }
        }
      }

      // Update sync time
      setLastSyncTime(currentSyncTime);
      
      // Refresh UI if necessary
      if ((remoteInventory && remoteInventory.length > 0) || (remoteTransactions && remoteTransactions.length > 0)) {
        document.dispatchEvent(new Event('sync_completed_with_data'));
      }

    } catch (err) {
      console.error('[SyncEngine] pullChanges error:', err);
    }
  }

  async function fullSync() {
    if (isSyncing || !window.AppState || !window.AppState.isOnline() || !supabase) return;
    
    // Only sync if user is authenticated
    const session = await window.Auth.getSession();
    if (!session) return;

    isSyncing = true;
    if (window.App && window.App.updateConnectionUI) window.App.updateConnectionUI();

    try {
      await pushChanges();
      await pullChanges();
    } finally {
      isSyncing = false;
      if (window.App && window.App.updateConnectionUI) window.App.updateConnectionUI();
    }
  }

  function setupRealtimeSubscriptions() {
    if (!supabase) return;

    supabase.channel('custom-all-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inventory' },
        (payload) => {
          handleRemoteInventoryChange(payload);
        }
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'transactions' },
        (payload) => {
          handleRemoteTransactionInsert(payload);
        }
      )
      .subscribe();
  }

  async function handleRemoteInventoryChange(payload) {
    const remoteItem = payload.new;
    if (!remoteItem || remoteItem.is_deleted === undefined) return; // Ignore deletes for now, should be soft-deletes

    const localItem = await window.StockDB.getItem(remoteItem.id);
    
    // Last write wins
    if (!localItem || remoteItem.updated_at > localItem.updatedAt) {
      const mappedItem = {
        id: remoteItem.id,
        name: remoteItem.name,
        category: remoteItem.category,
        quantity: remoteItem.quantity,
        minThreshold: remoteItem.min_threshold,
        maxCapacity: remoteItem.max_capacity,
        location: remoteItem.location,
        updatedAt: parseInt(remoteItem.updated_at, 10),
        is_deleted: remoteItem.is_deleted
      };
      await window.StockDB.putItemFromRemote(mappedItem);
      document.dispatchEvent(new Event('sync_completed_with_data'));
    }
  }

  async function handleRemoteTransactionInsert(payload) {
    const remoteTx = payload.new;
    if (!remoteTx || remoteTx.device_id === getDeviceId()) return; // Ignore our own pushes

    const existing = await window.StockDB.getTransactionByLocalId(remoteTx.local_id, remoteTx.device_id);
    if (!existing) {
      const mappedTx = {
        id: `remote_${remoteTx.id}`,
        local_id: remoteTx.local_id,
        device_id: remoteTx.device_id,
        items: remoteTx.items,
        direction: remoteTx.direction,
        voucherNumber: remoteTx.voucher_number,
        authorisedBy: remoteTx.authorised_by,
        receivedBy: remoteTx.received_by,
        deliveredBy: remoteTx.delivered_by,
        inspectedBy: remoteTx.inspected_by,
        signatureAuthorised: remoteTx.signature_authorised,
        signatureReceived: remoteTx.signature_received,
        signatureDelivered: remoteTx.signature_delivered,
        signatureInspected: remoteTx.signature_inspected,
        personA: remoteTx.person_a,
        personB: remoteTx.person_b,
        signatureA: remoteTx.signature_a,
        signatureB: remoteTx.signature_b,
        memo: remoteTx.memo,
        reference: remoteTx.reference,
        jtOrden: remoteTx.jt_orden,
        pinVerified: remoteTx.pin_verified,
        timestamp: parseInt(remoteTx.timestamp, 10)
      };
      await window.StockDB.addTransactionFromRemote(mappedTx);
      document.dispatchEvent(new Event('sync_completed_with_data'));
    }
  }

  return {
    init,
    getDeviceId,
    getSyncStatus,
    fullSync,
    queueChange: async (storeName, operation, record) => {
      await window.StockDB.addToSyncQueue({ storeName, operation, record });
      // Debounce trigger sync
      if (window.SyncEngine._syncTimeout) clearTimeout(window.SyncEngine._syncTimeout);
      window.SyncEngine._syncTimeout = setTimeout(fullSync, 2000);
    }
  };

})();
