/**
 * Enhanced Chatbot Component
 * 
 * Features:
 * - Context-aware conversations
 * - Adaptive responses based on user learning profile
 * - Word explanations and grammar teaching
 * - Conversation practice with feedback
 * - Integration with spaced repetition system
 */

import React, { useState, useRef, useEffect } from 'react';
import { trpc } from '../client';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Card } from './ui/card';
import { ScrollArea } from './ui/scroll-area';
import { Loader2, Send, Lightbulb } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  metadata?: {
    wordExplanation?: string;
    grammarTip?: string;
    evaluationFeedback?: string;
  };
}

interface EnhancedChatbotProps {
  topic?: string;
  difficulty?: 'easy' | 'intermediate' | 'hard';
  onWordLearned?: (word: string) => void;
}

export const EnhancedChatbot: React.FC<EnhancedChatbotProps> = ({
  topic = 'German vocabulary learning',
  difficulty = 'intermediate',
  onWordLearned,
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [showTips, setShowTips] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  const chatMutation = trpc.advancedLearning.chatWithBot.useMutation();
  const explanationMutation = trpc.advancedLearning.getWordExplanation.useMutation();
  const conversationMutation = trpc.advancedLearning.getConversationStarter.useMutation();

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Initialize with a conversation starter
  useEffect(() => {
    const initializeChat = async () => {
      setIsLoading(true);
      try {
        const starter = await conversationMutation.mutateAsync({
          topic,
          difficulty,
        });

        setMessages([
          {
            id: '0',
            role: 'assistant',
            content: starter.starter,
            timestamp: new Date(),
          },
        ]);
      } catch (error) {
        console.error('Error initializing chat:', error);
        setMessages([
          {
            id: '0',
            role: 'assistant',
            content: `Hallo! Let's practice ${topic} together. What would you like to learn?`,
            timestamp: new Date(),
          },
        ]);
      } finally {
        setIsLoading(false);
      }
    };

    if (messages.length === 0) {
      initializeChat();
    }
  }, []);

  const handleSendMessage = async () => {
    if (!input.trim()) return;

    // Add user message
    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      // Get chatbot response
      const response = await chatMutation.mutateAsync({
        message: input,
        topic,
      });

      if (response.success) {
        const assistantMessage: Message = {
          id: `msg-${Date.now()}-response`,
          role: 'assistant',
          content: response.response,
          timestamp: new Date(),
        };

        setMessages((prev) => [...prev, assistantMessage]);

        // Extract and explain any German words mentioned
        const germanWords = extractGermanWords(input);
        if (germanWords.length > 0) {
          await explainWords(germanWords);
        }
      }
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: `msg-${Date.now()}-error`,
          role: 'assistant',
          content: 'Sorry, I encountered an error. Please try again.',
          timestamp: new Date(),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const extractGermanWords = (text: string): string[] => {
    // Simple extraction - in production, use NLP
    const words = text.split(/\s+/).filter((word) => {
      // Check if word starts with capital letter (German nouns) or is a known German word
      return /^[A-Z]/.test(word) || /^(der|die|das|ein|eine|einen|einem|einem|einen|einen|einen|einen|einen|einen)$/i.test(word);
    });
    return words.slice(0, 3); // Limit to 3 words
  };

  const explainWords = async (words: string[]) => {
    for (const word of words) {
      try {
        const explanation = await explanationMutation.mutateAsync({
          germanWord: word,
          englishTranslation: '', // Would be filled by user or extracted from context
        });

        if (explanation.success) {
          setMessages((prev) => {
            const lastMessage = prev[prev.length - 1];
            if (lastMessage && lastMessage.role === 'assistant') {
              return [
                ...prev.slice(0, -1),
                {
                  ...lastMessage,
                  metadata: {
                    ...lastMessage.metadata,
                    wordExplanation: explanation.explanation,
                  },
                },
              ];
            }
            return prev;
          });

          if (onWordLearned) {
            onWordLearned(word);
          }
        }
      } catch (error) {
        console.error(`Error explaining word ${word}:`, error);
      }
    }
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white p-4 rounded-t-lg">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">German Learning Assistant</h2>
            <p className="text-blue-100 text-sm">Adaptive AI-powered conversation practice</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowTips(!showTips)}
            className="text-white hover:bg-blue-700"
          >
            <Lightbulb className="w-4 h-4 mr-2" />
            Tips
          </Button>
        </div>
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <Card
                className={`max-w-xs lg:max-w-md px-4 py-3 ${
                  message.role === 'user'
                    ? 'bg-blue-600 text-white rounded-bl-lg'
                    : 'bg-white text-gray-900 rounded-br-lg border-blue-200'
                }`}
              >
                <p className="text-sm">{message.content}</p>
                {message.metadata?.wordExplanation && showTips && (
                  <div className="mt-2 p-2 bg-yellow-50 rounded text-xs text-gray-700 border-l-2 border-yellow-400">
                    <strong>Word Tip:</strong> {message.metadata.wordExplanation}
                  </div>
                )}
                {message.metadata?.grammarTip && showTips && (
                  <div className="mt-2 p-2 bg-green-50 rounded text-xs text-gray-700 border-l-2 border-green-400">
                    <strong>Grammar:</strong> {message.metadata.grammarTip}
                  </div>
                )}
                <span className="text-xs opacity-70 mt-2 block">
                  {message.timestamp.toLocaleTimeString()}
                </span>
              </Card>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <Card className="bg-white text-gray-900 rounded-br-lg border-blue-200 px-4 py-3">
                <div className="flex items-center space-x-2">
                  <Loader2 className="w-4 h-4 animate-spin text-blue-600" />
                  <span className="text-sm">Thinking...</span>
                </div>
              </Card>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="border-t border-blue-200 p-4 bg-white rounded-b-lg">
        <div className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSendMessage()}
            placeholder="Type your response in German or English..."
            disabled={isLoading}
            className="flex-1 border-blue-200 focus:border-blue-600"
          />
          <Button
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Send className="w-4 h-4" />
          </Button>
        </div>
        <p className="text-xs text-gray-500 mt-2">
          💡 Tip: The chatbot learns from your responses and adapts to your level
        </p>
      </div>
    </div>
  );
};

