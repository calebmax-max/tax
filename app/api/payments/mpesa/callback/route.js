import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { readCallbackMetadata } from "../../../../../lib/server/mpesa";

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

export async function POST(request) {
  const searchParams = new URL(request.url).searchParams;
  const paymentId = searchParams.get("paymentId");

  if (!paymentId) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: "Missing paymentId" }, { status: 400 });
  }

  try {
    const body = await request.json();
    const callback = body.Body?.stkCallback;
    const metadata = readCallbackMetadata(callback?.CallbackMetadata?.Item || []);
    const success = callback?.ResultCode === 0;
    const supabaseAdmin = createSupabaseAdmin();

    const { data: payment } = await supabaseAdmin
      .from("subscription_payments")
      .select("*")
      .eq("id", paymentId)
      .maybeSingle();

    if (!payment) {
      return NextResponse.json({ ResultCode: 1, ResultDesc: "Payment record not found" }, { status: 404 });
    }

    await supabaseAdmin
      .from("subscription_payments")
      .update({
        status: success ? "paid" : "failed",
        result_code: callback?.ResultCode ?? null,
        result_desc: callback?.ResultDesc ?? null,
        mpesa_receipt_number: metadata.MpesaReceiptNumber || null,
        callback_payload: body,
        updated_at: new Date().toISOString(),
      })
      .eq("id", paymentId);

    if (success) {
      const currentPeriodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await supabaseAdmin
        .from("subscriptions")
        .upsert(
          {
            user_id: payment.user_id,
            plan: payment.plan,
            status: "active",
            current_period_end: currentPeriodEnd,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      const { data: appData } = await supabaseAdmin
        .from("app_data")
        .select("payload")
        .eq("user_id", payment.user_id)
        .maybeSingle();

      if (appData?.payload) {
        await supabaseAdmin
          .from("app_data")
          .upsert(
            {
              user_id: payment.user_id,
              payload: {
                ...appData.payload,
                subscription: {
                  plan: payment.plan,
                  status: "active",
                  currentPeriodEnd,
                },
                updatedAt: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" }
          );
      }
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (error) {
    return NextResponse.json(
      { ResultCode: 1, ResultDesc: error.message || "Callback handling failed" },
      { status: 500 }
    );
  }
}
