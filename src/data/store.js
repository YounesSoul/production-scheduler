/* ═══════════════════════════════════════════════════
   DATA STORE — Central State Management
   Supabase-backed with localStorage fallback
   ═══════════════════════════════════════════════════ */

import { supabase } from './supabase.js';
import { translations } from '../utils/i18n.js';

const STORAGE_KEY = 'textile_scheduler_data';
const NOTES_KEY = 'textile_order_notes';
const POSTITS_KEY = 'textile_model_postits';

// Helper: get the currently authenticated user's ID
async function getCurrentUserId() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

const store = {
  projects: [],
  currentProjectId: localStorage.getItem('current_project_id') || null,
  currentRole: 'viewer', // 'admin', 'planner', 'manager', 'viewer'
  orders: [],
  schedule: [],
  piecesPerDay: 630,
  language: localStorage.getItem('app_lang') || 'en',
  listeners: new Set(),
  _ready: false,
  _supabaseAvailable: false,
  _realtimeSubscription: null,

  // ── Order Notes map: { orderId: { text: string, attachments: [{name, dataUrl, type}] } }
  orderNotes: JSON.parse(localStorage.getItem(NOTES_KEY) || '{}'),

  // ── Model Post-its map: { modelName: [{ id, text, color, pinned }] }
  modelPostits: {},

  // ── Get post-its for a model (sorted: pinned first)
  getPostits(modelName) {
    const list = this.modelPostits[modelName] || [];
    return [...list].sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
  },

  // ── Add a new post-it for a model
  addPostit(modelName, color = '#fef08a') {
    if (!this.modelPostits[modelName]) this.modelPostits[modelName] = [];
    const newNote = { id: Date.now().toString(), text: '', color, pinned: false };
    this.modelPostits[modelName].push(newNote);
    this._saveLocal();
    return newNote;
  },

  // ── Update a post-it field
  updatePostit(modelName, id, changes) {
    const list = this.modelPostits[modelName];
    if (!list) return;
    const note = list.find(n => n.id === id);
    if (note) Object.assign(note, changes);
    this._saveLocal();
  },

  // ── Delete a post-it
  deletePostit(modelName, id) {
    if (!this.modelPostits[modelName]) return;
    this.modelPostits[modelName] = this.modelPostits[modelName].filter(n => n.id !== id);
    this._saveLocal();
  },

  // ── Get note for an order (guaranteed object)
  getOrderNote(orderId) {
    return this.orderNotes[orderId] || { text: '', attachments: [] };
  },

  // ── Save note text for an order
  setOrderNoteText(orderId, text) {
    if (!this.orderNotes[orderId]) this.orderNotes[orderId] = { text: '', attachments: [] };
    this.orderNotes[orderId].text = text;
    localStorage.setItem(NOTES_KEY, JSON.stringify(this.orderNotes));
  },

  // ── Add file attachment to an order
  addOrderAttachment(orderId, attachment) {
    if (!this.orderNotes[orderId]) this.orderNotes[orderId] = { text: '', attachments: [] };
    this.orderNotes[orderId].attachments.push(attachment);
    localStorage.setItem(NOTES_KEY, JSON.stringify(this.orderNotes));
  },

  // ── Remove file attachment from an order
  removeOrderAttachment(orderId, index) {
    if (!this.orderNotes[orderId]) return;
    this.orderNotes[orderId].attachments.splice(index, 1);
    localStorage.setItem(NOTES_KEY, JSON.stringify(this.orderNotes));
  },

  // ── Delete a post-it
  // (Moved up)

  t(key) {
    return translations[this.language]?.[key] || key;
  },

  setLanguage(lang) {
    this.language = lang;
    localStorage.setItem('app_lang', lang);
    this.notify();
  },

  // ── Helper: convert order object keys to DB column names (camelCase → snake_case)
  _toDbOrder(o) {
    return {
      id: o.id,
      project_id: this.currentProjectId,
      client: o.client || '',
      model: o.model || '',
      piece_type: o.pieceType || '',
      quantity: o.quantity || 0,
      arrival_date: o.arrivalDate || '',
      delivery_date: o.deliveryDate || '',
      duration: o.duration || 1,
      priority: o.priority || 'normal',
      locked_chain: o.lockedChain || '',
    };
  },

  // ── Helper: convert DB row to app order (snake_case → camelCase)
  _fromDbOrder(row) {
    // Strip DB suffix (_2, _3, etc.) to get original order ID
    const originalId = String(row.id).replace(/_\d+$/, '');
    return {
      id: originalId,
      client: row.client || '',
      model: row.model || '',
      pieceType: row.piece_type || '',
      quantity: row.quantity || 0,
      arrivalDate: row.arrival_date || '',
      deliveryDate: row.delivery_date || '',
      duration: row.duration || 1,
      priority: row.priority || 'normal',
      lockedChain: row.locked_chain || '',
    };
  },

  // ── Helper: convert schedule entry to DB row
  _toDbSched(s) {
    return {
      order_id: s.orderId,
      project_id: this.currentProjectId,
      chain: s.chain || '',
      start_date: s.startDate || '',
      end_date: s.endDate || '',
      duration: s.duration || 1,
      status: s.status || 'On Time',
      split_group: s.splitGroup || null,
      split_position: s.splitPosition || null,
    };
  },

  // ── Helper: convert DB row to schedule entry
  _fromDbSched(row) {
    return {
      orderId: row.order_id,
      chain: row.chain || '',
      startDate: row.start_date || '',
      endDate: row.end_date || '',
      duration: row.duration || 1,
      status: row.status || 'On Time',
      splitGroup: row.split_group || undefined,
      splitPosition: row.split_position || undefined,
    };
  },

  // ── Load from Supabase (falls back to localStorage)
  async load() {
    try {
      // 1. Fetch user's projects
      const uid = await getCurrentUserId();
      if (!uid) throw new Error("No user");

      const { data: projs, error: projsErr } = await supabase.from('projects').select('*').order('created_at', { ascending: false });
      if (projsErr) throw projsErr;

      this.projects = projs || [];


      if (this.projects.length > 0) {
        if (!this.currentProjectId || !this.projects.find(p => p.id === this.currentProjectId)) {
          this.currentProjectId = this.projects[0].id; // Default to first project
          localStorage.setItem('current_project_id', this.currentProjectId);
        }
      }

      if (!this.currentProjectId) {
        // No projects found. Let UI handle "Create Project" state.
        this.orders = [];
        this.schedule = [];
        this._ready = true;
        this._supabaseAvailable = true;
        this.notify();
        return;
      }

      // Fetch user role for this project
      const { data: collab } = await supabase.from('collaborators').select('role').eq('project_id', this.currentProjectId).eq('user_id', uid).single();
      this.currentRole = collab ? collab.role : 'viewer';

      // 2. Load context specific orders & schedule
      const [ordersRes, schedRes, settingsRes] = await Promise.all([
        supabase.from('orders').select('*').eq('project_id', this.currentProjectId).order('created_at', { ascending: true }),
        supabase.from('schedule_entries').select('*').eq('project_id', this.currentProjectId),
        supabase.from('settings').select('*').eq('user_id', uid),
      ]);

      if (ordersRes.error) throw ordersRes.error;
      if (schedRes.error) throw schedRes.error;

      this.orders = (ordersRes.data || []).map(r => this._fromDbOrder(r));
      this.schedule = (schedRes.data || []).map(r => this._fromDbSched(r));

      // Load settings
      if (settingsRes.data) {
        const ppd = settingsRes.data.find(s => s.key === 'pieces_per_day');
        if (ppd) this.piecesPerDay = parseInt(ppd.value) || 630;
      }

      this._saveLocal();
      this._supabaseAvailable = true;
      this._ready = true;
      console.log(`✅ Loaded from Supabase Project [${this.currentProjectId}]: ${this.orders.length} orders, ${this.schedule.length} schedule entries (Role: ${this.currentRole})`);

      this.setupRealtime();
      this.notify();
    } catch (e) {
      console.warn('⚠ Supabase unavailable, loading from localStorage:', e.message || e);
      alert('Supabase Error: ' + (e.message || JSON.stringify(e)));
      this._loadLocal();
      this._ready = true;
    }
  },

  // ── Realtime Synchronization
  async setupRealtime() {
    if (!this.currentProjectId || !this._supabaseAvailable) return;

    if (this._realtimeSubscription) {
      await supabase.removeChannel(this._realtimeSubscription);
      this._realtimeSubscription = null;
    }

    // Subscribe to changes on orders and schedules for the active project
    this._realtimeSubscription = supabase.channel(`project-${this.currentProjectId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders', filter: `project_id=eq.${this.currentProjectId}` }, () => {
        this.debouncedReload();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_entries', filter: `project_id=eq.${this.currentProjectId}` }, () => {
        this.debouncedReload();
      })
      .subscribe();
  },

  _reloadTimer: null,
  debouncedReload() {
    if (this._reloadTimer) clearTimeout(this._reloadTimer);
    this._reloadTimer = setTimeout(async () => {
      console.log('🔄 Reloading data from Realtime broadcast...');

      const [ordersRes, schedRes] = await Promise.all([
        supabase.from('orders').select('*').eq('project_id', this.currentProjectId).order('created_at', { ascending: true }),
        supabase.from('schedule_entries').select('*').eq('project_id', this.currentProjectId)
      ]);

      if (!ordersRes.error) this.orders = (ordersRes.data || []).map(r => this._fromDbOrder(r));
      if (!schedRes.error) this.schedule = (schedRes.data || []).map(r => this._fromDbSched(r));

      this.notify();
    }, 1500); // Wait 1.5s to batch bulk delete/inserts
  },

  // ── Save to localStorage (offline cache)
  _saveLocal() {
    try {
      localStorage.setItem(STORAGE_KEY + (this.currentProjectId ? '_' + this.currentProjectId : ''), JSON.stringify({
        orders: this.orders,
        schedule: this.schedule,
        piecesPerDay: this.piecesPerDay,
        modelPostits: this.modelPostits
      }));
    } catch (e) { /* ignore */ }
  },

  // ── Load from localStorage (fallback)
  _loadLocal() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY + (this.currentProjectId ? '_' + this.currentProjectId : ''));
      if (saved) {
        const data = JSON.parse(saved);
        this.orders = data.orders || [];
        this.schedule = data.schedule || [];
        this.modelPostits = data.modelPostits || {};
        if (data.piecesPerDay) this.piecesPerDay = data.piecesPerDay;
      }
    } catch (e) {
      console.warn('Failed to load from localStorage:', e);
    }
  },

  // ── Persist current state to Supabase (full sync)
  async save() {
    this._saveLocal();
    if (!this._supabaseAvailable) return; // Skip Supabase if tables aren't ready
    try {
      // Clear and re-insert all data for THIS project
      await supabase.from('schedule_entries').delete().eq('project_id', this.currentProjectId).neq('id', 0);
      await supabase.from('orders').delete().eq('project_id', this.currentProjectId).neq('id', '');

      // Build mapping: for each order, generate unique DB key
      // Track order index → dbId so schedule entries can reference correctly
      const idCount = new Map();
      const orderDbIds = []; // parallel to this.orders

      if (this.orders.length > 0) {
        const dbOrders = this.orders.map((o, idx) => {
          const baseId = String(o.id);
          const count = (idCount.get(baseId) || 0) + 1;
          idCount.set(baseId, count);
          const dbId = count > 1 ? `${baseId}_${count}` : baseId;
          orderDbIds[idx] = dbId;
          const dbOrder = this._toDbOrder(o);
          dbOrder.id = dbId;
          return dbOrder;
        });

        // Insert in batches of 50
        for (let i = 0; i < dbOrders.length; i += 50) {
          const batch = dbOrders.slice(i, i + 50);
          const { error } = await supabase.from('orders').insert(batch);
          if (error) throw error;
        }
      }

      // Insert schedule entries (map orderId → dbId)
      if (this.schedule.length > 0) {
        // Build reverse lookup: orderId + occurrence → dbId
        const orderIdToDbId = new Map();
        this.orders.forEach((o, idx) => {
          const key = String(o.id);
          if (!orderIdToDbId.has(key)) orderIdToDbId.set(key, []);
          orderIdToDbId.get(key).push(orderDbIds[idx]);
        });

        const schedCount = new Map(); // track which occurrence of orderId we've used
        const dbSched = this.schedule.map(s => {
          const baseOrderId = String(s.orderId);
          const dbIds = orderIdToDbId.get(baseOrderId) || [baseOrderId];
          const used = (schedCount.get(baseOrderId) || 0);
          const dbOrderId = dbIds[Math.min(used, dbIds.length - 1)];
          schedCount.set(baseOrderId, used + 1);

          const entry = this._toDbSched(s);
          entry.order_id = dbOrderId;
          return entry;
        });

        // Insert in batches
        for (let i = 0; i < dbSched.length; i += 50) {
          const batch = dbSched.slice(i, i + 50);
          const { error } = await supabase.from('schedule_entries').insert(batch);
          if (error) throw error;
        }
      }

      // Save settings
      const uid = await getCurrentUserId();
      await supabase.from('settings').upsert({ key: 'pieces_per_day', value: String(this.piecesPerDay), user_id: uid });
    } catch (e) {
      console.warn('⚠ Failed to sync to Supabase:', e.message || e);
    }
  },

  // ── Orders CRUD
  addOrder(order) {
    this.orders.push(order);
    this.save();
    this.notify();
  },

  updateOrder(index, order) {
    if (index >= 0 && index < this.orders.length) {
      this.orders[index] = order;
      this.save();
      this.notify();
    }
  },

  deleteOrder(index) {
    if (index >= 0 && index < this.orders.length) {
      const removed = this.orders.splice(index, 1)[0]; // eslint-disable-line no-unused-vars
      this.save();
      this.notify();
    }
  },

  setOrders(orders) {
    this.orders = orders;
    this.save();
    this.notify();
  },

  setSchedule(schedule) {
    this.schedule = schedule;
    this.save();
    this.notify();
  },

  // ── Chain splitting: run two orders simultaneously at half capacity
  splitChain(orderId1, orderId2) {
    const s1 = this.schedule.find(s => s.orderId === orderId1);
    const s2 = this.schedule.find(s => s.orderId === orderId2);
    if (!s1 || !s2) return false;

    const groupId = `split_${Date.now()}`;

    // Find orders for duration recalc
    const o1 = this.orders.find(o => o.id === orderId1);
    const o2 = this.orders.find(o => o.id === orderId2);

    // Half capacity = piecesPerDay / 2
    const HALF_CAPACITY = this.piecesPerDay / 2;
    const calcDays = (qty) => Math.ceil((qty || this.piecesPerDay) / HALF_CAPACITY);

    // Recalculate durations at half capacity
    const dur1 = calcDays(o1 ? o1.quantity : this.piecesPerDay);
    const dur2 = calcDays(o2 ? o2.quantity : this.piecesPerDay);

    // Both start at the earlier of the two starts
    const start1 = new Date(s1.startDate + 'T00:00:00');
    const start2 = new Date(s2.startDate + 'T00:00:00');
    const commonStart = start1 < start2 ? start1 : start2;

    // Use chain from s1 (target chain)
    const chain = s1.chain;

    // Helper: add working days (skip Sundays)
    const addWD = (date, n) => {
      const d = new Date(date);
      let rem = n;
      while (rem > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) rem--; }
      return d;
    };
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const end1 = addWD(commonStart, dur1);
    const end2 = addWD(commonStart, dur2);

    // Update schedule entries
    s1.splitGroup = groupId;
    s1.splitPosition = 'top';
    s1.chain = chain;
    s1.startDate = fmt(commonStart);
    s1.endDate = fmt(end1);
    s1.duration = dur1;

    s2.splitGroup = groupId;
    s2.splitPosition = 'bottom';
    s2.chain = chain;
    s2.startDate = fmt(commonStart);
    s2.endDate = fmt(end2);
    s2.duration = dur2;

    this.save();
    this.notify();
    return true;
  },

  unsplitChain(orderId) {
    const entry = this.schedule.find(s => s.orderId === orderId);
    if (!entry || !entry.splitGroup) return false;

    const groupId = entry.splitGroup;
    const grouped = this.schedule.filter(s => s.splitGroup === groupId);

    // Restore full capacity durations
    const FULL_CAPACITY = this.piecesPerDay;
    const addWD = (date, n) => {
      const d = new Date(date);
      let rem = n;
      while (rem > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) rem--; }
      return d;
    };
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    grouped.forEach(s => {
      const order = this.orders.find(o => o.id === s.orderId);
      const dur = Math.ceil((order ? order.quantity : this.piecesPerDay) / FULL_CAPACITY);
      const start = new Date(s.startDate + 'T00:00:00');
      const end = addWD(start, dur);
      s.endDate = fmt(end);
      s.duration = dur;
      delete s.splitGroup;
      delete s.splitPosition;
    });

    this.save();
    this.notify();
    return true;
  },

  // ── Manual Division: Chop block in half, throw duplicate onto next chain
  parallelizeOrder(orderId) {
    const entryIndex = this.schedule.findIndex(s => s.orderId === orderId);
    if (entryIndex === -1) return false;

    const entry = this.schedule[entryIndex];
    if (entry.splitGroup || entry.parallelGroup) return false; // Already split or parallelized

    const order = this.orders.find(o => o.id === orderId);
    if (!order) return false;

    // We can only parallelize if duration is > 1
    if (entry.duration <= 1) return false;

    // Calculate halved duration
    const dur1 = Math.ceil(entry.duration / 2);
    const dur2 = entry.duration - dur1;

    // Find next eligible chain that isn't the current one
    // Fallback to CH8 if somehow not found
    let nextChain = 'CH8';

    // We import getEligibleChains logic loosely (we just pick next chain)
    // CH1..CH8 are indexes 0..7
    const currentChainNum = parseInt(entry.chain.replace('CH', ''));
    if (!isNaN(currentChainNum)) {
      let nextNum = currentChainNum + 1;
      if (nextNum > 8) nextNum = 3; // Loop back to default generic chains if we overflow
      nextChain = 'CH' + nextNum;
    }

    const groupId = `parallel_${Date.now()}`;

    // Helper: add working days
    const addWD = (date, n) => {
      const d = new Date(date);
      let rem = n;
      while (rem > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) rem--; }
      return d;
    };
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    const start = new Date(entry.startDate + 'T00:00:00');

    // Update original entry
    entry.endDate = fmt(addWD(start, dur1));
    entry.duration = dur1;
    entry.parallelGroup = groupId;
    entry.parallelIndex = 1;

    // Create duplicate entry
    const siblingEntry = {
      orderId: entry.orderId,
      chain: nextChain,
      startDate: entry.startDate,
      endDate: fmt(addWD(start, dur2)),
      duration: dur2,
      status: entry.status, // Copy status, can recalculate later
      parallelGroup: groupId,
      parallelIndex: 2
    };

    this.schedule.push(siblingEntry);

    this.save();
    this.notify();
    return true;
  },

  // ── Undo Manual Division: merge the two parallel blocks back into one
  unparallelizeOrder(orderId) {
    const entry = this.schedule.find(s => s.orderId === orderId);
    if (!entry || !entry.parallelGroup) return false;

    const groupId = entry.parallelGroup;
    const grouped = this.schedule.filter(s => s.parallelGroup === groupId);
    if (grouped.length < 2) return false;

    // Sort by parallelIndex so we always restore the primary (index=1) block
    grouped.sort((a, b) => (a.parallelIndex || 0) - (b.parallelIndex || 0));
    const primary = grouped[0];
    const siblings = grouped.slice(1);

    // Reconstruct full duration = sum of all parallel block durations
    const totalDuration = grouped.reduce((sum, s) => sum + (s.duration || 0), 0);

    // Helper: add working days
    const addWD = (date, n) => {
      const d = new Date(date);
      let rem = n;
      while (rem > 0) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) rem--; }
      return d;
    };
    const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Restore primary entry
    const start = new Date(primary.startDate + 'T00:00:00');
    primary.endDate = fmt(addWD(start, totalDuration));
    primary.duration = totalDuration;
    delete primary.parallelGroup;
    delete primary.parallelIndex;

    // Remove all sibling entries from schedule
    this.schedule = this.schedule.filter(s => !siblings.includes(s));

    this.save();
    this.notify();
    return true;
  },
  async changeProject(projectId) {
    if (this.currentProjectId === projectId) return;
    this.currentProjectId = projectId;
    localStorage.setItem('current_project_id', projectId);

    // reset local state before fetching
    this.orders = [];
    this.schedule = [];
    this.notify();

    await this.load();
  },

  async renameProject(newName) {
    if (!this.currentProjectId || !this._supabaseAvailable) return;

    const { error } = await supabase
      .from('projects')
      .update({ name: newName })
      .eq('id', this.currentProjectId);

    if (error) throw error;

    // Update local state proactively
    const prj = this.projects.find(p => p.id === this.currentProjectId);
    if (prj) prj.name = newName;

    this.notify();
  },

  clearAll() {
    if (!this.currentProjectId) return;

    this.orders = [];
    this.schedule = [];
    // Clear Supabase tables for THIS project
    if (this._supabaseAvailable) {
      Promise.all([
        supabase.from('schedule_entries').delete().eq('project_id', this.currentProjectId).neq('id', 0),
        supabase.from('orders').delete().eq('project_id', this.currentProjectId).neq('id', ''),
      ]).catch(e => console.warn('Failed to clear Supabase:', e));
    }
    this._saveLocal();
    this.notify();
  },

  // ── Event system
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  },

  notify() {
    this.listeners.forEach(fn => fn(this));
  }
};

export default store;
