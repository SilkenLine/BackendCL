import dotenv from "dotenv";

dotenv.config();

export const PORT = process.env.PORT || 3000;
export const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error("Falta DATABASE_URL en el archivo .env");
}
