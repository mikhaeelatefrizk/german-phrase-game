/**
 * Conversational Memory Module
 * 
 * Manages long-term contextual memory for the chatbot, enabling:
 * - Retention of conversation history across sessions
 * - User preference and learning history tracking
 * - Context-aware dialogue management
 * - Episodic memory organization
 */

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  metadata?: {
    intent?: string;
    wordFocused?: string;
    difficulty?: "easy" | "intermediate" | "hard";
    accuracy?: number;
  };
}

export interface ConversationEpisode {
  id: string;
  userId: string;
  topic: string; // e.g., "vocabulary_review", "grammar_practice", "conversation"
  startTime: Date;
  endTime?: Date;
  turns: ConversationTurn[];
  summary?: string;
  keyLearnings?: string[];
  performance?: {
    correctAnswers: number;
    totalAnswers: number;
    accuracy: number;
  };
}

export interface UserMemoryProfile {
  userId: string;
  preferredTopics: string[];
  difficultAreas: string[];
  recentLearnings: string[];
  communicationStyle: "formal" | "casual" | "mixed";
  learningStyle: "visual" | "auditory" | "kinesthetic" | "mixed";
  lastInteractionTime: Date;
  totalConversationTurns: number;
}

/**
 * Create a new conversation episode
 * 
 * @param userId User ID
 * @param topic Topic of the conversation
 * @returns New conversation episode
 */
export function createConversationEpisode(
  userId: string,
  topic: string
): ConversationEpisode {
  return {
    id: `episode_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    userId,
    topic,
    startTime: new Date(),
    turns: [],
  };
}

/**
 * Add a turn to a conversation episode
 * 
 * @param episode Conversation episode
 * @param role Role of the speaker
 * @param content Content of the turn
 * @param metadata Optional metadata
 * @returns Updated episode
 */
export function addConversationTurn(
  episode: ConversationEpisode,
  role: "user" | "assistant",
  content: string,
  metadata?: ConversationTurn["metadata"]
): ConversationEpisode {
  const turn: ConversationTurn = {
    role,
    content,
    timestamp: new Date(),
    metadata,
  };

  return {
    ...episode,
    turns: [...episode.turns, turn],
  };
}

/**
 * Close a conversation episode
 * 
 * @param episode Conversation episode
 * @param summary Optional summary of the episode
 * @param keyLearnings Optional key learnings from the episode
 * @returns Closed episode with performance metrics
 */
export function closeConversationEpisode(
  episode: ConversationEpisode,
  summary?: string,
  keyLearnings?: string[]
): ConversationEpisode {
  // Calculate performance metrics
  const assistantTurns = episode.turns.filter(t => t.role === "assistant");
  const userTurns = episode.turns.filter(t => t.role === "user");
  
  const correctAnswers = userTurns.filter(
    t => t.metadata?.accuracy === 100
  ).length;
  const totalAnswers = userTurns.length;
  const accuracy = totalAnswers > 0 ? (correctAnswers / totalAnswers) * 100 : 0;

  return {
    ...episode,
    endTime: new Date(),
    summary,
    keyLearnings,
    performance: {
      correctAnswers,
      totalAnswers,
      accuracy: Math.round(accuracy),
    },
  };
}

/**
 * Extract context from recent conversation episodes
 * Useful for providing context to the LLM
 * 
 * @param episodes Recent conversation episodes
 * @param maxTurns Maximum number of turns to include
 * @returns Formatted context string
 */
export function extractContextFromEpisodes(
  episodes: ConversationEpisode[],
  maxTurns: number = 20
): string {
  let context = "Recent conversation context:\n";

  const allTurns: ConversationTurn[] = [];
  for (const episode of episodes) {
    context += `\nTopic: ${episode.topic}\n`;
    allTurns.push(...episode.turns);
  }

  // Get the last maxTurns
  const recentTurns = allTurns.slice(-maxTurns);

  for (const turn of recentTurns) {
    const role = turn.role === "user" ? "User" : "Assistant";
    context += `${role}: ${turn.content}\n`;
    
    if (turn.metadata?.wordFocused) {
      context += `  [Focus: ${turn.metadata.wordFocused}]\n`;
    }
  }

  return context;
}

/**
 * Build a user memory profile from conversation history
 * 
 * @param episodes User's conversation episodes
 * @returns User memory profile
 */
export function buildUserMemoryProfile(
  userId: string,
  episodes: ConversationEpisode[]
): UserMemoryProfile {
  // Extract preferred topics
  const topicCounts: { [key: string]: number } = {};
  for (const episode of episodes) {
    topicCounts[episode.topic] = (topicCounts[episode.topic] || 0) + 1;
  }

  const preferredTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([topic]) => topic);

  // Extract difficult areas (low accuracy topics)
  const difficultAreas: { [key: string]: number[] } = {};
  for (const episode of episodes) {
    if (episode.performance && episode.performance.accuracy < 70) {
      if (!difficultAreas[episode.topic]) {
        difficultAreas[episode.topic] = [];
      }
      difficultAreas[episode.topic].push(episode.performance.accuracy);
    }
  }

  const difficultAreasArray = Object.keys(difficultAreas).slice(0, 3);

  // Extract recent learnings
  const recentLearnings: string[] = [];
  for (const episode of episodes.slice(-5)) {
    if (episode.keyLearnings) {
      recentLearnings.push(...episode.keyLearnings);
    }
  }

  const lastEpisode = episodes[episodes.length - 1];
  const lastInteractionTime = lastEpisode?.endTime || new Date();

  const totalConversationTurns = episodes.reduce(
    (sum, ep) => sum + ep.turns.length,
    0
  );

  return {
    userId,
    preferredTopics,
    difficultAreas: difficultAreasArray,
    recentLearnings: [...new Set(recentLearnings)].slice(0, 10),
    communicationStyle: "mixed",
    learningStyle: "mixed",
    lastInteractionTime,
    totalConversationTurns,
  };
}

/**
 * Generate a context-aware system prompt for the LLM
 * Based on user memory profile and current episode
 * 
 * @param userProfile User memory profile
 * @param currentEpisode Current conversation episode
 * @returns System prompt for the LLM
 */
export function generateContextAwareSystemPrompt(
  userProfile: UserMemoryProfile,
  currentEpisode: ConversationEpisode
): string {
  let prompt = `You are an intelligent German language learning chatbot. 
Your role is to help the user learn German vocabulary and grammar in an engaging and personalized way.

User Profile:
- Preferred learning topics: ${userProfile.preferredTopics.join(", ")}
- Areas needing improvement: ${userProfile.difficultAreas.join(", ")}
- Recent learnings: ${userProfile.recentLearnings.join(", ")}
- Total conversation turns: ${userProfile.totalConversationTurns}

Current Session:
- Topic: ${currentEpisode.topic}
- Session duration: ${currentEpisode.turns.length} turns so far

Guidelines:
1. Personalize your responses based on the user's learning profile
2. Provide clear explanations with examples when teaching new concepts
3. Offer encouragement and positive reinforcement
4. Adapt difficulty level based on user performance
5. Use the user's preferred topics when possible
6. Track and address areas of difficulty
7. Maintain context from previous conversations
8. Be patient and supportive, especially with difficult topics

Remember: The goal is to make German learning enjoyable and effective.`;

  return prompt;
}

/**
 * Summarize a conversation episode
 * 
 * @param episode Conversation episode
 * @returns Summary string
 */
export function summarizeEpisode(episode: ConversationEpisode): string {
  const duration = episode.endTime
    ? Math.round((episode.endTime.getTime() - episode.startTime.getTime()) / 1000 / 60)
    : 0;

  let summary = `Session Summary:\n`;
  summary += `Topic: ${episode.topic}\n`;
  summary += `Duration: ${duration} minutes\n`;
  summary += `Turns: ${episode.turns.length}\n`;

  if (episode.performance) {
    summary += `Accuracy: ${episode.performance.accuracy}%\n`;
    summary += `Correct answers: ${episode.performance.correctAnswers}/${episode.performance.totalAnswers}\n`;
  }

  if (episode.keyLearnings && episode.keyLearnings.length > 0) {
    summary += `Key learnings:\n`;
    for (const learning of episode.keyLearnings) {
      summary += `- ${learning}\n`;
    }
  }

  return summary;
}

/**
 * Prune old conversation episodes to manage memory
 * Keeps only recent episodes and summaries of older ones
 * 
 * @param episodes All conversation episodes
 * @param maxRecentEpisodes Number of recent episodes to keep in full
 * @returns Pruned episodes
 */
export function pruneConversationHistory(
  episodes: ConversationEpisode[],
  maxRecentEpisodes: number = 10
): ConversationEpisode[] {
  if (episodes.length <= maxRecentEpisodes) {
    return episodes;
  }

  // Keep recent episodes in full
  const recentEpisodes = episodes.slice(-maxRecentEpisodes);

  // Summarize older episodes
  const olderEpisodes = episodes.slice(0, -maxRecentEpisodes).map(episode => ({
    ...episode,
    turns: [], // Clear turns to save memory
    summary: summarizeEpisode(episode),
  }));

  return [...olderEpisodes, ...recentEpisodes];
}

