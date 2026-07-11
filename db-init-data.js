// db-init-data.js
// Seed data has been removed. The app starts empty and all data
// is entered by the operator and stored directly in Supabase.

const DBInit = {
  async seedIfEmpty() {
    // No seed data — inventory comes from Supabase
    return false;
  }
};

window.DBInit = DBInit;
