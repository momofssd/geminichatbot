import { genAI } from "../ai.js";

const applyTemplate = (prompt, template, mode = "generate") => {
  if (template === "process_map") {
    if (mode === "edit") {
      return `Analyze the process map in the provided image. Understand its structure, flow, and components. 
Modify the process based on this instruction: "${prompt}". 
CRITICAL: Maintain the exact original color scheme, theme, and layout of the diagram unless specifically asked to change them. 
Your changes should be precise and integrated seamlessly into the existing map.`;
    }
    return `Create a professional, clear process map or flowchart based on the following description. Use clean lines, boxes, and arrows to represent the steps and flow. The diagram should be easy to read and follow: ${prompt}`;
  }
  return prompt;
};

const extractImages = (response) => {
  const images = [];
  const candidates = response.response.candidates;

  if (candidates?.[0]?.content?.parts) {
    for (const part of candidates[0].content.parts) {
      console.log("Checking part:", Object.keys(part));

      // Handle inlineData (standard for many models)
      if (part.inlineData?.data) {
        console.log("Found image in inlineData");
        images.push(
          `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}`,
        );
      }
      // Handle fileData (sometimes used in newer/different models)
      else if (part.fileData?.fileUri) {
        console.log("Found image in fileData (URI):", part.fileData.fileUri);
        // If it's a URI, we might need a different handling, but for now log it
      }
      // Handle potential direct data fields
      else if (part.data) {
        console.log("Found image in direct data field");
        images.push(`data:image/png;base64,${part.data}`);
      }
    }
  }
  return images;
};

export const generateImageHandler = async (req, res) => {
  const { prompt, size, modelId, template } = req.body;
  const finalPrompt = applyTemplate(prompt, template, "generate");

  try {
    const model = genAI.getGenerativeModel({
      model: modelId || "gemini-3-pro-image-preview",
    });
    const response = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: finalPrompt }] }],
      generationConfig: {
        imageConfig: { imageSize: size, aspectRatio: "1:1" },
      },
    });

    console.log(
      "Generate Response Structure:",
      JSON.stringify(
        response,
        (key, value) => {
          if (key === "data" && typeof value === "string" && value.length > 100)
            return value.substring(0, 50) + "...";
          return value;
        },
        2,
      ),
    );

    const images = extractImages(response);
    console.log("Images found:", images.length);
    res.json({ images });
  } catch (error) {
    console.error("Image Gen Error:", error);
    res.status(500).json({ error: error.message });
  }
};

export const editImageHandler = async (req, res) => {
  const { base64Image, prompt, modelId, template } = req.body;
  const finalPrompt = applyTemplate(prompt, template, "edit");

  try {
    const model = genAI.getGenerativeModel({
      model: modelId || "gemini-2.5-flash-image",
    });
    const response = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image.split(",")[1],
              },
            },
            { text: finalPrompt },
          ],
        },
      ],
    });

    console.log(
      "Edit Response Structure:",
      JSON.stringify(
        response,
        (key, value) => {
          if (key === "data" && typeof value === "string" && value.length > 100)
            return value.substring(0, 50) + "...";
          return value;
        },
        2,
      ),
    );

    const images = extractImages(response);
    console.log("Edit Images found:", images.length);
    res.json({ images });
  } catch (error) {
    console.error("Image Edit Error:", error);
    res.status(500).json({ error: error.message });
  }
};
