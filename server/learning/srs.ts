/**
 * Spaced Repetition System (SRS) Module
 * 
 * Implements the SM-2 algorithm variant for scheduling vocabulary reviews.
 * This system optimizes the timing of reviews based on user performance,
 * helping to move words into long-term memory efficiently.
 * 
 * References:
 * - SM-2 Algorithm: https://en.wikipedia.org/wiki/Spaced_repetition#SM-2
 * - Forgetting Curve: https://en.wikipedia.org/wiki/Forgetting_curve
 */

export interface SRSState {
  interval: number; // Days until next review
  easeFactor: number; // Ease factor (multiplied by 1000 for integer storage)
  repetitions: number; // Number of successful repetitions
  nextReviewAt: Date;
}

export interface SRSResponse {
  quality: number; // 0-5 quality rating (0=complete blackout, 5=perfect response)
}

/**
 * Calculate the next review interval based on SM-2 algorithm
 * 
 * @param state Current SRS state
 * @param quality Quality of the response (0-5)
 * @returns Updated SRS state
 */
export function calculateNextReview(state: SRSState, quality: number): SRSState {
  // Validate quality input
  if (quality < 0 || quality > 5) {
    throw new Error("Quality must be between 0 and 5");
  }

  let newEaseFactor = state.easeFactor;
  let newInterval = state.interval;
  let newRepetitions = state.repetitions;

  // Calculate new ease factor using SM-2 formula
  // EF' := EF + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02))
  newEaseFactor = state.easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)) * 1000;

  // Ensure ease factor doesn't go below 1.3 (1300 in integer form)
  if (newEaseFactor < 1300) {
    newEaseFactor = 1300;
  }

  // If quality is less than 3, reset the learning process
  if (quality < 3) {
    newRepetitions = 0;
    newInterval = 1; // Review again tomorrow
  } else {
    newRepetitions = state.repetitions + 1;

    // Calculate interval based on repetition count
    if (newRepetitions === 1) {
      newInterval = 1; // First review: 1 day
    } else if (newRepetitions === 2) {
      newInterval = 3; // Second review: 3 days
    } else {
      // Subsequent reviews: multiply previous interval by ease factor
      newInterval = Math.round(state.interval * (newEaseFactor / 1000));
    }
  }

  // Calculate next review date
  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + newInterval);

  return {
    interval: newInterval,
    easeFactor: Math.round(newEaseFactor),
    repetitions: newRepetitions,
    nextReviewAt,
  };
}

/**
 * Determine if a word should be reviewed today
 * 
 * @param nextReviewAt The scheduled date for next review
 * @returns true if the word should be reviewed today
 */
export function shouldReviewToday(nextReviewAt: Date): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const reviewDate = new Date(nextReviewAt);
  reviewDate.setHours(0, 0, 0, 0);
  
  return reviewDate <= today;
}

/**
 * Get the number of days until next review
 * 
 * @param nextReviewAt The scheduled date for next review
 * @returns Number of days until next review (negative if overdue)
 */
export function daysUntilReview(nextReviewAt: Date): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const reviewDate = new Date(nextReviewAt);
  reviewDate.setHours(0, 0, 0, 0);
  
  const diffTime = reviewDate.getTime() - today.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return diffDays;
}

/**
 * Calculate the mastery percentage for a word
 * Based on ease factor and repetitions
 * 
 * @param state Current SRS state
 * @returns Mastery percentage (0-100)
 */
export function calculateMasteryPercentage(state: SRSState): number {
  // Mastery is based on:
  // 1. Number of successful repetitions (max 10 for full credit)
  // 2. Ease factor (higher ease factor = better retention)
  
  const repetitionScore = Math.min(state.repetitions / 10, 1) * 50; // 0-50%
  const easeFactorScore = Math.min((state.easeFactor - 1300) / 1700, 1) * 50; // 0-50%
  
  return Math.round(repetitionScore + easeFactorScore);
}

/**
 * Get the status of a word based on its SRS state
 * 
 * @param state Current SRS state
 * @returns Status string: "new", "learning", or "mastered"
 */
export function getWordStatus(state: SRSState): "new" | "learning" | "mastered" {
  if (state.repetitions === 0) {
    return "new";
  } else if (state.repetitions < 5 || state.easeFactor < 2000) {
    return "learning";
  } else {
    return "mastered";
  }
}

/**
 * Initialize a new SRS state for a word
 * 
 * @returns Initial SRS state
 */
export function initializeSRSState(): SRSState {
  const nextReviewAt = new Date();
  nextReviewAt.setDate(nextReviewAt.getDate() + 1); // First review in 1 day
  
  return {
    interval: 1,
    easeFactor: 2500, // 2.5 in integer form
    repetitions: 0,
    nextReviewAt,
  };
}

/**
 * Batch process multiple word reviews
 * Useful for updating multiple words after a study session
 * 
 * @param reviews Array of {state, quality} pairs
 * @returns Array of updated SRS states
 */
export function batchProcessReviews(
  reviews: Array<{ state: SRSState; quality: number }>
): SRSState[] {
  return reviews.map(({ state, quality }) => calculateNextReview(state, quality));
}

