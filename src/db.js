import { createPool } from "mysql2/promise";
import { DB_HOST, DB_NAME, DB_PASSWORD, DB_PORT, DB_USER } from "./config.js";

export const pool = createPool({
  host: DB_HOST, // El orden es importante
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  port: DB_PORT,
  // ¡Nuevo: Conexión segura obligatoria!
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
