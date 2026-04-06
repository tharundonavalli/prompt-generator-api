const express = require("express");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;
const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const RAZORPAY_SECRET = process.env.RAZORPAY_SECRET || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";
const PAYMENT_AMOUNT = 9900;
const PAYMENT_CURRENCY = "INR";

app.use(cors({
  origin: ALLOWED_ORIGIN === "*" ? true : ALLOWED_ORIGIN
}));
app.use(express.json());

function getRazorpayAuthHeader() {
  const credentials = Buffer.from(`${RAZORPAY_KEY_ID}:${RAZORPAY_SECRET}`).toString("base64");
  return `Basic ${credentials}`;
}

app.get("/", (req, res) => {
  res.json({
    ok: true,
    message: "PromptStudio AI payment server is running."
  });
});

app.post("/create-order", async (req, res) => {
  console.log("Creating Razorpay order");

  if (!RAZORPAY_KEY_ID || !RAZORPAY_SECRET) {
    console.error("Missing Razorpay environment variables");
    return res.status(500).json({
      success: false,
      message: "Payment server is not configured."
    });
  }

  try {
    const razorpayResponse = await fetch("https://api.razorpay.com/v1/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": getRazorpayAuthHeader()
      },
      body: JSON.stringify({
        amount: PAYMENT_AMOUNT,
        currency: PAYMENT_CURRENCY,
        receipt: `promptstudio_${Date.now()}`
      })
    });

    const data = await razorpayResponse.json();

    if (!razorpayResponse.ok) {
      console.error("Razorpay order creation failed", data);
      return res.status(500).json({
        success: false,
        message: data && data.error && data.error.description
          ? data.error.description
          : "Unable to create payment order."
      });
    }

    console.log("Razorpay order created", data.id);
    return res.json({
      success: true,
      orderId: data.id,
      amount: data.amount,
      currency: data.currency
    });
  } catch (error) {
    console.error("Create order error", error);
    return res.status(500).json({
      success: false,
      message: "Payment server error."
    });
  }
});

app.post("/verify-payment", (req, res) => {
  const {
    razorpay_order_id: orderId,
    razorpay_payment_id: paymentId,
    razorpay_signature: signature
  } = req.body || {};

  console.log("Verifying payment", {
    orderId,
    paymentId
  });

  if (!orderId || !paymentId || !signature) {
    return res.status(400).json({
      success: false,
      message: "Missing payment verification fields."
    });
  }

  if (!RAZORPAY_SECRET) {
    console.error("Missing Razorpay secret");
    return res.status(500).json({
      success: false,
      message: "Payment server is not configured."
    });
  }

  try {
    const payload = `${orderId}|${paymentId}`;
    const expectedSignature = crypto
      .createHmac("sha256", RAZORPAY_SECRET)
      .update(payload)
      .digest("hex");

    const isValid = signature.length === expectedSignature.length
      && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

    if (!isValid) {
      console.error("Payment verification failed");
      return res.status(400).json({
        success: false,
        message: "Payment verification failed."
      });
    }

    console.log("Payment verified successfully");
    return res.json({
      success: true,
      message: "Payment verified successfully."
    });
  } catch (error) {
    console.error("Verify payment error", error);
    return res.status(500).json({
      success: false,
      message: "Verification server error."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
