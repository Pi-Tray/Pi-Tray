import type {MessagePayload} from "@pi-tray/types";

import type {Client} from "./clients";

// the shared types live in packages/types, this re-export keeps the server's own imports working
export * from "@pi-tray/types";

/**
 * A function that handles a message from a client.<br>
 * Each module (except `index.ts`) in the `src/handlers` directory should export a default function with this signature.<br>
 * Then it should be added as an export in `src/handlers/index.ts`.<br>
 * The name of the export should match the action it handles.<br>
 * The handler receives the {@link Client}, whose send() encrypts over the secure channel.
 */
export type MessageHandler = (client: Client, data: MessagePayload) => Promise<void>;
