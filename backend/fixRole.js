import mongoose from "mongoose";
const MONGODB_URI = "mongodb+srv://ali-islamic:xlUR8DWnt7jpcw2M@cluster0.0nsjvku.mongodb.net/tradetayyab?retryWrites=true&w=majority";

async function run() {
  await mongoose.connect(MONGODB_URI);
  const AppStateSchema = new mongoose.Schema({ data: { type: Object } }, { minimize: false });
  const AppStateModel = mongoose.models.AppState || mongoose.model("AppState", AppStateSchema, "appstate");

  const existing = await AppStateModel.findOne().lean();
  if (existing && existing.data && existing.data.users) {
    let changed = false;
    existing.data.users.forEach(u => {
      console.log(`[DB] User: ${u.email} | Current Role: ${u.role}`);
      if (u.role !== "admin") {
        u.role = "admin";
        changed = true;
        console.log(`[ACTION] Promoted ${u.email} to admin.`);
      }
    });

    if (changed) {
      await AppStateModel.replaceOne({}, { data: existing.data }, { upsert: true });
      console.log("\n✅ SUCCESS: All users in MongoDB Atlas have been forcefully promoted to 'admin'.");
      console.log("⚠️ CRITICAL: You MUST restart your backend server terminal NOW, otherwise it will revert this change.");
    } else {
      console.log("All users are already admins in the database.");
    }
  } else {
    console.log("No users found in database.");
  }
  process.exit(0);
}
run();
