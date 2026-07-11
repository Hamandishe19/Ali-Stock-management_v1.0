const initialInventory = [
  {
    id: 'HW-TL-001',
    name: 'DeWalt Cordless Drill 20V',
    category: 'Power Tools',
    quantity: 12,
    minThreshold: 5,
    maxCapacity: 20,
    location: 'Aisle A-3',
    updatedAt: Date.now() - 3600000 * 24,
    is_deleted: false
  },
  {
    id: 'HW-TL-002',
    name: 'Makita 4-1/2" Angle Grinder',
    category: 'Power Tools',
    quantity: 3,
    minThreshold: 5,
    maxCapacity: 15,
    location: 'Aisle A-4',
    updatedAt: Date.now() - 3600000 * 12,
    is_deleted: false
  },
  {
    id: 'HW-FS-101',
    name: 'M8 Zinc Hex Bolts (100pk)',
    category: 'Fasteners',
    quantity: 45,
    minThreshold: 15,
    maxCapacity: 50,
    location: 'Aisle B-1',
    updatedAt: Date.now() - 3600000 * 8,
    is_deleted: false
  },
  {
    id: 'HW-FS-102',
    name: 'Drywall Screws 40mm (500pk)',
    category: 'Fasteners',
    quantity: 75,
    minThreshold: 15,
    maxCapacity: 60,
    location: 'Aisle B-2',
    updatedAt: Date.now() - 3600000 * 48,
    is_deleted: false
  },
  {
    id: 'HW-EL-201',
    name: 'Single Gang Blue Outlet Box',
    category: 'Electrical',
    quantity: 18,
    minThreshold: 8,
    maxCapacity: 30,
    location: 'Aisle C-1',
    updatedAt: Date.now() - 3600000 * 2,
    is_deleted: false
  },
  {
    id: 'HW-EL-202',
    name: '12/2 WG Romex Cable 50ft',
    category: 'Electrical',
    quantity: 2,
    minThreshold: 5,
    maxCapacity: 15,
    location: 'Aisle C-3',
    updatedAt: Date.now() - 3600000 * 6,
    is_deleted: false
  },
  {
    id: 'HW-PL-301',
    name: '1/2" Copper 90-Deg Elbow (10pk)',
    category: 'Plumbing',
    quantity: 24,
    minThreshold: 12,
    maxCapacity: 40,
    location: 'Aisle D-2',
    updatedAt: Date.now() - 3600000 * 5,
    is_deleted: false
  },
  {
    id: 'HW-PL-302',
    name: 'Teflon Thread Seal Tape 1/2"',
    category: 'Plumbing',
    quantity: 85,
    minThreshold: 20,
    maxCapacity: 80,
    location: 'Aisle D-4',
    updatedAt: Date.now() - 3600000 * 18,
    is_deleted: false
  },
  {
    id: 'HW-SF-401',
    name: '3M N95 Dust Mask (20pk)',
    category: 'Safety',
    quantity: 14,
    minThreshold: 5,
    maxCapacity: 25,
    location: 'Aisle E-1',
    updatedAt: Date.now() - 3600000 * 7,
    is_deleted: false
  },
  {
    id: 'HW-SF-402',
    name: 'ANSI Z87 Premium Safety Glasses',
    category: 'Safety',
    quantity: 4,
    minThreshold: 10,
    maxCapacity: 35,
    location: 'Aisle E-2',
    updatedAt: Date.now() - 3600000 * 24,
    is_deleted: false
  }
];

// Historical audit records — quantities above already reflect these movements
const initialTransactions = [
  {
    items: [
      { itemId: 'HW-TL-001', itemName: 'DeWalt Cordless Drill 20V', quantity: 5 }
    ],
    direction: 'in',
    voucherNumber: '0001',
    authorisedBy: 'Mark Johnson',
    receivedBy: 'ALI',
    deliveredBy: 'Global Tools Corp',
    personA: 'Global Tools Corp',
    personB: 'Mark Johnson',
    signatureA: '',
    signatureB: '',
    timestamp: Date.now() - 3600000 * 3
  },
  {
    items: [
      { itemId: 'HW-TL-002', itemName: 'Makita 4-1/2" Angle Grinder', quantity: 2 }
    ],
    direction: 'out',
    voucherNumber: '0002',
    authorisedBy: 'Mark Johnson',
    receivedBy: 'Dave Martinez (Tech)',
    deliveredBy: 'ALI',
    personA: 'Dave Martinez (Tech)',
    personB: 'Mark Johnson',
    signatureA: '',
    signatureB: '',
    timestamp: Date.now() - 3600000 * 5
  },
  {
    items: [
      { itemId: 'HW-PL-302', itemName: 'Teflon Thread Seal Tape 1/2"', quantity: 20 }
    ],
    direction: 'in',
    voucherNumber: '0003',
    authorisedBy: 'ALI',
    receivedBy: 'ALI',
    deliveredBy: 'Apex Plumbing Supplies',
    personA: 'Apex Plumbing Supplies',
    personB: 'ALI',
    signatureA: '',
    signatureB: '',
    timestamp: Date.now() - 3600000 * 10
  },
  {
    items: [
      { itemId: 'HW-SF-402', itemName: 'ANSI Z87 Premium Safety Glasses', quantity: 6 }
    ],
    direction: 'out',
    voucherNumber: '0004',
    authorisedBy: 'ALI',
    receivedBy: 'Chris Evans (Contractor)',
    deliveredBy: 'ALI',
    personA: 'Chris Evans (Contractor)',
    personB: 'ALI',
    signatureA: '',
    signatureB: '',
    timestamp: Date.now() - 3600000 * 20
  }
];

const DBInit = {
  async seedIfEmpty() {
    try {
      const items = await window.StockDB.getAllItems();
      if (items.length === 0) {
        console.log('Seeding inventory items into IndexedDB...');
        for (const item of initialInventory) {
          await window.StockDB.putItem(item);
        }

        const txs = await window.StockDB.getAllTransactions();
        if (txs.length === 0) {
          console.log('Seeding transaction logs into IndexedDB...');
          for (const tx of initialTransactions) {
            await window.StockDB.addTransaction(tx);
          }
          localStorage.setItem('grv_voucher_counter', '4');
        }
        console.log('IndexedDB seed complete.');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Failed to seed IndexedDB:', err);
      return false;
    }
  }
};

window.DBInit = DBInit;
