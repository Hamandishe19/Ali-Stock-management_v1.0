/**
 * sync.js — Supabase-Direct Engine
 *
 * Architecture:
 *  • All writes go to Supabase immediately (no queue, no local buffer)
 *  • All reads come from Supabase on every page load
 *  • Realtime subscription pushes changes to all connected devices instantly
 *  • IndexedDB is kept only as a display mirror (fast local reads for UI)
 */

window.SyncEngine = (function () {
  let supabase = null;

  // ── Device ID (used for transaction deduplication) ───────────
  function getDeviceId() {
    let id = localStorage.getItem('device_id');
    if (!id) {
      id = Math.random().toString(36).substring(2, 10);
      localStorage.setItem('device_id', id);
    }
    return id;
  }

  // ── Initialise ───────────────────────────────────────────────
  async function init(supabaseClient) {
    supabase = supabaseClient;
    getDeviceId();

    // Pull everything from Supabase into local IndexedDB for display
    await pullAll();

    // Subscribe to live changes from other devices
    setupRealtime();
  }

  // ── Pull all data from Supabase → local IndexedDB ────────────
  async function pullAll() {
    if (!supabase) return;
    try {
      // Inventory
      const { data: items, error: ie } = await supabase
        .from('inventory')
        .select('*')
        .eq('is_deleted', false);

      if (!ie && items) {
        for (const item of items) {
          await window.StockDB.putItemFromRemote(fromSupabaseInventory(item));
        }
      }

      // Transactions
      const { data: txs, error: te } = await supabase
        .from('transactions')
        .select('*')
        .order('timestamp', { ascending: false });

      if (!te && txs) {
        for (const tx of txs) {
          const exists = await window.StockDB.getTransactionByLocalId(tx.local_id, tx.device_id);
          if (!exists) {
            await window.StockDB.addTransactionFromRemote(fromSupabaseTransaction(tx));
          }
        }
      }

      window.dispatchEvent(new Event('sync_completed_with_data'));
    } catch (err) {
      console.error('[Sync] pullAll error:', err);
    }
  }

  // ── Write inventory item directly to Supabase ─────────────────
  async function writeInventoryItem(item) {
    if (!supabase) return;
    const { error } = await supabase
      .from('inventory')
      .upsert({
        id:            item.id,
        name:          item.name,
        category:      item.category,
        quantity:      item.quantity,
        min_threshold: item.minThreshold,
        max_capacity:  item.maxCapacity,
        location:      item.location || '',
        updated_at:    item.updatedAt || Date.now(),
        is_deleted:    item.is_deleted || false,
      });
    if (error) console.error('[Sync] writeInventoryItem error:', error);
  }

  // ── Write transaction directly to Supabase ────────────────────
  async function writeTransaction(tx) {
    if (!supabase) return;
    const { error } = await supabase
      .from('transactions')
      .insert({
        local_id:             tx.id,
        device_id:            getDeviceId(),
        items:                tx.items,
        direction:            tx.direction,
        voucher_number:       tx.voucherNumber,
        authorised_by:        tx.authorisedBy,
        received_by:          tx.receivedBy,
        delivered_by:         tx.deliveredBy,
        inspected_by:         tx.inspectedBy,
        signature_authorised: tx.signatureAuthorised,
        signature_received:   tx.signatureReceived,
        signature_delivered:  tx.signatureDelivered,
        signature_inspected:  tx.signatureInspected,
        person_a:             tx.personA,
        person_b:             tx.personB,
        signature_a:          tx.signatureA,
        signature_b:          tx.signatureB,
        memo:                 tx.memo,
        reference:            tx.reference,
        jt_orden:             tx.jtOrden,
        pin_verified:         tx.pinVerified,
        timestamp:            tx.timestamp,
      });
    if (error) console.error('[Sync] writeTransaction error:', error);
  }

  // ── Realtime: receive changes from other devices ──────────────
  function setupRealtime() {
    if (!supabase) return;

    supabase.channel('jdi-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, async (payload) => {
        if (payload.new) {
          await window.StockDB.putItemFromRemote(fromSupabaseInventory(payload.new));
          window.dispatchEvent(new Event('sync_completed_with_data'));
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'transactions' }, async (payload) => {
        if (payload.new) {
          const exists = await window.StockDB.getTransactionByLocalId(payload.new.local_id, payload.new.device_id);
          if (!exists) {
            await window.StockDB.addTransactionFromRemote(fromSupabaseTransaction(payload.new));
            window.dispatchEvent(new Event('sync_completed_with_data'));
          }
        }
      })
      .subscribe((status) => {
        console.log('[Sync] Realtime status:', status);
      });
  }

  // ── Field mappers ─────────────────────────────────────────────
  function fromSupabaseInventory(item) {
    return {
      id:           item.id,
      name:         item.name,
      category:     item.category,
      quantity:     item.quantity,
      minThreshold: item.min_threshold,
      maxCapacity:  item.max_capacity,
      location:     item.location,
      updatedAt:    parseInt(item.updated_at, 10),
      is_deleted:   item.is_deleted,
    };
  }

  function fromSupabaseTransaction(tx) {
    return {
      id:                   tx.local_id ? `remote_${tx.id}` : tx.id,
      local_id:             tx.local_id,
      device_id:            tx.device_id,
      items:                tx.items,
      direction:            tx.direction,
      voucherNumber:        tx.voucher_number,
      authorisedBy:         tx.authorised_by,
      receivedBy:           tx.received_by,
      deliveredBy:          tx.delivered_by,
      inspectedBy:          tx.inspected_by,
      signatureAuthorised:  tx.signature_authorised,
      signatureReceived:    tx.signature_received,
      signatureDelivered:   tx.signature_delivered,
      signatureInspected:   tx.signature_inspected,
      personA:              tx.person_a,
      personB:              tx.person_b,
      signatureA:           tx.signature_a,
      signatureB:           tx.signature_b,
      memo:                 tx.memo,
      reference:            tx.reference,
      jtOrden:              tx.jt_orden,
      pinVerified:          tx.pin_verified,
      timestamp:            parseInt(tx.timestamp, 10),
    };
  }

  // ── Public API ────────────────────────────────────────────────
  return {
    init,
    getDeviceId,
    pullAll,
    writeInventoryItem,
    writeTransaction,
    getSyncStatus: () => supabase ? 'online' : 'offline',
    fullSync: pullAll,

    // Called by app.js after every local write — pushes to Supabase immediately
    queueChange: async (storeName, _operation, record) => {
      if (storeName === 'inventory') {
        await writeInventoryItem(record);
      } else if (storeName === 'transactions') {
        await writeTransaction(record);
      }
    },
  };
})();
