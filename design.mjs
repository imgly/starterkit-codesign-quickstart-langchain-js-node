// A brief in, a finished design out: LangChain.js runs the model through IMG.LY's gateway, the engine runs in one local executor.
import { mkdir, writeFile } from 'node:fs/promises';

import {
  googleFonts,
  prepareCoDesign,
  remoteExecutors
} from '@imgly/codesign-sdk';
import { ChatOpenAI } from '@langchain/openai';
import {
  AIMessage,
  createAgent,
  createMiddleware,
  HumanMessage,
  tool,
  ToolMessage
} from 'langchain';

const brief = process.argv[2];
const missing = [
  ...(brief ? [] : ['a brief (the first argument)']),
  ...['IMGLY_CESDK_LICENSE', 'EXECUTOR_TOKEN'].filter((n) => !process.env[n])
];
if (missing.length > 0) {
  console.error(
    `Missing ${missing.join(', ')}.\nUsage: npm start -- "<brief>", with the variables of .env.template set in .env`
  );
  process.exit(1);
}

// IMG.LY's AI gateway speaks OpenAI's Chat Completions; your CoDesign license key is its API key.
const model = new ChatOpenAI({
  model: process.env.MODEL || '@openrouter/anthropic/claude-opus-5',
  apiKey: process.env.IMGLY_CESDK_LICENSE,
  configuration: { baseURL: 'https://gateway.img.ly/v1' }
});

const codesign = prepareCoDesign({
  // Your id for this job. Every design of a conversation opens on one executor
  // that serves no other conversation. Every run here is yours, so all share one.
  conversation: 'quickstart',
  executors: remoteExecutors({
    // The executor for a conversation. Here there is one; a product starts a
    // new one for each conversation.
    acquire: () => ({
      url: process.env.EXECUTOR_URL || 'http://localhost:8080'
    }),
    token: process.env.EXECUTOR_TOKEN
  }),
  // The CE.SDK plugins the engine applies: everything the agent can search and
  // place. Google Fonts is the smallest useful list; your own plugins go here.
  plugins: [googleFonts()],
  design: `quickstart-${Date.now()}`, // any id; with no `designs` store, the design lives in memory
  gateway: false // no image generation; the model still runs through the gateway
});

// The SDK's tools in LangChain's shape: a JSON Schema for the input, and the
// result as LangChain's text and image content blocks.
const tools = codesign.tools.map((t) =>
  tool(
    async (args, config) => {
      const result = await t.call(args, { signal: config?.signal });
      console.log(`${result.isError ? '✗' : '✓'} ${t.name}`);
      const content = result.content.map((p) =>
        p.type === 'text'
          ? { type: /** @type {const} */ ('text'), text: p.text }
          : {
              type: /** @type {const} */ ('image'),
              mimeType: p.mimeType,
              data: p.data
            }
      );
      if (result.isError)
        throw new Error(content.map((p) => p.text ?? '').join('\n')); // the model reads it as a failed call
      return content;
    },
    {
      name: t.name,
      description: t.description ?? '',
      schema: /** @type {Record<string, unknown>} */ (t.inputSchema)
    }
  )
);

// Chat Completions has no images in a tool result: move each render into a
// user message after it, in OpenAI's image_url shape, so the model sees its work.
function imagesAfterToolResults(messages) {
  const out = [];
  let images = [];
  const flush = () => {
    if (images.length === 0) return;
    out.push(
      new HumanMessage({
        content: [
          { type: 'text', text: 'Attached image(s) from tool result:' },
          ...images
        ]
      })
    );
    images = [];
  };
  for (const message of messages) {
    if (
      !ToolMessage.isInstance(message) ||
      typeof message.content === 'string'
    ) {
      flush();
      out.push(message);
      continue;
    }
    const isImage = (block) => block.type === 'image';
    const kept = message.content.filter((block) => !isImage(block));
    if (kept.length === message.content.length) {
      out.push(message);
      continue;
    }
    for (const image of message.content.filter(isImage)) {
      images.push({
        type: 'image_url',
        image_url: { url: `data:${image.mimeType};base64,${image.data}` }
      });
    }
    out.push(
      new ToolMessage({
        tool_call_id: message.tool_call_id,
        name: message.name,
        status: message.status,
        content:
          kept.length > 0
            ? kept
            : [{ type: 'text', text: '(see attached image)' }]
      })
    );
  }
  flush();
  return out;
}

const showRenders = createMiddleware({
  name: 'ShowRenders',
  wrapModelCall: (request, handler) =>
    handler({ ...request, messages: imagesAfterToolResults(request.messages) })
});

const agent = createAgent({
  model,
  tools,
  systemPrompt: `You design marketing visuals. When you are done, say in one sentence what you made.\n\n${codesign.instructions}`,
  middleware: [showRenders]
});

const started = Date.now();
let messages;
try {
  // A model call and its round of tool calls are two steps of the agent's
  // graph, so 120 lets the model take 60 turns. The default, 25, ends a design run early.
  ({ messages } = await agent.invoke(
    { messages: [new HumanMessage(brief)] },
    { recursionLimit: 120 }
  ));
} catch (err) {
  console.error(
    `The run ended with an error after ${Math.round((Date.now() - started) / 1000)} s: ${err instanceof Error ? err.message : err}; nothing exported.`
  );
  await codesign.release();
  process.exit(1);
}
const answers = messages.filter((m) => AIMessage.isInstance(m));
const last = answers.at(-1);
console.log(`\n${last?.text ?? ''}`);
const usage = (key) =>
  answers.reduce((sum, m) => sum + (m.usage_metadata?.[key] ?? 0), 0);
console.log(
  `${answers.length} steps, ${Math.round((Date.now() - started) / 1000)} s, ` +
    `${usage('input_tokens')} input / ${usage('output_tokens')} output tokens`
);
await mkdir('out', { recursive: true });
await writeFile('out/design.png', await codesign.export('png'));
await writeFile('out/design.imgly', await codesign.export('imgly'));
console.log('Wrote out/design.png and out/design.imgly');
await codesign.release(); // ends the design's session now; the engine closes about 30 s later
