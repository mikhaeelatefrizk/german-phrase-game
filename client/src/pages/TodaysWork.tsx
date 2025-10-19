import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useSpeech } from "@/hooks/useSpeech";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";

export default function TodaysWork() {
  const { user, isAuthenticated } = useAuth();
  const [currentTaskIndex, setCurrentTaskIndex] = useState(0);
  const [showTranslation, setShowTranslation] = useState(false);
  const [sessionStats, setSessionStats] = useState({
    correct: 0,
    incorrect: 0,
    timeSpent: 0,
  });
  const [sessionStartTime, setSessionStartTime] = useState<number>(Date.now());

  const { speak, stop, isPlaying } = useSpeech({
    language: "de-DE",
    rate: 0.9,
    pitch: 1.0,
    volume: 1.0,
  });

  // Get today's tasks
  const { data: todaysTasks = [], refetch: refetchTasks, isLoading } = trpc.tasks.getTodaysTasks.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Get task count
  const { data: taskCount = 0 } = trpc.tasks.getTodaysTaskCount.useQuery(undefined, {
    enabled: isAuthenticated,
    refetchInterval: 5000, // Refresh every 5 seconds
  });

  // Get analytics
  const { data: analytics } = trpc.tasks.getAnalytics.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // Complete task mutation
  const completeTaskMutation = trpc.tasks.completeTask.useMutation({
    onSuccess: () => {
      refetchTasks();
    },
  });

  // Record session mutation
  const recordSessionMutation = trpc.tasks.recordSession.useMutation();

  // Initialize tasks on first load
  const initializeMutation = trpc.tasks.initializeTasks.useMutation({
    onSuccess: () => {
      refetchTasks();
    },
  });

  useEffect(() => {
    if (isAuthenticated && todaysTasks.length === 0 && !isLoading) {
      // Initialize tasks if none exist
      initializeMutation.mutate({ dailyLoad: 20 });
    }
  }, [isAuthenticated, todaysTasks.length, isLoading]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="p-12 max-w-md w-full text-center">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Today's Work
          </h1>
          <p className="text-gray-600 mb-8 text-lg">
            Sign in to see your personalized daily learning tasks
          </p>
          <a href="/login">
            <Button size="lg" className="w-full">
              Sign In
            </Button>
          </a>
        </Card>
      </div>
    );
  }

  const currentTask = todaysTasks[currentTaskIndex];
  const progressPercentage = todaysTasks.length > 0 ? Math.round(((currentTaskIndex + 1) / todaysTasks.length) * 100) : 0;

  const handleCorrect = () => {
    if (currentTask) {
      const timeSpent = Math.round((Date.now() - sessionStartTime) / 1000);
      completeTaskMutation.mutate({
        taskId: currentTask.task.id,
        phraseId: currentTask.task.phraseId,
        isCorrect: true,
        timeSpentSeconds: timeSpent,
      });
      setSessionStats((prev) => ({
        ...prev,
        correct: prev.correct + 1,
      }));
      setShowTranslation(false);
      setCurrentTaskIndex((prev) => prev + 1);
      setSessionStartTime(Date.now());
    }
  };

  const handleIncorrect = () => {
    if (currentTask) {
      const timeSpent = Math.round((Date.now() - sessionStartTime) / 1000);
      completeTaskMutation.mutate({
        taskId: currentTask.task.id,
        phraseId: currentTask.task.phraseId,
        isCorrect: false,
        timeSpentSeconds: timeSpent,
      });
      setSessionStats((prev) => ({
        ...prev,
        incorrect: prev.incorrect + 1,
      }));
      setShowTranslation(false);
      setCurrentTaskIndex((prev) => prev + 1);
      setSessionStartTime(Date.now());
    }
  };

  const handleFinishSession = () => {
    const totalStudied = sessionStats.correct + sessionStats.incorrect;
    if (totalStudied > 0) {
      recordSessionMutation.mutate({
        phrasesStudied: totalStudied,
        correctAnswers: sessionStats.correct,
        incorrectAnswers: sessionStats.incorrect,
      });
    }
    setSessionStats({ correct: 0, incorrect: 0, timeSpent: 0 });
    setCurrentTaskIndex(0);
    setSessionStartTime(Date.now());
  };

  const handleSpeak = () => {
    if (currentTask) {
      if (isPlaying) {
        stop();
      } else {
        speak(currentTask.phrase.german);
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <p className="text-gray-600 text-lg">Loading your tasks...</p>
        </Card>
      </div>
    );
  }

  if (todaysTasks.length === 0) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            All Done for Today!
          </h2>
          <p className="text-gray-600 mb-6">
            You've completed all your tasks. Come back tomorrow for more!
          </p>
          <Button onClick={() => initializeMutation.mutate({ dailyLoad: 20 })}>
            Load More Tasks
          </Button>
        </Card>
      </div>
    );
  }

  if (currentTaskIndex >= todaysTasks.length) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <Card className="p-8 max-w-md w-full text-center">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">
            Session Complete!
          </h2>
          <div className="mb-6 space-y-2">
            <p className="text-lg">
              <span className="font-bold text-green-600">
                {sessionStats.correct}
              </span>{" "}
              Correct
            </p>
            <p className="text-lg">
              <span className="font-bold text-red-600">
                {sessionStats.incorrect}
              </span>{" "}
              Incorrect
            </p>
            <p className="text-lg">
              Accuracy:{" "}
              <span className="font-bold">
                {sessionStats.correct + sessionStats.incorrect > 0
                  ? Math.round(
                      (sessionStats.correct /
                        (sessionStats.correct + sessionStats.incorrect)) *
                        100
                    )
                  : 0}
                %
              </span>
            </p>
          </div>
          <Button onClick={handleFinishSession} className="w-full">
            Finish Session
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">
            Today's Work
          </h1>
          <p className="text-gray-600">
            {taskCount} tasks remaining • {analytics?.learningPace || "normal"} pace
          </p>
        </div>

        {/* Progress */}
        <Card className="p-6 mb-6">
          <div className="flex justify-between mb-2">
            <span className="text-sm font-medium text-gray-600">Progress</span>
            <span className="text-sm font-bold text-blue-600">
              {currentTaskIndex + 1} / {todaysTasks.length}
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progressPercentage}%` }}
            />
          </div>
        </Card>

        {/* Session Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">Correct</p>
            <p className="text-2xl font-bold text-green-600">
              {sessionStats.correct}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">Incorrect</p>
            <p className="text-2xl font-bold text-red-600">
              {sessionStats.incorrect}
            </p>
          </Card>
          <Card className="p-4 text-center">
            <p className="text-xs text-gray-600 mb-1">Accuracy</p>
            <p className="text-2xl font-bold text-blue-600">
              {sessionStats.correct + sessionStats.incorrect > 0
                ? Math.round(
                    (sessionStats.correct /
                      (sessionStats.correct + sessionStats.incorrect)) *
                      100
                  )
                : 0}
              %
            </p>
          </Card>
        </div>

        {/* Task Card */}
        <Card className="p-8 mb-6">
          <div className="text-center mb-6">
            <p className="text-sm text-blue-600 font-medium mb-2">
              {currentTask?.task.taskType === "new"
                ? "📚 Learn New Phrase"
                : `🔄 Review (${currentTask?.task.daysFromLearning} days)`}
            </p>
            <p className="text-sm text-gray-600 mb-4">
              {currentTask?.phrase.category}
            </p>
          </div>

          <div className="text-center mb-8">
            <h2 className="text-4xl font-bold text-gray-900 mb-4">
              {currentTask?.phrase.german}
            </h2>

            <Button
              onClick={handleSpeak}
              className="mb-6"
              variant={isPlaying ? "destructive" : "default"}
            >
              {isPlaying ? "⏹ Stop" : "🔊 Hear Pronunciation"}
            </Button>

            {!showTranslation ? (
              <Button
                onClick={() => setShowTranslation(true)}
                variant="outline"
                className="w-full"
              >
                Show Translation
              </Button>
            ) : (
              <div className="bg-blue-50 p-4 rounded-lg mb-6">
                <p className="text-lg text-gray-900 font-medium">
                  {currentTask?.phrase.english}
                </p>
                <p className="text-sm text-gray-600 mt-2 italic">
                  {currentTask?.phrase.pronunciation}
                </p>
              </div>
            )}
          </div>

          {showTranslation && (
            <div className="flex gap-4">
              <Button
                onClick={handleIncorrect}
                variant="destructive"
                className="flex-1"
              >
                ✗ Forgot
              </Button>
              <Button
                onClick={handleCorrect}
                variant="default"
                className="flex-1 bg-green-600 hover:bg-green-700"
              >
                ✓ Got It
              </Button>
            </div>
          )}
        </Card>

        {/* Tips */}
        <Card className="p-4 bg-amber-50 border-amber-200">
          <p className="text-sm text-amber-900">
            💡 <strong>Tip:</strong> Use the spaced repetition schedule to master
            phrases. Review at 1, 3, 10, 21, and 50 days for optimal retention.
          </p>
        </Card>
      </div>
    </div>
  );
}

