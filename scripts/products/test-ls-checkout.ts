import { initLS } from "../../src/lib/payment/lemonsqueezy";
import { createCheckout } from "@lemonsqueezy/lemonsqueezy.js";
import fs from "fs";
import path from "path";

// Simple env parser
function loadEnv() {
  try {
    const envPath = path.join(process.cwd(), ".env");
    const content = fs.readFileSync(envPath, "utf8");
    for (const line of content.split("\n")) {
      const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
      if (match) {
        const key = match[1];
        let val = match[2] || "";
        if (val.startsWith('"') && val.endsWith('"')) {
          val = val.substring(1, val.length - 1);
        }
        process.env[key] = val;
      }
    }
  } catch (e) {
    console.error("Could not load .env file", e);
  }
}

async function main() {
  loadEnv();

  const storeId = process.env.LEMONSQUEEZY_STORE_ID;
  const variantId = 1792263;

  console.log("Using Store ID:", storeId);
  console.log("Using Variant ID:", variantId);
  console.log("Using API Key:", process.env.LEMONSQUEEZY_API_KEY?.substring(0, 15) + "...");

  initLS();

  try {
    const checkout = await createCheckout(storeId!, variantId, {
      checkoutData: {
        email: "test@example.com",
      },
      productOptions: {
        redirectUrl: "https://www.courssy.com/en-us/amish-secrets/download?lang=en-us",
        receiptButtonText: "Access Downloads",
        receiptLinkUrl: "https://www.courssy.com/en-us/amish-secrets/download?lang=en-us",
      },
    });

    if (checkout.error) {
      console.error("LS Error details:", JSON.stringify(checkout.error, null, 2));
    } else {
      console.log("Success! Checkout URL:", checkout.data?.data.attributes.url);
    }
  } catch (e) {
    console.error("Exception occurred:", e);
  }
}

main();
