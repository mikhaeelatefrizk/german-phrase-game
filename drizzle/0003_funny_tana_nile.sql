CREATE TABLE `dailyTasks` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(64) NOT NULL,
	`phraseId` varchar(64) NOT NULL,
	`scheduledDate` timestamp NOT NULL,
	`taskType` enum('new','review_1','review_3','review_10','review_21','review_50','exam') NOT NULL,
	`daysFromLearning` int NOT NULL,
	`status` enum('pending','completed','skipped') NOT NULL DEFAULT 'pending',
	`completedAt` timestamp,
	`isCorrect` int,
	`timeSpentSeconds` int,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `dailyTasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `learningAnalytics` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(64) NOT NULL,
	`avgPhrasesPerDay` int NOT NULL DEFAULT 0,
	`bestStudyTime` varchar(20),
	`studyStreak` int NOT NULL DEFAULT 0,
	`longestStudyStreak` int NOT NULL DEFAULT 0,
	`optimalDailyLoad` int NOT NULL DEFAULT 20,
	`learningPace` enum('slow','normal','fast') NOT NULL DEFAULT 'normal',
	`avgRetention` int NOT NULL DEFAULT 0,
	`weakCategories` text,
	`strongCategories` text,
	`lastAnalyzedAt` timestamp,
	`createdAt` timestamp DEFAULT (now()),
	`updatedAt` timestamp DEFAULT (now()),
	CONSTRAINT `learningAnalytics_id` PRIMARY KEY(`id`),
	CONSTRAINT `learningAnalytics_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
CREATE TABLE `studySessions` (
	`id` varchar(64) NOT NULL,
	`userId` varchar(64) NOT NULL,
	`sessionDate` timestamp NOT NULL,
	`startTime` timestamp NOT NULL,
	`endTime` timestamp,
	`phrasesStudied` int NOT NULL DEFAULT 0,
	`correctAnswers` int NOT NULL DEFAULT 0,
	`incorrectAnswers` int NOT NULL DEFAULT 0,
	`accuracy` int NOT NULL DEFAULT 0,
	`streakContinued` int NOT NULL DEFAULT 0,
	`createdAt` timestamp DEFAULT (now()),
	CONSTRAINT `studySessions_id` PRIMARY KEY(`id`)
);
