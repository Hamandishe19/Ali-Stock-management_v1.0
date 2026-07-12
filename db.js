const DB_NAME = 'HardwareStockDB';
const DB_VERSION = 1;

const StockDB = {
  db: null,

  open() {
    return new Promise((resolve, reject) => {
      if (this.db) {
        return resolve(this.db);
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // Inventory store
        if (!db.objectStoreNames.contains('inventory')) {
          db.createObjectStore('inventory', { keyPath: 'id' });
        }

        // Transactions store
        if (!db.objectStoreNames.contains('transactions')) {
          db.createObjectStore('transactions', { keyPath: 'id', autoIncrement: true });
        }

        // Sync queue store
        if (!db.objectStoreNames.contains('syncQueue')) {
          db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
        }
      };

      request.onsuccess = (event) => {
        this.db = event.target.result;
        resolve(this.db);
      };

      request.onerror = (event) => {
        console.error('Database failed to open:', event.target.error);
        reject(event.target.error);
      };
    });
  },

  // --- Inventory Store Operations ---
  async getAllItemsIncludingDeleted() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readonly');
      const store = transaction.objectStore('inventory');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => reject(request.error);
    });
  },

  async getAllItems() {
    const items = await this.getAllItemsIncludingDeleted();
    return items.filter(item => !item.is_deleted);
  },

  async getItem(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readonly');
      const store = transaction.objectStore('inventory');
      const request = store.get(id);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async putItem(item) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite');
      const store = transaction.objectStore('inventory');
      const request = store.put(item);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async putItemFromRemote(item) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite');
      const store = transaction.objectStore('inventory');
      const request = store.put(item);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteItem(id) {
    const item = await this.getItem(id);
    if (!item) return;
    
    item.is_deleted = true;
    item.updatedAt = Date.now();
    
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite');
      const store = transaction.objectStore('inventory');
      const request = store.put(item);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // Physically remove a single item from local IndexedDB (used when Supabase deletes it)
  async hardDeleteItem(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite');
      const store = transaction.objectStore('inventory');
      const request = store.delete(id);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // Wipe ALL inventory from local IndexedDB — used before a fresh pull from Supabase
  async clearInventoryStore() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('inventory', 'readwrite');
      const store = transaction.objectStore('inventory');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // --- Transactions Store Operations ---
  async getAllTransactions() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('transactions', 'readonly');
      const store = transaction.objectStore('transactions');
      const request = store.getAll();

      request.onsuccess = () => {
        // Sort transactions by timestamp descending
        const txs = request.result || [];
        txs.sort((a, b) => b.timestamp - a.timestamp);
        resolve(txs);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async addTransaction(tx) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('transactions', 'readwrite');
      const store = transaction.objectStore('transactions');
      const request = store.add({
        ...tx,
        timestamp: tx.timestamp || Date.now()
      });

      request.onsuccess = () => {
        // Return the auto-increment ID so it can be added to the queue
        const id = request.result;
        resolve(id);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async getTransactionByLocalId(localId, deviceId) {
    const txs = await this.getAllTransactions();
    return txs.find(tx => tx.local_id === localId && tx.device_id === deviceId);
  },

  async addTransactionFromRemote(tx) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('transactions', 'readwrite');
      const store = transaction.objectStore('transactions');
      const request = store.add(tx);

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  // Wipe ALL transactions from local IndexedDB — used before a fresh pull from Supabase
  async clearTransactionStore() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('transactions', 'readwrite');
      const store = transaction.objectStore('transactions');
      const request = store.clear();
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  // --- Sync Queue Store Operations ---
  async getSyncQueue() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('syncQueue', 'readonly');
      const store = transaction.objectStore('syncQueue');
      const request = store.getAll();

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async addToSyncQueue(payload) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('syncQueue', 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.add({
        payload,
        timestamp: Date.now()
      });

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },

  async deleteFromSyncQueue(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('syncQueue', 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  },

  async clearSyncQueue() {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('syncQueue', 'readwrite');
      const store = transaction.objectStore('syncQueue');
      const request = store.clear();

      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }
};

// Export to window or self for global availability
if (typeof self !== 'undefined') {
  self.StockDB = StockDB;
}
if (typeof window !== 'undefined') {
  window.StockDB = StockDB;
}
