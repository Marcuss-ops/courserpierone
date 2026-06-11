import { execSync } from "child_process";

async function main() {
  console.log("Starting deployment cleanup...");
  
  let nextId: string | null = null;
  let allUrls: string[] = [];

  while (true) {
    const command = nextId ? `npx vercel ls --next ${nextId}` : "npx vercel ls";
    console.log(`Running: ${command}`);
    
    let output: string;
    try {
      output = execSync(command, { encoding: "utf8" });
    } catch (e: any) {
      console.error("Failed to list deployments:", e.message);
      break;
    }

    // Extract URLs from stdout
    const urls = output.match(/https:\/\/[a-zA-Z0-9-]+\.vercel\.app/g) || [];
    // Convert to hostname
    const hostnames = urls.map(u => u.replace("https://", ""));
    allUrls.push(...hostnames);

    // Check for next page ID
    const nextMatch = output.match(/--next\s+(\d+)/);
    if (nextMatch && nextMatch[1]) {
      nextId = nextMatch[1];
    } else {
      break;
    }
  }

  // Remove duplicates
  allUrls = [...new Set(allUrls)];
  console.log(`Found ${allUrls.length} unique deployments to remove.`);

  for (const host of allUrls) {
    console.log(`Removing deployment: ${host}`);
    try {
      const removeOutput = execSync(`npx vercel rm ${host} -y`, { encoding: "utf8" });
      console.log(removeOutput.trim());
    } catch (e: any) {
      console.warn(`Could not remove ${host}:`, e.message);
    }
  }

  console.log("Cleanup complete!");
}

main().catch(console.error);
