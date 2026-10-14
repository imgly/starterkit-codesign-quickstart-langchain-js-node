<p align="center">
  <img src=".github/assets/header.png" width="1280" alt="Design agent on LangChain.js: a text brief goes in, a finished design comes out as design.png and design.imgly">
</p>

# LangChain.js Design Agent — a CoDesign SDK Quickstart

A Node.js starter kit that runs a design agent on LangChain.js: type a brief,
and the agent designs it with IMG.LY's CoDesign SDK and hands you a PNG and an
editable design. It is for engineers who want to add AI design generation to
their product with LangChain.js.

**Documentation:**
[CoDesign SDK for LangChain.js](https://img.ly/docs/cesdk/codesign/starter-kits/quickstart-langchain-cdsqlc/) ·
**The same quickstart on:** [Vercel AI SDK](https://github.com/imgly/starterkit-codesign-quickstart-ai-sdk-js-node) · [OpenAI Agents SDK](https://github.com/imgly/starterkit-codesign-quickstart-openai-agents-js-node) · [Mastra](https://github.com/imgly/starterkit-codesign-quickstart-mastra-js-node) · [pi](https://github.com/imgly/starterkit-codesign-quickstart-pi-js-node) · [Claude Agent SDK](https://github.com/imgly/starterkit-codesign-quickstart-claude-agent-sdk-js-node)

Terms used below: **CE.SDK** is IMG.LY's design engine and editor. A
**design** is a CE.SDK scene, saved as an `.imgly` file. The **CoDesign SDK**
(`@imgly/codesign-sdk`) gives an AI model the tools to read, change, preview,
and export designs. The **executor** is where those tools run a CE.SDK engine:
here IMG.LY's `imgly/codesign-executor` Docker image on your machine. The
**gateway** is IMG.LY's AI gateway, which forwards model calls to the model
provider and charges them to your IMG.LY account.

## What You Get

- One script, `design.mjs`, that hands CoDesign's design tools to
  LangChain.js and runs the agent on your brief.
- Two files per run: `out/design.png`, and `out/design.imgly`, the editable
  design with its images and fonts.
- The design engine as IMG.LY's `imgly/codesign-executor` Docker image,
  started with `npm run executor`.
- The model through IMG.LY's AI gateway, paid with the same CoDesign license
  key: no account with a model provider.

## What's Inside

```
design.mjs      # the agent runner: prepares the tools, hands them to a LangChain agent, exports the result
.env.template   # the variables both read; copy it to .env
package.json    # the SDK, LangChain, and its OpenAI chat model, at exact versions; `npm run executor` starts the executor
tsconfig.json   # `npm run check` type-checks design.mjs
```

## Run It

You need Docker, Node.js 22 or newer, and a **CoDesign license key**.
[Contact sales](https://img.ly/forms/contact-sales/) to get a CoDesign license key. That one key
starts the design engine, pays for each exported file, and pays for the model
through the gateway. You need no account with a model provider.

```sh
npm install
cp .env.template .env
```

In `.env`, set `IMGLY_CESDK_LICENSE` to your key; `EXECUTOR_TOKEN` is already
filled in. Then start the executor
and check that it answers:

```sh
npm run executor
curl http://localhost:8080/health
# {"result":{"sessions":0,"accepting":true,"bound":false,...}}
```

The first start downloads the image. If `/health` does not answer, run
`docker logs codesign-executor-langchain`: the executor stops at start when the key is
missing or cannot be activated, or when it cannot reach `api.img.ly`.

After you change `.env`, run `npm run executor` again: it replaces the
container, which reads `.env` only when it starts.

Then design something:

```sh
npm start -- "A square Instagram post for a 20% spring sale on ceramic mugs. Calm, premium, lots of white space."
```

You see each tool call as it happens (`✓ …`), then the model's one-sentence
summary, a line with the steps, seconds, and tokens, and last
`Wrote out/design.png and out/design.imgly`. A run takes around 3 minutes, depending on the model and how hard the brief is.

- `out/design.png` is a picture of the design.
- `out/design.imgly` is the editable design, with its images and fonts. Open
  it in a CE.SDK editor of exactly the version the executor runs, which the
  SDK exports as `CESDK_VERSION`: an older or newer editor that saves it drops
  what the other version wrote.

To stop and remove the executor, run `npm run executor:stop`.

### The Executor Between Runs

The executor serves one conversation, the id `design.mjs` sets
(`quickstart`), and exits half a minute after the script releases the design
at the end of a run. Docker starts it again (`--restart always`), and it keeps
its conversation in memory (`--tmpfs`), so it comes back ready for your next
run. A run that starts in the few seconds of a restart fails with
`executor_unreachable`: wait until `/health` answers again.

Before you run the executor anywhere but your machine, follow
[Host the Executor](https://img.ly/docs/cesdk/codesign/deploy/host-the-executor-cdshst/).

## What It Costs

Each run exports one PNG, which is charged to the IMG.LY account behind the
key; the `.imgly` file, the edits, and the previews are free. The model's
tokens are charged to the same account through the gateway.

## Make It Yours

- Keep the design in your database: pass `designs`, a `read` and a `write`
  over the table your editor saves to.
- Start from a customer's file (PSD, PDF, `.imgly`): call
  `codesign.load(bytes)` before the model runs.
- Give the model your brand and media: add your own CE.SDK plugin to
  `plugins`.
- Let the model generate images: pass `gateway: { bearer }`.
- Give each conversation its own executor: make `acquire` answer a new
  container per conversation.

## Variables

| Variable              | What it is                                                                                                                                                                                                                                                                                                                  |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `IMGLY_CESDK_LICENSE` | Your CoDesign license key. The executor uses it for the engine and exports, the script for the model.                                                                                                                                                                                                                       |
| `EXECUTOR_TOKEN`      | A secret the executor and the script share. A different one gets 401.                                                                                                                                                                                                                                                       |
| `MODEL`               | Optional. Default `@openrouter/anthropic/claude-opus-5`. Any model OpenRouter serves works as `@openrouter/` and its OpenRouter id, such as `@openrouter/anthropic/claude-haiku-5.5`. The gateway lists its own ids with your key: `curl -H "Authorization: Bearer $IMGLY_CESDK_LICENSE" https://gateway.img.ly/v1/models`. |
| `EXECUTOR_URL`        | Optional. Default `http://localhost:8080`.                                                                                                                                                                                                                                                                                  |

## Troubleshooting

| Symptom                                                                                                                                                                                | Cause and fix                                                                                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `The container name "/codesign-executor-langchain" is already in use`, or `docker logs codesign-executor-langchain` shows `no CoDesign license key` and the container keeps restarting | The container still has the `.env` it was started with. Run `npm run executor` again: it replaces the container.                                                             |
| `node: .env: not found`                                                                                                                                                                | Copy `.env.template` to `.env`.                                                                                                                                              |
| `Missing IMGLY_CESDK_LICENSE, EXECUTOR_TOKEN`                                                                                                                                          | Set both in `.env`.                                                                                                                                                          |
| The script uses another key or token than the one in `.env`                                                                                                                            | `npm start` reads `.env` with Node's `--env-file`, which never overrides a variable already exported in your shell. Unset it there, for example `unset IMGLY_CESDK_LICENSE`. |
| `The page has no blocks, so no PNG was exported`                                                                                                                                       | Usually the model asked a question instead of designing. Put the answer into the brief, and run again. No export was charged.                                                |
| `missing or wrong executor token`                                                                                                                                                      | The executor answered 401 with another token: after changing `EXECUTOR_TOKEN`, run `npm run executor` again so the executor gets it.                                         |
| `executor_unreachable`                                                                                                                                                                 | The executor is not running or restarting: check `curl http://localhost:8080/health`.                                                                                        |
| The gateway answers 402 `insufficient_credits`                                                                                                                                         | The account behind the key is out of credits.                                                                                                                                |
| `The run ended with an error`                                                                                                                                                          | The message after it says why, such as the gateway refusing a call or the step limit; no PNG was exported, and the design so far is in `out/design.imgly`.                   |

## FAQ

### Which models can it use?

Any model IMG.LY's AI gateway serves: set `MODEL` in `.env` to one of the ids
at `https://gateway.img.ly/v1/models`. The default is
`@openrouter/anthropic/claude-opus-5`.

### Do I need an account with a model provider?

No. Your CoDesign license key pays for the model through the gateway.

### Can a person keep editing the design?

Yes. `out/design.imgly` opens in a CE.SDK editor of exactly the version the
executor runs, which the SDK exports as `CESDK_VERSION`.

## License

This kit is licensed under IMG.LY's license; see `LICENSE.md`. Using the CoDesign
SDK and the executor needs a CoDesign license key. [Contact sales](https://img.ly/forms/contact-sales/) to get a CoDesign license key.

---

<p align="center">Built with CoDesign by <a href="https://img.ly">IMG.LY</a></p>
