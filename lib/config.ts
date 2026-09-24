/** 学習ルールの設定。変えたら次の出題から反映される */
export const config = {
  /** 1 日に出す新しい問題の数 */
  newPerDay: 20,
  /** FSRS の目標保持率（この確率で思い出せるタイミングで復習させる） */
  desiredRetention: 0.9,
  /** 1 日の区切り（深夜 0〜4 時の学習は前日扱い） */
  dayStartHour: 4,
  /** 混同した問題に誤答してから、何問後に見分け問題を差し込むか */
  followupAfter: 2,
  /** 直近 N 問で出た Atom は、ほかに候補があれば避ける */
  recentAtomWindow: 2,
  /** 復習予定まで N 分以内なら、ほかに問題がないとき前倒しで出す */
  learnAheadMinutes: 20,
  /** 習熟度 = 今から N 日後にも思い出せる確率。直後の「覚えている」ではなく定着度を見るため */
  masteryHorizonDays: 30,
  /** Atom の習熟度がこれ以上なら「習得済み」とみなす */
  masteredThreshold: 0.8,
} as const;

export type Config = typeof config;
