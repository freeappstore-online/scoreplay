# Cloud data access models

Device-local data uses @freeappstore/sdk/persist and does not sync.
Private per-account data uses fas.kv and requires sign-in.
Public shared data uses fas.collections and is public-read, owner-write.
Select it explicitly with collection(name, { visibility: 'public-read' }).
An owner query filter does not make a document private.
Room-restricted durable data uses authenticated backend data-room endpoints,
documented at https://github.com/freeappstore-online/platform/blob/main/docs/data-rooms.md.
The SDK does not yet wrap these endpoints. Realtime rooms are broadcast channels,
not authorization boundaries. Do not store hidden votes or private room data in
public collections.
See https://github.com/freeappstore-online/platform/blob/main/docs/sdk.md
