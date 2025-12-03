import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
});

// Use Llama 3.1 70B for best quality (free on Groq)
const MODEL = "llama-3.1-70b-versatile";

export interface BlogPostGenerationParams {
  keyword: string;
  tone?: "professional" | "casual" | "friendly" | "authoritative";
  length?: "short" | "medium" | "long";
  includeProductLinks?: boolean;
  products?: Array<{ title: string; handle: string; description?: string }>;
  additionalInstructions?: string;
}

export interface GeneratedBlogPost {
  title: string;
  content: string;
  excerpt: string;
  metaTitle: string;
  metaDescription: string;
  suggestedTags: string[];
  internalLinks: Array<{ text: string; url: string }>;
}

export async function generateBlogPost(
  params: BlogPostGenerationParams
): Promise<GeneratedBlogPost> {
  const { keyword, tone = "professional", length = "medium", includeProductLinks, products, additionalInstructions } = params;

  const wordCount = length === "short" ? 800 : length === "medium" ? 1500 : 2500;

  const productContext = products?.length
    ? `\n\nAvailable products to mention and link:\n${products.map((p) => `- ${p.title} (/products/${p.handle}): ${p.description || ""}`).join("\n")}`
    : "";

  const prompt = `You are an expert SEO content writer. Generate a comprehensive, SEO-optimized blog post about "${keyword}".

Requirements:
- Tone: ${tone}
- Target word count: approximately ${wordCount} words
- Include proper heading structure (H2, H3)
- Include the primary keyword naturally throughout the content
- Write engaging, valuable content that provides real value to readers
- Include a compelling introduction and conclusion
${includeProductLinks ? "- Naturally mention and recommend relevant products from the store where appropriate" : ""}
${productContext}
${additionalInstructions ? `\nAdditional instructions: ${additionalInstructions}` : ""}

Please provide the response in the following JSON format:
{
  "title": "SEO-optimized title (60 characters max)",
  "content": "Full HTML content with proper heading tags",
  "excerpt": "Compelling excerpt (160 characters max)",
  "metaTitle": "Meta title (60 characters max)",
  "metaDescription": "Meta description (160 characters max)",
  "suggestedTags": ["tag1", "tag2", "tag3"],
  "internalLinks": [{"text": "anchor text", "url": "/products/handle"}]
}

IMPORTANT: Respond ONLY with valid JSON, no additional text.`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are an expert SEO content writer specializing in e-commerce blog posts. Always respond with valid JSON only, no markdown formatting or code blocks.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 4000,
  });

  const content = response.choices[0].message.content || "{}";
  // Clean up any markdown code blocks if present
  const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleanedContent);
  return result as GeneratedBlogPost;
}

export interface MetaTagGenerationParams {
  title: string;
  description?: string;
  type: "product" | "collection" | "page" | "article";
  keywords?: string[];
}

export interface GeneratedMetaTags {
  metaTitle: string;
  metaDescription: string;
}

export async function generateMetaTags(
  params: MetaTagGenerationParams
): Promise<GeneratedMetaTags> {
  const { title, description, type, keywords } = params;

  const prompt = `Generate SEO-optimized meta title and description for a ${type}.

Title: ${title}
${description ? `Description: ${description}` : ""}
${keywords?.length ? `Target keywords: ${keywords.join(", ")}` : ""}

Requirements:
- Meta title: 50-60 characters, include primary keyword near the beginning
- Meta description: 150-160 characters, compelling and include a call to action
- Make them engaging and click-worthy

Respond in JSON format ONLY:
{
  "metaTitle": "...",
  "metaDescription": "..."
}`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are an SEO expert. Generate compelling meta tags that improve click-through rates. Always respond with valid JSON only, no markdown formatting.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 500,
  });

  const content = response.choices[0].message.content || "{}";
  const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleanedContent);
  return result as GeneratedMetaTags;
}

export interface AltTextGenerationParams {
  imageUrl: string;
  productTitle?: string;
  productDescription?: string;
  context?: string;
}

export async function generateAltText(
  params: AltTextGenerationParams
): Promise<string> {
  const { productTitle, productDescription, context } = params;

  const prompt = `Generate an SEO-optimized alt text for an image.

${productTitle ? `Product: ${productTitle}` : ""}
${productDescription ? `Description: ${productDescription}` : ""}
${context ? `Context: ${context}` : ""}

Requirements:
- Be descriptive and specific
- Include relevant keywords naturally
- Keep it under 125 characters
- Don't start with "Image of" or "Picture of"

Respond with just the alt text, no quotes or additional formatting.`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are an accessibility and SEO expert. Generate descriptive, keyword-rich alt text for images. Respond with only the alt text, nothing else.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 100,
  });

  return response.choices[0].message.content?.trim() || "";
}

export interface KeywordSuggestion {
  keyword: string;
  searchVolume: string;
  difficulty: string;
  intent: "informational" | "commercial" | "transactional" | "navigational";
}

export async function generateKeywordSuggestions(
  seedKeyword: string,
  industry?: string
): Promise<KeywordSuggestion[]> {
  const prompt = `Generate 10 related SEO keyword suggestions for "${seedKeyword}"${industry ? ` in the ${industry} industry` : ""}.

For each keyword, provide:
- The keyword phrase
- Estimated search volume (low/medium/high)
- Competition difficulty (easy/medium/hard)
- Search intent (informational/commercial/transactional/navigational)

Respond in JSON format ONLY:
{
  "keywords": [
    {
      "keyword": "...",
      "searchVolume": "low|medium|high",
      "difficulty": "easy|medium|hard",
      "intent": "informational|commercial|transactional|navigational"
    }
  ]
}`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are an SEO keyword research expert. Provide realistic keyword suggestions based on common search patterns. Always respond with valid JSON only, no markdown formatting.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 1000,
  });

  const content = response.choices[0].message.content || '{"keywords": []}';
  const cleanedContent = content.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleanedContent);
  return result.keywords as KeywordSuggestion[];
}

export interface ContentOptimizationSuggestion {
  type: "title" | "headings" | "content" | "keywords" | "readability" | "links";
  priority: "high" | "medium" | "low";
  suggestion: string;
  example?: string;
}

export async function analyzeContentForSEO(
  content: string,
  targetKeyword?: string
): Promise<ContentOptimizationSuggestion[]> {
  const prompt = `Analyze the following content for SEO optimization${targetKeyword ? ` targeting the keyword "${targetKeyword}"` : ""}.

Content:
${content.substring(0, 3000)}

Provide specific, actionable suggestions for improving:
1. Title optimization
2. Heading structure
3. Keyword usage and density
4. Content quality and readability
5. Internal linking opportunities

Respond in JSON format ONLY:
{
  "suggestions": [
    {
      "type": "title|headings|content|keywords|readability|links",
      "priority": "high|medium|low",
      "suggestion": "...",
      "example": "..."
    }
  ]
}`;

  const response = await groq.chat.completions.create({
    model: MODEL,
    messages: [
      {
        role: "system",
        content: "You are an SEO content analyst. Provide specific, actionable suggestions for improving content SEO. Always respond with valid JSON only, no markdown formatting.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const content_response = response.choices[0].message.content || '{"suggestions": []}';
  const cleanedContent = content_response.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const result = JSON.parse(cleanedContent);
  return result.suggestions as ContentOptimizationSuggestion[];
}

export default groq;
