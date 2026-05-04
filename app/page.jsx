"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import {
  BarChart3,
  Building2,
  Check,
  CircleDollarSign,
  Download,
  FileText,
  Image,
  MessageCircle,
  Plus,
  Receipt,
  RotateCcw,
  Send,
  Settings,
  Search,
  Upload,
  WalletCards,
  X,
} from "lucide-react";
import { plans, isPaidPlan } from "../lib/plans";
import { appPayload, isSupabaseConfigured, supabase } from "../lib/supabase";
import { Toast } from "../components/Toast";

const currency = new Intl.NumberFormat("en-KE", {
  style: "currency",
  currency: "KES",
  maximumFractionDigits: 0,
});

const initialInvoices = [
  {
    id: 1,
    number: "INV-2026-001",
    client: "Amani Foods",
    item: "Website Design",
    items: [{ name: "Website Design", quantity: 1, price: 65000 }],
    amount: 65000,
    dueDate: "2026-05-02",
    date: "2026-04-30",
    status: "Pending",
  },
  {
    id: 2,
    number: "INV-2026-002",
    client: "Nairobi Print Hub",
    item: "Brand refresh",
    items: [{ name: "Brand refresh", quantity: 1, price: 42000 }],
    amount: 42000,
    dueDate: "2026-04-21",
    date: "2026-04-12",
    status: "Overdue",
  },
  {
    id: 3,
    number: "INV-2026-003",
    client: "Maua Salon",
    item: "Social media package",
    items: [{ name: "Social media package", quantity: 1, price: 18000 }],
    amount: 18000,
    dueDate: "2026-04-27",
    date: "2026-04-18",
    status: "Paid",
  },
];

const initialExpenses = [
  { id: 1, title: "Office Rent", amount: 22000, category: "Rent", date: "2026-04-05", receiptName: "" },
  { id: 2, title: "Delivery Fuel", amount: 3500, category: "Transport", date: "2026-04-17", receiptName: "" },
  { id: 3, title: "Packaging Stock", amount: 8400, category: "Supplies", date: "2026-04-20", receiptName: "" },
];

const initialCustomers = [
  { id: 1, name: "Amani Foods", phone: "+254 700 111 222" },
  { id: 2, name: "Nairobi Print Hub", phone: "+254 700 333 444" },
  { id: 3, name: "Maua Salon", phone: "+254 700 555 666" },
];

const categories = ["Rent", "Supplies", "Transport", "Other"];
const tabs = [
  { id: "invoices", label: "Invoices", icon: FileText },
  { id: "expenses", label: "Expenses", icon: WalletCards },
  { id: "reports", label: "Reports", icon: BarChart3 },
  { id: "settings", label: "Settings", icon: Settings },
];

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function nextInvoiceNumber(count) {
  return `INV-2026-${String(count + 1).padStart(3, "0")}`;
}

function monthLabel(month) {
  return new Date(`${month}-01T00:00:00`).toLocaleDateString("en-KE", {
    month: "long",
    year: "numeric",
  });
}

function readStored(key, fallback) {
  if (typeof window === "undefined") return fallback;
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function StatusPill({ status }) {
  return <span className={`status ${status.toLowerCase()}`}>{status}</span>;
}

function monthFromDate(date) {
  return date.slice(0, 7);
}

function daysUntil(date) {
  const due = new Date(`${date}T00:00:00`);
  const today = new Date(`${todayIso()}T00:00:00`);
  return Math.ceil((due - today) / 86400000);
}

function invoiceItems(invoice) {
  if (Array.isArray(invoice.items) && invoice.items.length > 0) {
    return invoice.items;
  }
  return [{ name: invoice.item || "Item", quantity: 1, price: Number(invoice.amount || 0) }];
}

function lineTotal(item) {
  return Number(item.quantity || 0) * Number(item.price || 0);
}

function invoiceSummary(invoice) {
  const items = invoiceItems(invoice);
  if (items.length === 1) return items[0].name;
  return `${items[0].name} + ${items.length - 1} more`;
}

function currentMonthInvoices(invoicesList) {
  return invoicesList.filter((invoice) => monthFromDate(invoice.date) === todayIso().slice(0, 7));
}

function currentMonthExpenses(expensesList) {
  return expensesList.filter((expense) => monthFromDate(expense.date) === todayIso().slice(0, 7));
}

function canAddInvoice(planKey, invoicesList) {
  const limit = plans[planKey]?.limits?.invoicesPerMonth;
  if (limit === null) return true;
  return currentMonthInvoices(invoicesList).length < limit;
}

function canAddExpense(planKey, expensesList) {
  const limit = plans[planKey]?.limits?.expensesPerMonth;
  if (limit === null) return true;
  return currentMonthExpenses(expensesList).length < limit;
}

function canAddCustomer(planKey, customersList) {
  const limit = plans[planKey]?.limits?.maxCustomers;
  if (limit === null) return true;
  return customersList.length < limit;
}

function getUsagePercent(current, limit) {
  if (!limit) return 0;
  return Math.round((current / limit) * 100);
}

function QuickModal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label={title}>
      <div className="modal">
        <div className="modal-top">
          <h2>{title}</h2>
          <button className="icon-button" onClick={onClose} aria-label="Close">
            <X size={21} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export default function Home() {
  const [activeTab, setActiveTab] = useState("invoices");
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authInlineOpen, setAuthInlineOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(!isSupabaseConfigured);
  const [syncStatus, setSyncStatus] = useState(isSupabaseConfigured ? "Cloud ready" : "Local mode");
  const [toasts, setToasts] = useState([]);
  const [loadingStates, setLoadingStates] = useState({});
  const [invoices, setInvoices] = useState(initialInvoices);
  const [expenses, setExpenses] = useState(initialExpenses);
  const [customers, setCustomers] = useState(initialCustomers);
  const [generatedDocs, setGeneratedDocs] = useState([]);
  const [invoiceLineItems, setInvoiceLineItems] = useState([{ name: "", quantity: 1, price: "" }]);
  const [invoiceSearch, setInvoiceSearch] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");
  const [reportMonth, setReportMonth] = useState(todayIso().slice(0, 7));
  const [taxSettings, setTaxSettings] = useState({
    vatRegistered: false,
    vatRate: 16,
    incomeTaxRate: 30,
  });
  const [business, setBusiness] = useState({
    name: "Safari Digital Studio",
    phone: "+254 712 345 678",
    mpesa: "Till 712345",
    logoName: "",
    logoData: "",
  });
  const [subscription, setSubscription] = useState({
    plan: "free",
    status: "active",
    currentPeriodEnd: null,
  });
  const [latestPayment, setLatestPayment] = useState(null);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState(null);
  const [paymentPhone, setPaymentPhone] = useState("");
  const subscriptionChannelRef = useRef(null);
  const appDataChannelRef = useRef(null);
  const paymentChannelRef = useRef(null);

  function showToast(message, type = "info", duration = 3000) {
    const id = Date.now();
    setToasts((prev) => [...prev, { id, message, type }]);
    if (duration > 0) {
      setTimeout(() => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
      }, duration);
    }
    return id;
  }

  function closeToast(id) {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  function normalizeSubscription(payload) {
    return {
      plan: payload?.plan || "free",
      status: payload?.status || "active",
      currentPeriodEnd: payload?.currentPeriodEnd || payload?.current_period_end || null,
    };
  }

  function normalizePhone(value) {
    const digits = String(value || "").replace(/\D/g, "");
    if (digits.startsWith("254") && digits.length === 12) return digits;
    if (digits.startsWith("0") && digits.length === 10) return `254${digits.slice(1)}`;
    if ((digits.startsWith("7") || digits.startsWith("1")) && digits.length === 9) return `254${digits}`;
    return value;
  }

  function paymentStatusCopy(status) {
    switch (status) {
      case "paid":
        return "Payment confirmed";
      case "failed":
        return "Payment failed";
      case "processing":
        return "Waiting for M-Pesa PIN";
      case "pending":
        return "Preparing payment";
      default:
        return "No payment in progress";
    }
  }

  useEffect(() => {
    setInvoices(readStored("taxapp.invoices", initialInvoices));
    setExpenses(readStored("taxapp.expenses", initialExpenses));
    setCustomers(readStored("taxapp.customers", initialCustomers));
    setGeneratedDocs(readStored("taxapp.generatedDocs", []));
    setBusiness(readStored("taxapp.business", business));
    setTaxSettings(readStored("taxapp.taxSettings", taxSettings));
    setSubscription(readStored("taxapp.subscription", subscription));
    setOnboardingOpen(!window.localStorage.getItem("taxapp.onboarded"));
    if (!supabase) {
      setAuthChecked(true);
      return;
    }
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user || null);
      if (data.user) loadCloudData(data.user.id);
      setAuthChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      if (session?.user) loadCloudData(session.user.id);
      setAuthChecked(true);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !user?.id) {
      if (subscriptionChannelRef.current) {
        supabase?.removeChannel(subscriptionChannelRef.current);
        subscriptionChannelRef.current = null;
      }
      if (appDataChannelRef.current) {
        supabase?.removeChannel(appDataChannelRef.current);
        appDataChannelRef.current = null;
      }
      if (paymentChannelRef.current) {
        supabase?.removeChannel(paymentChannelRef.current);
        paymentChannelRef.current = null;
      }
      return;
    }

    setSyncStatus("Live sync on");

    const subscriptionChannel = supabase
      .channel(`subscription-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscriptions",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!payload.new) return;
          setSubscription(
            normalizeSubscription({
              plan: payload.new.plan,
              status: payload.new.status,
              current_period_end: payload.new.current_period_end,
            })
          );
          showToast("Subscription updated", "success", 2000);
        }
      )
      .subscribe();

    const appDataChannel = supabase
      .channel(`app-data-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "app_data",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const nextPayload = payload.new?.payload;
          if (!nextPayload) return;
          if (nextPayload.business) setBusiness(nextPayload.business);
          if (nextPayload.taxSettings) setTaxSettings(nextPayload.taxSettings);
          if (nextPayload.subscription) setSubscription(normalizeSubscription(nextPayload.subscription));
          if (Array.isArray(nextPayload.customers)) setCustomers(nextPayload.customers);
          if (Array.isArray(nextPayload.invoices)) setInvoices(nextPayload.invoices);
          if (Array.isArray(nextPayload.expenses)) setExpenses(nextPayload.expenses);
        }
      )
      .subscribe();

    const paymentChannel = supabase
      .channel(`subscription-payments-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "subscription_payments",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (!payload.new) return;
          setLatestPayment(payload.new);
          if (payload.new.status === "paid") {
            setPaymentOpen(false);
            setSelectedPlan(null);
            showToast("Payment confirmed. Plan activated.", "success", 3000);
          } else if (payload.new.status === "failed") {
            showToast(payload.new.result_desc || "Payment failed.", "error");
          }
        }
      )
      .subscribe();

    subscriptionChannelRef.current = subscriptionChannel;
    appDataChannelRef.current = appDataChannel;
    paymentChannelRef.current = paymentChannel;

    return () => {
      supabase.removeChannel(subscriptionChannel);
      supabase.removeChannel(appDataChannel);
      supabase.removeChannel(paymentChannel);
      subscriptionChannelRef.current = null;
      appDataChannelRef.current = null;
      paymentChannelRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    window.localStorage.setItem("taxapp.invoices", JSON.stringify(invoices));
  }, [invoices]);

  useEffect(() => {
    window.localStorage.setItem("taxapp.expenses", JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    window.localStorage.setItem("taxapp.customers", JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    window.localStorage.setItem("taxapp.generatedDocs", JSON.stringify(generatedDocs));
  }, [generatedDocs]);

  useEffect(() => {
    window.localStorage.setItem("taxapp.business", JSON.stringify(business));
  }, [business]);

  useEffect(() => {
    window.localStorage.setItem("taxapp.taxSettings", JSON.stringify(taxSettings));
  }, [taxSettings]);

  useEffect(() => {
    window.localStorage.setItem("taxapp.subscription", JSON.stringify(subscription));
  }, [subscription]);

  useEffect(() => {
    if (!paymentPhone && business.phone) {
      setPaymentPhone(normalizePhone(business.phone));
    }
  }, [business.phone, paymentPhone]);

  const totals = useMemo(() => {
    const monthInvoices = invoices.filter((invoice) => monthFromDate(invoice.date) === reportMonth);
    const monthExpenses = expenses.filter((expense) => monthFromDate(expense.date) === reportMonth);
    const income = monthInvoices.reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const paidIncome = monthInvoices
      .filter((invoice) => invoice.status === "Paid")
      .reduce((sum, invoice) => sum + Number(invoice.amount || 0), 0);
    const expenseTotal = monthExpenses.reduce((sum, expense) => sum + Number(expense.amount || 0), 0);
    const profit = paidIncome - expenseTotal;
    return {
      income,
      paidIncome,
      expenseTotal,
      profit,
      tax: Math.max(profit * (taxSettings.incomeTaxRate / 100), 0),
      vat: taxSettings.vatRegistered ? income * (taxSettings.vatRate / 100) : 0,
    };
  }, [invoices, expenses, reportMonth, taxSettings]);

  const filteredInvoices = useMemo(() => {
    const query = invoiceSearch.trim().toLowerCase();
    if (!query) return invoices;
    return invoices.filter((invoice) =>
      [invoice.client, invoice.item, invoice.number, invoice.status, ...invoiceItems(invoice).map((item) => item.name)].some((value) =>
        value.toLowerCase().includes(query)
      )
    );
  }, [invoices, invoiceSearch]);

  const filteredExpenses = useMemo(() => {
    const query = expenseSearch.trim().toLowerCase();
    if (!query) return expenses;
    return expenses.filter((expense) =>
      [expense.title, expense.category, expense.date].some((value) => value.toLowerCase().includes(query))
    );
  }, [expenses, expenseSearch]);

  const invoiceDraftTotal = useMemo(
    () => invoiceLineItems.reduce((sum, item) => sum + lineTotal(item), 0),
    [invoiceLineItems]
  );

  function saveInvoice(event) {
    event.preventDefault();
    const shouldSend = event.nativeEvent.submitter?.value === "send";
    const shouldDownload = event.nativeEvent.submitter?.value === "download";
    const form = new FormData(event.currentTarget);
    const items = invoiceLineItems
      .map((item) => ({
        name: item.name.trim(),
        quantity: Number(item.quantity || 0),
        price: Number(item.price || 0),
      }))
      .filter((item) => item.name && item.quantity > 0 && item.price >= 0);
    if (items.length === 0) {
      showToast("Add at least one item to the invoice", "error");
      return;
    }
    const amount = items.reduce((sum, item) => sum + lineTotal(item), 0);
    const client = form.get("client").trim();
    const dueDate = form.get("dueDate");

    if (!client) {
      showToast("Enter a client name", "error");
      return;
    }
    if (!dueDate) {
      showToast("Select a due date", "error");
      return;
    }
    if (amount <= 0) {
      showToast("Invoice amount must be greater than 0", "error");
      return;
    }

    if (!canAddInvoice(subscription.plan, invoices)) {
      const limit = plans[subscription.plan].limits.invoicesPerMonth;
      showToast(`Reached ${limit} invoices/month limit. Upgrade to Pro or Enterprise.`, "warning");
      setSubscriptionOpen(true);
      return;
    }

    const invoice = {
      id: Date.now(),
      number: nextInvoiceNumber(invoices.length),
      client,
      item: items.length === 1 ? items[0].name : `${items.length} items`,
      items,
      amount,
      dueDate,
      date: todayIso(),
      status: "Pending",
    };
    setInvoices([invoice, ...invoices]);
    if (!customers.some((customer) => customer.name.toLowerCase() === client.toLowerCase())) {
      setCustomers([{ id: Date.now() + 1, name: client, phone: form.get("clientPhone")?.trim() || "" }, ...customers]);
    }
    setInvoiceLineItems([{ name: "", quantity: 1, price: "" }]);
    setInvoiceOpen(false);
    showToast(`Invoice ${invoice.number} saved`, "success");
    if (shouldSend) {
      sendWhatsApp(invoice);
    }
    if (shouldDownload) {
      downloadInvoice(invoice);
    }
  }

  function saveExpense(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = form.get("title").trim();
    const amount = Number(form.get("amount"));
    const category = form.get("category");
    const date = form.get("date");
    
    if (!title) {
      showToast("Enter an expense description", "error");
      return;
    }
    if (amount <= 0) {
      showToast("Expense amount must be greater than 0", "error");
      return;
    }
    if (!category) {
      showToast("Select an expense category", "error");
      return;
    }
    if (!date) {
      showToast("Select an expense date", "error");
      return;
    }

    if (!canAddExpense(subscription.plan, expenses)) {
      const limit = plans[subscription.plan].limits.expensesPerMonth;
      showToast(`Reached ${limit} expenses/month limit. Upgrade to Pro or Enterprise.`, "warning");
      setSubscriptionOpen(true);
      return;
    }
    
    const expense = {
      id: Date.now(),
      title,
      amount,
      category,
      date,
      receiptName: form.get("receipt")?.name || "",
    };
    setExpenses([expense, ...expenses]);
    setExpenseOpen(false);
    showToast(`Expense \"${expense.title}\" saved`, "success");
  }

  function customerPhone(name) {
    return customers.find((customer) => customer.name === name)?.phone || "";
  }

  function whatsappUrl(invoice, reminder = false) {
    const phone = customerPhone(invoice.client).replace(/\D/g, "");
    const itemLines = invoiceItems(invoice)
      .map((item) => `${item.name} x${item.quantity} @ ${currency.format(item.price)} = ${currency.format(lineTotal(item))}`)
      .join("\n");
    const text = [
      reminder ? `Reminder: invoice ${invoice.number} is overdue` : `${business.name} invoice ${invoice.number}`,
      `Client: ${invoice.client}`,
      "Items:",
      itemLines,
      `Amount: ${currency.format(invoice.amount)}`,
      `Due: ${invoice.dueDate}`,
      `Pay via M-Pesa: ${business.mpesa}`,
    ].join("\n");
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  function sendWhatsApp(invoice, reminder = false) {
    window.open(whatsappUrl(invoice, reminder), "_blank", "noopener,noreferrer");
  }

  function setInvoiceStatus(id, status) {
    setInvoices(invoices.map((invoice) => (invoice.id === id ? { ...invoice, status } : invoice)));
  }

  function openInvoiceForm() {
    setInvoiceLineItems([{ name: "", quantity: 1, price: "" }]);
    setInvoiceOpen(true);
  }

  function updateInvoiceLine(index, field, value) {
    setInvoiceLineItems((items) =>
      items.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item))
    );
  }

  function addInvoiceLine() {
    setInvoiceLineItems((items) => [...items, { name: "", quantity: 1, price: "" }]);
  }

  function removeInvoiceLine(index) {
    setInvoiceLineItems((items) => items.length === 1 ? items : items.filter((_, itemIndex) => itemIndex !== index));
  }

  function exportBackup() {
    const backup = {
      business,
      taxSettings,
      customers,
      invoices,
      expenses,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kra-invoice-backup-${todayIso()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function ensureSubscriptionRecord(userId, nextSubscription = subscription) {
    if (!supabase) return { data: null, error: null };
    return supabase
      .from("subscriptions")
      .upsert(
        {
          user_id: userId,
          plan: nextSubscription.plan,
          status: nextSubscription.status,
          current_period_end: nextSubscription.currentPeriodEnd,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      )
      .select()
      .single();
  }

  async function loadCloudData(userId) {
    if (!supabase) return;
    setSyncStatus("Syncing...");
    const { data, error } = await supabase
      .from("app_data")
      .select("payload")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      showToast("Could not load cloud data", "error");
      return;
    }
    if (data?.payload) {
      if (data.payload.business) setBusiness(data.payload.business);
      if (data.payload.taxSettings) setTaxSettings(data.payload.taxSettings);
      if (data.payload.subscription) setSubscription(normalizeSubscription(data.payload.subscription));
      if (Array.isArray(data.payload.customers)) setCustomers(data.payload.customers);
      if (Array.isArray(data.payload.invoices)) setInvoices(data.payload.invoices);
      if (Array.isArray(data.payload.expenses)) setExpenses(data.payload.expenses);
      showToast("Cloud data loaded", "success", 2000);
    }
    const { data: subData, error: subError } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (subError) {
      showToast("Could not load subscription", "error");
      setSyncStatus("Subscription sync error");
      return;
    }

    if (subData) {
      setSubscription(normalizeSubscription(subData));
    } else {
      const localSubscription = data?.payload?.subscription
        ? normalizeSubscription(data.payload.subscription)
        : normalizeSubscription(subscription);
      const { data: createdSubscription, error: createError } = await ensureSubscriptionRecord(userId, localSubscription);
      if (createError) {
        showToast("Could not create your subscription record", "error");
        setSyncStatus("Subscription sync error");
        return;
      }
      if (createdSubscription) {
        setSubscription(normalizeSubscription(createdSubscription));
      }
    }

    const { data: paymentData } = await supabase
      .from("subscription_payments")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentData) {
      setLatestPayment(paymentData);
    }

    setSyncStatus("Live sync on");
  }

  async function saveCloudData(override = {}) {
    if (!supabase || !user) {
      setAuthInlineOpen(true);
      return;
    }
    setLoadingStates((prev) => ({ ...prev, saveCloud: true }));
    setSyncStatus("Saving...");
    const toastId = showToast("Saving to cloud...", "loading", 0);
    const payload = appPayload({
      business: override.business || business,
      taxSettings: override.taxSettings || taxSettings,
      customers: override.customers || customers,
      invoices: override.invoices || invoices,
      expenses: override.expenses || expenses,
      subscription: normalizeSubscription(override.subscription || subscription),
    });
    const { error } = await supabase
      .from("app_data")
      .upsert(
        {
          user_id: user.id,
          payload,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
    closeToast(toastId);
    setLoadingStates((prev) => ({ ...prev, saveCloud: false }));
    if (error) {
      setSyncStatus("Cloud save failed");
      showToast("Failed to save to cloud", "error");
    } else {
      setSyncStatus("Live sync on");
      showToast("Saved to cloud", "success", 2000);
    }
  }

  async function handleAuth(event) {
    event.preventDefault();
    if (!supabase) return;
    setLoadingStates((prev) => ({ ...prev, auth: true }));
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") || "").trim();
    const password = String(form.get("password") || "");
    const mode = event.nativeEvent.submitter?.value || authMode;
    if (!email || !password) {
      setLoadingStates((prev) => ({ ...prev, auth: false }));
      showToast("Enter your email and password", "error");
      return;
    }

    let result;
    try {
      if (mode === "signup") {
        result = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin },
        });

        if (result.error?.message.toLowerCase().includes("already registered")) {
          result = await supabase.auth.signInWithPassword({ email, password });
        }
      } else {
        result = await supabase.auth.signInWithPassword({ email, password });
      }
    } catch (error) {
      setLoadingStates((prev) => ({ ...prev, auth: false }));
      const message = error?.message || "Could not reach Supabase. Check your internet, Supabase URL, and anon key.";
      showToast(message, "error");
      return;
    }

    if (result.error) {
      setLoadingStates((prev) => ({ ...prev, auth: false }));
      const errorText = result.error.message.toLowerCase();
      let message = "Could not sign in. Check your email and password.";
      if (errorText.includes("rate limit")) {
        message = "Email limit reached. Turn off confirmation in Supabase for testing.";
      } else if (errorText.includes("email not confirmed")) {
        message = "Confirm your email or turn off confirmation in Supabase.";
      } else if (errorText.includes("invalid login credentials")) {
        message = mode === "signup"
          ? "Account may exist. Try Sign In with same email."
          : "Wrong email or password.";
      } else if (result.error.message) {
        message = result.error.message;
      }
      showToast(message, "error");
      return;
    }
    const nextUser = result.data.session?.user || result.data.user || null;
    setUser(nextUser);
    setAuthOpen(false);
    setAuthInlineOpen(false);
    setLoadingStates((prev) => ({ ...prev, auth: false }));
    if (nextUser) {
      await ensureSubscriptionRecord(nextUser.id, normalizeSubscription(subscription));
      await loadCloudData(nextUser.id);
    }
    if (mode === "signup" && !result.data.session) {
      showToast("Account created. Check email to confirm.", "success");
    } else {
      showToast(mode === "signup" ? "Account created" : "Signed in", "success", 2000);
    }
  }

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthInlineOpen(true);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setUser(null);
    setLatestPayment(null);
    setPaymentOpen(false);
    setSelectedPlan(null);
    setAuthMode("signin");
    setSyncStatus(isSupabaseConfigured ? "Cloud ready" : "Local mode");
    showToast("Signed out", "info", 2000);
  }

  async function downgradeToFreePlan() {
    if (!user) {
      setAuthInlineOpen(true);
      return;
    }
    setLoadingStates((prev) => ({ ...prev, upgrade: true }));
    const downgradedSubscription = normalizeSubscription({
      plan: "free",
      status: "active",
      currentPeriodEnd: null,
    });
    const { data: savedSubscription, error } = await ensureSubscriptionRecord(user.id, downgradedSubscription);
    if (error) {
      setLoadingStates((prev) => ({ ...prev, upgrade: false }));
      showToast("Could not change your plan", "error");
      return;
    }
    const nextSubscription = savedSubscription ? normalizeSubscription(savedSubscription) : downgradedSubscription;
    setSubscription(nextSubscription);
    await saveCloudData({ subscription: nextSubscription });
    setSubscriptionOpen(false);
    setLoadingStates((prev) => ({ ...prev, upgrade: false }));
    showToast("Moved back to Free plan", "success", 3000);
  }

  function openPaymentCheckout(planKey) {
    if (!user) {
      setAuthInlineOpen(true);
      return;
    }
    setSelectedPlan(planKey);
    setPaymentPhone((current) => normalizePhone(current || business.phone || ""));
    setPaymentOpen(true);
  }

  async function requestPlanPayment(event) {
    event.preventDefault();
    if (!user) {
      setAuthInlineOpen(true);
      return;
    }
    if (!selectedPlan || !isPaidPlan(selectedPlan)) {
      showToast("Choose a paid plan first", "error");
      return;
    }
    setLoadingStates((prev) => ({ ...prev, payment: true }));
    try {
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) {
        throw new Error("Your session expired. Please sign in again.");
      }
      const response = await fetch("/api/payments/mpesa/upgrade", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          planKey: selectedPlan,
          phoneNumber: paymentPhone,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Could not start the M-Pesa payment.");
      }
      setLatestPayment((prev) => ({
        ...prev,
        id: result.paymentId,
        plan: selectedPlan,
        phone_number: normalizePhone(paymentPhone),
        amount: plans[selectedPlan].price,
        status: result.status,
        result_desc: result.message,
      }));
      setSubscriptionOpen(false);
      showToast("STK push sent. Ask the client to enter their M-Pesa PIN.", "success", 4000);
    } catch (error) {
      showToast(error.message || "Could not start the payment.", "error");
    } finally {
      setLoadingStates((prev) => ({ ...prev, payment: false }));
    }
  }

  function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setBusiness({
        ...business,
        logoName: file.name,
        logoData: String(reader.result || ""),
      });
    };
    reader.readAsDataURL(file);
  }

  function importBackup(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const backup = JSON.parse(reader.result);
        if (backup.business) setBusiness(backup.business);
        if (backup.taxSettings) setTaxSettings(backup.taxSettings);
        if (Array.isArray(backup.customers)) setCustomers(backup.customers);
        if (Array.isArray(backup.invoices)) setInvoices(backup.invoices);
        if (Array.isArray(backup.expenses)) setExpenses(backup.expenses);
      } catch {
        window.alert("That backup file could not be read.");
      }
    };
    reader.readAsText(file);
  }

  function logoFormat(dataUrl) {
    if (dataUrl.startsWith("data:image/png")) return "PNG";
    if (dataUrl.startsWith("data:image/webp")) return "WEBP";
    return "JPEG";
  }

  function addPdfHeader(doc, title, subtitle) {
    doc.setFillColor(7, 94, 59);
    doc.rect(0, 0, 210, 32, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.text(business.name || "Business", 16, 15);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(business.phone || "", 16, 23);

    if (business.logoData) {
      try {
        doc.addImage(business.logoData, logoFormat(business.logoData), 168, 7, 24, 18);
      } catch {
        doc.text("LOGO", 174, 18);
      }
    } else {
      doc.setDrawColor(255, 255, 255);
      doc.roundedRect(168, 7, 24, 18, 2, 2);
      doc.text("LOGO", 174, 18);
    }

    doc.setTextColor(20, 33, 27);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.text(title, 16, 48);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.setTextColor(98, 113, 106);
    doc.text(subtitle, 16, 56);
  }

  function addInfoRow(doc, label, value, y) {
    doc.setFillColor(244, 246, 245);
    doc.rect(16, y - 6, 178, 10, "F");
    doc.setFont("helvetica", "bold");
    doc.setTextColor(98, 113, 106);
    doc.text(label, 20, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(20, 33, 27);
    doc.text(String(value), 82, y);
  }

  function storePdf(doc, filename, type) {
    const dataUri = doc.output("datauristring");
    doc.save(filename);
    setGeneratedDocs((docs) => [
      { id: Date.now(), name: filename, type, date: new Date().toLocaleString(), dataUri },
      ...docs,
    ].slice(0, 8));
  }

  function downloadInvoice(invoice) {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const items = invoiceItems(invoice);
    addPdfHeader(doc, `Invoice ${invoice.number}`, `Issued ${invoice.date}`);
    addInfoRow(doc, "Client", invoice.client, 74);
    addInfoRow(doc, "Due Date", invoice.dueDate, 88);
    addInfoRow(doc, "Status", invoice.status, 102);

    doc.setFillColor(7, 94, 59);
    doc.rect(16, 122, 178, 10, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Item", 20, 128);
    doc.text("No.", 112, 128);
    doc.text("Price", 132, 128);
    doc.text("Total", 164, 128);

    doc.setTextColor(20, 33, 27);
    doc.setFont("helvetica", "normal");
    items.slice(0, 10).forEach((item, index) => {
      const y = 141 + index * 9;
      doc.setFillColor(index % 2 === 0 ? 248 : 255, index % 2 === 0 ? 251 : 255, index % 2 === 0 ? 248 : 255);
      doc.rect(16, y - 6, 178, 9, "F");
      doc.text(item.name.slice(0, 42), 20, y);
      doc.text(String(item.quantity), 114, y);
      doc.text(currency.format(item.price), 132, y);
      doc.text(currency.format(lineTotal(item)), 164, y);
    });

    doc.setFillColor(232, 248, 237);
    doc.roundedRect(16, 238, 178, 28, 3, 3, "F");
    doc.setTextColor(7, 94, 59);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Total Amount", 24, 250);
    doc.setFontSize(24);
    doc.text(currency.format(invoice.amount), 24, 261);

    doc.setTextColor(20, 33, 27);
    doc.setFontSize(12);
    doc.text(`Pay via M-Pesa: ${business.mpesa}`, 16, 278);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(98, 113, 106);
    doc.text("Thank you for your business.", 16, 290);

    storePdf(doc, `${invoice.number}-${invoice.client.replace(/\s+/g, "-")}.pdf`, "Invoice");
  }

  function downloadReport() {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const monthInvoices = invoices.filter((invoice) => monthFromDate(invoice.date) === reportMonth);
    const monthExpenses = expenses.filter((expense) => monthFromDate(expense.date) === reportMonth);
    addPdfHeader(doc, "KRA Monthly Summary", monthLabel(reportMonth));
    addInfoRow(doc, "Total Income", currency.format(totals.income), 74);
    addInfoRow(doc, "Paid Income", currency.format(totals.paidIncome), 88);
    addInfoRow(doc, "Total Expenses", currency.format(totals.expenseTotal), 102);
    addInfoRow(doc, "Profit", currency.format(totals.profit), 116);
    addInfoRow(doc, "Estimated Tax", currency.format(totals.tax), 130);
    addInfoRow(doc, "VAT", taxSettings.vatRegistered ? currency.format(totals.vat) : "Not applicable", 144);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(20, 33, 27);
    doc.text("Invoices", 16, 170);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    monthInvoices.slice(0, 8).forEach((invoice, index) => {
      const y = 180 + index * 7;
      doc.text(`${invoice.number}  ${invoice.client}  ${currency.format(invoice.amount)}  ${invoice.status}`, 16, y);
    });

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text("Expenses", 16, 244);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    monthExpenses.slice(0, 5).forEach((expense, index) => {
      const y = 254 + index * 7;
      doc.text(`${expense.date}  ${expense.title}  ${expense.category}  ${currency.format(expense.amount)}`, 16, y);
    });

    storePdf(doc, `KRA-summary-${reportMonth}.pdf`, "Report");
  }

  function downloadStoredDoc(doc) {
    const link = document.createElement("a");
    link.href = doc.dataUri;
    link.download = doc.name;
    link.click();
  }

  function finishOnboarding(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusiness({
      ...business,
      name: form.get("business").trim(),
      phone: form.get("phone").trim(),
      mpesa: form.get("mpesa").trim(),
    });
    window.localStorage.setItem("taxapp.onboarded", "true");
    setOnboardingOpen(false);
    setInvoiceOpen(true);
  }

  if (isSupabaseConfigured && !authChecked) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">KRA</div>
          <h1>Loading your account</h1>
          <p>Checking your secure session...</p>
        </section>
      </main>
    );
  }

  if (isSupabaseConfigured && !user) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="brand-mark">KRA</div>
          <h1>{authMode === "signup" ? "Create your account" : "Welcome back"}</h1>
          <p>{authMode === "signup" ? "Start sending invoices and saving reports to the cloud." : "Sign in to manage your invoices, expenses, and KRA summaries."}</p>
          <form className="form" onSubmit={handleAuth}>
            <label>
              Email
              <input name="email" type="email" placeholder="you@business.com" required autoFocus />
            </label>
            <label>
              Password
              <input name="password" type="password" minLength="6" placeholder="At least 6 characters" required />
            </label>
            <button className="primary-wide" type="submit" value={authMode} disabled={loadingStates.auth}>
              {loadingStates.auth ? "Loading..." : authMode === "signup" ? "Create Account" : "Sign In"}
            </button>
          </form>
          <button
            className="auth-switch"
            type="button"
            onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}
          >
            {authMode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
          </button>
          <p className="auth-help">
            For testing, turn off Supabase email confirmation to avoid email limits.
          </p>
          <span className="auth-status">{syncStatus}</span>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="phone-frame">
        <header className="topbar">
          <div>
            <p>{business.name}</p>
            <h1>{tabs.find((tab) => tab.id === activeTab)?.label}</h1>
          </div>
          {activeTab === "invoices" && (
            <button className="round-action" onClick={openInvoiceForm} aria-label="Create invoice">
              <Plus size={28} />
            </button>
          )}
          {activeTab === "expenses" && (
            <button className="round-action" onClick={() => setExpenseOpen(true)} aria-label="Add expense">
              <Plus size={28} />
            </button>
          )}
        </header>

        <div className="content">
          {activeTab === "invoices" && (
            <section className="screen">
              <button className="prompt" onClick={openInvoiceForm}>
                <Receipt size={24} />
                <span>Create your first invoice</span>
                <Plus size={20} />
              </button>
              <label className="search-box">
                <Search size={19} />
                <input
                  value={invoiceSearch}
                  onChange={(event) => setInvoiceSearch(event.target.value)}
                  placeholder="Search invoices"
                />
              </label>
              <div className="list">
                {filteredInvoices.map((invoice) => (
                  <article className="invoice-card" key={invoice.id}>
                    <div className="invoice-main">
                      <div className="card-title-row">
                        <h2>{invoice.client}</h2>
                        <StatusPill status={invoice.status} />
                      </div>
                      <p>{invoiceSummary(invoice)}</p>
                      <div className="invoice-meta">
                        <span>{invoice.number}</span>
                        <span>Due {invoice.dueDate}</span>
                        <span>{invoiceItems(invoice).length} item{invoiceItems(invoice).length === 1 ? "" : "s"}</span>
                      </div>
                      <div className="invoice-alerts">
                        {invoice.status !== "Paid" && daysUntil(invoice.dueDate) >= 0 && daysUntil(invoice.dueDate) <= 3 && (
                          <div className="due-text">
                            Due {daysUntil(invoice.dueDate) === 0 ? "today" : `in ${daysUntil(invoice.dueDate)} day${daysUntil(invoice.dueDate) === 1 ? "" : "s"}`}
                          </div>
                        )}
                        {invoice.status === "Overdue" && <div className="reminder-text">This invoice is overdue</div>}
                      </div>
                    </div>
                    <div className="invoice-actions">
                      <strong>{currency.format(invoice.amount)}</strong>
                      <div className="mini-actions">
                        <select value={invoice.status} onChange={(event) => setInvoiceStatus(invoice.id, event.target.value)}>
                          <option>Paid</option>
                          <option>Pending</option>
                          <option>Overdue</option>
                        </select>
                        {invoice.status !== "Paid" && (
                          <button className="paid-button" onClick={() => setInvoiceStatus(invoice.id, "Paid")}>
                            <Check size={18} />
                            Paid
                          </button>
                        )}
                        <button onClick={() => sendWhatsApp(invoice)}>
                          <MessageCircle size={18} />
                          WhatsApp
                        </button>
                        {invoice.status === "Overdue" && (
                          <button className="reminder-button" onClick={() => sendWhatsApp(invoice, true)}>
                            <RotateCcw size={18} />
                            Reminder
                          </button>
                        )}
                        <button className="pdf-button" onClick={() => downloadInvoice(invoice)}>
                          <Download size={18} />
                          PDF
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "expenses" && (
            <section className="screen">
              <button className="primary-wide" onClick={() => setExpenseOpen(true)}>
                <Plus size={22} />
                Add Expense
              </button>
              <label className="search-box">
                <Search size={19} />
                <input
                  value={expenseSearch}
                  onChange={(event) => setExpenseSearch(event.target.value)}
                  placeholder="Search expenses"
                />
              </label>
              <div className="list">
                {filteredExpenses.map((expense) => (
                  <article className="simple-card" key={expense.id}>
                    <div>
                      <h2>{expense.title}</h2>
                      <p>{expense.category} - {expense.date}</p>
                      {expense.receiptName && <small><Image size={14} /> {expense.receiptName}</small>}
                    </div>
                    <strong>{currency.format(expense.amount)}</strong>
                  </article>
                ))}
              </div>
            </section>
          )}

          {activeTab === "reports" && (
            <section className="screen reports">
              <label className="month-filter">
                Month
                <input type="month" value={reportMonth} onChange={(event) => setReportMonth(event.target.value)} />
              </label>
              <div className="metric-grid">
                <article>
                  <span>Total Income</span>
                  <strong>{currency.format(totals.income)}</strong>
                </article>
                <article>
                  <span>Total Expenses</span>
                  <strong>{currency.format(totals.expenseTotal)}</strong>
                </article>
              </div>
              <article className="profit-card">
                <span>Profit</span>
                <strong>{currency.format(totals.profit)}</strong>
              </article>
              
              <article className="kra-card">
                <div className="card-title-row">
                  <h2>KRA Summary</h2>
                  <CircleDollarSign size={24} />
                </div>
                <div className="tax-row">
                  <span>Estimated Tax</span>
                  <strong>{currency.format(totals.tax)}</strong>
                </div>
                <div className="tax-row">
                  <span>VAT</span>
                  <strong>{taxSettings.vatRegistered ? currency.format(totals.vat) : "Not applicable"}</strong>
                </div>
                <button className="primary-wide" onClick={downloadReport}>
                  <Download size={22} />
                  Download Report
                </button>
              </article>

              {invoices.filter((inv) => monthFromDate(inv.date) === reportMonth).length > 0 && (
                <article className="analytics-card">
                  <h3>Payment Status</h3>
                  <div className="status-breakdown">
                    {["Paid", "Pending", "Overdue"].map((status) => {
                      const count = invoices.filter(
                        (inv) => monthFromDate(inv.date) === reportMonth && inv.status === status
                      ).length;
                      if (count === 0) return null;
                      return (
                        <div key={status} className="status-item">
                          <span className={`status-bar status-${status.toLowerCase()}`}></span>
                          <span className="status-label">{status}: {count}</span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              )}

              {expenses.filter((exp) => monthFromDate(exp.date) === reportMonth).length > 0 && (
                <article className="analytics-card">
                  <h3>Expenses by Category</h3>
                  <div className="category-breakdown">
                    {Array.from(
                      new Set(
                        expenses
                          .filter((exp) => monthFromDate(exp.date) === reportMonth)
                          .map((exp) => exp.category)
                      )
                    ).map((category) => {
                      const categoryTotal = expenses
                        .filter((exp) => monthFromDate(exp.date) === reportMonth && exp.category === category)
                        .reduce((sum, exp) => sum + exp.amount, 0);
                      const percentage = totals.expenseTotal > 0 ? (categoryTotal / totals.expenseTotal * 100).toFixed(0) : 0;
                      return (
                        <div key={category} className="category-item">
                          <span className="category-name">{category}</span>
                          <span className="category-bar">
                            <span className="category-fill" style={{ width: `${percentage}%` }}></span>
                          </span>
                          <span className="category-value">{currency.format(categoryTotal)}</span>
                        </div>
                      );
                    })}
                  </div>
                </article>
              )}

              {invoices.filter((inv) => monthFromDate(inv.date) === reportMonth).length > 0 && (
                <article className="analytics-card">
                  <h3>Top Clients</h3>
                  <div className="client-breakdown">
                    {Object.entries(
                      invoices
                        .filter((inv) => monthFromDate(inv.date) === reportMonth)
                        .reduce((acc, inv) => {
                          acc[inv.client] = (acc[inv.client] || 0) + inv.amount;
                          return acc;
                        }, {})
                    )
                      .sort(([, a], [, b]) => b - a)
                      .slice(0, 5)
                      .map(([client, total]) => (
                        <div key={client} className="client-item">
                          <span className="client-name">{client}</span>
                          <span className="client-amount">{currency.format(total)}</span>
                        </div>
                      ))}
                  </div>
                </article>
              )}
            </section>
          )}

          {activeTab === "settings" && (
            <section className="screen">
              <div className="cloud-panel account-panel">
                <strong>{user ? user.email : "Account"}</strong>
                <span>{syncStatus}</span>
                {user ? (
                  <div className="account-actions">
                    <button className="primary-wide" type="button" onClick={saveCloudData} disabled={loadingStates.saveCloud}>
                      <Upload size={22} />
                      {loadingStates.saveCloud ? "Saving..." : "Save to Cloud"}
                    </button>
                    <button className="secondary-wide" type="button" onClick={signOut}>
                      Sign Out
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="account-actions">
                      <button className="primary-wide" type="button" onClick={() => openAuth("signin")} disabled={loadingStates.auth}>
                        Sign In
                      </button>
                      <button className="secondary-wide" type="button" onClick={() => openAuth("signup")} disabled={loadingStates.auth}>
                        Sign Up
                      </button>
                    </div>
                    {authInlineOpen && (
                      isSupabaseConfigured ? (
                        <form className="form inline-auth-form" onSubmit={handleAuth}>
                          <label>
                            Email
                            <input name="email" type="email" placeholder="you@business.com" required />
                          </label>
                          <label>
                            Password
                            <input name="password" type="password" minLength="6" placeholder="At least 6 characters" required />
                          </label>
                          <div className="action-stack">
                            <button className="primary-wide" type="submit" value={authMode} disabled={loadingStates.auth}>
                              {loadingStates.auth ? "Loading..." : authMode === "signup" ? "Create Account" : "Sign In"}
                            </button>
                            <button
                              className="secondary-wide"
                              type="button"
                              onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}
                            >
                              {authMode === "signup" ? "Use Sign In Instead" : "Create New Account"}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <div className="empty-note">
                          Add your Supabase URL and anon key in <strong>.env.local</strong>, then restart the app.
                        </div>
                      )
                    )}
                  </>
                )}
              </div>
              <div className="cloud-panel account-panel">
                <strong>Current Plan: {plans[subscription.plan]?.name || "Free"}</strong>
                <span>Status: {subscription.status}</span>
                {latestPayment && (
                  <div className="subscription-meta">
                    <span>
                      Latest payment: {paymentStatusCopy(latestPayment.status)}
                      {latestPayment.amount ? ` - ${currency.format(latestPayment.amount)}` : ""}
                    </span>
                    {latestPayment.plan && <span>Requested plan: {plans[latestPayment.plan]?.name || latestPayment.plan}</span>}
                  </div>
                )}
                <button className="primary-wide" type="button" onClick={() => setSubscriptionOpen(true)}>
                  Manage Subscription
                </button>
              </div>
              <form className="form settings-form">
                <label>
                  Business Name
                  <input value={business.name} onChange={(event) => setBusiness({ ...business, name: event.target.value })} />
                </label>
                <label>
                  Phone Number
                  <input value={business.phone} onChange={(event) => setBusiness({ ...business, phone: event.target.value })} />
                </label>
                <label>
                  M-Pesa Number
                  <input value={business.mpesa} onChange={(event) => setBusiness({ ...business, mpesa: event.target.value })} />
                </label>
                <label className="upload-box">
                  <Upload size={24} />
                  <span>{business.logoName || "Logo upload"}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                  />
                </label>
                <label className="switch-row">
                  <span>VAT registered</span>
                  <input
                    type="checkbox"
                    checked={taxSettings.vatRegistered}
                    onChange={(event) => setTaxSettings({ ...taxSettings, vatRegistered: event.target.checked })}
                  />
                </label>
                <label>
                  VAT Rate
                  <input
                    type="number"
                    min="0"
                    value={taxSettings.vatRate}
                    onChange={(event) => setTaxSettings({ ...taxSettings, vatRate: Number(event.target.value) })}
                  />
                </label>
                <label>
                  Income Tax Rate
                  <input
                    type="number"
                    min="0"
                    value={taxSettings.incomeTaxRate}
                    onChange={(event) => setTaxSettings({ ...taxSettings, incomeTaxRate: Number(event.target.value) })}
                  />
                </label>
                <div className="backup-actions">
                  <button className="secondary-wide" type="button" onClick={exportBackup}>
                    <Download size={22} />
                    Export Backup
                  </button>
                  <label className="import-button">
                    <Upload size={22} />
                    Import Backup
                    <input type="file" accept="application/json,.json" onChange={importBackup} />
                  </label>
                </div>
                {generatedDocs.length > 0 && (
                  <div className="pdf-history">
                    <strong>Recent PDFs</strong>
                    {generatedDocs.map((doc) => (
                      <button type="button" key={doc.id} onClick={() => downloadStoredDoc(doc)}>
                        <span>{doc.name}</span>
                        <small>{doc.type} - {doc.date}</small>
                      </button>
                    ))}
                  </div>
                )}
              </form>
            </section>
          )}
        </div>

        <nav className="bottom-nav" aria-label="Primary">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                className={activeTab === tab.id ? "active" : ""}
                onClick={() => setActiveTab(tab.id)}
              >
                <Icon size={22} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </section>

      {invoiceOpen && (
        <QuickModal title="Create Invoice" onClose={() => setInvoiceOpen(false)}>
          <form className="form" onSubmit={saveInvoice}>
            <div className="auto-row">
              <span>{nextInvoiceNumber(invoices.length)}</span>
              <span>{todayIso()}</span>
            </div>
            <label>
              Client Name
              <input name="client" list="customers" placeholder="e.g. Amani Foods" required autoFocus />
              <datalist id="customers">
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.name} />
                ))}
              </datalist>
            </label>
            <label>
              Client Phone
              <input name="clientPhone" placeholder="+254..." />
            </label>
            <div className="line-items">
              <div className="line-items-top">
                <strong>Items</strong>
                <button type="button" onClick={addInvoiceLine}>
                  <Plus size={16} />
                  Add Item
                </button>
              </div>
              {invoiceLineItems.map((item, index) => (
                <div className="line-item-row" key={index}>
                  <label>
                    Item
                    <input
                      value={item.name}
                      onChange={(event) => updateInvoiceLine(index, "name", event.target.value)}
                      placeholder="e.g. Sugar"
                      required
                    />
                  </label>
                  <label>
                    No.
                    <input
                      value={item.quantity}
                      onChange={(event) => updateInvoiceLine(index, "quantity", event.target.value)}
                      type="number"
                      min="1"
                      required
                    />
                  </label>
                  <label>
                    Price
                    <input
                      value={item.price}
                      onChange={(event) => updateInvoiceLine(index, "price", event.target.value)}
                      type="number"
                      min="0"
                      placeholder="0"
                      required
                    />
                  </label>
                  <button className="remove-line" type="button" onClick={() => removeInvoiceLine(index)} aria-label="Remove item">
                    <X size={18} />
                  </button>
                </div>
              ))}
              <div className="invoice-form-total">
                <span>Total</span>
                <strong>{currency.format(invoiceDraftTotal)}</strong>
              </div>
            </div>
            <label>
              Due Date
              <input name="dueDate" type="date" required />
            </label>
            <div className="action-stack">
              <button className="primary-wide" type="submit" disabled={loadingStates.saveInvoice}>
                <Check size={22} />
                {loadingStates.saveInvoice ? "Saving..." : "Save"}
              </button>
              <button className="secondary-wide" type="submit" value="download" disabled={loadingStates.saveInvoice}>
                <Download size={22} />
                {loadingStates.saveInvoice ? "Processing..." : "Save and Download PDF"}
              </button>
              <button className="whatsapp-wide" type="submit" value="send" disabled={loadingStates.saveInvoice}>
                <Send size={22} />
                {loadingStates.saveInvoice ? "Processing..." : "Save, then Send via WhatsApp"}
              </button>
            </div>
          </form>
        </QuickModal>
      )}

      {expenseOpen && (
        <QuickModal title="Add Expense" onClose={() => setExpenseOpen(false)}>
          <form className="form" onSubmit={saveExpense}>
            <label>
              Title
              <input name="title" placeholder="e.g. Rent, Stock" required autoFocus />
            </label>
            <label>
              Amount
              <input name="amount" type="number" min="1" placeholder="0" required />
            </label>
            <label>
              Category
              <select name="category" required>
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </label>
            <label>
              Date
              <input name="date" type="date" defaultValue={todayIso()} required />
            </label>
            <label className="upload-box">
              <Upload size={24} />
              <span>Receipt upload</span>
              <input name="receipt" type="file" accept="image/*,.pdf" />
            </label>
            <button className="primary-wide" type="submit" disabled={loadingStates.saveExpense}>
              <Check size={22} />
              {loadingStates.saveExpense ? "Saving..." : "Save"}
            </button>
          </form>
        </QuickModal>
      )}

      {onboardingOpen && (
        <QuickModal title="Set Up Business" onClose={() => setOnboardingOpen(false)}>
          <form className="form" onSubmit={finishOnboarding}>
            <label>
              Business Name
              <input name="business" defaultValue={business.name} required autoFocus />
            </label>
            <label>
              Phone Number
              <input name="phone" defaultValue={business.phone} required />
            </label>
            <label>
              M-Pesa Number
              <input name="mpesa" defaultValue={business.mpesa} required />
            </label>
            <button className="primary-wide" type="submit">
              <Building2 size={22} />
              Create your first invoice
            </button>
          </form>
        </QuickModal>
      )}

      {authOpen && (
        <QuickModal title={authMode === "signup" ? "Create Account" : "Sign In"} onClose={() => setAuthOpen(false)}>
          {isSupabaseConfigured ? (
            <form className="form" onSubmit={handleAuth}>
              <label>
                Email
                <input name="email" type="email" placeholder="you@business.com" required autoFocus />
              </label>
              <label>
                Password
                <input name="password" type="password" minLength="6" placeholder="At least 6 characters" required />
              </label>
              {authMode === "signup" && (
                <p className="auth-hint">Password must be at least 6 characters. Use a mix of letters and numbers for security.</p>
              )}
              <div className="action-stack">
                <button className="primary-wide" type="submit" value={authMode} disabled={loadingStates.auth}>
                  {loadingStates.auth ? "Loading..." : authMode === "signup" ? "Create Account" : "Sign In"}
                </button>
                <button
                  className="secondary-wide"
                  type="button"
                  onClick={() => setAuthMode(authMode === "signup" ? "signin" : "signup")}
                  disabled={loadingStates.auth}
                >
                  {authMode === "signup" ? "Use Sign In Instead" : "Create New Account"}
                </button>
              </div>
            </form>
          ) : (
            <div className="empty-note">
              Add your Supabase URL and anon key in <strong>.env.local</strong>, then restart the app.
            </div>
          )}
        </QuickModal>
      )}

      {subscriptionOpen && (
        <QuickModal title="Choose Your Plan" onClose={() => setSubscriptionOpen(false)}>
          <div className="plans-grid">
            {Object.entries(plans).map(([key, plan]) => (
              <article key={key} className={`plan-card ${subscription.plan === key ? "current" : ""}`}>
                <div className="plan-header">
                  <h3>{plan.name}</h3>
                  {subscription.plan === key && <span className="current-badge">Current</span>}
                </div>
                <div className="plan-price">
                  {plan.price === 0 ? (
                    <span>Free</span>
                  ) : (
                    <>
                      <strong>{plan.priceDisplay}</strong>
                      <span>/month</span>
                    </>
                  )}
                </div>
                <ul className="plan-features">
                  {plan.features.map((feature, index) => (
                    <li key={index}>
                      <Check size={16} />
                      {feature}
                    </li>
                  ))}
                </ul>
                {subscription.plan !== key && (
                  <button
                    className="primary-wide"
                    onClick={() => (plan.price === 0 ? downgradeToFreePlan() : openPaymentCheckout(key))}
                    disabled={loadingStates.upgrade || loadingStates.payment}
                  >
                    {loadingStates.upgrade
                      ? "Saving..."
                      : loadingStates.payment && selectedPlan === key
                        ? "Waiting..."
                        : plan.price === 0
                          ? "Downgrade"
                          : `Pay ${plan.priceDisplay}`}
                  </button>
                )}
              </article>
            ))}
          </div>
          <p className="plan-note">
            Paid plans activate only after M-Pesa confirms the payment.
          </p>
        </QuickModal>
      )}

      {paymentOpen && selectedPlan && (
        <QuickModal title={`Pay for ${plans[selectedPlan].name}`} onClose={() => setPaymentOpen(false)}>
          <form className="form" onSubmit={requestPlanPayment}>
            <div className="auto-row">
              <span>Plan</span>
              <strong>{plans[selectedPlan].name}</strong>
            </div>
            <div className="auto-row">
              <span>Amount</span>
              <strong>{currency.format(plans[selectedPlan].price)}</strong>
            </div>
            <label>
              Customer M-Pesa Phone
              <input
                value={paymentPhone}
                onChange={(event) => setPaymentPhone(event.target.value)}
                placeholder="07XXXXXXXX or 2547XXXXXXXX"
                required
                autoFocus
              />
            </label>
            <div className="empty-note payment-note">
              The plan will stay locked until the customer accepts the M-Pesa STK push and enters their PIN.
            </div>
            {latestPayment && ["pending", "processing", "failed"].includes(latestPayment.status) && (
              <div className="payment-status-card">
                <strong>{paymentStatusCopy(latestPayment.status)}</strong>
                <span>{latestPayment.result_desc || "Waiting for payment update."}</span>
              </div>
            )}
            <div className="action-stack">
              <button className="primary-wide" type="submit" disabled={loadingStates.payment}>
                <CircleDollarSign size={22} />
                {loadingStates.payment ? "Sending STK Push..." : `Pay ${currency.format(plans[selectedPlan].price)}`}
              </button>
              <button className="secondary-wide" type="button" onClick={() => setPaymentOpen(false)} disabled={loadingStates.payment}>
                Cancel
              </button>
            </div>
          </form>
        </QuickModal>
      )}

      <div className="toast-container">
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            message={toast.message}
            type={toast.type}
            onClose={() => closeToast(toast.id)}
          />
        ))}
      </div>

    </main>
  );
}
