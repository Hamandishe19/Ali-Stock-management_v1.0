let supabaseClient = null;
let currentUser = null;
let currentSession = null;

const Auth = {
  initSupabase() {
    if (window.AppConfig && window.supabase) {
      supabaseClient = window.supabase.createClient(
        window.AppConfig.SUPABASE_URL,
        window.AppConfig.SUPABASE_ANON_KEY
      );
      
      supabaseClient.auth.getSession().then(({ data: { session } }) => {
        currentSession = session;
        currentUser = session?.user || null;
      });

      supabaseClient.auth.onAuthStateChange((_event, session) => {
        currentSession = session;
        currentUser = session?.user || null;
      });
    }
  },

  getSupabaseClient() {
    return supabaseClient;
  },

  getUser() {
    return currentUser;
  },

  async getSession() {
    if (!supabaseClient) return null;
    const { data: { session } } = await supabaseClient.auth.getSession();
    currentSession = session;
    currentUser = session?.user || null;
    return session;
  },

  async signInWithEmail(email, password, remember) {
    if (!supabaseClient) throw new Error("Supabase not initialized");
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
    if (error) throw error;
    this.setLoggedIn(remember);
    return data;
  },

  async signUpWithEmail(email, password) {
    if (!supabaseClient) throw new Error("Supabase not initialized");
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password
    });
    if (error) throw error;
    return data;
  },

  async updatePassword(newPassword) {
    if (!supabaseClient) throw new Error("Supabase not initialized");
    const { data, error } = await supabaseClient.auth.updateUser({ password: newPassword });
    if (error) throw error;
    return data;
  },

  async signOutSupabase() {
    if (supabaseClient) {
      await supabaseClient.auth.signOut();
    }
    this.signOut();
  },

  onAuthStateChange(callback) {
    if (supabaseClient) {
      supabaseClient.auth.onAuthStateChange(callback);
    }
  },

  isLoggedIn() {
    try {
      return (
        localStorage.getItem('is_logged_in') === 'true' ||
        sessionStorage.getItem('is_logged_in') === 'true'
      );
    } catch (e) {
      console.warn('Storage access denied', e);
      return false;
    }
  },

  setLoggedIn(remember) {
    try {
      if (remember) {
        localStorage.setItem('is_logged_in', 'true');
        localStorage.setItem('remember_me', 'true');
        sessionStorage.removeItem('is_logged_in');
      } else {
        sessionStorage.setItem('is_logged_in', 'true');
        localStorage.removeItem('is_logged_in');
        localStorage.setItem('remember_me', 'false');
      }
    } catch (e) {
      console.warn('Storage access denied', e);
    }
  },

  signOut() {
    try {
      localStorage.removeItem('is_logged_in');
      sessionStorage.removeItem('is_logged_in');
      localStorage.removeItem('remember_me');
    } catch (e) {
      console.warn('Storage access denied', e);
    }
  },

  isDisplayableSignature(sig) {
    return typeof sig === 'string' && sig.startsWith('data:image');
  }
};

window.Auth = Auth;

(function authRouteGuard() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (page === 'login.html') {
    if (Auth.isLoggedIn()) window.location.href = 'index.html';
  } else if (!Auth.isLoggedIn()) {
    window.location.href = 'login.html';
  }
})();
