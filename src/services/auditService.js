const pool = require("../db/pool");

exports.logAction = async ({
  userId,
  role,
  action,
  entityType,
  entityId,
  details,
  ip,
}) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, user_role, action, entity_type, entity_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [userId, role, action, entityType, entityId, JSON.stringify(details), ip],
    );
  } catch (err) {
    console.error("Audit log failed:", err.message);
  }
};
