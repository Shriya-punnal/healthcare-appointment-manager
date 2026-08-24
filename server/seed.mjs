import mysql from "mysql2/promise";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
const db = await mysql.createConnection(process.env.DATABASE_URL);
const doctors = [
  ["11111111-1111-4111-8111-111111111111", "Dr. Helena Ward", "helena.ward@clinic.demo", "Family Medicine", "DEMO-FM-001", "Continuity-focused primary care for adults and families.", "UTC", 30],
  ["22222222-2222-4222-8222-222222222222", "Dr. Amir Patel", "amir.patel@clinic.demo", "Cardiology", "DEMO-CARD-001", "Thoughtful cardiovascular consultations and follow-up planning.", "UTC", 30],
  ["33333333-3333-4333-8333-333333333333", "Dr. Sofia Chen", "sofia.chen@clinic.demo", "Dermatology", "DEMO-DERM-001", "Evidence-led skin health assessment and treatment planning.", "UTC", 20],
];
for (const doctor of doctors) {
  await db.execute("INSERT INTO doctor_profiles (id, displayName, email, specialization, licenseNumber, biography, timezone, slotDurationMinutes, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, true) ON DUPLICATE KEY UPDATE displayName=VALUES(displayName), specialization=VALUES(specialization), biography=VALUES(biography), slotDurationMinutes=VALUES(slotDurationMinutes), active=true", doctor);
  await db.execute("DELETE FROM doctor_working_hours WHERE doctorId = ?", [doctor[0]]);
  for (const weekday of [1, 2, 3, 4, 5]) await db.execute("INSERT INTO doctor_working_hours (id, doctorId, weekday, startMinute, endMinute, enabled) VALUES (UUID(), ?, ?, 540, 1020, true)", [doctor[0], weekday]);
}
console.log("Seeded three demo doctor profiles and weekday working hours. OAuth identities are intentionally not seeded; assign real authenticated users through the admin workflow.");
await db.end();
