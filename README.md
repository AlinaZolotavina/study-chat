# LOM AI

English | [Русский](README.ru.md)

## About

LOM AI is a demo web client for an educational AI agent. It helps students explore learning topics, continue a conversation, and see tool results. The agent is fully simulated in the browser with no backend or external AI APIs.

Live demo: https://alinazolotavina.github.io/study-chat/

## Features

- Independent conversations with drafts and unread reply markers.
- Step-by-step learning explanations and follow-up suggestions.
- Streaming responses, progress statuses, and an execution history.
- Stop a response and retry after a failure.
- Markdown rendering, response copying, and PNG viewing and downloading.
- Responsive desktop, tablet, and mobile layouts.

## Demo scenarios

Start each scenario in a new chat. The prompts below are in Russian because that is the language supported by the demo.

| Prompt                                                       | Try                                                                                                      | Built-in failure                                                                                                                                            |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| «Объясни второй закон Ньютона» (Explain Newton's second law) | Ask for a simpler explanation, a diagram, or a real-life example in any order.                           | The first «Покажи схему» (Show a diagram) request fails while preparing the image. Retry returns the diagram.                                               |
| «Помоги решить уравнение» (Help me solve an equation)        | Solve `3(2x − 4) + 5 = 2(x + 7)` step by step with «Дальше» (Next) and questions about the current step. | After `6x − 7 = 2x + 14`, choose «Дальше»: the explanation of moving terms starts and is interrupted. Retry returns the complete explanation and `4x = 21`. |
| «Сколько будет 17 × 24?» (What is 17 × 24?)                  | Call the calculator and get `408` after Retry.                                                           | The first calculation fails in the calculator tool. Retry returns `408`.                                                                                    |

The calculator accepts integer expressions without an app-defined size limit, using addition (`+`), subtraction (`-`), multiplication (`×`, `*`, `x`), or division (`/`, `÷`). Very large numbers are limited by JavaScript's `Number` precision. Division by zero is not supported.

Each built-in failure is shown once per chat. Reloading the page does not reset whether a failure has already been shown. If Stop is pressed before the failure appears, the failure remains available for the next attempt.

## Run locally

Requirements: Node.js 22.23.2 (see `.nvmrc`) and npm 10.9.8.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5173/. If the port is busy, Vite prints the actual address.

| Command              | Purpose                                                             |
| -------------------- | ------------------------------------------------------------------- |
| `npm run dev`        | Start the development server.                                       |
| `npm run check`      | Run TypeScript, ESLint, Prettier, and Vitest checks.                |
| `npm run test:e2e`   | Run the Playwright E2E in Google Chrome against a production build. |
| `npm run check:all`  | Run all checks, including the E2E suite.                            |
| `npm run build`      | Create a production build in `dist`.                                |
| `npm run preview`    | Preview the build at http://127.0.0.1:4173/study-chat/.             |
| `npm run test:watch` | Run Vitest in watch mode.                                           |

Run `npm run build` before `npm run preview`.

## Configuration

No `.env` file or API keys are required. Main configuration files:

- [src/agent/config.ts](src/agent/config.ts) — mock-agent delays and streaming settings.
- [vite.config.ts](vite.config.ts) — ports, Vitest settings, and base paths: `/` in development and `/study-chat/` for production builds and preview.
- [playwright.config.ts](playwright.config.ts) — browser, timeouts, and the E2E test server.

## Tech stack

React 19, TypeScript 6, Vite 8, Redux Toolkit, CSS Modules, react-markdown, Vitest, and Playwright. Exact versions are pinned in `package.json` and `package-lock.json`.

## Architecture and project structure

```text
src/
├── main.tsx              # Application entry point
├── app/                  # App component, Redux store, and typed hooks
├── features/chat/
│   ├── model/            # Redux state, selectors, commands, and requestExecutor
│   └── ui/               # Chat components and local UI state
├── agent/                # Event contract, context, and mock scenarios
│   └── tools/            # Calculator and demo image tool
├── storage/              # Validation, persistence, and restoration
├── shared/               # Shared components and utilities
└── test/                 # Test utilities
e2e/                      # Playwright E2E
public/assets/            # Supplied Newton diagram
```

Key architectural choices:

- Domain data lives in Redux; temporary UI state stays in React.
- Async work is handled by a separate requestExecutor; reducers update state synchronously.
- The mock agent and tools do not depend on the UI or Redux.

See [Architecture](docs/Architecture.md) for architecture diagrams and rationale, and [Requirements](docs/Requirements.md) for functional requirements and quality criteria.

## Mock-agent events and streaming

- **Commands:** an explicit grammar runs after normalization; the topic and step are derived from successful history in that chat. Fallback responses preserve progress.
- **Events:** an `AsyncIterable` reports startup, phases, tool calls and results, text fragments, and completion or failure.
- **Streaming:** short Unicode fragments preserve Markdown meaning; speed depends on the content, with pauses between blocks.
- **Stop, Retry, and errors:** cancellation keeps the partial response; Retry clears the attempt and starts a new `runId` while preserving the original messages. Errors end an attempt and release its runtime resources.

## Local persistence

Chats are stored as one JSON value under `lom-ai:chat`, including messages, drafts, partial responses, and PNG paths. Writes are debounced by 400 ms, while important changes are saved immediately. If reading or writing fails, the app continues in memory; malformed JSON is not overwritten.

After reload, unfinished responses are marked `interrupted` and are not resumed automatically.

## Checks and testing

- `npm run check:all` runs TypeScript, ESLint, Prettier, 459 Vitest tests (including four integration scenarios), and one Playwright E2E. Run `npm run build` separately to verify the production build.
- Integration tests cover the store, thunks, and executor; the E2E covers one browser flow, including restoration after reload.
- Google Chrome must be installed for E2E. A production preview server starts automatically on port 4174.
- The [37 manual scenarios](docs/Requirements.md#manual-scenario-catalog) are listed in the requirements document. Acceptance checks were performed in Chrome/DevTools; other browsers and physical mobile devices were not verified.

See [Requirements](docs/Requirements.md) for coverage of each functional and quality requirement.

## Known limitations

- Arbitrary learning questions are not supported.
- Conversations are not synchronized across tabs.

## Use of AI tools

Codex was used during development. Here are two examples where I revised an AI-suggested implementation:

- **Separating command and reducer responsibilities.** Sending a question adds two messages: the user's question and an empty assistant response. The suggested reducer accepted them without enough validation, so a malformed action could connect a response to the wrong question or add a response that already contained text. I kept message creation in the send command and made the reducer validate the relationship, distinct IDs, and the response's empty initial state. If validation fails, neither message is added.
- **Using one policy to look up chats.** Chats are stored in a JavaScript object keyed by ID. The suggested implementation treated any value at a key as an existing chat. For example, `constructor` can resolve to an inherited function even when the object has no such chat, and reading its messages could throw. I added a shared `getChatById` helper using `Object.hasOwn` and used it for chat lookups. A missing chat is now rejected, while a chat created with that ID remains accessible.

Both fixes are covered by regression tests.

## Possible next steps

- Expand browser and accessibility checks, including tests on physical mobile devices.
- Add E2E coverage for multiple chats, Stop, and recovery from errors.
- When connecting a real agent, add a transport adapter while keeping the existing event contract.
