import type WebSocket from "ws";

export const connected_clients = new Set<WebSocket>();
