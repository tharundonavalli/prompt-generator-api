const express = require("express");
const bodyParser = require("body-parser");
const crypto = require("crypto");
const cors = require("cors");

const app = express();
const PORT = process.env.port || 3000;
const RAZORPAY_SECRET = "promptstudio_secure_2129";
const SUPABASE_URL = "https://evaskpthhzfynrplpqqd.supabase.co";
const SUPABASE_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2YXNrcHRoaHpmeW5ycGxwcXFkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NTM4NTM5MywiZXhwIjoyMDkwOTYxMzkzfQ.K9vRRmjUB44sz4Nd4QsWBijocbe_xg26TJ1XOELeULU";

app.use(cors());
app.use((req, res, next) => {
  if (req.originalUrl === "/webhook") {
    return next();
  }

  return bodyParser.json()(req, res, next);
});

app.get("/", (req, res) => {
  res.json({
    status: "ok",
    message: "PromptStudio AI webhook server is running."
  });
});

app.post("/webhook", bodyParser.raw({ type: "application/json" }), async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.body;

  if (!signature || !Buffer.isBuffer(rawBody)) {
    console.log("Invalid webhook request");
    return res.sendStatus(200);
  }

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_SECRET)
    .update(rawBody)
    .digest("hex");

  const isValidSignature = signature.length === expectedSignature.length
    && crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));

  if (isValidSignature) {
    console.log("Payment verified");
    try {
      const payload = JSON.parse(rawBody.toString("utf8"));
      const payment = payload && payload.payload && payload.payload.payment && payload.payload.payment.entity;
      const userId = payment && payment.notes ? payment.notes.user_id : "";
      const plan = payment && payment.notes ? payment.notes.plan : "";

      if (!userId || !plan) {
        console.log("Webhook missing user_id or plan");
        return res.sendStatus(200);
      }

      const now = new Date();
      let expiresAt;

      if (plan === "basic") {
        expiresAt = new Date(now.setDate(now.getDate() + 30));
      } else {
        expiresAt = new Date(now.setDate(now.getDate() + 90));
      }

      const supabaseResponse = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_SERVICE_KEY,
          "Authorization": `Bearer ${SUPABASE_SERVICE_KEY}`
        },
        body: JSON.stringify({
          user_id: userId,
          plan,
          status: "active",
          expires_at: expiresAt.toISOString()
        })
      });

      if (!supabaseResponse.ok) {
        const errorText = await supabaseResponse.text();
        console.log("Failed to save subscription from webhook", errorText);
      } else {
        console.log("Subscription saved from webhook");
      }
    } catch (error) {
      console.log("Webhook processing failed", error);
    }
  } else {
    console.log("Invalid signature");
  }

  return res.sendStatus(200);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
