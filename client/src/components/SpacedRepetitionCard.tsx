/**
 * Spaced Repetition Card Component
 * 
 * Interactive flashcard for word review using the SM-2 algorithm.
 * Features:
 * - Flip animation
 * - Quality rating (0-5)
 * - Progress tracking
 * - Mastery percentage
 */

import React, { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { ChevronLeft, ChevronRight, Volume2, Lightbulb } from 'lucide-react';

interface Word {
  id: string;
  phraseId: string;
  german: string;
  english: string;
  pronunciation?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewAt: Date;
}

interface SpacedRepetitionCardProps {
  onComplete?: (word: Word, quality: number) => void;
  autoPlay?: boolean;
}

export const SpacedRepetitionCard: React.FC<SpacedRepetitionCardProps> = ({
  onComplete,
  autoPlay = false,
}) => {
  const [isFlipped, setIsFlipped] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [words, setWords] = useState<Word[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedQuality, setSelectedQuality] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const wordsQuery = trpc.advancedLearning.getWordsForReview.useQuery();
  const reviewMutation = trpc.advancedLearning.submitReview.useMutation();
  const explanationMutation = trpc.advancedLearning.getWordExplanation.useMutation();

  useEffect(() => {
    if (wordsQuery.data) {
      setWords(wordsQuery.data);
      setIsLoading(false);
    }
  }, [wordsQuery.data]);

  const currentWord = words[currentIndex];

  const handleFlip = () => {
    setIsFlipped(!isFlipped);
  };

  const handleQualitySelect = async (quality: number) => {
    if (!currentWord) return;

    setSelectedQuality(quality);

    try {
      const result = await reviewMutation.mutateAsync({
        userProgressId: currentWord.id,
        quality,
        timeSpentSeconds: 10, // Placeholder
      });

      if (onComplete) {
        onComplete(currentWord, quality);
      }

      // Move to next word after a short delay
      setTimeout(() => {
        if (currentIndex < words.length - 1) {
          setCurrentIndex(currentIndex + 1);
          setIsFlipped(false);
          setSelectedQuality(null);
          setShowExplanation(false);
        } else {
          // All words reviewed
          alert('Great job! You\'ve reviewed all words for today.');
        }
      }, 1000);
    } catch (error) {
      console.error('Error submitting review:', error);
    }
  };

  const handleGetExplanation = async () => {
    if (!currentWord) return;

    try {
      const explanation = await explanationMutation.mutateAsync({
        germanWord: currentWord.german,
        englishTranslation: currentWord.english,
      });

      if (explanation.success) {
        setShowExplanation(true);
      }
    } catch (error) {
      console.error('Error getting explanation:', error);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setIsFlipped(false);
      setSelectedQuality(null);
      setShowExplanation(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setIsFlipped(false);
      setSelectedQuality(null);
      setShowExplanation(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading words for review...</p>
        </div>
      </div>
    );
  }

  if (words.length === 0) {
    return (
      <Card className="p-8 text-center bg-green-50 border-green-200">
        <div className="text-4xl mb-4">🎉</div>
        <h3 className="text-xl font-semibold text-gray-900 mb-2">All Caught Up!</h3>
        <p className="text-gray-600">You've reviewed all your words for today. Great job!</p>
      </Card>
    );
  }

  const progressPercentage = ((currentIndex + 1) / words.length) * 100;
  const masteryPercentage = currentWord
    ? (currentWord.repetitions / (currentWord.repetitions + 1)) * 100
    : 0;

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Progress */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Review Progress</h3>
          <span className="text-sm text-gray-600">
            {currentIndex + 1} of {words.length}
          </span>
        </div>
        <Progress value={progressPercentage} className="h-2" />
      </div>

      {/* Main Card */}
      <div
        className="h-64 cursor-pointer perspective"
        onClick={handleFlip}
        style={{
          perspective: '1000px',
        }}
      >
        <div
          className={`relative w-full h-full transition-transform duration-500 transform ${
            isFlipped ? 'rotateY-180' : ''
          }`}
          style={{
            transformStyle: 'preserve-3d',
            transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
          }}
        >
          {/* Front - German Word */}
          <Card
            className={`absolute w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-blue-600 to-indigo-600 text-white border-0 ${
              isFlipped ? 'hidden' : ''
            }`}
            style={{
              backfaceVisibility: 'hidden',
            }}
          >
            <div className="text-center space-y-4">
              <p className="text-sm font-semibold opacity-75">German Word</p>
              <h2 className="text-5xl font-bold">{currentWord?.german}</h2>
              {currentWord?.pronunciation && (
                <p className="text-lg opacity-75 italic">/{currentWord.pronunciation}/</p>
              )}
              <p className="text-sm opacity-75">Click to reveal translation</p>
            </div>
            {currentWord?.pronunciation && (
              <button className="absolute bottom-4 right-4 p-2 hover:bg-blue-700 rounded-full transition">
                <Volume2 className="w-6 h-6" />
              </button>
            )}
          </Card>

          {/* Back - English Translation */}
          <Card
            className={`absolute w-full h-full flex flex-col items-center justify-center bg-gradient-to-br from-green-600 to-emerald-600 text-white border-0 ${
              !isFlipped ? 'hidden' : ''
            }`}
            style={{
              backfaceVisibility: 'hidden',
              transform: 'rotateY(180deg)',
            }}
          >
            <div className="text-center space-y-4">
              <p className="text-sm font-semibold opacity-75">English Translation</p>
              <h2 className="text-5xl font-bold">{currentWord?.english}</h2>
              <p className="text-sm opacity-75">How well did you remember this?</p>
            </div>
          </Card>
        </div>
      </div>

      {/* Explanation */}
      {showExplanation && (
        <Card className="p-4 bg-yellow-50 border-yellow-200">
          <div className="flex items-start gap-3">
            <Lightbulb className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Word Explanation</h4>
              <p className="text-sm text-gray-700">
                {currentWord?.german} is a {currentWord?.difficulty} difficulty word commonly used in German conversations.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Quality Rating */}
      {isFlipped && (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-gray-900">How well did you remember this word?</p>
          <div className="grid grid-cols-5 gap-2">
            {[
              { value: 0, label: 'Forgot', color: 'bg-red-500 hover:bg-red-600' },
              { value: 1, label: 'Hard', color: 'bg-orange-500 hover:bg-orange-600' },
              { value: 2, label: 'Okay', color: 'bg-yellow-500 hover:bg-yellow-600' },
              { value: 3, label: 'Good', color: 'bg-blue-500 hover:bg-blue-600' },
              { value: 4, label: 'Perfect', color: 'bg-green-500 hover:bg-green-600' },
            ].map((option) => (
              <Button
                key={option.value}
                onClick={() => handleQualitySelect(option.value)}
                disabled={selectedQuality !== null}
                className={`${option.color} text-white flex flex-col items-center justify-center h-20 transition-all ${
                  selectedQuality === option.value ? 'ring-2 ring-offset-2 ring-gray-400' : ''
                }`}
              >
                <span className="text-2xl font-bold">{option.value}</span>
                <span className="text-xs">{option.label}</span>
              </Button>
            ))}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleGetExplanation}
            className="w-full"
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Get Explanation
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={handlePrevious}
          disabled={currentIndex === 0}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Previous
        </Button>

        <div className="flex gap-2">
          {words.map((_, idx) => (
            <div
              key={idx}
              className={`h-2 w-2 rounded-full transition-colors ${
                idx === currentIndex ? 'bg-blue-600' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>

        <Button
          variant="outline"
          onClick={handleNext}
          disabled={currentIndex === words.length - 1}
        >
          Next
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Mastery Info */}
      <Card className="p-3 bg-blue-50 border-blue-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-700">
            <strong>Mastery:</strong> {Math.round(masteryPercentage)}%
          </span>
          <Badge variant="outline" className="text-xs">
            Interval: {currentWord?.interval} days
          </Badge>
        </div>
      </Card>
    </div>
  );
};

