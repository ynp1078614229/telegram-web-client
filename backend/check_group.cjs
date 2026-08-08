const Database = require("better-sqlite3");
const db = new Database("./data/telegram.db");

// Find VisionCloudCompute group
const group = db.prepare("SELECT * FROM chats WHERE title LIKE '%Vision%'").get();
console.log("Group:", JSON.stringify(group, null, 2));

if (group) {
  // Check messages for this group
  const msgs = db.prepare("SELECT id, type, text, sender_name, timestamp, media_url FROM messages WHERE chat_id = ? ORDER BY timestamp DESC LIMIT 30").all(group.id);
  console.log("\nMessages (" + msgs.length + "):");
  for (const m of msgs) {
    console.log(JSON.stringify(m));
  }
}
