import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Search, Plus, Minus, Trash2, Pencil, ShoppingBag, Check, X,
  Package, Store, Receipt, Wallet, ArrowLeft, ChevronRight, ChevronDown,
  LayoutDashboard, TrendingUp, Clock, CheckCircle2, MoreVertical,
  Settings, LogOut, User, Mail, Lock, ArrowRight, CircleArrowRight, Eye, EyeOff,
} from "lucide-react";

/* ------------------------------------------------------------------ *
 * Storage: uses the artifact persistent-storage API, with an
 * in-memory fallback so the app still runs if it's unavailable.
 * ------------------------------------------------------------------ */
const mem = {};
const store = {
  async get(key, fallback) {
    try {
      if (typeof window !== "undefined" && window.storage) {
        const r = await window.storage.get(key);
        return r ? JSON.parse(r.value) : fallback;
      }
    } catch (e) { /* missing key throws — treat as empty */ }
    return key in mem ? mem[key] : fallback;
  },
  async set(key, value) {
    mem[key] = value;
    try {
      if (typeof window !== "undefined" && window.storage) {
        await window.storage.set(key, JSON.stringify(value));
      }
    } catch (e) { /* ignore, in-memory copy already held */ }
  },
};

const uid = () =>
  (typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));

const rp = (n) => "Rp " + Math.round(n || 0).toLocaleString("id-ID");

// Assign stable sequential Order #s (earliest sale = #1).
function numberSales(list) {
  const byTime = [...list].sort((a, b) => a.at - b.at);
  const num = {};
  byTime.forEach((s, i) => (num[s.id] = i + 1));
  return list.map((s) => ({ ...s, orderNo: num[s.id] }));
}

const SEED_ITEMS = [
  { id: uid(), name: "Nasi Goreng Spesial", price: 22000, category: "Food" },
  { id: uid(), name: "Mie Goreng", price: 18000, category: "Food" },
  { id: uid(), name: "Ayam Goreng", price: 15000, category: "Food" },
  { id: uid(), name: "Es Teh Manis", price: 5000, category: "Drinks" },
  { id: uid(), name: "Kopi Susu", price: 8000, category: "Drinks" },
  { id: uid(), name: "Air Mineral", price: 4000, category: "Drinks" },
];

/* ================================================================== */

export default function CashierApp() {
  const [ready, setReady] = useState(false);
  const [view, setView] = useState("cashier"); // 'cashier' | 'items'
  const [shopName, setShopName] = useState("My Shop");
  const [editingName, setEditingName] = useState(false);

  const [items, setItems] = useState([]);
  const [sales, setSales] = useState([]);

  const [cart, setCart] = useState([]); // [{itemId, qty}]
  const [query, setQuery] = useState("");
  const [cartOpen, setCartOpen] = useState(false); // mobile sheet

  const [paying, setPaying] = useState(false);
  const [cash, setCash] = useState("");
  const [success, setSuccess] = useState(null); // {total, change}

  const [itemForm, setItemForm] = useState(null); // {mode, id, name, price, category}
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [openOrder, setOpenOrder] = useState(null); // expanded transaction id
  const [menuOpen, setMenuOpen] = useState(false);

  /* auth */
  const [account, setAccount] = useState(null); // {username, email, password}
  const [authed, setAuthed] = useState(false);
  const [authMode, setAuthMode] = useState("signup"); // 'login' | 'signup'
  const [authError, setAuthError] = useState("");
  const [confirmLogout, setConfirmLogout] = useState(false);

  /* ---- load once ---- */
  useEffect(() => {
    (async () => {
      const savedItems = await store.get("items", null);
      const savedSales = await store.get("sales", []);
      const savedName = await store.get("shopName", "My Shop");
      setItems(savedItems && savedItems.length ? savedItems : SEED_ITEMS);
      if (!savedItems) await store.set("items", SEED_ITEMS);
      setSales(numberSales(savedSales || []));
      setShopName(savedName || "My Shop");
      const savedAccount = await store.get("account", null);
      const savedSession = await store.get("session", false);
      setAccount(savedAccount);
      setAuthed(!!savedAccount && !!savedSession);
      setAuthMode(savedAccount ? "login" : "signup");
      setReady(true);
    })();
  }, []);

  /* ---- persist ---- */
  useEffect(() => { if (ready) store.set("items", items); }, [items, ready]);
  useEffect(() => { if (ready) store.set("sales", sales); }, [sales, ready]);
  useEffect(() => { if (ready) store.set("shopName", shopName); }, [shopName, ready]);
  useEffect(() => { if (ready) store.set("account", account); }, [account, ready]);
  useEffect(() => { if (ready) store.set("session", authed); }, [authed, ready]);

  /* ---- derived ---- */
  const itemById = useMemo(() => {
    const m = {};
    items.forEach((i) => (m[i.id] = i));
    return m;
  }, [items]);

  const lines = useMemo(
    () =>
      cart
        .map((c) => ({ ...itemById[c.itemId], qty: c.qty }))
        .filter((l) => l.id),
    [cart, itemById]
  );

  const total = useMemo(
    () => lines.reduce((s, l) => s + l.price * l.qty, 0),
    [lines]
  );
  const count = useMemo(() => cart.reduce((s, c) => s + c.qty, 0), [cart]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return items;
    return items.filter(
      (i) =>
        i.name.toLowerCase().includes(q) ||
        (i.category || "").toLowerCase().includes(q)
    );
  }, [items, query]);

  const today = useMemo(() => {
    const d = new Date().toDateString();
    const t = sales.filter((s) => new Date(s.at).toDateString() === d);
    return { count: t.length, revenue: t.reduce((s, x) => s + x.total, 0) };
  }, [sales]);

  /* ---- cart ops ---- */
  const add = (id) =>
    setCart((c) => {
      const f = c.find((x) => x.itemId === id);
      return f
        ? c.map((x) => (x.itemId === id ? { ...x, qty: x.qty + 1 } : x))
        : [...c, { itemId: id, qty: 1 }];
    });
  const bump = (id, d) =>
    setCart((c) =>
      c
        .map((x) => (x.itemId === id ? { ...x, qty: x.qty + d } : x))
        .filter((x) => x.qty > 0)
    );
  const removeLine = (id) => setCart((c) => c.filter((x) => x.itemId !== id));
  const clearCart = () => setCart([]);

  /* ---- payment ---- */
  const cashNum = Number(String(cash).replace(/[^\d]/g, "")) || 0;
  const change = cashNum - total;
  const completeSale = () => {
    const sale = {
      id: uid(),
      at: Date.now(),
      total,
      paid: cashNum || total,
      change: Math.max(0, change),
      lines: lines.map((l) => ({ name: l.name, price: l.price, qty: l.qty })),
    };
    setSales((s) => {
      const nextNo = s.reduce((m, x) => Math.max(m, x.orderNo || 0), 0) + 1;
      return [{ ...sale, orderNo: nextNo }, ...s].slice(0, 200);
    });
    setSuccess({ total, change: Math.max(0, change) });
    setPaying(false);
    setCart([]);
    setCash("");
    setCartOpen(false);
  };

  /* ---- item CRUD ---- */
  const openAdd = () =>
    setItemForm({ mode: "add", id: null, name: "", price: "", category: "" });
  const openEdit = (it) =>
    setItemForm({ mode: "edit", ...it, price: String(it.price) });
  const saveItem = () => {
    const name = itemForm.name.trim();
    const price = Number(String(itemForm.price).replace(/[^\d]/g, "")) || 0;
    if (!name) return;
    if (itemForm.mode === "add") {
      setItems((a) => [
        { id: uid(), name, price, category: itemForm.category.trim() },
        ...a,
      ]);
    } else {
      setItems((a) =>
        a.map((x) =>
          x.id === itemForm.id
            ? { ...x, name, price, category: itemForm.category.trim() }
            : x
        )
      );
    }
    setItemForm(null);
  };
  const doDelete = (id) => {
    setItems((a) => a.filter((x) => x.id !== id));
    setCart((c) => c.filter((x) => x.itemId !== id));
    setConfirmDelete(null);
  };

  /* ---- auth ---- */
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const handleSignup = (f) => {
    if (!f.username.trim()) return setAuthError("Please enter a username.");
    if (!f.shopName.trim()) return setAuthError("Please enter your shop name.");
    if (!emailOk(f.email)) return setAuthError("Please enter a valid email.");
    if (f.password.length < 6)
      return setAuthError("Password must be at least 6 characters.");
    if (f.password !== f.confirmPassword)
      return setAuthError("Passwords don't match.");
    setAccount({
      username: f.username.trim(),
      email: f.email.trim(),
      password: f.password,
    });
    setShopName(f.shopName.trim());
    setAuthError("");
    setAuthed(true);
    setView("dashboard");
  };
  const handleLogin = (f) => {
    if (!account) return setAuthError("No account yet — please sign up first.");
    if (f.email.trim().toLowerCase() !== account.email.toLowerCase() ||
        f.password !== account.password)
      return setAuthError("Incorrect email or password.");
    setAuthError("");
    setAuthed(true);
    setView("dashboard");
  };
  const handleLogout = () => {
    setMenuOpen(false);
    setCart([]);
    setAuthed(false);
    setAuthMode("login");
    setView("dashboard");
  };
  const saveProfile = (p) => {
    setAccount((a) => ({ ...a, username: p.username.trim(), email: p.email.trim() }));
    setShopName(p.shopName.trim());
  };
  const changePassword = (cur, next) => {
    if (cur !== account.password) return "Current password is incorrect.";
    if (next.length < 6) return "New password must be at least 6 characters.";
    setAccount((a) => ({ ...a, password: next }));
    return null;
  };
  const checkResetEmail = (email) =>
    !!account && email.trim().toLowerCase() === account.email.toLowerCase();
  const handleReset = (next) => {
    if (next.length < 6) return "Password must be at least 6 characters.";
    setAccount((a) => ({ ...a, password: next }));
    return null;
  };

  if (!ready)
    return (
      <div className="pos-root">
        <Style />
        <div className="loading">Loading register…</div>
      </div>
    );

  if (!authed)
    return (
      <div className="pos-root auth-root">
        <Style />
        <AuthScreen
          mode={authMode}
          setMode={(m) => { setAuthMode(m); setAuthError(""); }}
          hasAccount={!!account}
          error={authError}
          onLogin={handleLogin}
          onSignup={handleSignup}
          onCheckEmail={checkResetEmail}
          onReset={handleReset}
        />
      </div>
    );

  return (
    <div className="pos-root">
      <Style />

      {/* ---------- header ---------- */}
      <header className="topbar">
        <div className="brand">
          <Logo className="brand-mark" />
          {editingName ? (
            <input
              autoFocus
              className="name-input"
              value={shopName}
              onChange={(e) => setShopName(e.target.value)}
              onBlur={() => setEditingName(false)}
              onKeyDown={(e) => e.key === "Enter" && setEditingName(false)}
            />
          ) : (
            <button className="name" onClick={() => setEditingName(true)} title="Rename shop">
              {shopName}
              <Pencil size={13} className="name-pen" />
            </button>
          )}
        </div>

        <nav className="tabs">
          <button
            className={"tab" + (view === "dashboard" ? " on" : "")}
            onClick={() => setView("dashboard")}
          >
            <LayoutDashboard size={16} /> Dashboard
          </button>
          <button
            className={"tab" + (view === "cashier" ? " on" : "")}
            onClick={() => setView("cashier")}
          >
            <ShoppingBag size={16} /> Add Order
          </button>
        </nav>

        <div className="menu-wrap">
          <button
            className={"menu-btn" + (menuOpen ? " on" : "")}
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="More options"
          >
            <MoreVertical size={20} />
          </button>
          {menuOpen && (
            <>
              <div className="menu-scrim" onClick={() => setMenuOpen(false)} />
              <div className="menu">
                <button
                  className={"menu-item" + (view === "items" ? " active" : "")}
                  onClick={() => { setMenuOpen(false); setView("items"); }}
                >
                  <Package size={15} /> Inventory
                </button>
                <button
                  className={"menu-item" + (view === "settings" ? " active" : "")}
                  onClick={() => { setMenuOpen(false); setView("settings"); }}
                >
                  <Settings size={15} /> Settings
                </button>
                <button
                  className="menu-item"
                  onClick={() => { setMenuOpen(false); setEditingName(true); }}
                >
                  <Pencil size={15} /> Rename shop
                </button>
                <div className="menu-sep" />
                <button className="menu-item danger" onClick={() => { setMenuOpen(false); setConfirmLogout(true); }}>
                  <LogOut size={15} /> Log out
                </button>
              </div>
            </>
          )}
        </div>
      </header>

      {/* ---------- DASHBOARD ---------- */}
      {view === "dashboard" && (
        <main className="dashboard">
          <div className="today-card">
            <div className="tc-head">
              <span className="tc-eyebrow">
                <TrendingUp size={14} /> Today’s sales
              </span>
              <span className="tc-date">
                {new Date().toLocaleDateString("en-GB", {
                  weekday: "long", day: "numeric", month: "long",
                })}
              </span>
            </div>
            <div className="tc-stats">
              <div className="tc-stat">
                <span className="tc-label">Total amount</span>
                <span className="tc-amount">{rp(today.revenue)}</span>
              </div>
              <div className="tc-divider" />
              <div className="tc-stat">
                <span className="tc-label">Sales</span>
                <span className="tc-count">{today.count}</span>
              </div>
            </div>
          </div>

          <section className="history">
            <div className="history-head">
              <h2>Transaction history</h2>
              <span className="history-count">
                {sales.length} order{sales.length !== 1 ? "s" : ""}
              </span>
            </div>

            {sales.length === 0 ? (
              <div className="empty big">
                <Receipt size={28} />
                <p>No transactions yet.</p>
                <span className="empty-sub">
                  Completed sales from the cashier will appear here.
                </span>
              </div>
            ) : (
              <div className="txn-list">
                {sales.map((s) => {
                  const isOpen = openOrder === s.id;
                  const qty = (s.lines || []).reduce((a, l) => a + l.qty, 0);
                  return (
                    <div className={"txn" + (isOpen ? " open" : "")} key={s.id}>
                      <button
                        className="txn-row"
                        onClick={() => setOpenOrder(isOpen ? null : s.id)}
                      >
                        <span className="txn-no">
                          Order #{String(s.orderNo).padStart(3, "0")}
                        </span>
                        <span className="txn-status">
                          <CheckCircle2 size={15} /> Success
                        </span>
                        <span className="txn-meta">
                          {new Date(s.at).toLocaleString("en-GB", {
                            day: "2-digit", month: "short",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                        <span className="txn-amt">{rp(s.total)}</span>
                        <ChevronDown size={17} className="txn-chev" />
                      </button>

                      {isOpen && (
                        <div className="txn-detail">
                          <div className="txn-detail-head">
                            <Clock size={13} />
                            {new Date(s.at).toLocaleString("en-GB")}
                            <span className="txn-detail-qty">
                              {qty} item{qty !== 1 ? "s" : ""}
                            </span>
                          </div>
                          {(s.lines || []).map((l, i) => (
                            <div className="txn-item" key={i}>
                              <span className="ti-qty">{l.qty}×</span>
                              <span className="ti-name">{l.name}</span>
                              <span className="ti-each">{rp(l.price)}</span>
                              <span className="ti-total">{rp(l.price * l.qty)}</span>
                            </div>
                          ))}
                          <div className="txn-item txn-sum">
                            <span className="ti-qty" />
                            <span className="ti-name">Total paid</span>
                            <span className="ti-each" />
                            <span className="ti-total">{rp(s.total)}</span>
                          </div>
                          {s.change > 0 && (
                            <div className="txn-change">
                              Paid {rp(s.paid)} · change {rp(s.change)}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      )}

      {/* ---------- CASHIER ---------- */}
      {view === "cashier" && (
        <main className="cashier">
          <section className="catalog">
            <div className="searchbar">
              <Search size={18} />
              <input
                placeholder="Search items to add…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button className="clear-q" onClick={() => setQuery("")}>
                  <X size={16} />
                </button>
              )}
            </div>

            {filtered.length === 0 ? (
              <div className="empty">
                <ShoppingBag size={26} />
                <p>No items match “{query}”.</p>
                <button className="link" onClick={() => setView("items")}>
                  Manage items
                </button>
              </div>
            ) : (
              <div className="grid">
                {filtered.map((it) => {
                  const inCart = cart.find((c) => c.itemId === it.id);
                  return (
                    <div
                      key={it.id}
                      className={"tile" + (inCart ? " active" : "")}
                      role="button"
                      tabIndex={0}
                      onClick={() => add(it.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          add(it.id);
                        }
                      }}
                    >
                      <div className="tile-top">
                        {it.category && <span className="chip">{it.category}</span>}
                      </div>
                      <div className="tile-name">{it.name}</div>
                      <div className="tile-price">{rp(it.price)}</div>
                      {inCart ? (
                        <div
                          className="tile-stepper"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="ts-btn"
                            onClick={() => bump(it.id, -1)}
                            aria-label={"Reduce " + it.name}
                          >
                            <Minus size={16} />
                          </button>
                          <span className="ts-qty">{inCart.qty}</span>
                          <button
                            className="ts-btn"
                            onClick={() => bump(it.id, 1)}
                            aria-label={"Add " + it.name}
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                      ) : (
                        <span className="tile-add">
                          <Plus size={15} /> Add
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* order panel (desktop column / mobile sheet) */}
          <aside className={"order" + (cartOpen ? " open" : "")}>
            <div className="order-head">
              <h2>Current order</h2>
              <button className="sheet-close" onClick={() => setCartOpen(false)}>
                <X size={18} />
              </button>
              {lines.length > 0 && (
                <button className="clear-all" onClick={clearCart}>
                  Clear
                </button>
              )}
            </div>

            <div className="order-body">
              {lines.length === 0 ? (
                <div className="order-empty">
                  <Receipt size={24} />
                  <p>No items yet.</p>
                  <span>Tap products to build the order.</span>
                </div>
              ) : (
                lines.map((l) => (
                  <div className="line" key={l.id}>
                    <div className="line-info">
                      <div className="line-name">{l.name}</div>
                      <div className="line-each">{rp(l.price)} each</div>
                    </div>
                    <div className="stepper">
                      <button onClick={() => bump(l.id, -1)} aria-label="less">
                        <Minus size={14} />
                      </button>
                      <span>{l.qty}</span>
                      <button onClick={() => bump(l.id, 1)} aria-label="more">
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="line-total">{rp(l.price * l.qty)}</div>
                    <button className="line-del" onClick={() => removeLine(l.id)}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="order-foot">
              <div className="total-row">
                <span>Total</span>
                <span className="total-amt">{rp(total)}</span>
              </div>
              <button
                className="pay-btn"
                disabled={lines.length === 0}
                onClick={() => { setCash(""); setPaying(true); }}
              >
                <Wallet size={18} /> Payment received
              </button>
            </div>
          </aside>

          {/* mobile sticky bar */}
          <button
            className={"mobile-bar" + (count ? " show" : "")}
            onClick={() => setCartOpen(true)}
          >
            <span className="mb-count">{count} item{count !== 1 ? "s" : ""}</span>
            <span className="mb-total">{rp(total)}</span>
            <span className="mb-cta">View order <ChevronRight size={16} /></span>
          </button>
        </main>
      )}

      {/* ---------- ITEMS ---------- */}
      {view === "items" && (
        <main className="items-view">
          <div className="items-head">
            <div>
              <h2>Inventory</h2>
              <p>{items.length} product{items.length !== 1 ? "s" : ""} in your shop</p>
            </div>
            <button className="add-item" onClick={openAdd}>
              <Plus size={17} /> Add item
            </button>
          </div>

          {items.length === 0 ? (
            <div className="empty big">
              <Store size={28} />
              <p>Your shop has no items.</p>
              <button className="add-item" onClick={openAdd}>
                <Plus size={17} /> Add your first item
              </button>
            </div>
          ) : (
            <div className="table">
              <div className="thead">
                <span>Item</span>
                <span>Category</span>
                <span className="ta-r">Price</span>
                <span />
              </div>
              {items.map((it) => (
                <div className="trow" key={it.id}>
                  <span className="td-name">{it.name}</span>
                  <span className="td-cat">
                    {it.category ? <em className="chip">{it.category}</em> : <span className="dash">—</span>}
                  </span>
                  <span className="td-price">{rp(it.price)}</span>
                  <span className="td-actions">
                    <button onClick={() => openEdit(it)} title="Edit">
                      <Pencil size={15} />
                    </button>
                    <button
                      className="danger"
                      onClick={() => setConfirmDelete(it)}
                      title="Delete"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>
      )}

      {/* ---------- SETTINGS ---------- */}
      {view === "settings" && account && (
        <SettingsPage
          account={account}
          shopName={shopName}
          onSave={saveProfile}
          onChangePassword={changePassword}
          onBack={() => setView("dashboard")}
        />
      )}

      {/* ---------- payment modal ---------- */}
      {paying && (
        <div className="scrim" onClick={() => setPaying(false)}>
          <div className="modal pay-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-back" onClick={() => setPaying(false)}>
              <ArrowLeft size={16} /> Back to order
            </button>
            <div className="pay-total">
              <span>Amount due</span>
              <strong>{rp(total)}</strong>
            </div>

            <label className="field-label">Cash received (optional)</label>
            <div className="cash-input">
              <span>Rp</span>
              <input
                inputMode="numeric"
                placeholder="0"
                value={cash ? Number(cashNum).toLocaleString("id-ID") : ""}
                onChange={(e) => setCash(e.target.value)}
                autoFocus
              />
            </div>
            <div className="quick-cash">
              <button onClick={() => setCash(String(total))}>Exact</button>
              {[20000, 50000, 100000].map((v) => (
                <button key={v} onClick={() => setCash(String(cashNum + v))}>
                  +{(v / 1000)}k
                </button>
              ))}
            </div>

            {cashNum > 0 && (
              <div className={"change-row" + (change < 0 ? " short" : "")}>
                <span>{change >= 0 ? "Change" : "Still needed"}</span>
                <strong>{rp(Math.abs(change))}</strong>
              </div>
            )}

            <button className="confirm-btn" onClick={completeSale}>
              <Check size={18} /> Complete sale
            </button>
            <p className="pay-hint">
              Leave cash blank for card / e-wallet payments.
            </p>
          </div>
        </div>
      )}

      {/* ---------- success ---------- */}
      {success && (
        <div className="scrim" onClick={() => setSuccess(null)}>
          <div className="paid-card" onClick={(e) => e.stopPropagation()}>
            <div className="paid-ring">
              <Check size={40} strokeWidth={3} />
            </div>
            <h3>Payment received</h3>
            <div className="paid-amt">{rp(success.total)}</div>
            {success.change > 0 && (
              <div className="paid-change">
                Change due <strong>{rp(success.change)}</strong>
              </div>
            )}
            <button className="new-order" onClick={() => setSuccess(null)}>
              New order
            </button>
          </div>
        </div>
      )}

      {/* ---------- item form ---------- */}
      {itemForm && (
        <div className="scrim" onClick={() => setItemForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>{itemForm.mode === "add" ? "Add item" : "Edit item"}</h3>
              <button onClick={() => setItemForm(null)}>
                <X size={18} />
              </button>
            </div>
            <label className="field-label">Item name</label>
            <input
              className="text-input"
              placeholder="e.g. Nasi Goreng"
              value={itemForm.name}
              onChange={(e) => setItemForm({ ...itemForm, name: e.target.value })}
              autoFocus
            />
            <label className="field-label">Price</label>
            <div className="cash-input">
              <span>Rp</span>
              <input
                inputMode="numeric"
                placeholder="0"
                value={
                  itemForm.price
                    ? Number(
                        String(itemForm.price).replace(/[^\d]/g, "") || 0
                      ).toLocaleString("id-ID")
                    : ""
                }
                onChange={(e) => setItemForm({ ...itemForm, price: e.target.value })}
              />
            </div>
            <label className="field-label">Category (optional)</label>
            <input
              className="text-input"
              placeholder="e.g. Drinks"
              value={itemForm.category}
              onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
            />
            <div className="modal-actions">
              <button className="ghost" onClick={() => setItemForm(null)}>
                Cancel
              </button>
              <button className="save" onClick={saveItem} disabled={!itemForm.name.trim()}>
                {itemForm.mode === "add" ? "Add item" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- delete item confirm ---------- */}
      {confirmDelete && (
        <div className="scrim" onClick={() => setConfirmDelete(null)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Delete item?</h3>
            </div>
            <p className="confirm-text">
              “{confirmDelete.name}” will be removed from your inventory. This can’t be undone.
            </p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirmDelete(null)}>
                Keep it
              </button>
              <button className="save danger-btn" onClick={() => doDelete(confirmDelete.id)}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------- log out confirm ---------- */}
      {confirmLogout && (
        <div className="scrim" onClick={() => setConfirmLogout(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <h3>Log out of Cashly?</h3>
            </div>
            <p className="confirm-text">
              You’ll need to log back in to open your register. Any items in the
              current order will be cleared.
            </p>
            <div className="modal-actions">
              <button className="ghost" onClick={() => setConfirmLogout(false)}>
                Stay logged in
              </button>
              <button
                className="save danger-btn"
                onClick={() => { setConfirmLogout(false); handleLogout(); }}
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ================================================================== *
 * Auth screen — local, front-end only login / sign up.
 * ================================================================== */
function AuthScreen({ mode, setMode, hasAccount, error, onLogin, onSignup, onCheckEmail, onReset }) {
  const [f, setF] = useState({
    username: "", shopName: "", email: "", password: "", confirmPassword: "", newPass: "", confirm: "",
  });
  const [step, setStep] = useState(1); // reset flow: 1 = email, 2 = new password
  const [msg, setMsg] = useState(null); // {ok, text}
  const [showPw, setShowPw] = useState({}); // per-field visibility toggles
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const toggleShow = (k) => setShowPw((s) => ({ ...s, [k]: !s[k] }));

  const switchMode = (m) => { setMode(m); setStep(1); setMsg(null); };

  const submit = () => {
    if (mode === "login") return onLogin(f);
    if (mode === "signup") return onSignup(f);
    // reset
    if (step === 1) {
      if (!onCheckEmail(f.email))
        return setMsg({ ok: false, text: "No account found with that email." });
      setMsg(null); setStep(2); return;
    }
    if (f.newPass !== f.confirm)
      return setMsg({ ok: false, text: "Passwords don’t match." });
    const err = onReset(f.newPass);
    if (err) return setMsg({ ok: false, text: err });
    setMode("login"); setStep(1);
    setF({ ...f, password: "", newPass: "", confirm: "" });
    setMsg({ ok: true, text: "Password reset — please log in." });
  };
  const onKey = (e) => e.key === "Enter" && submit();

  const title = mode === "login" ? "Welcome back"
    : mode === "signup" ? "Create your account" : "Reset password";
  const sub = mode === "login" ? "Log in to open your register."
    : mode === "signup" ? "Set up Cashly for your shop in a few seconds."
    : step === 1 ? "Enter your account email to reset your password."
    : "Choose a new password for your account.";
  const cta = mode === "login" ? "Log in"
    : mode === "signup" ? "Create account"
    : step === 1 ? "Continue" : "Reset password";

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <Logo className="auth-logo" />
        <h1 className="auth-title">{title}</h1>
        <p className="auth-sub">{sub}</p>

        {mode !== "reset" && (
          <div className="auth-toggle">
            <button className={mode === "login" ? "on" : ""} onClick={() => switchMode("login")}>Log in</button>
            <button className={mode === "signup" ? "on" : ""} onClick={() => switchMode("signup")}>Sign up</button>
          </div>
        )}

        {mode === "signup" && (
          <>
            <label className="field-label">Username</label>
            <div className="icon-input">
              <User size={16} />
              <input placeholder="e.g. budi" value={f.username} onChange={set("username")} onKeyDown={onKey} />
            </div>
            <label className="field-label">Shop name</label>
            <div className="icon-input">
              <Store size={16} />
              <input placeholder="e.g. Warung Budi" value={f.shopName} onChange={set("shopName")} onKeyDown={onKey} />
            </div>
          </>
        )}

        {/* email: login, signup, and reset step 1 */}
        {(mode !== "reset" || step === 1) && (
          <>
            <label className="field-label">Email</label>
            <div className="icon-input">
              <Mail size={16} />
              <input type="email" placeholder="you@email.com" value={f.email} onChange={set("email")} onKeyDown={onKey} autoFocus={mode === "reset"} />
            </div>
          </>
        )}

        {/* password: login + signup */}
        {mode !== "reset" && (
          <>
            <div className="label-row">
              <label className="field-label">Password</label>
              {mode === "login" && (
                <button className="forgot-link" onClick={() => switchMode("reset")}>Forgot password?</button>
              )}
            </div>
            <div className="icon-input">
              <Lock size={16} />
              <input type={showPw.password ? "text" : "password"} placeholder={mode === "signup" ? "At least 6 characters" : "Your password"} value={f.password} onChange={set("password")} onKeyDown={onKey} />
              <button type="button" className="pw-toggle" tabIndex={-1} onClick={() => toggleShow("password")}>
                {showPw.password ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </>
        )}

        {mode === "signup" && (
          <>
            <label className="field-label">Confirm password</label>
            <div className="icon-input">
              <Lock size={16} />
              <input type={showPw.confirmPassword ? "text" : "password"} placeholder="Re-enter your password" value={f.confirmPassword} onChange={set("confirmPassword")} onKeyDown={onKey} />
              <button type="button" className="pw-toggle" tabIndex={-1} onClick={() => toggleShow("confirmPassword")}>
                {showPw.confirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </>
        )}

        {/* reset step 2: new + confirm password */}
        {mode === "reset" && step === 2 && (
          <>
            <label className="field-label">New password</label>
            <div className="icon-input">
              <Lock size={16} />
              <input type={showPw.newPass ? "text" : "password"} placeholder="At least 6 characters" value={f.newPass} onChange={set("newPass")} onKeyDown={onKey} autoFocus />
              <button type="button" className="pw-toggle" tabIndex={-1} onClick={() => toggleShow("newPass")}>
                {showPw.newPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <label className="field-label">Confirm new password</label>
            <div className="icon-input">
              <Lock size={16} />
              <input type={showPw.confirm ? "text" : "password"} value={f.confirm} onChange={set("confirm")} onKeyDown={onKey} />
              <button type="button" className="pw-toggle" tabIndex={-1} onClick={() => toggleShow("confirm")}>
                {showPw.confirm ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </>
        )}

        {mode !== "reset" && error && <div className="auth-error">{error}</div>}
        {msg && <div className={msg.ok ? "auth-ok" : "auth-error"}>{msg.text}</div>}

        <button className="auth-submit" onClick={submit}>
          {cta} <CircleArrowRight size={24} />
        </button>

        <p className="auth-switch">
          {mode === "login" && (<>New to Cashly? <button onClick={() => switchMode("signup")}>Create an account</button></>)}
          {mode === "signup" && (<>Already have an account? <button onClick={() => switchMode("login")}>Log in</button></>)}
          {mode === "reset" && (<button onClick={() => switchMode("login")}>Back to log in</button>)}
        </p>
        <p className="auth-note">
          Demo login — your account is stored only on this device.
        </p>
      </div>
    </div>
  );
}

/* ================================================================== *
 * Settings page — edit profile + change password.
 * ================================================================== */
function SettingsPage({ account, shopName, onSave, onChangePassword, onBack }) {
  const [p, setP] = useState({
    username: account.username, shopName, email: account.email,
  });
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saved, setSaved] = useState(false);
  const [pwMsg, setPwMsg] = useState(null); // {ok, text}

  const dirty =
    p.username !== account.username || p.email !== account.email || p.shopName !== shopName;

  const saveProfile = () => {
    if (!p.username.trim() || !p.shopName.trim() || !p.email.trim()) return;
    onSave(p);
    setSaved(true);
    setTimeout(() => setSaved(false), 2200);
  };
  const submitPw = () => {
    if (pw.next !== pw.confirm)
      return setPwMsg({ ok: false, text: "New passwords don’t match." });
    const err = onChangePassword(pw.current, pw.next);
    if (err) return setPwMsg({ ok: false, text: err });
    setPw({ current: "", next: "", confirm: "" });
    setPwMsg({ ok: true, text: "Password updated." });
  };

  return (
    <main className="settings">
      <button className="back-link" onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <h2 className="settings-title">Settings</h2>

      <section className="settings-card">
        <h3 className="settings-h">Profile</h3>
        <label className="field-label">Username</label>
        <div className="icon-input">
          <User size={16} />
          <input value={p.username} onChange={(e) => setP({ ...p, username: e.target.value })} />
        </div>
        <label className="field-label">Shop name</label>
        <div className="icon-input">
          <Store size={16} />
          <input value={p.shopName} onChange={(e) => setP({ ...p, shopName: e.target.value })} />
        </div>
        <label className="field-label">Email</label>
        <div className="icon-input">
          <Mail size={16} />
          <input type="email" value={p.email} onChange={(e) => setP({ ...p, email: e.target.value })} />
        </div>
        <div className="settings-actions">
          {saved && <span className="saved-tag"><Check size={14} /> Saved</span>}
          <button className="save" onClick={saveProfile} disabled={!dirty}>Save changes</button>
        </div>
      </section>

      <section className="settings-card">
        <h3 className="settings-h">Change password</h3>
        <label className="field-label">Current password</label>
        <div className="icon-input">
          <Lock size={16} />
          <input type="password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} />
        </div>
        <label className="field-label">New password</label>
        <div className="icon-input">
          <Lock size={16} />
          <input type="password" placeholder="At least 6 characters" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} />
        </div>
        <label className="field-label">Confirm new password</label>
        <div className="icon-input">
          <Lock size={16} />
          <input type="password" value={pw.confirm} onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
        </div>
        {pwMsg && (
          <div className={"pw-msg" + (pwMsg.ok ? " ok" : " err")}>{pwMsg.text}</div>
        )}
        <div className="settings-actions">
          <button
            className="save"
            onClick={submitPw}
            disabled={!pw.current || !pw.next || !pw.confirm}
          >
            Update password
          </button>
        </div>
      </section>
    </main>
  );
}

/* ================================================================== *
 * Cashly logo — yellow dot behind a teal "Cashly." wordmark.
 * Rebuilt from the supplied artwork; Myriad swapped for Source Sans 3
 * (same designer, near-identical metrics) so it loads on the web.
 * ================================================================== */
function Logo({ className }) {
  const wm = {
    fill: "#109488",
    fontFamily: "'Source Sans 3', system-ui, sans-serif",
    fontSize: "130.17px",
    fontWeight: 700,
  };
  return (
    <svg className={className} viewBox="0 0 340.16 203.12"
      role="img" aria-label="Cashly" xmlns="http://www.w3.org/2000/svg">
      <circle cx="101.56" cy="101.56" r="101.56" fill="#ffce07" />
      <text style={wm} transform="translate(33.57 141.19) scale(.75 1)">
        <tspan x="0" y="0" style={{ letterSpacing: "-0.01em" }}>C</tspan>
        <tspan x="76.15" y="0">ash</tspan>
        <tspan x="277.66" y="0">l</tspan>
        <tspan x="313.58" y="0" style={{ letterSpacing: "-0.05em" }}>y</tspan>
        <tspan x="375.41" y="0">.</tspan>
      </text>
    </svg>
  );
}

/* ================================================================== *
 * Styles
 * ================================================================== */
function Style() {
  return (
    <style>{`
@import url('https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=DM+Mono:wght@400;500&family=Manrope:wght@400;500;600;700&family=Source+Sans+3:wght@600;700;800&display=swap');

.pos-root{
  --ink:#182338; --paper:#FBF9F4; --card:#FFFFFF; --muted:#6B7488;
  --line:#EAE5D9; --accent:#F2A20C; --accent-ink:#8A5B00; --accent-soft:#FCEFCE;
  --paid:#178A5E; --paid-soft:#E4F4EC; --danger:#CE4B26;
  --display:'Bricolage Grotesque',system-ui,sans-serif;
  --sans:'Manrope',system-ui,sans-serif;
  --mono:'DM Mono',ui-monospace,monospace;
  font-family:var(--sans); color:var(--ink); background:var(--paper);
  min-height:100vh; -webkit-font-smoothing:antialiased;
}
.pos-root *{box-sizing:border-box;}
.pos-root button{font-family:inherit;cursor:pointer;border:none;background:none;color:inherit;}
.pos-root input{font-family:inherit;}
.loading{display:grid;place-items:center;height:100vh;color:var(--muted);font-family:var(--mono);}

/* header */
.topbar{
  display:flex;align-items:center;gap:18px;
  padding:14px 22px;background:var(--card);
  border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20;
}
.brand{display:flex;align-items:center;gap:12px;min-width:0;}
.brand-mark{height:34px;width:auto;flex:none;display:block;}
.name{display:flex;align-items:center;gap:7px;font-family:var(--display);
  font-weight:700;font-size:19px;letter-spacing:-.01em;color:var(--ink);}
.name-pen{opacity:0;color:var(--muted);transition:opacity .15s;}
.name:hover .name-pen{opacity:1;}
.name-input{font-family:var(--display);font-weight:700;font-size:19px;
  border:none;border-bottom:2px solid var(--accent);background:transparent;
  outline:none;color:var(--ink);width:200px;}

.tabs{display:flex;gap:4px;margin:0 auto;background:var(--paper);
  padding:4px;border-radius:12px;border:1px solid var(--line);}
.tab{display:flex;align-items:center;gap:7px;padding:8px 16px;border-radius:9px;
  font-weight:600;font-size:14px;color:var(--muted);transition:.15s;}
.tab.on{background:var(--card);color:var(--ink);box-shadow:0 1px 3px rgba(24,35,56,.1);}
.tab:not(.on):hover{color:var(--ink);}

.menu-wrap{position:relative;}
.menu-btn{width:40px;height:40px;border-radius:11px;display:grid;place-items:center;
  color:var(--muted);border:1px solid transparent;transition:.12s;}
.menu-btn:hover,.menu-btn.on{background:var(--paper);color:var(--ink);border-color:var(--line);}
.menu-scrim{position:fixed;inset:0;z-index:24;}
.menu{position:absolute;top:48px;right:0;z-index:25;background:var(--card);
  border:1px solid var(--line);border-radius:13px;padding:6px;min-width:196px;
  box-shadow:0 16px 40px rgba(20,28,45,.18);animation:rise .16s ease;}
.menu-item{display:flex;align-items:center;gap:10px;width:100%;padding:10px 12px;
  border-radius:9px;font-size:14px;font-weight:500;color:var(--ink);text-align:left;
  transition:.12s;}
.menu-item:hover{background:var(--paper);}
.menu-item.danger{color:var(--danger);}
.menu-item.danger:hover{background:#fbeae4;}
.menu-item.active{color:var(--accent-ink);background:var(--accent-soft);}
.menu-sep{height:1px;background:var(--line);margin:5px 8px;}

/* ---- cashier layout ---- */
.cashier{display:grid;grid-template-columns:1fr 380px;gap:22px;
  padding:22px;max-width:1240px;margin:0 auto;align-items:start;}
.catalog{min-width:0;}

.searchbar{display:flex;align-items:center;gap:10px;background:var(--card);
  border:1px solid var(--line);border-radius:13px;padding:0 14px;height:50px;
  color:var(--muted);margin-bottom:16px;}
.searchbar input{flex:1;border:none;outline:none;background:none;font-size:15px;
  color:var(--ink);}
.searchbar input::placeholder{color:#9aa2b2;}
.clear-q{display:grid;place-items:center;color:var(--muted);}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(158px,1fr));gap:12px;}
.tile{position:relative;text-align:left;background:var(--card);
  border:1px solid var(--line);border-radius:15px;padding:14px;cursor:pointer;
  display:flex;flex-direction:column;gap:5px;min-height:118px;
  transition:transform .12s,box-shadow .12s,border-color .12s;overflow:hidden;}
.tile:hover{transform:translateY(-2px);box-shadow:0 8px 22px rgba(24,35,56,.09);
  border-color:#dcd6c7;}
.tile:active{transform:translateY(0);}
.tile:focus-visible{outline:2px solid var(--accent);outline-offset:2px;}
.tile.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent);}
.tile-top{display:flex;justify-content:space-between;align-items:center;min-height:20px;}
.chip{font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;
  color:var(--accent-ink);background:var(--accent-soft);padding:3px 8px;border-radius:20px;}
.qty-badge{font-family:var(--mono);font-size:12px;font-weight:500;color:#fff;
  background:var(--accent);min-width:22px;height:22px;border-radius:20px;
  display:grid;place-items:center;padding:0 6px;}
.tile-name{font-weight:600;font-size:14.5px;line-height:1.25;margin-top:auto;}
.tile-price{font-family:var(--mono);font-size:14px;color:var(--ink);}
.tile-add{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:600;
  color:var(--muted);margin-top:4px;opacity:0;transform:translateY(4px);
  transition:.15s;}
.tile:hover .tile-add{opacity:1;transform:none;color:var(--accent-ink);}
/* in-cart stepper on the tile */
.tile-stepper{display:flex;align-items:center;justify-content:space-between;
  margin-top:6px;background:var(--accent-soft);border-radius:10px;padding:3px;cursor:default;}
.ts-btn{width:30px;height:30px;border-radius:8px;display:grid;place-items:center;
  color:var(--accent-ink);background:var(--card);cursor:pointer;
  box-shadow:0 1px 2px rgba(24,35,56,.12);transition:.12s;}
.ts-btn:hover{background:var(--accent);color:#fff;}
.ts-btn:active{transform:scale(.92);}
.ts-qty{font-family:var(--mono);font-weight:500;font-size:15px;color:var(--accent-ink);
  min-width:26px;text-align:center;}

/* order panel */
.order{background:var(--card);border:1px solid var(--line);border-radius:18px;
  position:sticky;top:92px;display:flex;flex-direction:column;
  max-height:calc(100vh - 116px);overflow:hidden;}
.order-head{display:flex;align-items:center;gap:10px;padding:16px 18px;
  border-bottom:1px dashed var(--line);}
.order-head h2{font-family:var(--display);font-size:16px;font-weight:700;margin:0;}
.clear-all{margin-left:auto;font-size:12.5px;font-weight:600;color:var(--danger);}
.sheet-close{display:none;}
.order-body{flex:1;overflow-y:auto;padding:6px 8px;min-height:120px;}
.order-empty{display:flex;flex-direction:column;align-items:center;gap:4px;
  padding:44px 20px;text-align:center;color:var(--muted);}
.order-empty svg{color:#c3c9d4;margin-bottom:4px;}
.order-empty p{margin:0;font-weight:600;color:var(--ink);}
.order-empty span{font-size:13px;}

.line{display:grid;grid-template-columns:1fr auto auto auto;align-items:center;
  gap:10px;padding:11px 10px;border-radius:11px;animation:pop .18s ease;}
.line+.line{border-top:1px solid var(--line);border-radius:0;}
@keyframes pop{from{opacity:0;transform:translateY(-4px);}to{opacity:1;transform:none;}}
.line-info{min-width:0;}
.line-name{font-weight:600;font-size:14px;line-height:1.2;}
.line-each{font-family:var(--mono);font-size:11.5px;color:var(--muted);}
.stepper{display:flex;align-items:center;gap:2px;background:var(--paper);
  border:1px solid var(--line);border-radius:9px;padding:2px;}
.stepper button{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;
  color:var(--ink);transition:.12s;}
.stepper button:hover{background:var(--card);}
.stepper span{font-family:var(--mono);font-size:13px;min-width:20px;text-align:center;}
.line-total{font-family:var(--mono);font-size:13.5px;font-weight:500;min-width:64px;
  text-align:right;}
.line-del{color:#b9bfca;width:26px;height:26px;display:grid;place-items:center;
  border-radius:7px;transition:.12s;}
.line-del:hover{color:var(--danger);background:#fbeae4;}

.order-foot{padding:16px 18px;border-top:1px solid var(--line);background:var(--card);}
.total-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:14px;}
.total-row span:first-child{font-weight:600;color:var(--muted);}
.total-amt{font-family:var(--display);font-weight:800;font-size:26px;letter-spacing:-.02em;}
.pay-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;
  background:var(--paid);color:#fff;font-weight:700;font-size:15.5px;
  padding:15px;border-radius:13px;transition:.15s;box-shadow:0 4px 14px rgba(23,138,94,.28);}
.pay-btn:hover:not(:disabled){background:#14764f;transform:translateY(-1px);}
.pay-btn:disabled{background:#cfd4dc;box-shadow:none;cursor:not-allowed;}

/* mobile bar */
.mobile-bar{display:none;}

/* ---- items view ---- */
.items-view{max-width:920px;margin:0 auto;padding:26px 22px;}
.items-head{display:flex;align-items:flex-end;justify-content:space-between;
  gap:16px;margin-bottom:20px;}
.items-head h2{font-family:var(--display);font-size:26px;font-weight:800;margin:0;
  letter-spacing:-.02em;}
.items-head p{margin:2px 0 0;color:var(--muted);font-size:14px;}
.add-item{display:flex;align-items:center;gap:8px;background:var(--ink);color:#fff;
  font-weight:600;font-size:14.5px;padding:12px 18px;border-radius:12px;transition:.15s;}
.add-item:hover{background:#0f1728;transform:translateY(-1px);}

.table{background:var(--card);border:1px solid var(--line);border-radius:16px;overflow:hidden;}
.thead,.trow{display:grid;grid-template-columns:1fr 150px 130px 92px;align-items:center;
  gap:12px;padding:13px 18px;}
.thead{font-size:11px;text-transform:uppercase;letter-spacing:.09em;color:var(--muted);
  background:var(--paper);font-weight:700;border-bottom:1px solid var(--line);}
.ta-r{text-align:right;}
.trow+.trow,.thead+.trow{border-top:1px solid var(--line);}
.trow{transition:background .12s;}
.trow:hover{background:#fdfbf6;}
.td-name{font-weight:600;font-size:15px;}
.td-cat .dash{color:#c3c9d4;}
.td-price{font-family:var(--mono);font-size:14.5px;text-align:right;}
.td-actions{display:flex;gap:6px;justify-content:flex-end;}
.td-actions button{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;
  color:var(--muted);border:1px solid var(--line);transition:.12s;}
.td-actions button:hover{color:var(--ink);border-color:#d3cdbe;background:var(--paper);}
.td-actions .danger:hover{color:var(--danger);border-color:#eab6a5;background:#fbeae4;}

/* empties */
.empty{display:flex;flex-direction:column;align-items:center;gap:10px;
  padding:60px 20px;text-align:center;color:var(--muted);}
.empty svg{color:#c3c9d4;}
.empty p{margin:0;font-weight:600;color:var(--ink);}
.empty.big{background:var(--card);border:1px dashed var(--line);border-radius:16px;}
.link{color:var(--accent-ink);font-weight:600;text-decoration:underline;}

/* ---- dashboard ---- */
.dashboard{max-width:820px;margin:0 auto;padding:26px 22px;}
.empty-sub{font-size:13.5px;color:var(--muted);}

.today-card{background:linear-gradient(145deg,var(--ink),#28374f);color:#fff;
  border-radius:20px;padding:24px 26px;box-shadow:0 14px 34px rgba(24,35,56,.22);
  position:relative;overflow:hidden;}
.today-card::after{content:"";position:absolute;right:-40px;top:-40px;width:180px;height:180px;
  background:radial-gradient(circle,rgba(242,162,12,.35),transparent 70%);pointer-events:none;}
.tc-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;
  position:relative;}
.tc-eyebrow{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;
  text-transform:uppercase;letter-spacing:.1em;color:var(--accent);}
.tc-date{font-size:12.5px;color:#aeb8ca;}
.tc-stats{display:flex;align-items:center;gap:26px;position:relative;}
.tc-stat{display:flex;flex-direction:column;gap:5px;}
.tc-label{font-size:12px;color:#aeb8ca;text-transform:uppercase;letter-spacing:.08em;}
.tc-amount{font-family:var(--display);font-weight:800;font-size:38px;letter-spacing:-.02em;
  line-height:1;}
.tc-count{font-family:var(--display);font-weight:800;font-size:38px;letter-spacing:-.02em;
  line-height:1;}
.tc-divider{width:1px;height:52px;background:rgba(255,255,255,.14);}

.history{margin-top:24px;}
.history-head{display:flex;align-items:baseline;justify-content:space-between;margin-bottom:14px;}
.history-head h2{font-family:var(--display);font-size:20px;font-weight:700;margin:0;
  letter-spacing:-.01em;}
.history-count{font-size:13px;color:var(--muted);font-family:var(--mono);}

.txn-list{display:flex;flex-direction:column;gap:8px;}
.txn{background:var(--card);border:1px solid var(--line);border-radius:14px;overflow:hidden;
  transition:border-color .12s,box-shadow .12s;}
.txn:hover{border-color:#dcd6c7;}
.txn.open{border-color:var(--accent);box-shadow:0 6px 18px rgba(24,35,56,.08);}
.txn-row{width:100%;display:grid;grid-template-columns:120px 1fr auto auto 20px;
  align-items:center;gap:14px;padding:15px 18px;text-align:left;}
.txn-no{font-family:var(--mono);font-weight:500;font-size:14px;}
.txn-status{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;font-weight:600;
  color:var(--paid);background:var(--paid-soft);padding:4px 10px;border-radius:20px;
  width:fit-content;}
.txn-meta{font-size:12.5px;color:var(--muted);font-family:var(--mono);}
.txn-amt{font-family:var(--mono);font-weight:500;font-size:15px;text-align:right;min-width:88px;}
.txn-chev{color:var(--muted);transition:transform .2s;justify-self:end;}
.txn.open .txn-chev{transform:rotate(180deg);}

.txn-detail{padding:4px 18px 16px;border-top:1px dashed var(--line);
  animation:slideDown .2s ease;}
@keyframes slideDown{from{opacity:0;transform:translateY(-6px);}to{opacity:1;transform:none;}}
.txn-detail-head{display:flex;align-items:center;gap:6px;font-size:12px;color:var(--muted);
  padding:12px 0 8px;font-family:var(--mono);}
.txn-detail-qty{margin-left:auto;font-family:var(--sans);font-weight:600;color:var(--ink);}
.txn-item{display:grid;grid-template-columns:36px 1fr auto auto;align-items:center;gap:12px;
  padding:8px 0;font-size:14px;border-top:1px solid var(--line);}
.ti-qty{font-family:var(--mono);color:var(--accent-ink);font-weight:500;}
.ti-name{font-weight:500;}
.ti-each{font-family:var(--mono);font-size:12px;color:var(--muted);}
.ti-total{font-family:var(--mono);font-size:13.5px;text-align:right;min-width:80px;}
.txn-sum{border-top:1.5px solid var(--ink);margin-top:2px;}
.txn-sum .ti-name{font-weight:700;}
.txn-sum .ti-total{font-weight:600;}
.txn-change{font-size:12.5px;color:var(--muted);padding-top:10px;font-family:var(--mono);}

/* ---- modals ---- */
.scrim{position:fixed;inset:0;background:rgba(20,28,45,.5);backdrop-filter:blur(3px);
  display:grid;place-items:center;padding:20px;z-index:60;animation:fade .15s;}
@keyframes fade{from{opacity:0;}to{opacity:1;}}
.modal{background:var(--card);border-radius:20px;padding:22px;width:100%;max-width:420px;
  box-shadow:0 24px 60px rgba(20,28,45,.3);animation:rise .2s ease;}
.modal.small{max-width:380px;}
@keyframes rise{from{opacity:0;transform:translateY(12px) scale(.98);}to{opacity:1;transform:none;}}
.modal-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;}
.modal-head h3{font-family:var(--display);font-size:20px;font-weight:700;margin:0;}
.modal-head button{color:var(--muted);width:32px;height:32px;border-radius:8px;
  display:grid;place-items:center;}
.modal-head button:hover{background:var(--paper);}
.field-label{display:block;font-size:12.5px;font-weight:600;color:var(--muted);
  margin:12px 0 6px;text-align:left;}
.text-input{width:100%;height:46px;border:1px solid var(--line);border-radius:11px;
  padding:0 13px;font-size:15px;outline:none;background:var(--paper);transition:.12s;}
.text-input:focus{border-color:var(--accent);background:var(--card);
  box-shadow:0 0 0 3px var(--accent-soft);}
.cash-input{display:flex;align-items:center;gap:8px;height:46px;border:1px solid var(--line);
  border-radius:11px;padding:0 13px;background:var(--paper);transition:.12s;}
.cash-input:focus-within{border-color:var(--accent);background:var(--card);
  box-shadow:0 0 0 3px var(--accent-soft);}
.cash-input span{font-family:var(--mono);color:var(--muted);font-size:14px;}
.cash-input input{flex:1;border:none;outline:none;background:none;
  font-family:var(--mono);font-size:17px;color:var(--ink);}
.modal-actions{display:flex;gap:10px;margin-top:20px;}
.modal-actions button{flex:1;height:46px;border-radius:11px;font-weight:600;font-size:14.5px;
  transition:.15s;}
.ghost{background:var(--paper);color:var(--ink);border:1px solid var(--line);}
.ghost:hover{background:#f2eee3;}
.save{background:var(--ink);color:#fff;}
.save:hover:not(:disabled){background:#0f1728;}
.save:disabled{opacity:.45;cursor:not-allowed;}
.danger-btn{background:var(--danger);}
.danger-btn:hover{background:#b33f1f;}
.confirm-text{color:var(--muted);font-size:14.5px;line-height:1.5;margin:0;}

/* payment modal */
.pay-modal{max-width:440px;}
.modal-back{display:flex;align-items:center;gap:6px;font-size:13px;font-weight:600;
  color:var(--muted);margin-bottom:16px;}
.modal-back:hover{color:var(--ink);}
.pay-total{display:flex;flex-direction:column;align-items:center;gap:3px;
  background:var(--paper);border:1px solid var(--line);border-radius:14px;
  padding:18px;margin-bottom:6px;}
.pay-total span{font-size:12px;text-transform:uppercase;letter-spacing:.1em;color:var(--muted);}
.pay-total strong{font-family:var(--display);font-weight:800;font-size:32px;letter-spacing:-.02em;}
.quick-cash{display:flex;gap:8px;margin-top:10px;}
.quick-cash button{flex:1;height:40px;border-radius:10px;background:var(--paper);
  border:1px solid var(--line);font-family:var(--mono);font-size:13px;font-weight:500;
  color:var(--ink);transition:.12s;}
.quick-cash button:hover{border-color:var(--accent);background:var(--accent-soft);}
.change-row{display:flex;justify-content:space-between;align-items:baseline;
  margin-top:16px;padding:13px 15px;background:var(--paid-soft);border-radius:12px;}
.change-row span{font-weight:600;color:var(--paid);}
.change-row strong{font-family:var(--mono);font-size:18px;color:var(--paid);}
.change-row.short{background:#fbeae4;}
.change-row.short span,.change-row.short strong{color:var(--danger);}
.confirm-btn{width:100%;display:flex;align-items:center;justify-content:center;gap:9px;
  background:var(--paid);color:#fff;font-weight:700;font-size:16px;padding:15px;
  border-radius:13px;margin-top:18px;box-shadow:0 4px 14px rgba(23,138,94,.28);transition:.15s;}
.confirm-btn:hover{background:#14764f;transform:translateY(-1px);}
.pay-hint{text-align:center;font-size:12.5px;color:var(--muted);margin:12px 0 0;}

/* success */
.paid-card{background:var(--card);border-radius:24px;padding:34px 28px;width:100%;
  max-width:360px;text-align:center;box-shadow:0 24px 60px rgba(20,28,45,.3);
  animation:rise .25s ease;}
.paid-ring{width:82px;height:82px;border-radius:50%;background:var(--paid-soft);
  color:var(--paid);display:grid;place-items:center;margin:0 auto 18px;
  animation:ring .4s cubic-bezier(.2,1.3,.4,1);}
@keyframes ring{from{transform:scale(.3);opacity:0;}to{transform:scale(1);opacity:1;}}
.paid-card h3{font-family:var(--display);font-size:20px;font-weight:700;margin:0 0 6px;}
.paid-amt{font-family:var(--display);font-weight:800;font-size:34px;letter-spacing:-.02em;
  color:var(--ink);}
.paid-change{margin-top:12px;padding:11px;background:var(--paper);border-radius:11px;
  font-size:14px;color:var(--muted);}
.paid-change strong{font-family:var(--mono);color:var(--ink);margin-left:6px;}
.new-order{margin-top:22px;width:100%;height:48px;border-radius:12px;background:var(--ink);
  color:#fff;font-weight:600;font-size:15px;transition:.15s;}
.new-order:hover{background:#0f1728;}

/* ---- auth ---- */
.auth-root{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;}
.auth-wrap{width:100%;max-width:420px;}
.auth-card{background:var(--card);border:1px solid var(--line);border-radius:22px;
  padding:34px 30px;box-shadow:0 20px 50px rgba(20,28,45,.12);}
.auth-logo{height:40px;width:auto;display:block;margin-bottom:20px;}
.auth-title{font-family:var(--display);font-size:26px;font-weight:800;letter-spacing:-.02em;
  margin:0 0 4px;color:#182338;}
.auth-sub{color:var(--muted);font-size:14.5px;margin:0 0 22px;line-height:1.4;}
.auth-toggle{display:flex;gap:4px;background:var(--paper);border:1px solid var(--line);
  border-radius:12px;padding:4px;margin-bottom:20px;}
.auth-toggle button{flex:1;padding:9px;border-radius:9px;font-weight:600;font-size:14px;
  color:var(--muted);transition:.15s;}
.auth-toggle button.on{background:var(--card);color:var(--ink);
  box-shadow:0 1px 3px rgba(24,35,56,.12);}
.icon-input{display:flex;align-items:center;gap:10px;height:46px;border:1px solid var(--line);
  border-radius:11px;padding:0 13px;background:var(--paper);transition:.12s;color:var(--muted);}
.icon-input:focus-within{border-color:var(--accent);background:var(--card);
  box-shadow:0 0 0 3px var(--accent-soft);color:var(--accent-ink);}
.icon-input input{flex:1;border:none;outline:none;background:none;font-size:15px;
  color:var(--ink);}
.icon-input input::placeholder{color:#9aa2b2;}
.pw-toggle{display:flex;align-items:center;background:none;border:none;padding:0;
  color:var(--muted);cursor:pointer;flex-shrink:0;}
.pw-toggle:hover{color:var(--ink);}
.auth-error{background:#fbeae4;color:var(--danger);font-size:13.5px;font-weight:500;
  padding:10px 13px;border-radius:10px;margin-top:16px;}
.auth-ok{background:var(--paid-soft);color:var(--paid);font-size:13.5px;font-weight:500;
  padding:10px 13px;border-radius:10px;margin-top:16px;}
.label-row{display:flex;align-items:baseline;justify-content:space-between;}
.forgot-link{font-size:12.5px;font-weight:600;color:var(--accent-ink);}
.forgot-link:hover{text-decoration:underline;}
.auth-root .auth-submit{width:100%;display:flex;align-items:center;justify-content:center;gap:12px;
  background:#109488;color:#fafafa;font-weight:600;font-size:16px;padding:10px 24px;
  border-radius:8px;margin-top:20px;transition:.15s;}
.auth-root .auth-submit:hover{background:#0d7a70;color:#fafafa;transform:translateY(-1px);}
.auth-switch{text-align:center;font-size:14px;color:var(--muted);margin:18px 0 0;}
.auth-switch button{color:var(--accent-ink);font-weight:700;}
.auth-switch button:hover{text-decoration:underline;}
.auth-note{text-align:center;font-size:12px;color:#9aa2b2;margin:14px 0 0;}

/* ---- settings ---- */
.settings{max-width:520px;margin:0 auto;padding:24px 22px;}
.back-link{display:flex;align-items:center;gap:6px;font-size:14px;font-weight:600;
  color:var(--muted);margin-bottom:14px;}
.back-link:hover{color:var(--ink);}
.settings-title{font-family:var(--display);font-size:26px;font-weight:800;letter-spacing:-.02em;
  margin:0 0 18px;}
.settings-card{background:var(--card);border:1px solid var(--line);border-radius:18px;
  padding:24px;margin-bottom:16px;}
.settings-h{font-family:var(--display);font-size:17px;font-weight:700;margin:0 0 6px;}
.settings-actions{display:flex;align-items:center;justify-content:flex-end;gap:12px;
  margin-top:20px;}
.settings-actions .save{height:44px;padding:0 22px;border-radius:11px;background:var(--ink);
  color:#fff;font-weight:600;font-size:14.5px;transition:.15s;}
.settings-actions .save:hover:not(:disabled){background:#0f1728;}
.settings-actions .save:disabled{opacity:.4;cursor:not-allowed;}
.saved-tag{display:flex;align-items:center;gap:5px;font-size:13.5px;font-weight:600;
  color:var(--paid);}
.pw-msg{font-size:13.5px;font-weight:500;padding:10px 13px;border-radius:10px;margin-top:14px;}
.pw-msg.ok{background:var(--paid-soft);color:var(--paid);}
.pw-msg.err{background:#fbeae4;color:var(--danger);}

/* ---- responsive ---- */
@media (max-width:860px){
  .topbar{flex-wrap:wrap;gap:12px;padding:12px 16px;}
  .tabs{order:3;width:100%;margin:0;}
  .tab{flex:1;justify-content:center;}
  .menu-wrap{margin-left:auto;}
  .cashier{grid-template-columns:1fr;padding:16px;padding-bottom:96px;}
  .order{position:fixed;inset:auto 0 0 0;top:auto;border-radius:20px 20px 0 0;
    max-height:82vh;transform:translateY(105%);transition:transform .28s cubic-bezier(.3,1,.4,1);
    z-index:50;box-shadow:0 -12px 40px rgba(20,28,45,.22);}
  .order.open{transform:none;}
  .sheet-close{display:grid;place-items:center;margin-left:auto;width:32px;height:32px;
    border-radius:8px;color:var(--muted);}
  .order-head .clear-all{margin-left:0;}
  .mobile-bar{display:flex;align-items:center;gap:12px;position:fixed;left:12px;right:12px;
    bottom:12px;background:var(--ink);color:#fff;border-radius:15px;padding:14px 18px;
    z-index:40;transform:translateY(140%);transition:transform .25s;
    box-shadow:0 10px 30px rgba(20,28,45,.35);}
  .mobile-bar.show{transform:none;}
  .mb-count{font-size:13px;color:#c6cdda;}
  .mb-total{font-family:var(--mono);font-weight:500;font-size:16px;}
  .mb-cta{margin-left:auto;display:flex;align-items:center;gap:4px;font-weight:600;font-size:14px;}
  .thead,.trow{grid-template-columns:1fr 88px 78px;}
  .td-cat{display:none;}
  .thead span:nth-child(2){display:none;}

  .today-card{padding:20px;}
  .tc-amount,.tc-count{font-size:30px;}
  .tc-stats{gap:18px;}
  .txn-row{grid-template-columns:auto 1fr auto 18px;gap:10px;padding:14px;}
  .txn-meta{display:none;}
  .txn-amt{min-width:0;}
  .txn-item{grid-template-columns:32px 1fr auto;}
  .ti-each{display:none;}
}
@media (max-width:420px){
  .grid{grid-template-columns:repeat(2,1fr);}
  .name-input{width:140px;}
}
@media (prefers-reduced-motion:reduce){
  .pos-root *{animation:none!important;transition:none!important;}
}
`}</style>
  );
}
