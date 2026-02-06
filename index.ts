import { Stagehand } from "@browserbasehq/stagehand";
import { Kernel, type KernelContext } from '@onkernel/sdk';

const kernel = new Kernel({
  apiKey: process.env.KERNEL_API_KEY
});

const app = kernel.app('ts-stagehand-google-cua-agent');

interface SearchQueryOutput {
  success: boolean;
  result: string;
}

// GOOGLE_API_KEY: Required for Gemini 2.5 Computer Use Agent
// Set via environment variables or `kernel deploy <filename> --env-file .env`
const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

if (!GOOGLE_API_KEY) {
  throw new Error('GOOGLE_API_KEY is not set');
}

async function runStagehandTask(invocationId?: string): Promise<SearchQueryOutput> {
  const VIEWPORT = { width: 1440, height: 900 };

  const browserOptions = invocationId
    ? { invocation_id: invocationId, stealth: true, viewport_width: VIEWPORT.width, viewport_height: VIEWPORT.height }
    : { stealth: true, viewport_width: VIEWPORT.width, viewport_height: VIEWPORT.height };

  const kernelBrowser = await kernel.browsers.create(browserOptions);

  console.log("Kernel browser live view url: ", kernelBrowser.browser_live_view_url);

  const stagehand = new Stagehand({
    env: "LOCAL",
    verbose: 1,
    domSettleTimeout: 30_000,
    localBrowserLaunchOptions: {
      cdpUrl: kernelBrowser.cdp_ws_url,
      viewport: VIEWPORT
    }
  });
  await stagehand.init();

  try {
    const page = stagehand.context.pages()[0];
    if (!page) throw new Error("No page available");

    await page.goto("https://www.ycombinator.com/companies");

    const agent = stagehand.agent({
      mode: "cua",
      model: { 
        modelName: "google/gemini-2.5-computer-use-preview-10-2025",
        apiKey: GOOGLE_API_KEY
      },
      systemPrompt: `You are a helpful assistant that can use a web browser.
You are currently on the following page: ${page.url()}.
Do not ask follow up questions, the user will trust your judgement.`,
    });

    const instruction = "Search for 'Kernel' in the search box and then tell me the number of employees on the company page.";

    const result = await agent.execute({
      instruction,
      maxSteps: 20,
    });

    console.log("result: ", result);

    return { success: true, result: result.message };
  } catch (error) {
    console.error(error);
    return { success: false, result: "" };
  } finally {
    console.log("Deleting browser and closing stagehand...");
    await stagehand.close();
    await kernel.browsers.deleteByID(kernelBrowser.session_id);
  }
}

// Invoked via: kernel invoke ts-stagehand-google-cua-agent google-cua-agent-task
app.action<void, SearchQueryOutput>(
  'google-cua-agent-task',
  async (ctx: KernelContext): Promise<SearchQueryOutput> => {
    return runStagehandTask(ctx.invocation_id);
  },
);

// Execute via: npx tsx index.ts
if (import.meta.url === `file://${process.argv[1]}`) {
  runStagehandTask().then(result => {
    console.log('Local execution result:', result);
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Local execution failed:', error);
    process.exit(1);
  });
}
