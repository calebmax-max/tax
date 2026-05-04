import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { plans, isPaidPlan } from "../../../../../lib/plans";
import { getMpesaConfig, initiateStkPush, normalizeKenyanPhoneNumber } from "../../../../../lib/server/mpesa";

function createSupabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("Missing Supabase server credentials");
  }
  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

async function getAuthenticatedUser(request) {
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error("Missing Supabase public credentials");
  }

  const supabase = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
  const { data, error } = await supabase.auth.getUser(token);
  if (error) return null;
  return data.user || null;
}

export async function POST(request) {
  try {
    const user = await getAuthenticatedUser(request);
    if (!user) {
      return NextResponse.json({ error: "You must sign in before upgrading." }, { status: 401 });
    }

    const { planKey, phoneNumber } = await request.json();
    if (!plans[planKey] || !isPaidPlan(planKey)) {
      return NextResponse.json({ error: "Choose a paid plan to continue." }, { status: 400 });
    }

    const normalizedPhone = normalizeKenyanPhoneNumber(phoneNumber);
    const supabaseAdmin = createSupabaseAdmin();
    const amount = plans[planKey].price;

    const { data: existingPending } = await supabaseAdmin
      .from("subscription_payments")
      .select("id,status")
      .eq("user_id", user.id)
      .in("status", ["pending", "processing"])
      .order("created_at", { ascending: false })
      .limit(1);

    if (existingPending?.length) {
      return NextResponse.json(
        { error: "You already have a payment request waiting on your phone." },
        { status: 409 }
      );
    }

    const { data: payment, error: paymentError } = await supabaseAdmin
      .from("subscription_payments")
      .insert({
        user_id: user.id,
        plan: planKey,
        amount,
        phone_number: normalizedPhone,
        status: "pending",
      })
      .select()
      .single();

    if (paymentError || !payment) {
      return NextResponse.json(
        { error: paymentError?.message || "Could not create the payment request." },
        { status: 500 }
      );
    }

    const callbackUrl = `${getMpesaConfig().callbackBaseUrl}/api/payments/mpesa/callback?paymentId=${payment.id}`;

    try {
      const stkResponse = await initiateStkPush({
        amount,
        phoneNumber: normalizedPhone,
        accountReference: `${planKey.toUpperCase()}-${user.id.slice(0, 8)}`,
        transactionDescription: `${plans[planKey].name} plan subscription`,
        callbackUrl,
      });

      await supabaseAdmin
        .from("subscription_payments")
        .update({
          status: "processing",
          merchant_request_id: stkResponse.MerchantRequestID,
          checkout_request_id: stkResponse.CheckoutRequestID,
          result_desc: stkResponse.ResponseDescription,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      return NextResponse.json({
        paymentId: payment.id,
        status: "processing",
        message: "Payment prompt sent to the customer phone.",
      });
    } catch (error) {
      await supabaseAdmin
        .from("subscription_payments")
        .update({
          status: "failed",
          result_desc: error.message,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payment.id);

      return NextResponse.json(
        { error: error.message || "Could not send the M-Pesa prompt." },
        { status: 502 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      { error: error.message || "Payment request failed." },
      { status: 500 }
    );
  }
}
