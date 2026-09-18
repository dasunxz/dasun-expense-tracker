/* Dasun Expense Tracker
 * Spreadsheet-driven personal finance app for GitHub Pages.
 */
(function () {
  "use strict";

  const STORAGE_KEY = "dasun-expense-tracker-v1";
  const SEED = window.EXPENSE_TRACKER_SEED;
  const CARD_PAYMENT_CATEGORY = {
    "DFCC Credit Card": "DFCC Credit Card Payment",
    "HNB Credit Card": "HNB Credit Card Payment",
    "Commercial Bank Credit Card": "Commercial Bank Credit Card Payment"
  };

  let state = loadState();
  let currentView = "dashboard";
  let charts = {};
  let editingId = null;

  const money = new Intl.NumberFormat("en-LK", {
    style: "currency",
    currency: "LKR",
    maximumFractionDigits: 2
  });

  const shortMoney = new Intl.NumberFormat("en-LK", {
    maximumFractionDigits: 0
  });

  const dateFmt = new Intl.DateTimeFormat("en-LK", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function uid(prefix = "tx") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return normaliseState(parsed);
      }
    } catch (error) {
      console.warn("Could not read saved data", error);
    }
    return normaliseState(clone(SEED));
  }

  function normaliseState(raw) {
    const rawCategories = raw.categories || {};
    const accounts = Array.isArray(raw.accounts) ? raw.accounts : [];
    const creditCards = Array.isArray(raw.creditCards) ? raw.creditCards : [];
    const base = {
      version: 1,
      currency: "LKR",
      accounts,
      creditCards,
      debts: Array.isArray(raw.debts) ? raw.debts : [],
      categories: {
        expense: Array.isArray(rawCategories.expense) ? rawCategories.expense : [],
        income: Array.isArray(rawCategories.income) ? rawCategories.income : [],
        transactions: Array.isArray(rawCategories.transactions) ? rawCategories.transactions : [],
        bankCashAccounts: Array.isArray(rawCategories.bankCashAccounts) ? rawCategories.bankCashAccounts : accounts.map(a => a.name).filter(Boolean),
        creditCards: Array.isArray(rawCategories.creditCards) ? rawCategories.creditCards : creditCards.map(c => c.name).filter(Boolean)
      },
      transactions: Array.isArray(raw.transactions) ? raw.transactions : []
    };
    base.transactions = base.transactions.map((t, i) => ({
      id: t.id || `seed_${i + 1}`,
      date: t.date || new Date().toISOString().slice(0, 10),
      description: t.description || "Untitled",
      category: t.category || "Other",
      paymentMethod: t.paymentMethod || "Cash",
      type: t.type || "Expense",
      amount: Number(t.amount) || 0,
      transferTo: t.transferTo || "",
      notes: t.notes || ""
    }));
    return base;
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderCurrentView();
  }

  function resetState() {
    localStorage.removeItem(STORAGE_KEY);
    state = normaliseState(clone(SEED));
    renderCurrentView();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function formatMoney(value) {
    return money.format(Number(value) || 0).replace("LKR", "LKR");
  }

  function formatCompact(value) {
    return `LKR ${shortMoney.format(Number(value) || 0)}`;
  }

  function formatDate(value) {
    if (!value) return "—";
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? value : dateFmt.format(d);
  }

  function today() {
    const d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function getAccounts() {
    return state.accounts.filter(a => a.name !== "TOTAL");
  }

  function getCards() {
    return state.creditCards.filter(c => c.name !== "TOTAL");
  }

  function accountSummary(account) {
    const name = account.name;
    const income = sum(state.transactions.filter(t => t.type === "Income" && t.paymentMethod === name));
    const expenses = sum(state.transactions.filter(t => t.type === "Expense" && t.paymentMethod === name));
    const transferOut = sum(state.transactions.filter(t => t.type === "Transfer" && t.paymentMethod === name));
    const transferIn = sum(state.transactions.filter(t => t.type === "Transfer" && t.transferTo === name));
    return {
      income,
      expenses,
      transferOut,
      transferIn,
      current: Number(account.openingBalance) + income - expenses - transferOut + transferIn
    };
  }

  function cardSummary(card) {
    const name = card.name;
    const spending = sum(state.transactions.filter(t => t.type === "Expense" && t.paymentMethod === name));
    const paymentCategory = CARD_PAYMENT_CATEGORY[name];
    const categoryPayments = sum(state.transactions.filter(t => t.type === "Expense" && t.category === paymentCategory));
    const transferPayments = sum(state.transactions.filter(t => t.type === "Transfer" && t.transferTo === name));
    const payments = categoryPayments + transferPayments;
    const outstanding = Math.max(0, Number(card.openingOutstanding) + spending - payments);
    return {
      spending,
      payments,
      outstanding,
      available: Number(card.creditLimit) ? Number(card.creditLimit) - outstanding : 0,
      utilisation: Number(card.creditLimit) ? outstanding / Number(card.creditLimit) : 0
    };
  }

  function sum(items) {
    return items.reduce((total, item) => total + (Number(item.amount) || 0), 0);
  }

  function totals() {
    const income = sum(state.transactions.filter(t => t.type === "Income"));
    const expenses = sum(state.transactions.filter(t => t.type === "Expense"));
    const cards = getCards().reduce((total, card) => total + cardSummary(card).outstanding, 0);
    const pawn = state.debts.reduce((total, debt) => total + Number(debt.principal || 0), 0);
    return { income, expenses, net: income - expenses, cards, pawn };
  }

  function expenseByCategory() {
    const map = {};
    state.transactions
      .filter(t => t.type === "Expense")
      .forEach(t => {
        const key = t.category || "Other";
        map[key] = (map[key] || 0) + Number(t.amount || 0);
      });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }

  function monthlyData() {
    if (!state.transactions.length) return [];
    const dates = state.transactions.map(t => t.date).filter(Boolean).sort();
    const start = new Date(`${dates[0]}T00:00:00`);
    const end = new Date(`${dates[dates.length - 1]}T00:00:00`);
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);
    const result = [];
    while (cursor <= end || result.length < 6) {
      const year = cursor.getFullYear();
      const month = cursor.getMonth();
      const tx = state.transactions.filter(t => {
        const d = new Date(`${t.date}T00:00:00`);
        return d.getFullYear() === year && d.getMonth() === month;
      });
      result.push({
        label: cursor.toLocaleDateString("en-LK", { month: "short", year: "2-digit" }),
        income: sum(tx.filter(t => t.type === "Income")),
        expenses: sum(tx.filter(t => t.type === "Expense")),
        count: tx.length
      });
      cursor.setMonth(cursor.getMonth() + 1);
      if (result.length >= 24) break;
    }
    return result.slice(-12);
  }

  function pageHeader(eyebrow, title) {
    document.getElementById("viewEyebrow").textContent = eyebrow;
    document.getElementById("viewTitle").textContent = title;
  }

  function destroyCharts() {
    Object.values(charts).forEach(chart => chart.destroy());
    charts = {};
  }

  function kpi(label, value, meta, tone = "") {
    return `<div class="kpi"><div class="kpi-label">${escapeHtml(label)}</div><div class="kpi-value ${tone}">${escapeHtml(value)}</div><div class="kpi-meta"><span>${escapeHtml(meta)}</span></div></div>`;
  }

  function renderDashboard() {
    pageHeader("Personal finance", "Dashboard");
    const root = document.getElementById("view-dashboard");
    const t = totals();
    const accounts = getAccounts();
    const accountSummaries = accounts.map(account => ({ ...account, ...accountSummary(account) }));
    const maxAccount = Math.max(...accountSummaries.map(a => Math.max(a.current, 0)), 1);
    const cards = getCards().map(card => ({ ...card, ...cardSummary(card) }));
    const recent = [...state.transactions].sort((a,b) => (b.date || "").localeCompare(a.date || "")).slice(0, 8);

    root.innerHTML = `
      <div class="grid kpi-grid">
        ${kpi("Total income", formatMoney(t.income), "Across all income entries", "positive")}
        ${kpi("Total expenses", formatMoney(t.expenses), "Includes card payments", "negative")}
        ${kpi("Net cash flow", formatMoney(t.net), t.net >= 0 ? "Positive for this data set" : "Expenses exceed income", t.net >= 0 ? "positive" : "negative")}
        ${kpi("Card outstanding", formatMoney(t.cards), "Across tracked credit cards", t.cards > 0 ? "negative" : "positive")}
        ${kpi("Gold pawn balance", formatMoney(t.pawn), "Current tracked principal", t.pawn > 0 ? "negative" : "positive")}
      </div>

      <div class="grid dashboard-grid">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Current balances</div><h2>Bank & cash</h2></div><button class="ghost-btn" data-view-jump="accounts">View all</button></div>
          <div class="balance-list">
            ${accountSummaries.map(a => `
              <div class="balance-row">
                <div class="balance-name">${escapeHtml(a.name)}</div>
                <div class="amount">${formatMoney(a.current)}</div>
                <div class="balance-track"><div class="balance-fill" style="width:${Math.max(0, Math.min(100, (Math.max(a.current,0)/maxAccount)*100))}%"></div></div>
              </div>`).join("")}
          </div>
          <div class="stat-line"><span>Total available cash</span><strong>${formatMoney(accountSummaries.reduce((s,a)=>s+a.current,0))}</strong></div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Credit cards</div><h2>Outstanding</h2></div><button class="ghost-btn" data-view-jump="cards">Manage</button></div>
          <div class="card-grid">
            ${cards.map(c => `
              <div class="card-item">
                <div class="card-top"><div class="card-name">${escapeHtml(c.name)}</div><strong>${formatMoney(c.outstanding)}</strong></div>
                <div class="util-row"><span>${Math.round(c.utilisation*100)}% utilised</span><span>${formatMoney(Math.max(c.available,0))} available</span></div>
                <div class="progress"><span style="width:${Math.max(0,Math.min(100,c.utilisation*100))}%"></span></div>
              </div>`).join("")}
          </div>
        </div>
      </div>

      <div class="grid dashboard-grid">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Spending mix</div><h2>Expense by category</h2></div></div>
          <div class="chart-box"><canvas id="categoryChart"></canvas></div>
        </div>
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Activity</div><h2>Recent transactions</h2></div><button class="ghost-btn" data-view-jump="transactions">View all</button></div>
          <div class="table-wrap"><table><thead><tr><th>Date</th><th>Description</th><th>Type</th><th class="amount">Amount</th></tr></thead><tbody>
            ${recent.length ? recent.map(transactionRowCompact).join("") : `<tr><td colspan="4"><div class="empty">No transactions yet.</div></td></tr>`}
          </tbody></table></div>
        </div>
      </div>`;

    renderCategoryChart();
  }

  function transactionRowCompact(t) {
    const tone = t.type === "Income" ? "badge-income" : t.type === "Transfer" ? "badge-transfer" : "badge-expense";
    const sign = t.type === "Income" ? "+" : t.type === "Expense" ? "−" : "→";
    return `<tr><td>${formatDate(t.date)}</td><td>${escapeHtml(t.description)}</td><td><span class="badge ${tone}">${escapeHtml(t.type)}</span></td><td class="amount ${t.type === "Income" ? "positive" : t.type === "Expense" ? "negative" : "muted"}>${sign} ${formatMoney(t.amount)}</td></tr>`;
  }

  function renderCategoryChart() {
    const el = document.getElementById("categoryChart");
    if (!el || !window.Chart) return;
    const data = expenseByCategory().slice(0,10);
    charts.category = new Chart(el, {
      type: "doughnut",
      data: {
        labels: data.map(d => d[0]),
        datasets: [{ data: data.map(d => d[1]), borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "bottom", labels: { color: "#9aa6b4", boxWidth: 10, font: { size: 10 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${formatMoney(ctx.raw)}` } }
        }
      }
    });
  }

  function renderTransactions() {
    pageHeader("Money movement", "Transactions");
    const root = document.getElementById("view-transactions");
    root.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <div><div class="panel-title">Ledger</div><h2>Every income, expense and transfer</h2></div>
          <div class="toolbar-actions"><button class="primary-btn" id="addTransactionInside">＋ Add transaction</button><button class="secondary-btn" id="exportCsv">Export CSV</button></div>
        </div>
        <div class="filter-bar">
          <input id="txSearch" class="field" placeholder="Search description or notes">
          <select id="txType" class="select compact"><option value="">All types</option><option>Income</option><option>Expense</option><option>Transfer</option></select>
          <select id="txCategory" class="select compact"><option value="">All categories</option>${state.categories.transactions.map(c => `<option>${escapeHtml(c)}</option>`).join("")}</select>
          <select id="txPayment" class="select compact"><option value="">All payment methods</option>${[...new Set([
            ...getAccounts().map(a => a.name),
            ...getCards().map(c => c.name),
            ...(state.categories.bankCashAccounts || []),
            ...(state.categories.creditCards || [])
          ].filter(Boolean))].map(c => `<option>${escapeHtml(c)}</option>`).join("")}</select>
          <input id="txFrom" type="date" class="field compact" title="From date">
          <input id="txTo" type="date" class="field compact" title="To date">
        </div>
        <div id="transactionTable"></div>
      </div>`;
    ["txSearch","txType","txCategory","txPayment","txFrom","txTo"].forEach(id => document.getElementById(id).addEventListener("input", renderTransactionTable));
    document.getElementById("addTransactionInside").addEventListener("click", () => openTransactionModal());
    document.getElementById("exportCsv").addEventListener("click", exportCsv);
    renderTransactionTable();
  }

  function filteredTransactions() {
    const search = (document.getElementById("txSearch")?.value || "").toLowerCase().trim();
    const type = document.getElementById("txType")?.value || "";
    const category = document.getElementById("txCategory")?.value || "";
    const payment = document.getElementById("txPayment")?.value || "";
    const from = document.getElementById("txFrom")?.value || "";
    const to = document.getElementById("txTo")?.value || "";

    return [...state.transactions].filter(t => {
      const haystack = `${t.description} ${t.notes} ${t.category} ${t.paymentMethod} ${t.transferTo}`.toLowerCase();
      if (search && !haystack.includes(search)) return false;
      if (type && t.type !== type) return false;
      if (category && t.category !== category) return false;
      if (payment && t.paymentMethod !== payment) return false;
      if (from && t.date < from) return false;
      if (to && t.date > to) return false;
      return true;
    }).sort((a,b) => (b.date || "").localeCompare(a.date || ""));
  }

  function renderTransactionTable() {
    const root = document.getElementById("transactionTable");
    if (!root) return;
    const rows = filteredTransactions();
    root.innerHTML = `
      <div class="table-wrap"><table>
        <thead><tr><th>Date</th><th>Description</th><th>Category</th><th>Payment</th><th>Type</th><th>Transfer To</th><th class="amount">Amount</th><th></th></tr></thead>
        <tbody>
          ${rows.length ? rows.map(t => `<tr>
            <td>${formatDate(t.date)}</td>
            <td><strong>${escapeHtml(t.description)}</strong>${t.notes ? `<div class="muted">${escapeHtml(t.notes)}</div>` : ""}</td>
            <td>${escapeHtml(t.category || "—")}</td>
            <td>${escapeHtml(t.paymentMethod || "—")}</td>
            <td><span class="badge ${t.type === "Income" ? "badge-income" : t.type === "Transfer" ? "badge-transfer" : "badge-expense"}">${escapeHtml(t.type)}</span></td>
            <td>${escapeHtml(t.transferTo || "—")}</td>
            <td class="amount ${t.type === "Income" ? "positive" : t.type === "Expense" ? "negative" : "muted"}">${t.type === "Income" ? "+" : t.type === "Expense" ? "−" : "→"} ${formatMoney(t.amount)}</td>
            <td><div class="toolbar-actions"><button class="ghost-btn edit-tx" data-id="${t.id}">Edit</button><button class="danger-btn delete-tx" data-id="${t.id}">Delete</button></div></td>
          </tr>`).join("") : `<tr><td colspan="8"><div class="empty">No transactions match the current filters.</div></td></tr>`}
        </tbody>
      </table></div>
      <div class="muted" style="margin-top:12px;font-size:11px">Showing ${rows.length} of ${state.transactions.length} transactions</div>`;
    root.querySelectorAll(".edit-tx").forEach(btn => btn.addEventListener("click", () => openTransactionModal(btn.dataset.id)));
    root.querySelectorAll(".delete-tx").forEach(btn => btn.addEventListener("click", () => deleteTransaction(btn.dataset.id)));
  }

  function renderAccounts() {
    pageHeader("Accounts", "Bank & Cash");
    const root = document.getElementById("view-accounts");
    const accounts = getAccounts().map(a => ({...a,...accountSummary(a)}));
    root.innerHTML = `
      <div class="grid three-col">
        ${accounts.map(a => `
          <div class="panel">
            <div class="panel-title">Account</div><h2 style="margin-top:6px">${escapeHtml(a.name)}</h2>
            <div class="big-number" style="margin-top:18px">${formatMoney(a.current)}</div>
            <div class="stat-line"><span>Opening</span><span>${formatMoney(a.openingBalance)}</span></div>
            <div class="stat-line"><span>Income</span><span class="positive">+${formatMoney(a.income)}</span></div>
            <div class="stat-line"><span>Expenses</span><span class="negative">−${formatMoney(a.expenses)}</span></div>
            <div class="stat-line"><span>Transfers out</span><span>−${formatMoney(a.transferOut)}</span></div>
            <div class="stat-line"><span>Transfers in</span><span>+${formatMoney(a.transferIn)}</span></div>
          </div>`).join("")}
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><div><div class="panel-title">Summary</div><h2>All accounts</h2></div></div>
        <div class="table-wrap"><table><thead><tr><th>Account</th><th class="amount">Opening</th><th class="amount">Income</th><th class="amount">Expenses</th><th class="amount">Current</th></tr></thead><tbody>
        ${accounts.map(a => `<tr><td>${escapeHtml(a.name)}</td><td class="amount">${formatMoney(a.openingBalance)}</td><td class="amount positive">${formatMoney(a.income)}</td><td class="amount negative">${formatMoney(a.expenses)}</td><td class="amount"><strong>${formatMoney(a.current)}</strong></td></tr>`).join("")}
        <tr><td><strong>TOTAL</strong></td><td class="amount"><strong>${formatMoney(sum(accounts.map(a=>({amount:a.openingBalance})) ))}</strong></td><td class="amount positive"><strong>${formatMoney(sum(accounts.map(a=>({amount:a.income})) ))}</strong></td><td class="amount negative"><strong>${formatMoney(sum(accounts.map(a=>({amount:a.expenses})) ))}</strong></td><td class="amount"><strong>${formatMoney(sum(accounts.map(a=>({amount:a.current})) ))}</strong></td></tr>
        </tbody></table></div>
      </div>`;
  }

  function renderCards() {
    pageHeader("Credit management", "Credit Cards");
    const root = document.getElementById("view-cards");
    const cards = getCards().map(c => ({...c,...cardSummary(c)}));
    const totalsCard = {
      openingOutstanding: sum(cards.map(c => ({amount:c.openingOutstanding}))),
      spending: sum(cards.map(c => ({amount:c.spending}))),
      payments: sum(cards.map(c => ({amount:c.payments}))),
      outstanding: sum(cards.map(c => ({amount:c.outstanding}))),
      creditLimit: sum(cards.map(c => ({amount:c.creditLimit})))
    };
    root.innerHTML = `
      <div class="grid three-col">
        ${cards.map(c => `
          <div class="panel">
            <div class="panel-title">Credit card</div><h2 style="margin-top:6px">${escapeHtml(c.name)}</h2>
            <div class="big-number" style="margin-top:18px">${formatMoney(c.outstanding)}</div>
            <div class="util-row"><span>Utilisation</span><strong>${Math.round(c.utilisation*100)}%</strong></div>
            <div class="progress"><span style="width:${Math.min(100,c.utilisation*100)}%"></span></div>
            <div class="stat-line"><span>Credit limit</span><span>${formatMoney(c.creditLimit)}</span></div>
            <div class="stat-line"><span>Available credit</span><span class="positive">${formatMoney(c.available)}</span></div>
            <div class="stat-line"><span>New spending</span><span>${formatMoney(c.spending)}</span></div>
            <div class="stat-line"><span>Payments</span><span class="positive">${formatMoney(c.payments)}</span></div>
          </div>`).join("")}
      </div>
      <div class="panel" style="margin-top:16px">
        <div class="panel-head"><div><div class="panel-title">Centre summary</div><h2>Portfolio</h2></div></div>
        <div class="grid two-col">
          <div class="note-box">Current outstanding <strong>${formatMoney(totalsCard.outstanding)}</strong></div>
          <div class="note-box">Available credit <strong>${formatMoney(Math.max(0, totalsCard.creditLimit - totalsCard.outstanding))}</strong></div>
        </div>
      </div>`;
  }

  function renderDebts() {
    pageHeader("Liabilities", "Debts & Pawn");
    const root = document.getElementById("view-debts");
    root.innerHTML = `
      <div class="grid two-col">
        ${state.debts.map((d, idx) => {
          const interest = Number(d.principal || 0) * Number(d.monthlyInterestRate || 0);
          const principalReduction = Math.max(0, Number(d.plannedMonthlyPayment || 0) - interest);
          return `<div class="panel">
            <div class="panel-title">Debt item</div><h2 style="margin-top:6px">${escapeHtml(d.item)}</h2>
            <div class="big-number" style="margin-top:18px">${formatMoney(d.principal)}</div>
            <div class="stat-line"><span>Monthly interest</span><span>${(Number(d.monthlyInterestRate)*100).toFixed(2)}%</span></div>
            <div class="stat-line"><span>Estimated interest</span><span class="negative">${formatMoney(interest)}</span></div>
            <div class="stat-line"><span>Planned payment</span><span>${formatMoney(d.plannedMonthlyPayment)}</span></div>
            <div class="stat-line"><span>Initial principal reduction</span><span class="positive">${formatMoney(principalReduction)}</span></div>
            <div class="note-box" style="margin-top:14px">${escapeHtml(d.notes || "Use actual lender statements to update the principal.")}</div>
            <div style="margin-top:14px"><button class="secondary-btn edit-debt" data-index="${idx}">Edit debt</button></div>
          </div>`;
        }).join("") || `<div class="panel"><div class="empty">No debts recorded.</div></div>`}
      </div>`;
    root.querySelectorAll(".edit-debt").forEach(btn => btn.addEventListener("click", () => openDebtModal(Number(btn.dataset.index))));
  }

  function renderAnalytics() {
    pageHeader("Trends", "Analytics");
    const root = document.getElementById("view-analytics");
    root.innerHTML = `
      <div class="grid dashboard-grid">
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Monthly trend</div><h2>Income vs expenses</h2></div></div><div class="chart-box"><canvas id="monthlyChart"></canvas></div></div>
        <div class="panel"><div class="panel-head"><div><div class="panel-title">Categories</div><h2>Expense breakdown</h2></div></div><div id="categoryBreakdown"></div></div>
      </div>
      <div class="panel" style="margin-top:16px"><div class="panel-head"><div><div class="panel-title">Monthly table</div><h2>Cash flow history</h2></div></div><div class="table-wrap"><table><thead><tr><th>Month</th><th class="amount">Income</th><th class="amount">Expenses</th><th class="amount">Net</th><th class="amount">Transactions</th></tr></thead><tbody id="monthlyTableBody"></tbody></table></div></div>`;
    renderAnalyticsCharts();
  }

  function renderAnalyticsCharts() {
    const months = monthlyData();
    const labels = months.map(m=>m.label);
    const mc = document.getElementById("monthlyChart");
    if (mc && window.Chart) {
      charts.monthly = new Chart(mc, {
        type:"bar",
        data:{labels,datasets:[
          {label:"Income",data:months.map(m=>m.income),borderRadius:7},
          {label:"Expenses",data:months.map(m=>m.expenses),borderRadius:7}
        ]},
        options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{labels:{color:"#9aa6b4",font:{size:10}}}},scales:{x:{ticks:{color:"#7f8b98"},grid:{color:"rgba(255,255,255,.04)"}},y:{ticks:{color:"#7f8b98",callback:v=>formatCompact(v)},grid:{color:"rgba(255,255,255,.05)"}}}}
      });
    }
    const cat = document.getElementById("categoryBreakdown");
    const data = expenseByCategory();
    const total = sum(data.map(d=>({amount:d[1]})));
    if (cat) cat.innerHTML = data.map(([name,value]) => `<div class="stat-line"><span>${escapeHtml(name)}</span><strong>${formatMoney(value)} <span class="muted">(${total ? Math.round(value/total*100) : 0}%)</span></strong></div>`).join("") || `<div class="empty">No expenses yet.</div>`;
    const body=document.getElementById("monthlyTableBody");
    if(body) body.innerHTML=months.map(m=>`<tr><td>${escapeHtml(m.label)}</td><td class="amount positive">${formatMoney(m.income)}</td><td class="amount negative">${formatMoney(m.expenses)}</td><td class="amount ${m.income-m.expenses>=0?"positive":"negative"}">${formatMoney(m.income-m.expenses)}</td><td class="amount">${m.count}</td></tr>`).join("");
  }

  function renderSettings() {
    pageHeader("Configuration", "Settings");
    const root = document.getElementById("view-settings");
    root.innerHTML = `
      <div class="settings-grid">
        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Backup</div><h2>Protect your data</h2></div></div>
          <div class="toolbar-actions"><button class="primary-btn" id="exportJson">Export JSON Backup</button><button class="secondary-btn" id="importJson">Import JSON Backup</button><button class="danger-btn" id="resetData">Reset to spreadsheet data</button></div>
          <div class="note-box" style="margin-top:14px">The default site stores data in this browser. Export a JSON backup before changing devices or clearing browser storage.</div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Accounts</div><h2>Opening balances</h2></div></div>
          <div class="table-wrap"><table><thead><tr><th>Account</th><th class="amount">Opening balance</th></tr></thead><tbody>${getAccounts().map((a,i)=>`<tr><td>${escapeHtml(a.name)}</td><td class="amount"><input class="field setting-account" data-index="${i}" type="number" step="0.01" value="${Number(a.openingBalance)}"></td></tr>`).join("")}</tbody></table></div>
          <div style="margin-top:12px"><button class="primary-btn" id="saveAccounts">Save account settings</button></div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Credit cards</div><h2>Opening debt & limits</h2></div></div>
          <div class="table-wrap"><table><thead><tr><th>Card</th><th class="amount">Opening outstanding</th><th class="amount">Credit limit</th></tr></thead><tbody>${getCards().map((c,i)=>`<tr><td>${escapeHtml(c.name)}</td><td class="amount"><input class="field setting-card-open" data-index="${i}" type="number" step="0.01" value="${Number(c.openingOutstanding)}"></td><td class="amount"><input class="field setting-card-limit" data-index="${i}" type="number" step="0.01" value="${Number(c.creditLimit)}"></td></tr>`).join("")}</tbody></table></div>
          <div style="margin-top:12px"><button class="primary-btn" id="saveCards">Save card settings</button></div>
        </div>

        <div class="panel">
          <div class="panel-head"><div><div class="panel-title">Supabase</div><h2>Optional future sync</h2></div></div>
          <div class="note-box">This GitHub Pages version is intentionally backend-free. The included config.example.js is a placeholder for adding Supabase authentication and cloud sync later. Never put a Supabase service role key in browser code.</div>
        </div>
      </div>`;
    document.getElementById("exportJson").addEventListener("click", exportJson);
    document.getElementById("importJson").addEventListener("click", () => document.getElementById("importInput").click());
    document.getElementById("resetData").addEventListener("click", () => {
      if (confirm("Reset all current browser data back to the spreadsheet seed data? This removes any edits made in this browser.")) resetState();
    });
    document.getElementById("saveAccounts").addEventListener("click", () => {
      getAccounts().forEach((a,i) => {
        const input=document.querySelector(`.setting-account[data-index="${i}"]`);
        a.openingBalance=Number(input.value)||0;
      });
      saveState();
      alert("Account settings saved.");
    });
    document.getElementById("saveCards").addEventListener("click", () => {
      getCards().forEach((c,i) => {
        const open=document.querySelector(`.setting-card-open[data-index="${i}"]`);
        const limit=document.querySelector(`.setting-card-limit[data-index="${i}"]`);
        c.openingOutstanding=Number(open.value)||0;
        c.creditLimit=Number(limit.value)||0;
      });
      saveState();
      alert("Card settings saved.");
    });
  }

  function renderCurrentView() {
    destroyCharts();
    ["dashboard","transactions","accounts","cards","debts","analytics","settings"].forEach(view => {
      const el=document.getElementById(`view-${view}`);
      if(el) el.classList.toggle("active-view",view===currentView);
    });
    switch(currentView){
      case "transactions": renderTransactions(); break;
      case "accounts": renderAccounts(); break;
      case "cards": renderCards(); break;
      case "debts": renderDebts(); break;
      case "analytics": renderAnalytics(); break;
      case "settings": renderSettings(); break;
      default: renderDashboard();
    }
  }

  function showView(view) {
    currentView = view;
    document.querySelectorAll(".nav-item").forEach(btn => btn.classList.toggle("active", btn.dataset.view === view));
    renderCurrentView();
    window.scrollTo({top:0,behavior:"smooth"});
  }

  function categoryOptions(type, current) {
    const source = type === "Income" ? state.categories.income : state.categories.transactions;
    const values = [...new Set(source.concat(current ? [current] : []))].filter(Boolean);
    return values.map(c=>`<option ${c===current?"selected":""}>${escapeHtml(c)}</option>`).join("");
  }

  function paymentOptions(current) {
    const values = [...new Set([
      ...getAccounts().map(a => a.name),
      ...getCards().map(c => c.name),
      ...(state.categories.bankCashAccounts || []),
      ...(state.categories.creditCards || [])
    ].filter(Boolean))];
    return `<option value="">Select payment method</option>` + values.map(p=>`<option ${p===current?"selected":""}>${escapeHtml(p)}</option>`).join("");
  }

  function transferOptions(current) {
    const values = [...new Set([
      ...getAccounts().map(a => a.name),
      ...getCards().map(c => c.name),
      ...(state.categories.bankCashAccounts || []),
      ...(state.categories.creditCards || [])
    ].filter(Boolean))];
    return `<option value="">Select destination</option>` + values.map(p=>`<option ${p===current?"selected":""}>${escapeHtml(p)}</option>`).join("");
  }

  function openTransactionModal(id = null) {
    editingId = id;
    const existing = id ? state.transactions.find(t=>t.id===id) : null;
    const tx = existing || { date:today(), description:"", category:"Food", paymentMethod:"Commercial Bank", type:"Expense", amount:"", transferTo:"", notes:"" };
    const root=document.getElementById("modalRoot");
    root.innerHTML=`<div class="modal-backdrop" id="transactionBackdrop"><div class="modal" role="dialog" aria-modal="true" aria-labelledby="transactionModalTitle">
      <div class="modal-head"><div><div class="panel-title">Transaction</div><h2 id="transactionModalTitle">${existing?"Edit transaction":"Add transaction"}</h2></div><button class="ghost-btn" id="closeModal">✕</button></div>
      <div class="modal-body"><form id="transactionForm"><div class="form-grid">
        <div class="form-group"><label>Date</label><input id="txDateInput" class="field" type="date" value="${escapeHtml(tx.date)}" required></div>
        <div class="form-group"><label>Type</label><select id="txTypeInput" class="select"><option ${tx.type==="Expense"?"selected":""}>Expense</option><option ${tx.type==="Income"?"selected":""}>Income</option><option ${tx.type==="Transfer"?"selected":""}>Transfer</option></select></div>
        <div class="form-group full-span"><label>Description</label><input id="txDescInput" class="field" value="${escapeHtml(tx.description)}" placeholder="e.g. Lunch at Neil Bakery" required></div>
        <div class="form-group"><label>Category</label><select id="txCategoryInput" class="select"></select></div>
        <div class="form-group"><label>Payment method</label><select id="txPaymentInput" class="select">${paymentOptions(tx.paymentMethod)}</select></div>
        <div class="form-group"><label>Amount (LKR)</label><input id="txAmountInput" class="field" type="number" step="0.01" min="0" value="${tx.amount}" required></div>
        <div class="form-group"><label>Transfer to</label><select id="txTransferInput" class="select">${transferOptions(tx.transferTo)}</select></div>
        <div class="form-group full-span"><label>Notes</label><textarea id="txNotesInput" placeholder="Optional note">${escapeHtml(tx.notes)}</textarea></div>
      </div><div class="note-box" style="margin-top:15px">For a credit card payment you can either use the transaction type <strong>Transfer</strong> with the bank account as the payment method and the credit card as the destination or use the spreadsheet-style payment category.</div>
      <div class="modal-actions"><button type="button" class="secondary-btn" id="cancelModal">Cancel</button><button type="submit" class="primary-btn">Save transaction</button></div>
      </form></div></div></div>`;
    document.getElementById("closeModal").addEventListener("click",closeModal);
    document.getElementById("cancelModal").addEventListener("click",closeModal);
    document.getElementById("transactionBackdrop").addEventListener("click", e=>{if(e.target.id==="transactionBackdrop")closeModal();});
    const typeEl=document.getElementById("txTypeInput");
    const categoryEl=document.getElementById("txCategoryInput");
    const transferEl=document.getElementById("txTransferInput");
    function syncFields(){
      categoryEl.innerHTML=categoryOptions(typeEl.value,tx.category);
      transferEl.disabled=typeEl.value!=="Transfer";
      if(typeEl.value!=="Transfer") transferEl.value="";
    }
    typeEl.addEventListener("change",syncFields);
    syncFields();
    document.getElementById("transactionForm").addEventListener("submit",e=>{
      e.preventDefault();
      const form={
        date:document.getElementById("txDateInput").value,
        type:typeEl.value,
        description:document.getElementById("txDescInput").value.trim(),
        category:categoryEl.value,
        paymentMethod:document.getElementById("txPaymentInput").value,
        amount:Number(document.getElementById("txAmountInput").value)||0,
        transferTo:typeEl.value==="Transfer"?transferEl.value:"",
        notes:document.getElementById("txNotesInput").value.trim()
      };
      if(!form.description || form.amount<=0){alert("Please enter a description and an amount greater than zero.");return;}
      if(form.type==="Transfer" && !form.transferTo){alert("Please choose a transfer destination.");return;}
      if(existing) Object.assign(existing,form); else state.transactions.push({id:uid(),...form});
      closeModal();
      saveState();
    });
    document.getElementById("txDescInput").focus();
  }

  function closeModal(){document.getElementById("modalRoot").innerHTML="";editingId=null;}

  function deleteTransaction(id){
    const tx=state.transactions.find(t=>t.id===id);
    if(!tx) return;
    if(confirm(`Delete "${tx.description}" for ${formatMoney(tx.amount)}?`)){
      state.transactions=state.transactions.filter(t=>t.id!==id);
      saveState();
    }
  }

  function openDebtModal(index){
    const d=state.debts[index];
    const root=document.getElementById("modalRoot");
    root.innerHTML=`<div class="modal-backdrop" id="debtBackdrop"><div class="modal" role="dialog" aria-modal="true">
      <div class="modal-head"><div><div class="panel-title">Debt</div><h2>Edit debt</h2></div><button class="ghost-btn" id="closeDebt">✕</button></div>
      <div class="modal-body"><form id="debtForm"><div class="form-grid">
        <div class="form-group full-span"><label>Item</label><input id="debtItem" class="field" value="${escapeHtml(d.item)}" required></div>
        <div class="form-group"><label>Principal</label><input id="debtPrincipal" class="field" type="number" step="0.01" value="${d.principal}"></div>
        <div class="form-group"><label>Monthly interest rate (%)</label><input id="debtRate" class="field" type="number" step="0.01" value="${Number(d.monthlyInterestRate)*100}"></div>
        <div class="form-group"><label>Planned monthly payment</label><input id="debtPayment" class="field" type="number" step="0.01" value="${d.plannedMonthlyPayment}"></div>
        <div class="form-group full-span"><label>Notes</label><textarea id="debtNotes">${escapeHtml(d.notes||"")}</textarea></div>
      </div><div class="modal-actions"><button type="button" class="secondary-btn" id="cancelDebt">Cancel</button><button type="submit" class="primary-btn">Save debt</button></div></form></div>
    </div></div>`;
    const close=()=>root.innerHTML="";
    document.getElementById("closeDebt").addEventListener("click",close);
    document.getElementById("cancelDebt").addEventListener("click",close);
    document.getElementById("debtBackdrop").addEventListener("click",e=>{if(e.target.id==="debtBackdrop")close();});
    document.getElementById("debtForm").addEventListener("submit",e=>{e.preventDefault();d.item=document.getElementById("debtItem").value.trim();d.principal=Number(document.getElementById("debtPrincipal").value)||0;d.monthlyInterestRate=(Number(document.getElementById("debtRate").value)||0)/100;d.plannedMonthlyPayment=Number(document.getElementById("debtPayment").value)||0;d.notes=document.getElementById("debtNotes").value.trim();close();saveState();});
  }

  function exportJson(){
    const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
    downloadBlob(blob,`dasun-expense-tracker-${today()}.json`);
  }

  function exportCsv(){
    const headers=["Date","Description","Category","Payment Method","Type","Amount (LKR)","Transfer To","Notes"];
    const rows=state.transactions.map(t=>[t.date,t.description,t.category,t.paymentMethod,t.type,t.amount,t.transferTo,t.notes]);
    const csv=[headers,...rows].map(row=>row.map(csvCell).join(",")).join("\n");
    const blob=new Blob(["\ufeff"+csv],{type:"text/csv;charset=utf-8"});
    downloadBlob(blob,`dasun-transactions-${today()}.csv`);
  }

  function csvCell(v){return `"${String(v??"").replaceAll('"','""')}"`;}
  function downloadBlob(blob,name){const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  document.getElementById("importInput").addEventListener("change", async e=>{
    const file=e.target.files?.[0];
    if(!file)return;
    try{
      const imported=JSON.parse(await file.text());
      if(!imported.transactions || !imported.accounts || !imported.creditCards) throw new Error("This does not look like an Expense Tracker backup.");
      state=normaliseState(imported);saveState();alert("Backup imported successfully.");
    }catch(error){alert(`Import failed: ${error.message}`);}finally{e.target.value="";}
  });

  const mobileMenu = document.getElementById("mobileMenu");
  const mobileBackdrop = document.getElementById("mobileBackdrop");

  function setMobileMenu(open) {
    document.body.classList.toggle("mobile-nav-open", open);
    if (mobileMenu) {
      mobileMenu.setAttribute("aria-expanded", String(open));
      mobileMenu.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
      mobileMenu.textContent = open ? "✕" : "☰";
    }
    if (mobileBackdrop) mobileBackdrop.setAttribute("aria-hidden", String(!open));
  }

  document.querySelectorAll(".nav-item").forEach(btn=>btn.addEventListener("click",()=>{
    showView(btn.dataset.view);
    setMobileMenu(false);
  }));
  if (mobileMenu) mobileMenu.addEventListener("click",()=>setMobileMenu(!document.body.classList.contains("mobile-nav-open")));
  if (mobileBackdrop) mobileBackdrop.addEventListener("click",()=>setMobileMenu(false));
  window.addEventListener("resize",()=>{ if (window.innerWidth > 900) setMobileMenu(false); });
  document.addEventListener("keydown",e=>{ if(e.key === "Escape") setMobileMenu(false); });
  document.getElementById("quickAdd").addEventListener("click",()=>openTransactionModal());
  document.getElementById("quickAddSide").addEventListener("click",()=>{setMobileMenu(false);openTransactionModal();});
  document.addEventListener("click",e=>{const jump=e.target.closest("[data-view-jump]");if(jump){showView(jump.dataset.viewJump);setMobileMenu(false);}});

  renderCurrentView();
})();
