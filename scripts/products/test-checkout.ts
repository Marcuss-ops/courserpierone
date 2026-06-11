import { initLS, getStoreId } from "../../src/lib/payment/lemonsqueezy";
import { createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import fs from "fs";
import path from "path";

// Parse .env manually
const envContent = fs.readFileSync(path.join(process.cwd(), ".env"), "utf8");
for (const line of envContent.split("\n")) {
  const match = line.match(/^\s*([^#\s=]+)\s*=\s*(.*)$/);
  if (match) {
    const key = match[1];
    let val = match[2].trim();
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    process.env[key] = val;
  }
}

async function main() {
  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantIdStr = "1732285";
  
  console.log("Store ID:", storeId);
  console.log("Variant ID:", variantIdStr);
  console.log("API Key length:", process.env.LEMONSQUEEZY_API_KEY?.length || 0);

  if (!storeId || !process.env.LEMONSQUEEZY_API_KEY) {
    console.error("Missing store ID or API key in .env");
    process.exit(1);
  }

  initLS();

  const variantId = parseInt(variantIdStr, 10);

  try {
    const checkout = await createCheckout(storeId, variantId, {
      checkoutData: {
        email: "test-checkout@example.com",
        custom: {
          courseSlug: "amish-secrets",
          locale: "it",
        },
      },
      productOptions: {
        redirectUrl: `http://localhost:3000/amish-secrets/portal?lang=it&onboarded=1`,
        receiptButtonText: "Accedi al Corso",
        receiptLinkUrl: `http://localhost:3000/amish-secrets/portal?lang=it`,
      },
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    });

    if (checkout.error) {
      console.error("LS checkout error:", JSON.stringify(checkout.error, null, 2));
    } else {
      console.log("Success! Checkout URL:", checkout.data?.data.attributes.url);
    }
  } catch (err) {
    console.error("Caught error:", err);
  }
}

main();
