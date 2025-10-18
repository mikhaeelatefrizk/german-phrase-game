/**
 * Enhanced LLM Integration Module
 * 
 * Provides advanced LLM capabilities for the chatbot including:
 * - Dynamic prompt generation based on user context
 * - Function calling for structured interactions
 * - Context window management
 * - Response parsing and validation
 */

import Anthropic from "@anthropic-ai/sdk";
import { UserMemoryProfile, ConversationEpisode } from "./conversationalMemory";

const client = new Anthropic();

export interface LLMRequest {
  userMessage: string;
  userProfile?: UserMemoryProfile;
  conversationContext?: ConversationEpisode[];
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  usage: {
    inputTokens: number;
    outputTokens: number;
  };
  functionCalls?: FunctionCall[];
}

export interface FunctionCall {
  name: string;
  arguments: Record<string, unknown>;
}

/**
 * Generate a dynamic system prompt based on user context
 * 
 * @param userProfile User memory profile
 * @param currentTopic Current learning topic
 * @returns Dynamic system prompt
 */
export function generateDynamicSystemPrompt(
  userProfile: UserMemoryProfile | null,
  currentTopic: string
): string {
  let prompt = `You are an intelligent German language learning chatbot designed to help users memorize and master German vocabulary and grammar.

Your primary objectives are:
1. Help users learn German words and phrases effectively
2. Provide clear explanations with contextual examples
3. Offer personalized feedback based on user performance
4. Maintain an encouraging and supportive tone
5. Adapt your teaching style to the user's learning pace and preferences

Current Learning Context:
- Topic: ${currentTopic}
- Format: Conversational and interactive`;

  if (userProfile) {
    prompt += `

User-Specific Information:
- Preferred topics: ${userProfile.preferredTopics.join(", ") || "General"}
- Areas needing improvement: ${userProfile.difficultAreas.join(", ") || "None identified yet"}
- Recent learnings: ${userProfile.recentLearnings.slice(0, 5).join(", ") || "None yet"}
- Learning style: ${userProfile.learningStyle}
- Communication style: ${userProfile.communicationStyle}
- Total interactions: ${userProfile.totalConversationTurns}`;
  }

  prompt += `

Important Guidelines:
1. Always provide German words with their English translations
2. Include example sentences when teaching new vocabulary
3. Offer pronunciation guidance using IPA notation when relevant
4. Explain grammar rules clearly and concisely
5. Provide positive reinforcement for correct answers
6. Gently correct mistakes and explain the correct form
7. Adapt difficulty level based on user responses
8. Keep responses concise but informative (2-3 paragraphs max)
9. Use the user's name if known to personalize the interaction
10. Track learning progress and acknowledge improvements

Remember: Your goal is to make German learning enjoyable, effective, and personalized to each user's unique learning journey.`;

  return prompt;
}

/**
 * Call the Claude API with enhanced context
 * 
 * @param request LLM request parameters
 * @returns LLM response
 */
export async function callLLMWithContext(
  request: LLMRequest
): Promise<LLMResponse> {
  const {
    userMessage,
    userProfile,
    conversationContext,
    systemPrompt,
    temperature = 0.7,
    maxTokens = 1024,
  } = request;

  // Build the system prompt
  const finalSystemPrompt =
    systemPrompt ||
    generateDynamicSystemPrompt(userProfile || null, "German vocabulary learning");

  // Build message history from conversation context
  const messageHistory: Anthropic.MessageParam[] = [];

  if (conversationContext && conversationContext.length > 0) {
    // Extract recent conversation turns for context
    const recentEpisode = conversationContext[conversationContext.length - 1];
    const recentTurns = recentEpisode.turns.slice(-10); // Last 10 turns

    for (const turn of recentTurns) {
      messageHistory.push({
        role: turn.role === "user" ? "user" : "assistant",
        content: turn.content,
      });
    }
  }

  // Add the current user message
  messageHistory.push({
    role: "user",
    content: userMessage,
  });

  try {
    const response = await client.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: maxTokens,
      temperature,
      system: finalSystemPrompt,
      messages: messageHistory,
    });

    // Extract the response content
    const content = response.content
      .filter(block => block.type === "text")
      .map(block => (block as Anthropic.TextBlock).text)
      .join("\n");

    return {
      content,
      usage: {
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  } catch (error) {
    console.error("Error calling Claude API:", error);
    throw new Error(`Failed to call LLM: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Generate a word explanation with examples
 * 
 * @param germanWord German word to explain
 * @param englishTranslation English translation
 * @param context Optional context for the explanation
 * @returns Explanation with examples
 */
export async function generateWordExplanation(
  germanWord: string,
  englishTranslation: string,
  context?: string
): Promise<string> {
  const prompt = `Provide a concise explanation for the German word "${germanWord}" (English: "${englishTranslation}").

Include:
1. Part of speech
2. Pronunciation guide (IPA)
3. 2-3 example sentences in German with English translations
4. Any relevant grammar notes or common usage patterns
${context ? `\nAdditional context: ${context}` : ""}

Format your response clearly with sections.`;

  const response = await callLLMWithContext({
    userMessage: prompt,
    systemPrompt: "You are a German language expert providing detailed word explanations for learners.",
    maxTokens: 500,
  });

  return response.content;
}

/**
 * Generate conversational practice prompts
 * 
 * @param topic Topic for conversation practice
 * @param difficulty Difficulty level
 * @param userProfile Optional user profile for personalization
 * @returns Conversation starter
 */
export async function generateConversationStarter(
  topic: string,
  difficulty: "easy" | "intermediate" | "hard",
  userProfile?: UserMemoryProfile
): Promise<string> {
  const difficultyDescriptions = {
    easy: "simple, everyday vocabulary",
    intermediate: "moderate vocabulary with some complex structures",
    hard: "advanced vocabulary and complex grammar",
  };

  const prompt = `Create a German conversation starter for practicing "${topic}" at ${difficulty} level using ${difficultyDescriptions[difficulty]}.

${userProfile ? `The learner has been studying for a while and is familiar with: ${userProfile.recentLearnings.join(", ")}` : ""}

Provide:
1. A German sentence or question to start the conversation
2. English translation
3. 2-3 suggested response options (in German with English translations)
4. Tips for continuing the conversation

Make it engaging and practical.`;

  const response = await callLLMWithContext({
    userMessage: prompt,
    userProfile,
    systemPrompt: "You are a German conversation teacher creating engaging practice scenarios.",
    maxTokens: 600,
  });

  return response.content;
}

/**
 * Evaluate a user's German response
 * 
 * @param userResponse User's response in German
 * @param expectedResponse Expected or ideal response
 * @param context Context of the exercise
 * @returns Evaluation with feedback
 */
export async function evaluateGermanResponse(
  userResponse: string,
  expectedResponse: string,
  context: string
): Promise<{
  isCorrect: boolean;
  accuracy: number;
  feedback: string;
  correction?: string;
}> {
  const prompt = `Evaluate this German language response:

Context: ${context}
User's response: "${userResponse}"
Expected/ideal response: "${expectedResponse}"

Provide:
1. Is the response correct? (yes/no)
2. Accuracy score (0-100)
3. Detailed feedback on grammar, vocabulary, and usage
4. If incorrect, provide the correct form and explanation

Be constructive and encouraging.`;

  const response = await callLLMWithContext({
    userMessage: prompt,
    systemPrompt: "You are a German language teacher evaluating student responses. Provide constructive feedback.",
    maxTokens: 500,
  });

  // Parse the response to extract structured data
  const isCorrect = response.content.toLowerCase().includes("correct") && !response.content.toLowerCase().includes("incorrect");
  const accuracyMatch = response.content.match(/accuracy[:\s]+(\d+)/i);
  const accuracy = accuracyMatch ? parseInt(accuracyMatch[1]) : (isCorrect ? 100 : 50);

  return {
    isCorrect,
    accuracy,
    feedback: response.content,
  };
}

/**
 * Generate grammar explanation
 * 
 * @param grammarTopic Grammar topic to explain
 * @param difficulty Difficulty level
 * @returns Grammar explanation with examples
 */
export async function generateGrammarExplanation(
  grammarTopic: string,
  difficulty: "easy" | "intermediate" | "hard"
): Promise<string> {
  const prompt = `Explain the German grammar topic: "${grammarTopic}" at ${difficulty} level.

Include:
1. Clear explanation of the rule
2. Why it's important for German learners
3. 3-4 example sentences with English translations
4. Common mistakes to avoid
5. Practice tips

Make it accessible and practical.`;

  const response = await callLLMWithContext({
    userMessage: prompt,
    systemPrompt: "You are an expert German grammar teacher. Explain grammar concepts clearly with practical examples.",
    maxTokens: 800,
  });

  return response.content;
}

/**
 * Manage context window by summarizing old messages
 * 
 * @param messages Array of messages
 * @param maxTokens Maximum tokens to keep
 * @returns Pruned messages
 */
export function manageContextWindow(
  messages: Anthropic.MessageParam[],
  maxTokens: number = 2000
): Anthropic.MessageParam[] {
  // Simple token estimation: ~4 characters per token
  let totalTokens = 0;
  const result: Anthropic.MessageParam[] = [];

  // Process messages in reverse to keep recent ones
  for (let i = messages.length - 1; i >= 0; i--) {
    const message = messages[i];
    const messageTokens = Math.ceil(
      (message.content as string).length / 4
    );

    if (totalTokens + messageTokens <= maxTokens) {
      result.unshift(message);
      totalTokens += messageTokens;
    } else if (result.length === 0) {
      // Always keep at least one message
      result.unshift(message);
    } else {
      break;
    }
  }

  return result;
}

