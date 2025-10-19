import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";
import { useSpeech } from "@/hooks/useSpeech";
import { useState, useEffect } from "react";

import { TOTAL_PHRASES } from "../shared/const";
import AIChatbot from "@/components/AIChatbot.tsx";
import { EnhancedChatbot } from "@/components/EnhancedChatbot";
import { DailyMissionsDashboard } from "@/components/DailyMissionsDashboard";
import { SpacedRepetitionCard } from "@/components/SpacedRepetitionCard";
import { Volume2, ChevronRight, Lock, CheckCircle, Tabs } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

export default function Home() {
  const { user, isAuthenticated, logout } = useAuth();
  const [isFlipped, setIsFlipped] = useState(false);
  const [sessionPhrasesCompleted, setSessionPhrasesCompleted] = useState<string[]>([]);
  const [currentPhraseAnswered, setCurrentPhraseAnswered] = useState(false);
  const [answerCorrect, setAnswerCorrect] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<
    "practice" | "missions" | "spaced-rep" | "chatbot"
  >("practice");

  // Text-to-speech hook
  const { speak } = useSpeech({
    language: "de-DE",
    rate: 0.9,
    pitch: 1.0,
    volume: 1.0,
  });

  // Get today's phrases
  const { data: todaysPhrases, refetch: refetchTodaysPhrases } =
    trpc.learning.getTodaysPhrases.useQuery(undefined, {
      enabled: isAuthenticated,
    });

  // Get current phrase (first uncompleted one)
  const currentPhrase = todaysPhrases?.find(
    (p) => !sessionPhrasesCompleted.includes(p.id)
  );

  // Get stats
  const { data: stats } = trpc.learning.getStats.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Record answer mutation
  const recordAnswerMutation = trpc.learning.recordAnswer.useMutation({
    onSuccess: () => {
      setCurrentPhraseAnswered(true);
    },
  });

  const handleAnswer = (correct: boolean) => {
    if (!currentPhrase) return;
    setAnswerCorrect(correct);
    recordAnswerMutation.mutate({
      phraseId: currentPhrase.id,
      isCorrect: correct,
    });
  };

  const handleNextPhrase = () => {
    if (!currentPhrase) return;

    // Mark this phrase as completed in this session
    setSessionPhrasesCompleted([...sessionPhrasesCompleted, currentPhrase.id]);

    // Reset states for next phrase
    setIsFlipped(false);
    setCurrentPhraseAnswered(false);
    setAnswerCorrect(null);
  };

  const isTodaysSessionComplete =
    todaysPhrases &&
    todaysPhrases.length > 0 &&
    sessionPhrasesCompleted.length === todaysPhrases.length;

  const totalPhrases = TOTAL_PHRASES;
  const learned = stats?.learned || 0;
  const progressPercentage = Math.round((learned / totalPhrases) * 100);
  const todaysTotal = todaysPhrases?.length || 0;
  const todaysCompleted = sessionPhrasesCompleted.length;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
        <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 max-w-md w-full text-center border border-gray-700">
          <h1 className="text-4xl font-bold text-white mb-2">
            German Phrase Master
          </h1>
          <p className="text-gray-300 mb-8">
            Master 4,000 German phrases with spaced repetition and AI assistance
          </p>
          <Button
            onClick={() => (window.location.href = "/login")}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 text-lg"
          >
            Sign In
          </Button>
          <p className="text-gray-300 mt-4">Don't have an account? <a href="/register" className="text-blue-400 hover:underline">Register here</a></p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 p-4">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-8">
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-3xl font-bold text-white">German Phrases</h1>
          <Button
            onClick={() => logout()}
            variant="outline"
            size="sm"
            className="text-white border-gray-600 hover:bg-gray-800"
          >
            Logout
          </Button>
          <p className="text-gray-300 mt-4">Don't have an account? <a href="/register" className="text-blue-400 hover:underline">Register here</a></p>
        </div>

        {/* Overall Progress Bar */}
        <div className="bg-gray-800 rounded-lg shadow p-4 border border-gray-700 mb-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-300">
              Overall Progress
            </span>
            <span className="text-sm font-bold text-blue-400">
              {learned} / {totalPhrases} ({progressPercentage}%)
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-blue-500 to-blue-600 h-3 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </div>

        {/* Today's Session Progress */}
        <div className="bg-gray-800 rounded-lg shadow p-4 border border-gray-700">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-gray-300">
              Today's Progress
            </span>
            <span className="text-sm font-bold text-green-400">
              {todaysCompleted} / {todaysTotal}
            </span>
          </div>
          <div className="w-full bg-gray-700 rounded-full h-3">
            <div
              className="bg-gradient-to-r from-green-500 to-green-600 h-3 rounded-full transition-all duration-300"
              style={{
                width:
                  todaysTotal > 0
                    ? `${(todaysCompleted / todaysTotal) * 100}%`
                    : "0%",
              }}
            />
          </div>
          {isTodaysSessionComplete && (
            <p className="text-green-400 text-sm font-semibold mt-2 flex items-center gap-2">
              <CheckCircle size={16} /> Today's session complete! You can exit
              now.
            </p>
          )}
          {!isTodaysSessionComplete && todaysTotal > 0 && (
            <p className="text-yellow-400 text-sm font-semibold mt-2 flex items-center gap-2">
              <Lock size={16} /> Complete all {todaysTotal} phrases before
              exiting
            </p>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="max-w-6xl mx-auto mb-6">
        <div className="flex gap-2 border-b border-gray-700">
          <button
            onClick={() => setActiveTab("practice")}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === "practice"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Practice
          </button>
          <button
            onClick={() => setActiveTab("missions")}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === "missions"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Daily Missions
          </button>
          <button
            onClick={() => setActiveTab("spaced-rep")}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === "spaced-rep"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            Spaced Repetition
          </button>
          <button
            onClick={() => setActiveTab("chatbot")}
            className={`px-4 py-2 font-semibold transition-colors ${
              activeTab === "chatbot"
                ? "text-blue-400 border-b-2 border-blue-400"
                : "text-gray-400 hover:text-gray-300"
            }`}
          >
            AI Chatbot
          </button>
        </div>
      </div>

      {/* Content Based on Active Tab */}
      {activeTab === "practice" && (
        <div className="max-w-2xl mx-auto">
          {currentPhrase ? (
            <div>
              {/* Flashcard */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                className="bg-gray-800 rounded-2xl shadow-2xl p-8 min-h-96 flex flex-col items-center justify-center cursor-pointer hover:shadow-3xl transition-shadow mb-8 relative overflow-hidden border border-gray-700"
              >
                {/* Decorative background */}
                <div className="absolute inset-0 bg-gradient-to-br from-gray-700 to-gray-900 opacity-50" />

                <div className="relative z-10 text-center">
                  {!isFlipped ? (
                    <>
                      <p className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-widest">
                        German
                      </p>
                      <p className="text-5xl font-bold text-white mb-8 leading-relaxed">
                        {currentPhrase.german}
                      </p>
                      <div className="flex justify-center gap-4">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            speak(currentPhrase.german);
                          }}
                          className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-4 transition-colors"
                          title="Pronounce"
                        >
                          <Volume2 size={24} />
                        </button>
                      </div>
                      <p className="text-gray-500 text-sm mt-8">
                        Tap card to reveal answer
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-gray-400 text-sm font-semibold mb-4 uppercase tracking-widest">
                        English
                      </p>
                      <p className="text-4xl font-bold text-green-400 mb-8 leading-relaxed">
                        {currentPhrase.english}
                      </p>
                      <p className="text-gray-500 text-sm">
                        Tap card to hide answer
                      </p>
                    </>
                  )}
                </div>
              </div>

              {/* Action Buttons - Only show after flipping */}
              {isFlipped && !currentPhraseAnswered && (
                <div className="flex gap-4 mb-8">
                  <Button
                    onClick={() => handleAnswer(false)}
                    className="flex-1 py-6 text-lg font-bold bg-red-900 hover:bg-red-800 text-white border border-red-700"
                    disabled={recordAnswerMutation.isPending}
                  >
                    Forgot
                  </Button>
          <p className="text-gray-300 mt-4">Don't have an account? <a href="/register" className="text-blue-400 hover:underline">Register here</a></p>
                  <Button
                    onClick={() => handleAnswer(true)}
                    className="flex-1 py-6 text-lg font-bold bg-green-700 hover:bg-green-600 text-white border border-green-600"
                    disabled={recordAnswerMutation.isPending}
                  >
                    Got It
                  </Button>
          <p className="text-gray-300 mt-4">Don't have an account? <a href="/register" className="text-blue-400 hover:underline">Register here</a></p>
                </div>
              )}

              {/* Next Button - Only show after answering */}
              {currentPhraseAnswered && (
                <div className="mb-8">
                  <div className="mb-4 p-4 bg-gray-800 rounded-lg border border-gray-700">
                    <p
                      className={`text-center font-semibold text-lg ${
                        answerCorrect ? "text-green-400" : "text-red-400"
                      }`}
                    >
                      {answerCorrect ? "✓ Correct!" : "✗ Incorrect"}
                    </p>
                  </div>
                  <Button
                    onClick={handleNextPhrase}
                    className="w-full py-6 text-lg font-bold bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 flex items-center justify-center gap-2"
                  >
                    Next Phrase
                    <ChevronRight size={24} />
                  </Button>
          <p className="text-gray-300 mt-4">Don't have an account? <a href="/register" className="text-blue-400 hover:underline">Register here</a></p>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 max-w-2xl mx-auto">
                <div className="bg-gray-800 rounded-lg shadow p-4 text-center border border-gray-700">
                  <p className="text-gray-400 text-sm font-semibold">Learned</p>
                  <p className="text-3xl font-bold text-blue-400">
                    {stats?.learned || 0}
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg shadow p-4 text-center border border-gray-700">
                  <p className="text-gray-400 text-sm font-semibold">Accuracy</p>
                  <p className="text-3xl font-bold text-blue-400">
                    {stats?.accuracy ? Math.round(stats.accuracy) : 0}%
                  </p>
                </div>
                <div className="bg-gray-800 rounded-lg shadow p-4 text-center border border-gray-700">
                  <p className="text-gray-400 text-sm font-semibold">Total</p>
                  <p className="text-3xl font-bold text-blue-400">
                    {totalPhrases}
                  </p>
                </div>
              </div>
            </div>
          ) : isTodaysSessionComplete ? (
            <div className="bg-gray-800 rounded-2xl shadow-2xl p-12 text-center border border-gray-700">
              <CheckCircle size={64} className="mx-auto mb-4 text-green-400" />
              <p className="text-green-400 text-2xl font-bold mb-4">
                Today's Session Complete!
              </p>
              <p className="text-gray-300 mb-8">
                You have successfully completed all {todaysTotal} phrases for
                today. Great job! Come back tomorrow for more.
              </p>
              <Button
                onClick={() => logout()}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 text-lg"
              >
                Exit & Logout
              </Button>
          <p className="text-gray-300 mt-4">Don't have an account? <a href="/register" className="text-blue-400 hover:underline">Register here</a></p>
            </div>
          ) : (
            <div className="bg-gray-800 rounded-2xl shadow-2xl p-12 text-center border border-gray-700">
              <p className="text-gray-400 text-lg">
                Loading today's phrases...
              </p>
            </div>
          )}
        </div>
      )}

      {/* Daily Missions Tab */}
      {activeTab === "missions" && (
        <div className="max-w-6xl mx-auto">
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
            <DailyMissionsDashboard />
          </div>
        </div>
      )}

      {/* Spaced Repetition Tab */}
      {activeTab === "spaced-rep" && (
        <div className="max-w-6xl mx-auto">
          <div className="bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700">
            <SpacedRepetitionCard />
          </div>
        </div>
      )}

      {/* AI Chatbot Tab */}
      {activeTab === "chatbot" && (
        <div className="max-w-6xl mx-auto">
          <div
            className="bg-gray-800 rounded-2xl shadow-2xl p-8 border border-gray-700"
            style={{ minHeight: "600px" }}
          >
            <EnhancedChatbot
              topic="German vocabulary learning"
              difficulty="intermediate"
            />
          </div>
        </div>
      )}
    </div>
  );
}

