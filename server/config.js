import dotenv from "dotenv";
dotenv.config();

export const apiKey = process.env.GEMINI_API_KEY;
export const AES_KEY = process.env.AES_KEY;
export const port = process.env.PORT || 3001;

if (!apiKey) {
  console.error("GEMINI_API_KEY is not set in environment variables");
  process.exit(1);
}

if (!AES_KEY) {
  console.error("AES_KEY is not set in environment variables");
  process.exit(1);
}
