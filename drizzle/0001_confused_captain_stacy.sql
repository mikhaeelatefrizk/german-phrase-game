CREATE TABLE `mistakes` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(64) NOT NULL,
	`phraseId` varchar(64) NOT NULL,
	`mistakeType` enum('spelling','grammar','wrong_translation','pronunciation','other') NOT NULL,
	`mistakeCount` int NOT NULL DEFAULT 1,
	`userAnswer` text,
	`correctAnswer` text,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `mistakes_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `phrases` (
	`id` varchar(64) NOT NULL,
	`german` text NOT NULL,
	`english` text NOT NULL,
	`difficulty` enum('easy','intermediate','hard') NOT NULL DEFAULT 'intermediate',
	`category` varchar(64) NOT NULL DEFAULT 'general',
	`createdAt` timestamp DEFAULT (now()),
	CONSTRAINT `phrases_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userProgress` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(64) NOT NULL,
	`phraseId` varchar(64) NOT NULL,
	`interval` int NOT NULL DEFAULT 1,
	`easeFactor` int NOT NULL DEFAULT 2500,
	`repetitions` int NOT NULL DEFAULT 0,
	`correctCount` int NOT NULL DEFAULT 0,
	`incorrectCount` int NOT NULL DEFAULT 0,
	`lastReviewedAt` timestamp,
	`nextReviewAt` timestamp NOT NULL DEFAULT (now()),
	`status` enum('new','learning','mastered') NOT NULL DEFAULT 'new',
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `userProgress_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `userStats` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(64) NOT NULL,
	`totalPhrasesLearned` int NOT NULL DEFAULT 0,
	`totalPhrasesMastered` int NOT NULL DEFAULT 0,
	`totalReviews` int NOT NULL DEFAULT 0,
	`correctReviews` int NOT NULL DEFAULT 0,
	`currentStreak` int NOT NULL DEFAULT 0,
	`longestStreak` int NOT NULL DEFAULT 0,
	`lastActivityAt` timestamp,
	`points` int NOT NULL DEFAULT 0,
	`level` int NOT NULL DEFAULT 1,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `userStats_id` PRIMARY KEY(`id`),
	CONSTRAINT `userStats_userId_unique` UNIQUE(`userId`)
);
