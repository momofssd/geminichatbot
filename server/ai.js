import { GoogleGenerativeAI } from "@google/generative-ai";
import { apiKey } from "./config.js";

export const genAI = new GoogleGenerativeAI(apiKey);

export const GROUNDING_TOOL = { googleSearch: {} };
