import assert from "node:assert";
import { markSeen, onlineUserIds, ONLINE_WINDOW_MS } from "../src/lib/presence";
markSeen("a", 0); markSeen("b", 1000);
assert.deepEqual(onlineUserIds(ONLINE_WINDOW_MS), ["a", "b"]);
assert.deepEqual(onlineUserIds(ONLINE_WINDOW_MS + 500), ["b"]);
console.log("presence ok");
