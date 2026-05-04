export const plans = {
  free: {
    name: "Free",
    price: 0,
    description: "Get started for free",
    limits: {
      invoicesPerMonth: 10,
      expensesPerMonth: 20,
      maxCustomers: 5,
    },
    features: [
      "Up to 10 invoices/month",
      "Up to 20 expenses/month",
      "Up to 5 customers",
      "Basic reports",
      "Local storage only",
    ],
  },
  pro: {
    name: "Pro",
    price: 299,
    description: "For growing businesses",
    priceDisplay: "KES 299",
    limits: {
      invoicesPerMonth: 100,
      expensesPerMonth: 200,
      maxCustomers: 50,
    },
    features: [
      "Up to 100 invoices/month",
      "Up to 200 expenses/month",
      "Unlimited customers",
      "Advanced reports",
      "Cloud sync",
      "WhatsApp integration",
      "VAT tracking",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: 799,
    description: "For large operations",
    priceDisplay: "KES 799",
    limits: {
      invoicesPerMonth: null,
      expensesPerMonth: null,
      maxCustomers: null,
    },
    features: [
      "Unlimited invoices",
      "Unlimited expenses",
      "Unlimited customers",
      "Advanced reports",
      "Cloud sync",
      "WhatsApp integration",
      "VAT tracking",
      "Team management",
      "API access",
      "Priority support",
    ],
  },
};

export function isPaidPlan(planKey) {
  return Number(plans[planKey]?.price || 0) > 0;
}
